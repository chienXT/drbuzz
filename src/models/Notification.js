'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: ['friend_request', 'friend_accept', 'post_like', 'post_comment', 'comment_like', 'private_message'],
      required: true,
    },
    // Liên kết tới bài viết / comment / post nếu có
    refPost:    { type: mongoose.Schema.Types.ObjectId, ref: 'Post',    default: null },
    refComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    message: { type: String, required: true, maxlength: 200 },
    read:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
