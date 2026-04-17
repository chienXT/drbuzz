'use strict';

const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    title:   { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    slug:    { type: String, unique: true, sparse: true },
    excerpt: { type: String, required: true, trim: true, minlength: 5, maxlength: 500 },
    content: { type: String, required: true, minlength: 10 },

    // Tác giả
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Ảnh – hỗ trợ nhiều ảnh
    images:    { type: [String], default: [] },
    thumbnail: { type: String, default: '' },

    // Video – upload file hoặc URL (YouTube/embed)
    videos:    { type: [String], default: [] },

    // Category & tag
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    tags:       { type: [String], default: [] },

    // Tương tác
    likes:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    views:      { type: Number, default: 0 },
    bookmarkBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Trạng thái
    status: { type: String, enum: ['draft', 'published'], default: 'published' },

    // Loại bài: post (bài viết thường) | video (trang video)
    postType: { type: String, enum: ['post', 'video'], default: 'post' },
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ── Số lượng comment (virtual) ── */
postSchema.virtual('commentCount', {
  ref:          'Comment',
  localField:   '_id',
  foreignField: 'post',
  count:        true,
});

/* ── Tự tạo slug ── */
postSchema.pre('save', async function (next) {
  if (!this.isModified('title')) return next();
  let base = this.title
    .toLowerCase()
    .replace(/[àáảãạăắặẳẵằâấầẩẫậ]/g, 'a')
    .replace(/[èéẻẽẹêếềểễệ]/g, 'e')
    .replace(/[ìíỉĩị]/g, 'i')
    .replace(/[òóỏõọôốồổỗộơớờởỡợ]/g, 'o')
    .replace(/[ùúủũụưứừửữự]/g, 'u')
    .replace(/[ỳýỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  // Unique slug: base + short random suffix (avoids race condition & repeated DB queries)
  this.slug = `${base}-${Date.now().toString(36)}`;

  // Thumbnail = ảnh đầu tiên
  if (this.images.length && !this.thumbnail) {
    this.thumbnail = this.images[0];
  }

  next();
});

/* ── Index cho filter/sort ── */
postSchema.index({ categories: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ status: 1, views: -1, createdAt: -1 });
postSchema.index({ postType: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
