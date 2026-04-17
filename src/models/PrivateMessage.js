'use strict';

const mongoose = require('mongoose');

const privateMessageSchema = new mongoose.Schema(
  {
    sender:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text:     { type: String, required: true, maxlength: 1000 },
    read:     { type: Boolean, default: false },
    recalled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Composite index for fast conversation lookup
privateMessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
privateMessageSchema.index({ receiver: 1, read: 1 });

module.exports = mongoose.model('PrivateMessage', privateMessageSchema);
