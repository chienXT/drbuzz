'use strict';

const chatService = require('../services/chatService');

/** GET /api/chat/history?room=global */
const history = async (req, res, next) => {
  try {
    const room = req.query.room || 'global';
    const msgs = await chatService.getHistory(room);
    res.json({ success: true, messages: msgs });
  } catch (err) { next(err); }
};

/** DELETE /api/chat/:id */
const remove = async (req, res, next) => {
  try {
    const msg = await chatService.deleteMessage(req.params.id, req.user._id, req.user.isAdmin);
    // Emit sẽ được xử lý bởi socket handler
    req.app.get('io').to(msg.room).emit('chat:deleted', { id: msg._id });
    res.json({ success: true });
  } catch (err) { next(err); }
};

/** PATCH /api/chat/:id/recall  (admin) */
const recall = async (req, res, next) => {
  try {
    const msg = await chatService.recallMessage(req.params.id);
    req.app.get('io').to(msg.room).emit('chat:recalled', { id: msg._id });
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = { history, remove, recall };
