/* =============================================
   DramaBuzz v3 – chat.js (Enhanced)
   Realtime chat via Socket.io
   ============================================= */

'use strict';

if (typeof ME === 'undefined') var ME = window.CURRENT_USER || null;
if (!ME) { location.href = '/?login=1'; }

/* ── Connect socket ─────────────────────────── */
const socket = window._socket || io('/', { withCredentials: true });
window._socket = socket;

/* ── DOM refs ───────────────────────────────── */
const messagesEl     = document.getElementById('chatMessages');
const inputEl        = document.getElementById('chatInput');
const sendBtn        = document.getElementById('sendBtn');
const typingEl       = document.getElementById('typingIndicator');
const typingTextEl   = document.getElementById('typingText');
const onlineListEl   = document.getElementById('onlineList');
const onlineCountEl  = document.getElementById('onlineCount');
const roomStatusEl   = document.getElementById('roomStatus');
const searchEl       = document.getElementById('chatSearch');

/* ── State ──────────────────────────────────── */
let typingTimer      = null;
let isTyping         = false;
const seenObserver   = new IntersectionObserver(onMsgVisible, { threshold: 0.8 });
const emojiPicker    = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '✨'];

/* ── Custom Modals ────────────────────────── */
function showConfirmModal(message, onConfirm, onCancel) {
  const modal = document.createElement('div');
  modal.className = 'custom-modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header">
        <span class="modal-title">⚠️ Xác nhận</span>
      </div>
      <div class="modal-body">
        <p class="confirm-msg" style="font-size:.95rem;color:var(--ink-2);line-height:1.6"></p>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;padding:16px;border-top:1px solid var(--border)">
        <button class="btn" style="background:var(--bg);color:var(--ink);border:1px solid var(--border)">Hủy</button>
        <button class="btn btn-primary">Xác nhận</button>
      </div>
    </div>`;
  modal.querySelector('.confirm-msg').textContent = message;
  
  document.body.appendChild(modal);
  const btns = modal.querySelectorAll('button');
  btns[0].onclick = () => { modal.remove(); onCancel?.(); };
  btns[1].onclick = () => { modal.remove(); onConfirm?.(); };
  modal.onclick = (e) => { if (e.target === modal) { modal.remove(); onCancel?.(); } };
}

function showPromptModal(message, defaultValue = '', onConfirm, onCancel) {
  const modal = document.createElement('div');
  modal.className = 'custom-modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px">
      <div class="modal-header">
        <span class="modal-title">✏️ Sửa tin nhắn</span>
      </div>
      <div class="modal-body">
        <label class="form-label prompt-label"></label>
        <textarea class="form-input" style="resize:vertical;min-height:80px;font-family:inherit" placeholder="Nhập nội dung..."></textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;padding:16px;border-top:1px solid var(--border)">
        <button class="btn" style="background:var(--bg);color:var(--ink);border:1px solid var(--border)">Hủy</button>
        <button class="btn btn-primary">Cập nhật</button>
      </div>
    </div>`;
  modal.querySelector('.prompt-label').textContent = message;
  const textarea = modal.querySelector('textarea');
  textarea.value = defaultValue;
  const btns = modal.querySelectorAll('button');
  
  setTimeout(() => textarea.focus(), 100);
  
  btns[0].onclick = () => { modal.remove(); onCancel?.(); };
  btns[1].onclick = () => { 
    const text = textarea.value.trim();
    modal.remove(); 
    if (text) onConfirm?.(text);
  };
  modal.onclick = (e) => { if (e.target === modal) { modal.remove(); onCancel?.(); } };
  
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      const text = textarea.value.trim();
      modal.remove();
      if (text) onConfirm?.(text);
    }
  });
}


/* ── Notification Sound ────────────────────── */
function playNotificationSound() {
  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj==');
  audio.play().catch(() => {});
}

/* ── Helpers ────────────────────────────────– */
function avatarHtml(user, size = 32) {
  const src = (user && user.avatar) ? user.avatar : '/images/default-avatar.svg';
  return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover">`;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatFullTime(date) {
  const d = new Date(date);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN');
}

function isMine(msg) {
  return String(msg.sender?._id || msg.sender) === String(ME.id);
}

