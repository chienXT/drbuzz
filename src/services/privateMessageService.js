'use strict';

const PrivateMessage = require('../models/PrivateMessage');
const friendService  = require('./friendService');
const User           = require('../models/User');

/**
 * Lấy lịch sử chat 1-1 (chỉ bạn bè)
 */
const getHistory = async (myId, otherId, limit = 100) => {
  const ok = await friendService.areFriends(myId, otherId);
  if (!ok) throw Object.assign(new Error('Chỉ có thể nhắn tin với bạn bè'), { status: 403 });

  const msgs = await PrivateMessage.find({
    $or: [
      { sender: myId, receiver: otherId },
      { sender: otherId, receiver: myId },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'displayName avatar username')
    .lean();

  return msgs.reverse();
};

/**
 * Lấy danh sách conversation (inbox)
 */
const getInbox = async (userId) => {
  const friends = await friendService.getFriends(userId);
  const friendIds = friends.map((f) => f._id);

  const conversations = [];

  for (const friend of friends) {
    const lastMsg = await PrivateMessage.findOne({
      $or: [
        { sender: userId, receiver: friend._id },
        { sender: friend._id, receiver: userId },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    const unread = await PrivateMessage.countDocuments({
      sender: friend._id,
      receiver: userId,
      read: false,
    });

    conversations.push({
      partner: friend,
      lastMsg: lastMsg || null,
      unread,
    });
  }

  // Sort by latest message
  conversations.sort((a, b) => {
    const ta = a.lastMsg?.createdAt || 0;
    const tb = b.lastMsg?.createdAt || 0;
    return new Date(tb) - new Date(ta);
  });

  return conversations;
};

/**
 * Lưu tin nhắn mới
 */
const saveMessage = async ({ senderId, receiverId, text }) => {
  const ok = await friendService.areFriends(senderId, receiverId);
  if (!ok) throw Object.assign(new Error('Chỉ có thể nhắn tin với bạn bè'), { status: 403 });

  const msg = await PrivateMessage.create({ sender: senderId, receiver: receiverId, text });
  await msg.populate('sender', 'displayName avatar username');
  return msg;
};

/**
 * Đánh dấu đã đọc
 */
const markRead = async (myId, otherId) => {
  await PrivateMessage.updateMany(
    { sender: otherId, receiver: myId, read: false },
    { read: true }
  );
};

/**
 * Thu hồi tin nhắn
 */
const recallMessage = async (msgId, userId) => {
  const msg = await PrivateMessage.findById(msgId);
  if (!msg) throw Object.assign(new Error('Không tìm thấy tin nhắn'), { status: 404 });
  if (String(msg.sender) !== String(userId))
    throw Object.assign(new Error('Không có quyền thu hồi'), { status: 403 });

  msg.recalled = true;
  await msg.save();
  return msg;
};

/**
 * Tổng unread count
 */
const totalUnread = async (userId) => {
  return PrivateMessage.countDocuments({ receiver: userId, read: false });
};

module.exports = { getHistory, getInbox, saveMessage, markRead, recallMessage, totalUnread };
