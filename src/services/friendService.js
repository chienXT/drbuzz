'use strict';

const Friendship    = require('../models/Friendship');
const User          = require('../models/User');
const Notification  = require('../models/Notification');

const clearPendingFriendRequestNotification = async (requesterId, recipientId) => {
  await Notification.deleteMany({
    recipient: recipientId,
    sender: requesterId,
    type: 'friend_request',
  });
};

/**
 * Lấy trạng thái quan hệ giữa 2 user
 * @returns 'none' | 'pending_sent' | 'pending_received' | 'accepted'
 */
const getStatus = async (userId, otherId) => {
  const ship = await Friendship.findOne({
    $or: [
      { requester: userId, recipient: otherId },
      { requester: otherId, recipient: userId },
    ],
  });
  if (!ship) return 'none';
  if (ship.status === 'accepted') return 'accepted';
  if (ship.status === 'pending') {
    return String(ship.requester) === String(userId) ? 'pending_sent' : 'pending_received';
  }
  return 'none';
};

/**
 * Gửi lời mời kết bạn
 */
const sendRequest = async (requesterId, recipientId) => {
  if (String(requesterId) === String(recipientId))
    throw Object.assign(new Error('Không thể kết bạn với chính mình'), { status: 400 });

  const exists = await Friendship.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId },
    ],
  });
  if (exists) {
    const msg = exists.status === 'accepted' ? 'Đã là bạn bè' : 'Đã gửi lời mời trước đó';
    throw Object.assign(new Error(msg), { status: 400 });
  }

  const ship = await Friendship.create({ requester: requesterId, recipient: recipientId });

  // Tạo notification
  const sender = await User.findById(requesterId).select('displayName');
  await Notification.create({
    recipient: recipientId,
    sender:    requesterId,
    type:      'friend_request',
    message:   `${sender.displayName} đã gửi lời mời kết bạn`,
  });

  return ship;
};

/**
 * Chấp nhận lời mời
 */
const acceptRequest = async (shipId, recipientId) => {
  const ship = await Friendship.findOneAndUpdate(
    { _id: shipId, recipient: recipientId, status: 'pending' },
    { status: 'accepted' },
    { new: true }
  );
  if (!ship) throw Object.assign(new Error('Không tìm thấy lời mời'), { status: 404 });

  await clearPendingFriendRequestNotification(ship.requester, recipientId);

  // Notification cho người gửi
  const accepter = await User.findById(recipientId).select('displayName');
  await Notification.create({
    recipient: ship.requester,
    sender:    recipientId,
    type:      'friend_accept',
    message:   `${accepter.displayName} đã chấp nhận lời mời kết bạn`,
  });

  return ship;
};

/**
 * Từ chối lời mời kết bạn
 */
const declineRequest = async (shipId, recipientId) => {
  const ship = await Friendship.findOneAndDelete(
    { _id: shipId, recipient: recipientId, status: 'pending' }
  );
  if (!ship) throw Object.assign(new Error('Không tìm thấy lời mời'), { status: 404 });
  await clearPendingFriendRequestNotification(ship.requester, recipientId);
  return ship;
};

/**
 * Từ chối lời mời từ user cụ thể
 */
const declineRequestFromUser = async (requesterId, recipientId) => {
  const ship = await Friendship.findOneAndDelete({
    requester: requesterId,
    recipient: recipientId,
    status: 'pending'
  });
  if (!ship) throw Object.assign(new Error('Không tìm thấy lời mời'), { status: 404 });
  await clearPendingFriendRequestNotification(requesterId, recipientId);
  return ship;
};

/**
 * Từ chối / Hủy / Xóa bạn
 */
const removeFriend = async (userId, otherId) => {
  const result = await Friendship.findOneAndDelete({
    $or: [
      { requester: userId, recipient: otherId },
      { requester: otherId, recipient: userId },
    ],
  });
  if (!result) throw Object.assign(new Error('Không tìm thấy mối quan hệ'), { status: 404 });
  return result;
};

/**
 * Danh sách bạn bè đã chấp nhận
 */
const getFriends = async (userId) => {
  const ships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  });

  const friendIds = ships.map((s) =>
    String(s.requester) === String(userId) ? s.recipient : s.requester
  );

  return User.find({ _id: { $in: friendIds } }).select('displayName username avatar');
};

/**
 * Lời mời chờ xác nhận (người nhận = userId)
 */
const getPendingRequests = async (userId) => {
  return Friendship.find({ recipient: userId, status: 'pending' })
    .populate('requester', 'displayName username avatar')
    .sort({ createdAt: -1 });
};

/**
 * Kiểm tra 2 người có phải bạn bè không
 */
const areFriends = async (userId, otherId) => {
  const ship = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: userId, recipient: otherId },
      { requester: otherId, recipient: userId },
    ],
  });
  return !!ship;
};

/**
 * Lấy gợi ý kết bạn
 */
const getSuggestions = async (userId, limit = 5) => {
  // Lấy danh sách bạn bè hiện tại
  const friends = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  });
  const friendIds = friends.map((s) =>
    String(s.requester) === String(userId) ? s.recipient : s.requester
  );
  
  // Lấy danh sách các ID đã gửi/nhận lời mời
  const pendingIds = await Friendship.find({
    status: 'pending',
    $or: [{ requester: userId }, { recipient: userId }],
  });
  const pendingUserIds = pendingIds.map((s) =>
    String(s.requester) === String(userId) ? s.recipient : s.requester
  );
  
  // Gợi ý: những người chưa là bạn, chưa có lời mời
  const suggestions = await User.find({
    _id: {
      $ne: userId,
      $nin: [...friendIds, ...pendingUserIds],
    },
  })
    .select('displayName username avatar')
    .limit(limit)
    .lean();
  
  return suggestions;
};

module.exports = { getStatus, sendRequest, acceptRequest, declineRequest, declineRequestFromUser, removeFriend, getFriends, getPendingRequests, areFriends, getSuggestions };
