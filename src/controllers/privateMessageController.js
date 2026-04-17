'use strict';

const pmService = require('../services/privateMessageService');

const setNoStore = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
};

/** GET /api/messages — inbox (conversations list) */
const inbox = async (req, res, next) => {
  try {
    setNoStore(res);
    const data = await pmService.getInbox(req.user._id);
    res.json({ success: true, conversations: data });
  } catch (err) { next(err); }
};

/** GET /api/messages/:userId — history with one user */
const history = async (req, res, next) => {
  try {
    setNoStore(res);
    const msgs = await pmService.getHistory(req.user._id, req.params.userId);
    res.json({ success: true, messages: msgs });
  } catch (err) { next(err); }
};

/** POST /api/messages/:userId/read */
const markRead = async (req, res, next) => {
  try {
    await pmService.markRead(req.user._id, req.params.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
};

/** PATCH /api/messages/:id/recall */
const recall = async (req, res, next) => {
  try {
    const msg = await pmService.recallMessage(req.params.id, req.user._id);
    // Notify both parties via socket
    req.app.get('io').to(`user:${msg.sender}`).emit('pm:recalled', { msgId: msg._id });
    req.app.get('io').to(`user:${msg.receiver}`).emit('pm:recalled', { msgId: msg._id });
    res.json({ success: true });
  } catch (err) { next(err); }
};

/** GET /api/messages/unread-count */
const unreadCount = async (req, res, next) => {
  try {
    setNoStore(res);
    const count = await pmService.totalUnread(req.user._id);
    res.json({ success: true, count });
  } catch (err) { next(err); }
};

module.exports = { inbox, history, markRead, recall, unreadCount };
