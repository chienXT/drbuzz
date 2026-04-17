'use strict';

const Message = require('../models/Message');

const KEEP_LIMIT = 500; // Giữ tối đa 500 tin nhắn / phòng

/**
 * Lấy lịch sử chat (100 tin gần nhất)
 */
const getHistory = async (room = 'global', limit = 100) => {
  const messages = await Message.find({ room, deleted: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'displayName avatar username')
    .lean();

  return messages.reverse();
};

/**
 * Lưu tin nhắn mới vào DB
 */
const saveMessage = async ({ room = 'global', senderId, text }) => {
  const msg = await Message.create({ room, sender: senderId, text });
  await msg.populate('sender', 'displayName avatar username');

  // Dọn tin cũ nếu vượt giới hạn (chỉ count khi cần thiết)
  const count = await Message.countDocuments({ room });
  if (count > KEEP_LIMIT) {
    const toDeleteCount = count - KEEP_LIMIT;
    // Lấy IDs của tin cũ nhất (dùng .lean() để tối ưu)
    const oldestIds = await Message.find({ room })
      .sort({ createdAt: 1 })
      .limit(toDeleteCount)
      .select('_id')
      .lean();
    
    if (oldestIds.length > 0) {
      await Message.deleteMany({ _id: { $in: oldestIds.map(m => m._id) } });
    }
  }

  return msg;
};

/**
 * Đánh dấu đã xem
 */
const markSeen = async (messageId, userId) => {
  await Message.findByIdAndUpdate(messageId, { $addToSet: { seenBy: userId } });
};

/**
 * Thu hồi tin nhắn (admin)
 */
const recallMessage = async (messageId) => {
  const msg = await Message.findByIdAndUpdate(messageId, { recalled: true }, { new: true });
  if (!msg) throw Object.assign(new Error('Tin nhắn không tồn tại'), { status: 404 });
  return msg;
};

/**
 * Xóa tin nhắn (owner hoặc admin)
 */
const deleteMessage = async (messageId, userId, isAdmin) => {
  const msg = await Message.findById(messageId);
  if (!msg) throw Object.assign(new Error('Tin nhắn không tồn tại'), { status: 404 });

  if (!isAdmin && String(msg.sender) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền xóa tin nhắn này'), { status: 403 });
  }

  await Message.findByIdAndUpdate(messageId, { deleted: true });
  return msg;
};

module.exports = { getHistory, saveMessage, markSeen, recallMessage, deleteMessage };
