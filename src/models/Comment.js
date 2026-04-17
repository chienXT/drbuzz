'use strict';

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    post:   { type: mongoose.Schema.Types.ObjectId, ref: 'Post',    required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },

    text:  { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, createdAt: 1 });
commentSchema.index({ parent: 1 });

module.exports = mongoose.model('Comment', commentSchema);
