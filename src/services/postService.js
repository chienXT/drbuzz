'use strict';

const sanitizeHtml = require('sanitize-html');
const Post         = require('../models/Post');
const Comment      = require('../models/Comment');
const User         = require('../models/User');
const Activity     = require('../models/Activity');
const cache        = require('../utils/cache');

/** Escape special regex meta-characters to prevent ReDoS */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SANITIZE_OPTS = {
  allowedTags: ['p','br','b','i','strong','em','u','h2','h3','ul','ol','li','blockquote','a','img','pre','code','video','source','iframe'],
  allowedAttributes: {
    'a':      ['href','target','rel'],
    'img':    ['src','alt','width','height','style'],
    'video':  ['controls','preload','width','height','style'],
    'source': ['src','type'],
    'iframe': ['src','allowfullscreen','frameborder','width','height','style'],
    'pre':    ['class'],
    'code':   ['class'],
  },
  allowedSchemes: ['http','https'],
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
  transformTags: {
    'a': (tag, attribs) => ({
      tagName: tag,
      attribs: { ...attribs, rel: 'noopener noreferrer', target: '_blank' },
    }),
    'iframe': (tag, attribs) => ({
      tagName: tag,
      attribs: { ...attribs, frameborder: '0' },
    }),
  },
};

/**
 * Chuyển đổi URL thuần trên dòng riêng thành thẻ HTML nhúng
 * - Link ảnh  → <img>
 * - Link video → <video>
 * - YouTube   → <iframe embed>
 */
const autoEmbedUrls = (content) => {
  return content.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return line;
    if (/<[a-z]/i.test(trimmed)) return line; // đã là HTML, bỏ qua

    const ytMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) {
      return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen frameborder="0" style="width:100%;aspect-ratio:16/9"></iframe>`;
    }
    if (/\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(trimmed)) {
      return `<img src="${trimmed}" alt="" style="max-width:100%">`;
    }
    if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed)) {
      return `<video controls preload="metadata" style="width:100%"><source src="${trimmed}"></video>`;
    }
    return line;
  }).join('\n');
};

/**
 * Lấy danh sách bài viết với filter, sort, pagination
 */
const getPosts = async ({ page = 1, limit = 6, category, tag, sort = 'newest', search }) => {
  const filter = { status: 'published', postType: { $ne: 'video' } };

  if (category) filter.categories = category;
  if (tag)      filter.tags = tag;
  if (search)   filter.title = new RegExp(escapeRegex(search), 'i');

  const sortMap = {
    newest:  { createdAt: -1 },
    popular: { likes: -1, views: -1 },
    oldest:  { createdAt: 1 },
  };

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort(sortMap[sort] || sortMap.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'displayName avatar username')
      .populate('categories', 'name slug color icon')
      .lean(),
    Post.countDocuments(filter),
  ]);

  return { posts, total, pages: Math.ceil(total / limit), page };
};

const getWeeklyTopPosts = async (limit = 10) => {
  // Check cache first (1 hour TTL)
  const cacheKey = `weekly_top_posts_${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);

  const posts = await Post.find({
    status: 'published',
    createdAt: { $gte: lastWeek }
  })
    .sort({ views: -1, likes: -1, createdAt: -1 })
    .limit(limit)
    .populate('author', 'displayName username')
    .lean();

  // Cache for 1 hour
  cache.set(cacheKey, posts, 3600);
  
  return posts;
};

/**
 * Lấy 1 bài viết theo ID hoặc slug, tăng view
 */
const getPostById = async (id) => {
  const query = id.match(/^[0-9a-fA-F]{24}$/)
    ? { _id: id }
    : { slug: id };

  const post = await Post.findOneAndUpdate(query, { $inc: { views: 1 } }, { new: true })
    .populate('author', 'displayName avatar username bio postCount commentCount')
    .populate('categories', 'name slug color icon')
    .populate('commentCount');

  if (!post) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });
  return post;
};

/**
 * Trích xuất src của thẻ <img> đầu tiên trong HTML
 */
const extractFirstImage = (html) => {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
};

