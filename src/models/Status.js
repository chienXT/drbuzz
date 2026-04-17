'use strict';

const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema(
  {
    author:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
    images:  { type: [String], default: [] },
    likes:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject: { virtuals: true },
  }
);

statusSchema.index({ author: 1, createdAt: -1 });
statusSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Status', statusSchema);
