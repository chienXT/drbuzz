'use strict';

const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema(
  {
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Story',
      required: true,
      index: true,
    },
    chapterNumber: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    content: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

chapterSchema.index({ storyId: 1, chapterNumber: 1 }, { unique: true });
chapterSchema.index({ storyId: 1, createdAt: 1 });

module.exports = mongoose.model('Chapter', chapterSchema);