const updatePost = async (postId, { title, excerpt, content, categories, tags, images, videos }) => {
  const sanitized = sanitizeHtml(autoEmbedUrls(content), SANITIZE_OPTS);
  const thumbnail = (images && images.length) ? images[0] : extractFirstImage(sanitized);

  const post = await Post.findByIdAndUpdate(
    postId,
    { title: title.trim(), excerpt: excerpt.trim(), content: sanitized, categories: categories || [], tags: tags || [], images: images || [], videos: videos || [], thumbnail },
    { new: true }
  ).populate([
    { path: 'author', select: 'displayName avatar username' },
    { path: 'categories', select: 'name slug color icon' },
  ]);

  if (!post) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });
  return post;
};

/**
 */
const getRelatedPosts = async (post, limit = 4) => {
  if (!post) return [];

  const categoryIds = (post.categories || []).map(c => String(c._id || c));
  const tags = post.tags || [];

  const filter = { status: 'published', _id: { $ne: post._id } };

  // Tìm các bài có chung danh mục hoặc tag
  filter.$or = [];
  if (categoryIds.length) filter.$or.push({ categories: { $in: categoryIds } });
  if (tags.length) filter.$or.push({ tags: { $in: tags } });

  if (!filter.$or.length) {
    // Nếu không có tag/danh mục nào, trả rỗng
    return [];
  }

  const posts = await Post.find(filter)
    .sort({ createdAt: -1, views: -1 })
    .limit(limit)
    .populate('author', 'displayName username')
    .populate('categories', 'name slug color icon')
    .lean();

  return posts;
};

/**
 * Tạo bài viết mới (chỉ admin)
 */
const createPost = async ({ title, excerpt, content, categories, tags, images, videos, author, postType = 'post' }) => {
  const sanitized = sanitizeHtml(autoEmbedUrls(content), SANITIZE_OPTS);
  const thumbnail = (images && images.length) ? images[0] : extractFirstImage(sanitized);

  const post = await Post.create({
    title: title.trim(),
    excerpt: excerpt.trim(),
    content: sanitized,
    categories: categories || [],
    tags: tags || [],
    images: images || [],
    videos: videos || [],
    thumbnail,
    author,
    postType,
  });

  await post.populate([
    { path: 'author', select: 'displayName avatar username' },
    { path: 'categories', select: 'name slug color icon' },
  ]);

  // Cập nhật postCount cho user
  await User.findByIdAndUpdate(author, { $inc: { postCount: 1 } });

  // Invalidate cache when new post is created
  cache.delete('recent_activities_20');
  cache.delete('weekly_top_posts_10');

  return post;
};

/**
 * Xóa bài viết
 */
const deletePost = async (postId, userId, isAdmin) => {
  const post = await Post.findById(postId);
  if (!post) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });

  if (!isAdmin && String(post.author) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền xóa bài này'), { status: 403 });
  }

  await Promise.all([
    Post.findByIdAndDelete(postId),
    Comment.deleteMany({ post: postId }),
    User.findByIdAndUpdate(post.author, { $inc: { postCount: -1 } }),
  ]);

  // Invalidate cache when post is deleted
  cache.delete('recent_activities_20');
  cache.delete('weekly_top_posts_10');

  return post;
};

/**
 * Lấy hoạt động gần đây từ Activity model (cached)
 */
