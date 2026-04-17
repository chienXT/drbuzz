'use strict';

const Post = require('../models/Post');
const User = require('../models/User');

/** Escape special regex meta-characters to prevent ReDoS */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tìm kiếm bài viết theo title / tags
 */
const searchPosts = async (q, limit = 20) => {
  if (!q) return [];
  const safe = escapeRegex(q);
  return Post.find({
    status: 'published',
    $or: [
      { title: { $regex: safe, $options: 'i' } },
      { excerpt: { $regex: safe, $options: 'i' } },
      { tags: { $regex: safe, $options: 'i' } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('categories', 'name slug color icon')
    .populate('author', 'displayName avatar username')
    .select('title excerpt thumbnail images likes views createdAt categories author tags');
};

/**
 * Tìm kiếm user theo username / displayName
 */
const searchUsers = async (q, limit = 10) => {
  if (!q) return [];
  const safe = escapeRegex(q);
  return User.find({
    $or: [
      { username:    { $regex: safe, $options: 'i' } },
      { displayName: { $regex: safe, $options: 'i' } },
    ],
  })
    .limit(limit)
    .select('displayName username avatar bio postCount commentCount');
};

module.exports = { searchPosts, searchUsers };
