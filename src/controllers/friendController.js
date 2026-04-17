'use strict';

const friendService = require('../services/friendService');

// Rate limiting for friend requests (simple in-memory)
const requestCooldowns = new Map();

const FRIEND_REQUEST_COOLDOWN = 30000; // 30 seconds between requests

/** GET /api/friends/status/:userId */
const status = async (req, res, next) => {
  try {
    const s = await friendService.getStatus(req.user._id, req.params.userId);
    res.json({ success: true, status: s });
  } catch (err) { next(err); }
};

/** POST /api/friends/request */
const sendRequest = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const recipientId = req.body.recipientId;
    
    // Check cooldown
    const key = `${userId}-${recipientId}`;
    const lastRequest = requestCooldowns.get(key);
    if (lastRequest && Date.now() - lastRequest < FRIEND_REQUEST_COOLDOWN) {
      const remaining = Math.ceil((FRIEND_REQUEST_COOLDOWN - (Date.now() - lastRequest)) / 1000);
      return res.status(429).json({ 
        success: false, 
        message: `Quá nhiều yêu cầu. Thử lại sau ${remaining} giây.` 
      });
    }
    
    const ship = await friendService.sendRequest(req.user._id, req.body.recipientId);
    
    // Set cooldown
    requestCooldowns.set(key, Date.now());
    
    // Emit real-time notification
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.body.recipientId}`).emit('friend:new_request', {
        fromUserId: req.user._id,
        fromName: req.user.displayName,
        fromAvatar: req.user.avatar || '',
        shipId: ship._id,
      });
    }
    
    res.json({ success: true, message: 'Đã gửi lời mời kết bạn' });
  } catch (err) { next(err); }
};

/** POST /api/friends/accept */
const accept = async (req, res, next) => {
  try {
    const ship = await friendService.acceptRequest(req.body.shipId, req.user._id);
    
    // Emit real-time notification to the requester
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${ship.requester}`).emit('friend:accepted', {
        fromUserId: req.user._id,
        fromName: req.user.displayName,
        fromAvatar: req.user.avatar || '',
        shipId: ship._id,
      });
    }
    
    res.json({ success: true, message: 'Đã chấp nhận lời mời' });
  } catch (err) {
    next(err);
  }
};

/** POST /api/friends/accept-from/:userId - Accept request from specific user */
const acceptFromUser = async (req, res, next) => {
  try {
    const requesterId = req.params.userId;
    const recipientId = req.user._id;

    const Friendship = require('../models/Friendship');
    const ship = await Friendship.findOne({
      requester: requesterId,
      recipient: recipientId,
      status: 'pending'
    });

    if (!ship) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lời mời kết bạn' });
    }

    const acceptedShip = await friendService.acceptRequest(ship._id, recipientId);

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${requesterId}`).emit('friend:accepted', {
        fromUserId: recipientId,
        fromName: req.user.displayName,
        fromAvatar: req.user.avatar || '',
        shipId: acceptedShip._id,
      });
    }

    res.json({ success: true, message: 'Đã chấp nhận lời mời kết bạn' });
  } catch (err) {
    next(err);
  }
};

/** POST /api/friends/decline */
const decline = async (req, res, next) => {
  try {
    await friendService.declineRequest(req.body.shipId, req.user._id);
    res.json({ success: true, message: 'Đã từ chối lời mời' });
  } catch (err) {
    next(err);
  }
};

/** POST /api/friends/decline-from/:userId - Decline request from specific user */
const declineFromUser = async (req, res, next) => {
  try {
    const requesterId = req.params.userId;
    const recipientId = req.user._id;
    
    await friendService.declineRequestFromUser(requesterId, recipientId);
    
    res.json({ success: true, message: 'Đã từ chối lời mời kết bạn' });
  } catch (err) {
    next(err);
  }
};

/** POST /api/friends/remove */
const remove = async (req, res, next) => {
  try {
    await friendService.removeFriend(req.user._id, req.body.friendId);
    res.json({ success: true });
  } catch (err) { next(err); }
};

/** GET /api/friends */
const list = async (req, res, next) => {
  try {
    const friends = await friendService.getFriends(req.user._id);
    res.json({ success: true, friends });
  } catch (err) { next(err); }
};

/** GET /api/friends/pending */
const pending = async (req, res, next) => {
  try {
    const requests = await friendService.getPendingRequests(req.user._id);
    res.json({ success: true, requests });
  } catch (err) { next(err); }
};

module.exports = { status, sendRequest, accept, acceptFromUser, decline, declineFromUser, remove, list, pending };
