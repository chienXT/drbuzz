'use strict';

const postService = require('../services/postService');
const Category    = require('../models/Category');
const path        = require('path');
const fs          = require('fs');

/**
 * GET /api/posts
 * Query: page, limit, category, tag, sort, search
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 6, category, tag, sort = 'newest', search } = req.query;
    const result = await postService.getPosts({
      page: +page, limit: Math.min(+limit, 20),
      category, tag, sort, search,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/**
 * GET /api/posts/:id
 */
const detail = async (req, res, next) => {
  try {
    const post = await postService.getPostById(req.params.id);
    res.json({ success: true, post });
  } catch (err) { next(err); }
};

/**
 * POST /api/posts  (admin only)
 */
const create = async (req, res, next) => {
  try {
    const { title, excerpt, content, tags, postType } = req.body;
    const normalizedPostType = postType === 'video' ? 'video' : 'post';

    // Categories: JSON string hoặc array
    let categories = [];
    try {
      const raw = req.body.categories;
      if (Array.isArray(raw))             categories = raw;
      else if (typeof raw === 'string')   categories = JSON.parse(raw);
    } catch { categories = []; }

    // Ensure categories match content type (blog vs video)
    const allowedTarget = normalizedPostType === 'video' ? 'video' : 'blog';
    if (categories.length) {
      const validCategories = await Category.find({ _id: { $in: categories }, target: allowedTarget }).select('_id').lean();
      categories = validCategories.map(c => c._id);
    }

    // Tags
    let parsedTags = [];
    try {
      if (Array.isArray(tags))          parsedTags = tags;
      else if (typeof tags === 'string') parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    } catch { parsedTags = []; }

    // Ảnh upload (upload.fields → req.files.images)
    const imageFiles = req.files?.images || [];
    const images = imageFiles.map((f) => '/uploads/' + f.filename);

    // Ảnh URL thêm thủ công
    const imageUrls = [].concat(req.body.imageUrls || []).filter(Boolean);
    for (const u of imageUrls) {
      try { if (['http:', 'https:'].includes(new URL(u).protocol)) images.push(u); } catch { /* bỏ qua */ }
    }

    // Nếu không có ảnh nào, thêm placeholder
    if (!images.length) images.push(`https://picsum.photos/seed/${Date.now()}/600/350`);

    // Video upload (upload.fields → req.files.videos)
    const videoFiles = req.files?.videos || [];
    const videos = videoFiles.map((f) => '/uploads/' + f.filename);

    // Video URL (YouTube, raw link)
    const videoUrls = [].concat(req.body.videoUrls || []).filter(Boolean);
    for (const u of videoUrls) {
      try { if (['http:', 'https:'].includes(new URL(u).protocol)) videos.push(u); } catch { /* bỏ qua */ }
    }

    const post = await postService.createPost({
      title, excerpt, content: content || 'Đang cập nhật nội dung.', categories, tags: parsedTags, images, videos,
      author: req.user._id,
      postType: normalizedPostType,
    });

    res.status(201).json({ success: true, post });
  } catch (err) { next(err); }
};

/**
 * DELETE /api/posts/:id  (admin or author)
 */
const remove = async (req, res, next) => {
  try {
    const post = await postService.deletePost(req.params.id, req.user._id, req.user.isAdmin);

    // Xóa ảnh đã upload
    post.images?.forEach((img) => {
      if (img.startsWith('/uploads/')) {
        fs.unlink(path.join(__dirname, '../../', img), () => {});
      }
    });

    res.json({ success: true, message: 'Đã xóa bài viết' });
  } catch (err) { next(err); }
};

/**
 * POST /api/posts/:id/like
 */
const toggleLike = async (req, res, next) => {
  try {
    const result = await postService.toggleLike(req.params.id, req.user._id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/**
 * PUT /api/posts/:id  (admin or author)
 */
const update = async (req, res, next) => {
  try {
    const post = await postService.getPostById(req.params.id);
    if (!req.user.isAdmin && String(post.author?._id || post.author) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Không có quyền sửa bài này' });
    }

    const { title, excerpt, content, tags } = req.body;

    let categories = [];
    try {
      const raw = req.body.categories;
      if (Array.isArray(raw))           categories = raw;
      else if (typeof raw === 'string') categories = JSON.parse(raw);
    } catch { categories = []; }

    const allowedTarget = post.postType === 'video' ? 'video' : 'blog';
    if (categories.length) {
      const validCategories = await Category.find({ _id: { $in: categories }, target: allowedTarget }).select('_id').lean();
      categories = validCategories.map(c => c._id);
    }

    let parsedTags = [];
    try {
      if (Array.isArray(tags))           parsedTags = tags;
      else if (typeof tags === 'string') parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    } catch { parsedTags = []; }

    // Ảnh mới upload
    const newImageFiles = (req.files?.images || []).map(f => '/uploads/' + f.filename);
    const imageUrls = [].concat(req.body.imageUrls || []).filter(Boolean).filter(u => {
      try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
    });

    // Giữ ảnh cũ nếu không có ảnh mới
    const keepImages = [].concat(req.body.keepImages || []).filter(Boolean);
    const images = [...keepImages, ...newImageFiles, ...imageUrls];

    // Video mới upload
    const newVideoFiles = (req.files?.videos || []).map(f => '/uploads/' + f.filename);
    const videoUrls = [].concat(req.body.videoUrls || []).filter(Boolean).filter(u => {
      try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
    });
    const keepVideos = [].concat(req.body.keepVideos || []).filter(Boolean);
    const videos = [...keepVideos, ...newVideoFiles, ...videoUrls];

    const updated = await postService.updatePost(req.params.id, {
      title, excerpt, content, categories, tags: parsedTags, images, videos,
    });

    res.json({ success: true, post: updated });
  } catch (err) { next(err); }
};

/**
 * POST /api/posts/:id/bookmark
 */
const toggleBookmark = async (req, res, next) => {
  try {
    const result = await postService.toggleBookmark(req.params.id, req.user._id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, update, remove, toggleLike, toggleBookmark };
