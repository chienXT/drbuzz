'use strict';

const sanitizeHtml = require('sanitize-html');
const Comment      = require('../models/Comment');
const Post         = require('../models/Post');
const User         = require('../models/User');
const Activity     = require('../models/Activity');

/**
 * Lấy comments của 1 bài viết (có nested replies) với pagination
 */
const getComments = async (postId, { page = 1, limit = 10 } = {}) => {
  const skip = (page - 1) * limit;
  
  const [comments, total] = await Promise.all([
    Comment.find({ post: postId, parent: null })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'displayName avatar username')
      .lean(),
    Comment.countDocuments({ post: postId, parent: null }),
  ]);

  // Gắn replies (tối đa 5 replies) vào mỗi comment
  const replies = await Comment.find({ 
    post: postId, 
    parent: { $in: comments.map(c => c._id) } 
  })
    .sort({ createdAt: 1 })
    .limit(comments.length * 5) // Tối đa 5 replies/comment
    .populate('author', 'displayName avatar username')
    .lean();

  const replyMap = {};
  replies.forEach((r) => {
    const key = String(r.parent);
    if (!replyMap[key]) replyMap[key] = [];
    if (replyMap[key].length < 5) {
      replyMap[key].push(r);
    }
  });

  return { 
    comments: comments.map((c) => ({ ...c, replies: replyMap[String(c._id)] || [] })),
    total,
    pages: Math.ceil(total / limit),
    page,
  };
};

/**
 * Tạo comment mới
 */
const createComment = async ({ postId, text, authorId, parentId }) => {
  const post = await Post.findById(postId);
  if (!post) throw Object.assign(new Error('Bài viết không tồn tại'), { status: 404 });

  const clean = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });

  const comment = await Comment.create({
    post:   postId,
    author: authorId,
    parent: parentId || null,
    text:   clean,
  });

  await comment.populate('author', 'displayName avatar username');
  await User.findByIdAndUpdate(authorId, { $inc: { commentCount: 1 } });

  // Create activity for comment
  if (!parentId) {
    // Top-level comment
    try {
      await Activity.create({
        type: 'comment_created',
        user: authorId,
        post: postId,
        comment: comment._id,
      });
    } catch (err) {
      console.error('[createComment] Error creating activity:', err.message);
    }
  } else {
    // Reply to a comment - find the parent comment's author
    try {
      const parentComment = await Comment.findById(parentId).select('author');
      if (parentComment && String(parentComment.author) !== String(authorId)) {
        // Only create activity if replying to someone else's comment
        await Activity.create({
          type: 'comment_replied',
          user: authorId,
          post: postId,
          comment: comment._id,
          targetUser: parentComment.author,
        });
        comment._replyTargetUserId = String(parentComment.author);
      }
    } catch (err) {
      console.error('[createComment] Error creating reply activity:', err.message);
    }
  }

  return comment;
};

/**
 * Like / Unlike comment
 */
const toggleLike = async (commentId, userId) => {
  const comment = await Comment.findById(commentId);
  if (!comment) throw Object.assign(new Error('Comment không tồn tại'), { status: 404 });

  const idx = comment.likes.indexOf(userId);
  idx === -1 ? comment.likes.push(userId) : comment.likes.splice(idx, 1);
  await comment.save();

  return { liked: idx === -1, count: comment.likes.length };
};

/**
 * Xóa comment
 */
const deleteComment = async (commentId, userId, isAdmin) => {
  const comment = await Comment.findById(commentId);
  if (!comment) throw Object.assign(new Error('Comment không tồn tại'), { status: 404 });

  if (!isAdmin && String(comment.author) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền xóa comment này'), { status: 403 });
  }

  // Remove activity if it's a top-level comment
  if (!comment.parent) {
    try {
      await Activity.deleteOne({
        type: 'comment_created',
        comment: commentId,
      });
    } catch (err) {
      console.error('[deleteComment] Error removing activity:', err.message);
    }
  }

  await Promise.all([
    Comment.findByIdAndDelete(commentId),
    Comment.deleteMany({ parent: commentId }), // xóa replies
    User.findByIdAndUpdate(comment.author, { $inc: { commentCount: -1 } }),
  ]);
};

module.exports = { getComments, createComment, toggleLike, deleteComment };