function scrollBottom(smooth = true) {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

function getUserLink(userId, username) {
  return `/u/${username}`;
}

/* ── Render single message ──────────────────– */
function renderMessage(msg) {
  const mine    = isMine(msg);
  const sender  = msg.sender || {};
  let text    = msg.recalled ? '<em style="opacity:.6">Tin nhắn đã được thu hồi</em>' : formatMentions(msg.text);

  const div = document.createElement('div');
  div.className = `message-bubble${mine ? ' mine' : ''}${msg.pinned ? ' pinned' : ''}`;
  div.dataset.id = msg._id;

  const editedLabel = msg.edited ? `<span class="edited-label">[đã sửa]</span>` : '';
  const pinnedLabel = msg.pinned ? `<span class="pinned-label">📌 Đã ghim</span>` : '';
  
  const userLink = `<a href="${getUserLink(sender._id, sender.username)}" class="user-link">${escapeHtml(sender.displayName || sender.username || '')}</a>`;

  div.innerHTML = `
    <div class="msg-avatar" data-action="open-user" data-user-url="${getUserLink(sender._id, sender.username)}" style="cursor:pointer;">${avatarHtml(sender)}</div>
    <div class="msg-content">
      ${!mine ? `<div class="msg-name">${userLink}</div>` : ''}
      ${pinnedLabel}
      <div class="msg-bubble${msg.recalled ? ' recalled' : ''}" title="${formatFullTime(msg.createdAt)}">
        ${text}
        ${editedLabel}
        <div class="msg-reactions" id="reactions-${msg._id}">
          ${renderReactions(msg)}
        </div>
      </div>
      <div class="msg-time" style="display:flex;align-items:center;gap:8px">
        <span>${formatTime(msg.createdAt)}</span>
        <div class="msg-actions" style="position:static;background:transparent;border:none;padding:0;box-shadow:none;display:flex;gap:4px">
          <button class="msg-action-btn reaction-btn" data-id="${msg._id}" title="Thêm reaction" style="font-size:1rem">😊</button>
          ${mine ? `<button class="msg-action-btn" data-action="edit" data-id="${msg._id}" title="Sửa"><i class="fas fa-edit"></i></button>` : ''}
          ${mine || ME.isAdmin ? `<button class="msg-action-btn" data-action="delete" data-id="${msg._id}" title="Xóa"><i class="fas fa-trash"></i></button>` : ''}
          ${ME.isAdmin && !msg.recalled ? `<button class="msg-action-btn" data-action="recall" data-id="${msg._id}" title="Thu hồi"><i class="fas fa-undo"></i></button>` : ''}
          ${ME.isAdmin ? `<button class="msg-action-btn" data-action="pin" data-id="${msg._id}" title="${msg.pinned ? 'Bỏ ghim' : 'Ghim'}"><i class="fas fa-thumbtack"></i></button>` : ''}
        </div>
      </div>
    </div>`;

  if (!mine) seenObserver.observe(div);
  return div;
}

function renderReactions(msg) {
  if (!msg.reactions || msg.reactions.length === 0) return '';
  return msg.reactions.map(r => {
    const count = r.users?.length || 0;
    const iHave = r.users?.some(u => String(u) === String(ME.id));
    return `<span class="reaction${iHave ? ' my-reaction' : ''}" data-emoji="${r.emoji}" data-id="${msg._id}">${r.emoji} ${count}</span>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatMentions(text) {
  // Highlight @mentions in text
  return escapeHtml(text).replace(/@([a-zA-Z0-9_]+)/g, '<span style="color:var(--primary);font-weight:600">@$1</span>');
}

/* ── Append message to list ─────────────────── */
function appendMessage(msg, scroll = true) {
  const placeholder = messagesEl.querySelector('[data-placeholder]');
  placeholder?.remove();

  const el = renderMessage(msg);
  messagesEl.appendChild(el);
  if (scroll) {
    const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
    if (atBottom) scrollBottom();
  }
  playNotificationSound();
}

/* ── Render history ──────────────────────────– */
function renderHistory(messages) {
  messagesEl.innerHTML = '';
  if (!messages.length) {
    messagesEl.innerHTML = `<div style="text-align:center;color:var(--ink-4);padding:40px;font-size:.9rem">💬 Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!</div>`;
    return;
  }
  messages.forEach(m => appendMessage(m, false));
  scrollBottom(false);
}

/* ── Online users list ──────────────────────– */
function renderOnlineList(users) {
  if (!onlineListEl) return;
  if (onlineCountEl) onlineCountEl.textContent = `● ${users.length} online`;

  onlineListEl.innerHTML = users.map(u => `
    <a href="${getUserLink(u.id, u.username)}" class="online-user" style="text-decoration:none;color:inherit;">
      <div class="online-user-avatar">${avatarHtml(u, 34)}</div>
      <div>
        <div style="font-weight:600;font-size:.85rem">${escapeHtml(u.displayName)}</div>
        <div style="font-size:.72rem;color:var(--ink-4)">@${escapeHtml(u.username)}</div>
      </div>
    </a>`).join('');
}

/* ── Send message ──────────────────────────── */
function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit('chat:send', text);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  stopTyping();
}

/* ── Typing indicator ──────────────────────── */
function startTyping() {
  if (!isTyping) {
    isTyping = true;
    socket.emit('chat:typing', true);
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 2500);
}

function stopTyping() {
  if (isTyping) {
    isTyping = false;
    socket.emit('chat:typing', false);
  }
  clearTimeout(typingTimer);
}

/* ── Seen observer callback ──────────────────– */
function onMsgVisible(entries) {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.dataset.id;
      if (id) socket.emit('chat:seen', id);
      seenObserver.unobserve(entry.target);
    }
  });
}

/* ── Message actions ────────────────────────– */
messagesEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action], .reaction-btn, .reaction');
  if (!btn) return;

  const action = btn.dataset.action;
  const id     = btn.dataset.id;

  if (action === 'delete') {
    showConfirmModal('Bạn có chắc muốn xóa tin nhắn này?', async () => {
      try {
        await api(`/api/chat/${id}`, { method: 'DELETE' });
      } catch (err) { showToast(err.message, 'error'); }
    });
  }
  
  if (action === 'edit') {
    const msgEl = messagesEl.querySelector(`[data-id="${id}"]`);
    const currentText = msgEl?.querySelector('.msg-bubble')?.textContent?.split('[đã sửa]')[0]?.trim() || '';
    showPromptModal('Sửa nội dung tin nhắn:', currentText, (newText) => {
      socket.emit('chat:edit', { messageId: id, text: newText });
    });
  }
  
  if (action === 'recall') {
    showConfirmModal('Bạn có chắc muốn thu hồi tin nhắn này?', async () => {
      try {
        await api(`/api/chat/${id}/recall`, { method: 'PATCH' });
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  if (action === 'pin') {
    const bubble = messagesEl.querySelector(`[data-id="${id}"]`);
    const isPinned = bubble?.classList.contains('pinned');
    socket.emit('chat:pin', { messageId: id, action: isPinned ? 'unpin' : 'pin' });
  }

  if (btn.dataset.action === 'open-user') {
    window.location = btn.dataset.userUrl;
    return;
  }

  if (btn.dataset.action === 'emoji-react') {
    addReaction(btn.dataset.messageId, btn.dataset.emoji);
    return;
  }

  if (btn.classList.contains('reaction-btn')) {
    showEmojiPicker(id);
  }

  if (btn.classList.contains('reaction')) {
    const emoji = btn.dataset.emoji;
    const iHave = btn.classList.contains('my-reaction');
    socket.emit('chat:reaction', { messageId: id, emoji, action: iHave ? 'remove' : 'add' });
  }
});

function showEmojiPicker(messageId) {
  const btn = messagesEl.querySelector(`[data-id="${messageId}"] .reaction-btn`);
  if (!btn) return;
  
  let existing = document.getElementById('emoji-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'emoji-picker';
  picker.className = 'emoji-picker';
  picker.innerHTML = emojiPicker.map(e => 
    `<span class="emoji-picker-item" data-action="emoji-react" data-message-id="${messageId}" data-emoji="${e}" style="cursor:pointer;font-size:1.2rem;padding:4px">${e}</span>`
  ).join('');
  
  btn.parentElement.appendChild(picker);
  setTimeout(() => existing?.remove(), 3000);
}

function addReaction(messageId, emoji) {
  socket.emit('chat:reaction', { messageId, emoji, action: 'add' });
  document.getElementById('emoji-picker')?.remove();
}

/* ── Auto-resize textarea ──────────────────── */
inputEl?.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  startTyping();
});

inputEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn?.addEventListener('click', sendMessage);

/* ── Message Search ────────────────────────── */
searchEl?.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const messages = messagesEl.querySelectorAll('[data-id]');
  messages.forEach(msg => {
    const text = msg.textContent.toLowerCase();
    msg.style.opacity = !query || text.includes(query) ? '1' : '0.3';
  });
});

/* ── Typing display ────────────────────────── */
const typingUsers = new Map();

function updateTypingDisplay() {
  const names = Array.from(typingUsers.values());
  if (!names.length) {
    if (typingEl) typingEl.style.display = 'none';
    return;
  }
  if (typingEl) typingEl.style.display = 'flex';
  const text = names.length === 1
    ? `${names[0]} đang nhập...`
    : `${names.slice(0,-1).join(', ')} và ${names.at(-1)} đang nhập...`;
  if (typingTextEl) typingTextEl.textContent = text;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SOCKET EVENT HANDLERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

socket.on('connect', () => {
  if (roomStatusEl) roomStatusEl.textContent = 'Đã kết nối · Phòng chung';
  console.log('[chat] connected:', socket.id);
  socket.emit('user:status', 'online');
});

socket.on('disconnect', () => {
  if (roomStatusEl) roomStatusEl.textContent = 'Mất kết nối – đang thử lại...';
  socket.emit('user:status', 'offline');
});

socket.on('connect_error', (err) => {
  console.error('[chat] connect error:', err.message);
  if (err.message === 'Invalid token' || err.message === 'Unauthorized') {
    showToast('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại', 'error');
    setTimeout(() => { location.href = '/?login=1'; }, 2000);
  }
});

socket.on('chat:history', (messages) => {
  renderHistory(messages);
});

socket.on('chat:message', (msg) => {
  appendMessage(msg);
  typingUsers.delete(String(msg.sender?._id));
  updateTypingDisplay();
});

socket.on('chat:typing', ({ userId, displayName, isTyping }) => {
  if (String(userId) === String(ME.id)) return;
  if (isTyping) {
    typingUsers.set(String(userId), displayName);
  } else {
    typingUsers.delete(String(userId));
  }
  updateTypingDisplay();
});

socket.on('chat:seen', ({ messageId, userId }) => {
  const el = messagesEl.querySelector(`[data-id="${messageId}"] .msg-seen`);
  if (el) el.textContent = '✓✓ Đã xem';
});

socket.on('online:list', (users) => {
  renderOnlineList(users);
});

socket.on('chat:deleted', ({ id }) => {
  document.querySelector(`[data-id="${id}"]`)?.remove();
});

socket.on('chat:recalled', ({ id }) => {
  const bubble = document.querySelector(`[data-id="${id}"] .msg-bubble`);
  if (bubble) {
    bubble.classList.add('recalled');
    bubble.innerHTML = '<em style="opacity:.6">Tin nhắn đã được thu hồi</em>';
  }
});

socket.on('chat:reaction_update', ({ messageId, emoji, users, action }) => {
  const reactionsEl = document.getElementById(`reactions-${messageId}`);
  if (!reactionsEl) return;
  if (action === 'add' && users.length > 0) {
    const count = users.length;
    const iHave = users.some(u => String(u) === String(ME.id));
    const existing = reactionsEl.querySelector(`[data-emoji="${emoji}"]`);
    if (existing) {
      existing.textContent = `${emoji} ${count}`;
      if (iHave) existing.classList.add('my-reaction');
      else existing.classList.remove('my-reaction');
    } else {
      const span = document.createElement('span');
      span.className = `reaction${iHave ? ' my-reaction' : ''}`;
      span.dataset.emoji = emoji;
      span.dataset.id = messageId;
      span.textContent = `${emoji} ${count}`;
      reactionsEl.appendChild(span);
    }
  } else if (action === 'remove') {
    const existing = reactionsEl.querySelector(`[data-emoji="${emoji}"]`);
    if (existing) {
      if (users.length === 0) {
        existing.remove();
      } else {
        existing.textContent = `${emoji} ${users.length}`;
        const iHave = users.some(u => String(u) === String(ME.id));
        if (iHave) existing.classList.add('my-reaction');
        else existing.classList.remove('my-reaction');
      }
    }
  }
});

socket.on('chat:edited', ({ messageId, text, editedAt }) => {
  const bubble = document.querySelector(`[data-id="${messageId}"] .msg-bubble`);
  if (bubble) {
    bubble.innerHTML = escapeHtml(text) + '<span class="edited-label">[đã sửa]</span>' + (bubble.querySelector('.msg-reactions')?.outerHTML || '');
  }
});

socket.on('chat:pin_update', ({ messageId, pinned }) => {
  const bubble = document.querySelector(`[data-id="${messageId}"]`);
  if (bubble) {
    if (pinned) bubble.classList.add('pinned');
    else bubble.classList.remove('pinned');
  }
});

socket.on('user:status_update', ({ userId, status }) => {
  console.log(`[status] User ${userId} is now ${status}`);
});

socket.on('chat:mention', ({ messageId, from, fromAvatar, preview }) => {
  showToast(`${from} đã mention bạn: "${preview}"`, 'info');
});
