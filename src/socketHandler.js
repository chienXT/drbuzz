'use strict';
const sanitizeHtml  = require('sanitize-html');
const chatService   = require('./services/chatService');
const pmService     = require('./services/privateMessageService');
const Notification  = require('./models/Notification');
const { socketAuth } = require('./middleware/auth');

/** Strip all HTML tags from a string (plain text only) */
const sanitizeText = (s) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} });

const onlineUsers = new Map(); // socketId -> {user, room}
const userSockets = new Map(); // userId  -> Set<socketId>

const getOnlineList = () => {
  const seen = new Set(), list = [];
  for (const { user } of onlineUsers.values()) {
    if (!seen.has(String(user._id))) {
      seen.add(String(user._id));
      list.push({ id: user._id, username: user.username, displayName: user.displayName, avatar: user.avatar||'' });
    }
  }
  // Update global online count
  global.onlineCount = list.length;
  return list;
};

const initSocket = (io) => {
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const user = socket.user;
    const room = 'global';


    socket.join(room);
    socket.join(`user:${user._id}`);
    onlineUsers.set(socket.id, { user, room });
    if (!userSockets.has(String(user._id))) userSockets.set(String(user._id), new Set());
    userSockets.get(String(user._id)).add(socket.id);

    io.emit('online:list', getOnlineList());
    io.emit('user:online', { userId: user._id });

    try {
      const history = await chatService.getHistory(room, 80);
      socket.emit('chat:history', history);
    } catch (e) { console.error('[socket] history:', e.message); }

    /* PUBLIC CHAT */
    socket.on('chat:send', async (text) => {
      const clean = sanitizeText(String(text||'').trim()).slice(0,500);
      if (!clean) return;
      try {
        // Extract mentioned usernames
        const mentionPattern = /@([a-zA-Z0-9_]+)/g;
        const usernames = [...clean.matchAll(mentionPattern)].map(m => m[1]);
        
        const msg = await chatService.saveMessage({ room, senderId: user._id, text: clean });
        
        // Find mentioned users and add to mentions array
        if (usernames.length > 0) {
          const User = require('./models/User');
          const mentionedUsers = await User.find({ username: { $in: usernames } }).select('_id');
          msg.mentions = mentionedUsers.map(u => u._id);
          await msg.save();
          
          // Send notifications
          mentionedUsers.forEach(mentionedUser => {
            io.to(`user:${mentionedUser._id}`).emit('chat:mention', {
              messageId: msg._id, from: user.displayName, fromAvatar: user.avatar,
              preview: clean.slice(0, 60),
            });
          });
        }
        
        io.to(room).emit('chat:message', {
          _id: msg._id, text: msg.text, room: msg.room, recalled: false, createdAt: msg.createdAt,
          mentions: msg.mentions, sender: { _id: user._id, username: user.username, displayName: user.displayName, avatar: user.avatar||'' },
        });
      } catch(e) { socket.emit('chat:error', { message:'Không thể gửi' }); }
    });

    socket.on('chat:typing', (isTyping) => {
      socket.to(room).emit('chat:typing', { userId: user._id, displayName: user.displayName, isTyping: Boolean(isTyping) });
    });

    socket.on('chat:seen', async (messageId) => {
      try { await chatService.markSeen(messageId, user._id); socket.to(room).emit('chat:seen', { messageId, userId: user._id }); } catch {}
    });

    /* PRIVATE MESSAGES */
    socket.on('pm:send', async ({ toUserId, text }) => {
      const clean = sanitizeText(String(text||'').trim()).slice(0,1000);
      if (!clean || !toUserId) return;
      try {
        const msg = await pmService.saveMessage({ senderId: user._id, receiverId: toUserId, text: clean });
        const payload = {
          _id: msg._id, text: msg.text, recalled: false, read: false, createdAt: msg.createdAt,
          sender: { _id: user._id, username: user.username, displayName: user.displayName, avatar: user.avatar||'' },
          receiver: toUserId,
        };
        socket.emit('pm:message', payload);
        io.to(`user:${toUserId}`).emit('pm:message', payload);
        io.to(`user:${toUserId}`).emit('pm:notification', {
          fromUserId: user._id, fromName: user.displayName, fromAvatar: user.avatar||'', preview: clean.slice(0,60),
        });
        Notification.create({ recipient: toUserId, sender: user._id, type: 'private_message',
          message: `${user.displayName} đã nhắn tin cho bạn` }).catch(()=>{});
      } catch(e) { socket.emit('pm:error', { message: e.message }); }
    });

    socket.on('pm:typing', ({ toUserId, isTyping }) => {
      io.to(`user:${toUserId}`).emit('pm:typing', { fromUserId: user._id, fromName: user.displayName, isTyping: Boolean(isTyping) });
    });

    socket.on('pm:read', async ({ fromUserId }) => {
      try { await pmService.markRead(user._id, fromUserId); io.to(`user:${fromUserId}`).emit('pm:read_ack', { by: user._id }); } catch {}
    });

    /* FRIEND REQUEST realtime */
    socket.on('friend:notify', ({ toUserId }) => {
      io.to(`user:${toUserId}`).emit('friend:new_request', {
        fromUserId: user._id, fromName: user.displayName, fromAvatar: user.avatar||'',
      });
    });

    /* REACTIONS ──────────────────────────────── */
    socket.on('chat:reaction', async ({ messageId, emoji, action }) => {
      try {
        const Message = require('./models/Message');
        const msg = await Message.findById(messageId);
        if (!msg) return;
        
        let reaction = msg.reactions.find(r => r.emoji === emoji);
        if (action === 'add') {
          if (!reaction) msg.reactions.push({ emoji, users: [user._id] });
          else if (!reaction.users.includes(user._id)) reaction.users.push(user._id);
        } else {
          if (reaction) {
            reaction.users = reaction.users.filter(id => String(id) !== String(user._id));
            if (reaction.users.length === 0) {
              msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
            }
          }
        }
        await msg.save();
        io.to(room).emit('chat:reaction_update', { messageId, emoji, users: reaction?.users || [], action });
      } catch(e) { console.error('[socket] reaction:', e.message); }
    });

    /* EDIT MESSAGE ────────────────────────────── */
    socket.on('chat:edit', async ({ messageId, text }) => {
      try {
        const clean = sanitizeText(String(text||'').trim()).slice(0,500);
        if (!clean) return;
        const Message = require('./models/Message');
        const msg = await Message.findById(messageId);
        if (!msg || String(msg.sender) !== String(user._id)) return;
        
        msg.editHistory = msg.editHistory || [];
        msg.editHistory.push({ text: msg.text, at: new Date() });
        msg.text = clean;
        msg.edited = true;
        msg.editedAt = new Date();
        await msg.save();
        
        io.to(room).emit('chat:edited', { messageId, text: clean, editedAt: msg.editedAt });
      } catch(e) { console.error('[socket] edit:', e.message); }
    });

    /* PIN MESSAGE ──────────────────────────────– */
    socket.on('chat:pin', async ({ messageId, action }) => {
      try {
        if (!user.isAdmin) return;
        const Message = require('./models/Message');
        const msg = await Message.findById(messageId);
        if (!msg) return;
        
        if (action === 'pin') {
          msg.pinned = true;
          msg.pinnedAt = new Date();
          msg.pinnedBy = user._id;
        } else {
          msg.pinned = false;
          msg.pinnedAt = null;
          msg.pinnedBy = null;
        }
        await msg.save();
        io.to(room).emit('chat:pin_update', { messageId, pinned: msg.pinned });
      } catch(e) { console.error('[socket] pin:', e.message); }
    });

    /* USER STATUS ──────────────────────────────– */
    socket.on('user:status', async (status) => {
      try {
        if (!['online', 'away', 'offline'].includes(status)) return;
        const User = require('./models/User');
        await User.findByIdAndUpdate(user._id, { status, lastSeen: new Date() });
        io.emit('user:status_update', { userId: user._id, status });
      } catch(e) { console.error('[socket] status:', e.message); }
    });

    /* DISCONNECT */
    socket.on('disconnect', () => {
      onlineUsers.delete(socket.id);
      const sSet = userSockets.get(String(user._id));
      if (sSet) {
        sSet.delete(socket.id);
        if (sSet.size === 0) { userSockets.delete(String(user._id)); io.emit('user:offline', { userId: user._id }); }
      }
      io.emit('online:list', getOnlineList());
    });
  });
};

module.exports = initSocket;
