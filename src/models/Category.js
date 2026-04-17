'use strict';

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    slug:  { type: String, required: true, unique: true, trim: true, lowercase: true },
    color: { type: String, default: '#e5e7eb', maxlength: 20 },
    icon:  { type: String, default: '📂', maxlength: 10 },
    target:{ type: String, enum: ['blog', 'video'], default: 'blog', index: true },
  },
  { timestamps: true }
);

/* ── Tự tạo slug từ name ── */
categorySchema.pre('validate', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);
