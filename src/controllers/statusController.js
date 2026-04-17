'use strict';

const statusService = require('../services/statusService');
const Status        = require('../models/Status');
const path          = require('path');
const fs            = require('fs');

/** GET /api/statuses */
const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, sort = 'smart', tag = '' } = req.query;
    const result = await statusService.getStatuses({
      page: +page,
      limit: Math.min(+limit, 30),
      sort,
      tag: String(tag || '').trim().replace(/^#/, '').toLowerCase(),
      viewerId: req.user?._id || null,
    });
    // Mark liked-by-me for the current user
    if (req.user) {
      const uid = String(req.user._id);
      result.statuses = result.statuses.map(s => ({
        ...s,
        likedByMe: (s.likes || []).map(String).includes(uid),
      }));
    }
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/** POST /api/statuses */
const create = async (req, res, next) => {
  try {
    const { content } = req.body;
    const imageFiles = req.files?.images || [];
    const images = imageFiles.map(f => '/uploads/' + f.filename);
    const status = await statusService.createStatus({ author: req.user._id, content, images });
    res.status(201).json({ success: true, status });
  } catch (err) { next(err); }
};

/** PUT /api/statuses/:id */
const update = async (req, res, next) => {
  try {
    const imageFiles = req.files?.images || [];
    const newImages = imageFiles.map((f) => '/uploads/' + f.filename);
    const keepImagesRaw = req.body.keepImages;
    const keepImages = keepImagesRaw === undefined
      ? null
      : (Array.isArray(keepImagesRaw)
        ? keepImagesRaw
        : (keepImagesRaw ? [keepImagesRaw] : []));

    const result = await statusService.updateStatus({
      statusId: req.params.id,
      userId: req.user._id,
      isAdmin: req.user.isAdmin,
      content: req.body.content,
      keepImages,
      newImages,
    });

    (result.removedImages || []).forEach((img) => {
      if (typeof img === 'string' && img.startsWith('/uploads/')) {
        fs.unlink(path.join(__dirname, '../../', img), () => {});
      }
    });

    res.json({ success: true, status: result.status });
  } catch (err) { next(err); }
};

/** DELETE /api/statuses/:id */
const remove = async (req, res, next) => {
  try {
    const status = await statusService.deleteStatus(req.params.id, req.user._id, req.user.isAdmin);
    // Clean up uploaded images
    (status.images || []).forEach(img => {
      if (img.startsWith('/uploads/')) {
        fs.unlink(path.join(__dirname, '../../', img), () => {});
      }
    });
    res.json({ success: true, message: 'Đã xóa trạng thái' });
  } catch (err) { next(err); }
};

/** POST /api/statuses/:id/like */
const toggleLike = async (req, res, next) => {
  try {
    const targetStatus = await Status.findById(req.params.id).select('author content').lean();
    const result = await statusService.toggleLike(req.params.id, req.user._id);

    if (result.liked && targetStatus?.author && String(targetStatus.author) !== String(req.user._id)) {
      const io = req.app.get('io');
      io.to(`user:${targetStatus.author}`).emit('activity:new', {
        type: 'status_liked',
        user: { _id: req.user._id, displayName: req.user.displayName, username: req.user.username, avatar: req.user.avatar || '' },
        status: { _id: req.params.id, content: targetStatus.content || '' },
        targetUser: { _id: targetStatus.author },
        createdAt: new Date(),
      });
    }

    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/** GET /api/statuses/:id/comments */
const getComments = async (req, res, next) => {
  try {
    const comments = await statusService.getComments(req.params.id);
    res.json({ success: true, comments });
  } catch (err) { next(err); }
};

/** POST /api/statuses/:id/comments */
const addComment = async (req, res, next) => {
  try {
    const targetStatus = await Status.findById(req.params.id).select('author content').lean();
    const comment = await statusService.addComment({
      status: req.params.id, author: req.user._id, text: req.body.text,
    });

    if (targetStatus?.author && String(targetStatus.author) !== String(req.user._id)) {
      const io = req.app.get('io');
      io.to(`user:${targetStatus.author}`).emit('activity:new', {
        type: 'status_commented',
        user: { _id: req.user._id, displayName: req.user.displayName, username: req.user.username, avatar: req.user.avatar || '' },
        status: { _id: req.params.id, content: targetStatus.content || '' },
        targetUser: { _id: targetStatus.author },
        createdAt: comment.createdAt || new Date(),
      });
    }

    res.status(201).json({ success: true, comment });
  } catch (err) { next(err); }
};

/** DELETE /api/statuses/comments/:id */
const deleteComment = async (req, res, next) => {
  try {
    await statusService.deleteComment(req.params.id, req.user._id, req.user.isAdmin);
    res.json({ success: true, message: 'Đã xóa bình luận' });
  } catch (err) { next(err); }
};

module.exports = { list, create, update, remove, toggleLike, getComments, addComment, deleteComment };