const getRecentActivities = async (limit = 20) => {
  try {
    // Check cache first (30 min TTL for activities - changes more frequently)
    const cacheKey = `recent_activities_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: 'user', select: 'displayName avatar username _id' })
      .populate({ path: 'post', select: '_id title' })
      .populate({ path: 'status', select: '_id content' })
      .populate({ path: 'targetUser', select: '_id' })
      .lean();

    // Cache for 30 minutes
    cache.set(cacheKey, activities || [], 1800);
    
    return activities || [];
  } catch (err) {
    console.error('[getRecentActivities] Error:', err.message);
    return [];
  }
};


const toggleLike = async (postId, userId) => {
  // Check if already liked (without loading full doc)
  const existing = await Post.findById(postId).select('likes').lean();
  if (!existing) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });

  const isLiking = !existing.likes.map(String).includes(String(userId));

  // Use atomic update to avoid VersionError on concurrent requests
  let updated;
  if (isLiking) {
    updated = await Post.findByIdAndUpdate(
      postId,
      { $addToSet: { likes: userId } },
      { new: true, select: 'likes' }
    );
    try {
      await Activity.create({ type: 'post_liked', user: userId, post: postId });
    } catch (err) {
      // ignore duplicate activity errors
    }
  } else {
    updated = await Post.findByIdAndUpdate(
      postId,
      { $pull: { likes: userId } },
      { new: true, select: 'likes' }
    );
    try {
      await Activity.deleteOne({ type: 'post_liked', user: userId, post: postId });
    } catch (err) {
      // ignore
    }
  }

  return { liked: isLiking, count: updated ? updated.likes.length : existing.likes.length };
};

/**
 * Bookmark / un-bookmark bài viết
 */
const toggleBookmark = async (postId, userId) => {
  const post = await Post.findById(postId).select('bookmarkBy').lean();
  if (!post) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });

  const bookmarked = post.bookmarkBy.map(String).includes(String(userId));

  if (bookmarked) {
    await Promise.all([
      Post.findByIdAndUpdate(postId, { $pull: { bookmarkBy: userId } }),
      User.findByIdAndUpdate(userId, { $pull: { bookmarks: postId } }),
    ]);
  } else {
    await Promise.all([
      Post.findByIdAndUpdate(postId, { $addToSet: { bookmarkBy: userId } }),
      User.findByIdAndUpdate(userId, { $addToSet: { bookmarks: postId } }),
    ]);
  }

  return { bookmarked: !bookmarked };
};

/**
 * Lấy danh sách bài viết có video (videos array không rỗng)
 */
const getVideoPosts = async (limit = 20, excludeId = null) => {
  const filter = { status: 'published', postType: 'video' };
  if (excludeId) filter._id = { $ne: excludeId };
  return Post.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('author', 'displayName avatar username')
    .lean();
};

/** Hot videos sorted by views in a time period */
const getHotVideoPosts = async (period = 'all', limit = 10) => {
  const filter = { status: 'published', postType: 'video' };
  if (period === 'day') {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    filter.createdAt = { $gte: since };
  } else if (period === 'week') {
    const since = new Date(); since.setDate(since.getDate() - 7);
    filter.createdAt = { $gte: since };
  } else if (period === 'month') {
    const since = new Date(); since.setMonth(since.getMonth() - 1);
    filter.createdAt = { $gte: since };
  }
  return Post.find(filter)
    .sort({ views: -1, likes: -1, createdAt: -1 })
    .limit(limit)
    .populate('author', 'displayName username')
    .lean();
};

/** All episodes in same series (same category), sorted oldest→newest */
const getSeriesEpisodes = async (post, limit = 60) => {
  const catIds = (post.categories || []).map(c => String(c._id || c));
  const filter = { status: 'published', postType: 'video' };
  if (catIds.length) filter.categories = { $in: catIds };
  return Post.find(filter)
    .sort({ createdAt: 1 })
    .limit(limit)
    .select('_id title createdAt views thumbnail images videos tags')
    .lean();
};

/** Prev (older) and next (newer) video in same series */
const getAdjacentVideos = async (post) => {
  const catIds = (post.categories || []).map(c => String(c._id || c));
  const base = { status: 'published', postType: 'video' };
  if (catIds.length) base.categories = { $in: catIds };
  const [prev, next] = await Promise.all([
    Post.findOne({ ...base, createdAt: { $lt: post.createdAt }, _id: { $ne: post._id } })
      .sort({ createdAt: -1 }).select('_id title').lean(),
    Post.findOne({ ...base, createdAt: { $gt: post.createdAt }, _id: { $ne: post._id } })
      .sort({ createdAt: 1 }).select('_id title').lean(),
  ]);
  return { prev, next };
};

/** Videos filtered by day of week (0=Sun…6=Sat) */
const getVideosByDay = async (dayIndex, limit = 50) => {
  const all = await Post.find({ status: 'published', postType: 'video' })
    .sort({ createdAt: -1 })
    .limit(300)
    .populate('author', 'displayName avatar username')
    .lean();
  return all.filter(p => new Date(p.createdAt).getDay() === dayIndex).slice(0, limit);
};

module.exports = { getPosts, getWeeklyTopPosts, getPostById, getRelatedPosts, createPost, updatePost, deletePost, toggleLike, toggleBookmark, getRecentActivities, getVideoPosts, getHotVideoPosts, getSeriesEpisodes, getAdjacentVideos, getVideosByDay };
