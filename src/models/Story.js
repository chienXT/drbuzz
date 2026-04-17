'use strict';

const mongoose = require('mongoose');

const normalizeSlug = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const storySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 220,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    author: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      maxlength: 5000,
    },
    coverImage: {
      type: String,
      default: '',
      trim: true,
    },
    genres: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 12,
        message: 'Too many genres',
      },
    },
    status: {
      type: String,
      enum: ['ongoing', 'completed'],
      default: 'ongoing',
      index: true,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

storySchema.virtual('chapterCount', {
  ref: 'Chapter',
  localField: '_id',
  foreignField: 'storyId',
  count: true,
});

storySchema.pre('validate', function storyPreValidate(next) {
  if (!this.slug && this.title) {
    this.slug = normalizeSlug(this.title);
  } else if (this.slug) {
    this.slug = normalizeSlug(this.slug);
  }
  next();
});

storySchema.index({ createdAt: -1 });
storySchema.index({ genres: 1, createdAt: -1 });

module.exports = mongoose.model('Story', storySchema);
