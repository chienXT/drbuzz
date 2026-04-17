'use strict';

const mongoose = require('mongoose');

const statusCommentSchema = new mongoose.Schema(
  {
    status: { type: mongoose.Schema.Types.ObjectId, ref: 'Status', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    text:   { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    likes:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

statusCommentSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('StatusComment', statusCommentSchema);
