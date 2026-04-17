'use strict';

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    room:   { type: String, default: 'global', index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text:   { type: String, required: true, maxlength: 500 },

    // Ai đã xem tin nhắn
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Thu hồi / xóa
    recalled: { type: Boolean, default: false },
    deleted:  { type: Boolean, default: false },

    // Emojis reactions
    reactions: [{
      emoji: String,
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }],

    // Chỉnh sửa tin nhắn
    edited: { type: Boolean, default: false },
    editedAt: Date,
    editHistory: [{ text: String, at: Date }],

    // Ghim tin nhắn
    pinned: { type: Boolean, default: false },
    pinnedAt: Date,
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // @Mentions
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ room: 1, sender: 1 });

module.exports = mongoose.model('Message', messageSchema);
