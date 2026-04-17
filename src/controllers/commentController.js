'use strict';

const commentService = require('../services/commentService');

/** GET /api/posts/:postId/comments */
const list = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const result = await commentService.getComments(req.params.postId, { page, limit });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/** POST /api/posts/:postId/comments */
const create = async (req, res, next) => {
  try {
    const comment = await commentService.createComment({
      postId:   req.params.postId,
      text:     req.body.text,
      authorId: req.user._id,
      parentId: req.body.parentId || null,
    });

    // Real-time push: notify the target user of the reply via socket
    if (comment._replyTargetUserId) {
      const Post = require('../models/Post');
      const post = await Post.findById(req.params.postId).select('title').lean();
      const io = req.app.get('io');
      io.to(`user:${comment._replyTargetUserId}`).emit('activity:new', {
        type: 'comment_replied',
        user: { _id: req.user._id, displayName: req.user.displayName, username: req.user.username, avatar: req.user.avatar || '' },
        post: { _id: req.params.postId, title: post?.title || '' },
        createdAt: new Date(),
      });
    }

    res.status(201).json({ success: true, comment });
  } catch (err) { next(err); }
};

/** POST /api/comments/:id/like */
const toggleLike = async (req, res, next) => {
  try {
    const result = await commentService.toggleLike(req.params.id, req.user._id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/** DELETE /api/comments/:id */
const remove = async (req, res, next) => {
  try {
    await commentService.deleteComment(req.params.id, req.user._id, req.user.isAdmin);
    res.json({ success: true, message: 'Đã xóa bình luận' });
  } catch (err) { next(err); }
};

module.exports = { list, create, toggleLike, remove };
