'use strict';

const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['post_created', 'post_liked', 'comment_created', 'comment_replied', 'status_liked', 'status_commented'],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    status: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Status',
      default: null,
    },
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Every activity must point to either a post or a status.
activitySchema.pre('validate', function(next) {
  if (!this.post && !this.status) {
    return next(new Error('Activity must reference either post or status'));
  }
  next();
});

/* ── Index quò activity gần đây ── */
activitySchema.index({ createdAt: -1 });
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ post: 1, createdAt: -1 });
activitySchema.index({ status: 1, createdAt: -1 });
activitySchema.index({ targetUser: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);
