'use strict';

const postService    = require('../services/postService');
const statusService  = require('../services/statusService');
const commentService = require('../services/commentService');
const friendService  = require('../services/friendService');
const searchService  = require('../services/searchService');
const Category       = require('../models/Category');
const Post           = require('../models/Post');
const Comment        = require('../models/Comment');
const User           = require('../models/User');
const Friendship     = require('../models/Friendship');

/** Escape special regex meta-characters to prevent ReDoS */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (s = '') => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const linkifyHashtags = (text = '') => {
  const safe = escapeHtml(text);
  return safe.replace(/(^|\s)#([\p{L}\p{N}_]{2,50})/gu, (m, p1, tag) => {
    const href = '/social?tag=' + encodeURIComponent(tag.toLowerCase());
    return `${p1}<a href="${href}" class="sf-hashtag">#${tag}</a>`;
  });
};

/** Filter activities to only show friends' + replies to current user */
const filterActivityByFriends = async (userId, activities) => {
  if (!userId || !activities.length) return activities.slice(0, 5);
  const [fwd, rev] = await Promise.all([
    Friendship.find({ requester: userId, status: 'accepted' }).select('recipient').lean(),
    Friendship.find({ recipient: userId, status: 'accepted' }).select('requester').lean(),
  ]);
  const friendIds = new Set([
    ...fwd.map(f => String(f.recipient)),
    ...rev.map(f => String(f.requester)),
  ]);
  const me = String(userId);
  return activities.filter(a => {
    const uid = String(a.user?._id);
    return (uid !== me && friendIds.has(uid)) ||
           (a.type === 'comment_replied' && String(a.targetUser?._id) === me);
  }).slice(0, 5);
};

/** GET / */
const home = async (req, res, next) => {
  try {
    const { page = 1, sort = 'smart', banned, tag = '' } = req.query;
    const currentTag = String(tag || '').trim().replace(/^#/, '').toLowerCase();
    const isTagMode = Boolean(currentTag);
    const statusPage = isTagMode ? 1 : +page;
    const statusLimit = isTagMode ? 1000 : 15;
    const [statusResult, weeklyTopPosts, trendingHashtags] = await Promise.all([
      statusService.getStatuses({
        page: statusPage,
        limit: statusLimit,
        sort,
        tag: currentTag,
        viewerId: req.user?._id || null,
      }),
      postService.getWeeklyTopPosts(10),
      statusService.getWeeklyTrendingHashtags({ days: 7, limit: 5 }),
    ]);
    let recentActivity = await postService.getRecentActivities(20) || [];
    let friendSuggestions = [];

    if (req.user) {
      friendSuggestions = await friendService.getSuggestions(req.user._id, 5);
      // Mark liked-by-me
      const uid = String(req.user._id);
      statusResult.statuses = statusResult.statuses.map(s => ({
        ...s,
        likedByMe: (s.likes || []).map(String).includes(uid),
      }));
    }

    recentActivity = await filterActivityByFriends(req.user?._id, recentActivity);

    res.render('index', {
      user: req.user || null,
      statuses: statusResult.statuses, total: statusResult.total,
      pages: isTagMode ? 1 : statusResult.pages,
      page: isTagMode ? 1 : statusResult.page,
      weeklyTopPosts, recentActivity, friendSuggestions,
      trendingHashtags,
      currentTag,
      linkifyHashtags,
      currentSort: sort,
      showBannedMessage: banned === '1',
    });
  } catch (err) { next(err); }
};

/** GET /bai-viet/:id */
const postDetail = async (req, res, next) => {
  try {
    const post     = await postService.getPostById(req.params.id);
    const { comments } = await commentService.getComments(post._id);
    const related = await postService.getRelatedPosts(post, 6);
    let recentActivity = await postService.getRecentActivities(20) || [];
    
    let authorFriendship = null;
    if (req.user) {
      const currentUserId = req.user._id;
      const authorId = post.author?._id;

      // Check friendship status with post author
      if (authorId && String(authorId) !== String(currentUserId)) {
        authorFriendship = await Friendship.findOne({
          $or: [
            { requester: currentUserId, recipient: authorId },
            { requester: authorId, recipient: currentUserId },
          ]
        }).select('status requester').lean();
      }
    }
    recentActivity = await filterActivityByFriends(req.user?._id, recentActivity);
    
    res.render('post', {
      user: req.user || null, post, comments, recentActivity, authorFriendship,
      related: (related || []).filter(p => String(p._id) !== String(post._id)).slice(0,4),
    });
  } catch (err) { next(err); }
};

/** GET /chat */
const chat = (req, res) => {
  res.render('chat', { user: req.user });
};

/** GET /messages */
const messages = async (req, res, next) => {
  try {
    const friends = await friendService.getFriends(req.user._id);
    res.render('messages', { user: req.user, friends, popupMode: req.query.popup === '1' });
  } catch (err) { next(err); }
};

/** GET /profile */
const profile = async (req, res, next) => {
  try {
    let recentActivity = await postService.getRecentActivities(20) || [];
    recentActivity = await filterActivityByFriends(req.user?._id, recentActivity);
    
    res.render('profile', { user: req.user, recentActivity });
  } catch (err) { next(err); }
};

/** GET /u/:username — public profile */
const publicProfile = async (req, res, next) => {
  try {
    const target = await User.findOne({ username: req.params.username }).select('-password');
    if (!target) return res.status(404).render('404', { user: req.user || null });

    const { posts } = await postService.getPosts({ page: 1, limit: 12, sort: 'newest' });
    const userPosts = posts.filter(p => String(p.author?._id) === String(target._id));

    let friendStatus = 'none';
    if (req.user && String(req.user._id) !== String(target._id)) {
      friendStatus = await friendService.getStatus(req.user._id, target._id);
    }
    const isSelf = req.user && String(req.user._id) === String(target._id);
    let recentActivity = await postService.getRecentActivities(20) || [];
    recentActivity = await filterActivityByFriends(req.user?._id, recentActivity);
    
    res.render('profile-public', { user: req.user || null, target, userPosts, friendStatus, isSelf, recentActivity });
  } catch (err) { next(err); }
};

/** GET /search */
const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    let posts = [], users = [];
    if (q) {
      [posts, users] = await Promise.all([searchService.searchPosts(q), searchService.searchUsers(q)]);
    }
    let recentActivity = await postService.getRecentActivities(20) || [];
    recentActivity = await filterActivityByFriends(req.user?._id, recentActivity);
    
    res.render('search', { user: req.user || null, query: q, posts, users, recentActivity });
  } catch (err) { next(err); }
};

/** GET /dang-bai */
const createPost = async (req, res, next) => {
  try {
    const categories = await Category.find({ target: 'blog' }).sort({ name: 1 });
    let recentActivity = await postService.getRecentActivities(20) || [];

    // Load bài cũ nếu có ?edit=postId (admin hoặc tác giả)
    let editPost = null;
    if (req.query.edit) {
      try {
        const found = await Post.findById(req.query.edit).populate('categories', '_id').lean();
        if (found && (req.user?.isAdmin || found.author.toString() === req.user._id.toString())) {
          editPost = found;
        }
      } catch { /* ID không hợp lệ hoặc post không tồn tại, tiếp tục như form tạo mới */ }
    }

    recentActivity = await filterActivityByFriends(req.user?._id, recentActivity);

    res.render('create-post', { user: req.user, categories, activePage: 'home', recentActivity, editPost });
  } catch (err) { next(err); }
};

/** GET /quan-ly-danh-muc */
const manageCategories = async (req, res, next) => {
  try {
    // Backfill legacy categories created before target existed.
    const [videoCategoryIds, blogCategoryIds] = await Promise.all([
      Post.distinct('categories', { postType: 'video' }),
      Post.distinct('categories', { postType: { $ne: 'video' } }),
    ]);
    const blogSet = new Set(blogCategoryIds.map(x => String(x)));
    const videoOnly = videoCategoryIds
      .map(id => String(id))
      .filter(id => !blogSet.has(id));

    if (videoOnly.length) {
      await Category.updateMany(
        { _id: { $in: videoOnly }, target: { $exists: false } },
        { $set: { target: 'video' } }
      );
    }
    await Category.updateMany({ target: { $exists: false } }, { $set: { target: 'blog' } });

    const categories = await Category.find().sort({ name: 1 });
    res.render('manage-categories', {
      user: req.user,
      currentUser: req.user,
      categories: categories || [],
      activePage: 'admin',
      currentCategory: null,
      searchQuery: null,
      weeklyTopPosts: []
    });
  } catch (err) { next(err); }
};

/** GET /quan-ly-nguoi-dung */
const manageUsers = async (req, res, next) => {
  try {
    const { page = 1, search, role, status } = req.query;
    const limit = 20;
    const filter = {};

    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { displayName: new RegExp(safe, 'i') },
        { username: new RegExp(safe, 'i') }
      ];
    }

    if (role === 'admin') filter.isAdmin = true;
    if (role === 'user') filter.isAdmin = false;

    if (status === 'banned') filter.isBanned = true;
    if (status === 'active') filter.isBanned = { $ne: true };

    const [users, total, totalAdmin, totalBanned] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-password'),
      User.countDocuments(filter),
      User.countDocuments({ isAdmin: true }),
      User.countDocuments({ isBanned: true }),
    ]);

    const pages = Math.ceil(total / limit);

    res.render('manage-users', {
      user: req.user,
      currentUser: req.user,
      users,
      total,
      totalAdmin,
      totalBanned,
      pages,
      page: +page,
      search,
      role,
      status,
      activePage: 'admin',
      categories: [],
      currentCategory: null,
      searchQuery: null,
      weeklyTopPosts: []
    });
  } catch (err) { next(err); }
};

/** GET /friends — Friends list */
const friends = async (req, res, next) => {
  try {
    if (!req.user) return res.redirect('/?login=1');
    const { search = '' } = req.query;
    const userFriends = await friendService.getFriends(req.user._id);
    
    let friendsList = userFriends || [];
    if (search) {
      const searchLower = search.toLowerCase();
      friendsList = friendsList.filter(f => 
        f.displayName.toLowerCase().includes(searchLower) || 
        f.username.toLowerCase().includes(searchLower)
      );
    }
    
    const recentActivity = await postService.getRecentActivities(20) || [];
    res.render('friends', { 
      user: req.user, 
      friends: friendsList, 
      search,
      friendCount: userFriends?.length || 0,
      recentActivity
    });
  } catch (err) { next(err); }
};

// Get stats (online users, visitors, etc.)
const getStats = async (req, res) => {
  try {
    const Post = require('../models/Post');
    const User = require('../models/User');
    const Category = require('../models/Category');

    const totalPosts = await Post.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalCategories = await Category.countDocuments();

    // For now, estimate visitors = online users + 30% buffer (for guests)
    // In a real scenario, you'd track sessions or pageviews
    const onlineCount = global.onlineCount || 0;
    const visitors = Math.ceil(onlineCount * 1.3) || 1;

    res.json({
      success: true,
      posts: totalPosts,
      users: totalUsers,
      categories: totalCategories,
      online: onlineCount,
      visitors: visitors
    });
  } catch (err) {
    res.json({ success: false, visitors: 0, online: 0 });
  }
};

/** GET /dang-video */
const createVideoPost = async (req, res, next) => {
  try {
    const categories = await Category.find({ target: 'video' }).sort({ name: 1 });
    let editPost = null;
    if (req.query.edit) {
      try {
        const found = await Post.findById(req.query.edit).populate('categories', '_id').lean();
        if (found && (req.user?.isAdmin || found.author.toString() === req.user._id.toString())) {
          editPost = found;
        }
      } catch { /* bỏ qua */ }
    }
    res.render('create-video', { user: req.user, categories, activePage: 'video', editPost });
  } catch (err) { next(err); }
};

/** GET /video — Danh sách video */
const videoList = async (req, res, next) => {
  try {
    const day       = req.query.day || 'new';
    const hotPeriod = req.query.hot || 'day';

    let videoPosts;
    if (day === 'new') {
      videoPosts = await postService.getVideoPosts(60);
    } else {
      videoPosts = await postService.getVideosByDay(parseInt(day, 10), 60);
    }

    const hotVideos = await postService.getHotVideoPosts(hotPeriod, 10);
    res.render('video-list', { user: req.user || null, videoPosts, hotVideos, activeDay: day, hotPeriod });
  } catch (err) { next(err); }
};

/** GET /video/:id */
const videoDetail = async (req, res, next) => {
  try {
    const post      = await postService.getPostById(req.params.id);
    const hotPeriod = req.query.hot || 'all';
    const preferredSourceIndex = Number.isFinite(parseInt(req.query.src, 10))
      ? Math.max(0, parseInt(req.query.src, 10))
      : 0;

    const [commentsResult, seriesEpisodes, hotVideos, adjacent] = await Promise.all([
      commentService.getComments(post._id),
      postService.getSeriesEpisodes(post, 60),
      postService.getHotVideoPosts(hotPeriod, 10),
      postService.getAdjacentVideos(post),
    ]);

    res.render('video', {
      user: req.user || null,
      post,
      comments: commentsResult.comments,
      seriesEpisodes,
      hotVideos,
      prevPost: adjacent.prev,
      nextPost: adjacent.next,
      hotPeriod,
      preferredSourceIndex,
    });
  } catch (err) { next(err); }
};

/* ══════════════════════════════════════════════
   CLASSIC BLOG/VIDEO SECTION
   ══════════════════════════════════════════════ */

/** GET /blog — Classic blog listing */
const classicBlog = async (req, res, next) => {
  try {
    const { page = 1, category, tag, search } = req.query;
    const limit = 10;
    const filter = { status: 'published', postType: { $ne: 'video' } };

    if (category) filter.categories = category;
    if (tag) filter.tags = tag;
    if (search) {
      const safe = escapeRegex(String(search).trim());
      filter.$or = [
        { title: new RegExp(safe, 'i') },
        { excerpt: new RegExp(safe, 'i') },
        { tags: new RegExp(safe, 'i') },
      ];
    }

    const [posts, total, categories, recentPosts] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip((+page - 1) * limit)
        .limit(limit)
        .populate('author', 'displayName username avatar')
        .populate('categories', 'name slug color icon')
        .populate('commentCount'),
      Post.countDocuments(filter),
      Category.find({ target: 'blog' }).sort({ name: 1 }).lean(),
      Post.find({ status: 'published', postType: { $ne: 'video' } })
        .sort({ createdAt: -1 }).limit(5)
        .select('title slug createdAt').lean(),
    ]);

    const pages = Math.ceil(total / limit);

    // Keep category id for query links and category name for breadcrumb/title.
    let currentCategory = '';
    let currentCategoryName = '';
    if (category) {
      const cat = categories.find(c => String(c._id) === String(category));
      if (cat) {
        currentCategory = String(cat._id);
        currentCategoryName = cat.name;
      }
    }

    res.render('classic-blog', {
      user: req.user || null, posts, page: +page, pages, categories, recentPosts,
      searchQuery: search || '', currentCategory, currentCategoryName, currentTag: tag || '',
    });
  } catch (err) { next(err); }
};

/** GET /blog/:slug — Classic blog post detail */
const classicBlogPost = async (req, res, next) => {
  try {
    const post = await postService.getPostById(req.params.slug);
    if (!post) return res.status(404).render('404', { user: req.user || null });

    const [commentsResult, related, categories, recentPosts] = await Promise.all([
      commentService.getComments(post._id),
      postService.getRelatedPosts(post, 6),
      Category.find({ target: 'blog' }).sort({ name: 1 }).lean(),
      Post.find({ status: 'published', postType: { $ne: 'video' } })
        .sort({ createdAt: -1 }).limit(5)
        .select('title slug createdAt').lean(),
    ]);

    res.render('classic-blog-post', {
      user: req.user || null, post, comments: commentsResult.comments, categories, recentPosts,
      related: (related || []).filter(p => String(p._id) !== String(post._id)).slice(0, 4),
    });
  } catch (err) { next(err); }
};

/** GET /blog/video — Classic video listing */
const classicVideoList = async (req, res, next) => {
  try {
    const { page = 1, search, category } = req.query;
    const limit = 12;
    const filter = { status: 'published', postType: 'video' };

    if (category) filter.categories = category;
    if (search) {
      const safe = escapeRegex(String(search).trim());
      filter.$or = [
        { title: new RegExp(safe, 'i') },
        { excerpt: new RegExp(safe, 'i') },
        { tags: new RegExp(safe, 'i') },
      ];
    }

    const [videoPosts, total, hotVideos, categories] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip((+page - 1) * limit)
        .limit(limit)
        .populate('author', 'displayName username avatar')
        .lean(),
      Post.countDocuments(filter),
      postService.getHotVideoPosts('all', 8),
      Category.find({ target: 'video' }).sort({ name: 1 }).lean(),
    ]);

    const pages = Math.ceil(total / limit);
    let currentCategory = '';
    if (category) {
      const cat = categories.find(c => String(c._id) === String(category));
      if (cat) currentCategory = cat.name;
    }

    res.render('classic-video-list', {
      user: req.user || null, videoPosts, hotVideos, page: +page, pages, categories,
      searchQuery: search || '', currentCategory,
    });
  } catch (err) { next(err); }
};

/** GET /blog/video/:id — Classic video detail */
const classicVideoDetail = async (req, res, next) => {
  try {
    const post = await postService.getPostById(req.params.id);
    if (!post) return res.status(404).render('404', { user: req.user || null });

    const [commentsResult, seriesEpisodes, relatedVideos, adjacent] = await Promise.all([
      commentService.getComments(post._id),
      postService.getSeriesEpisodes(post, 60),
      postService.getVideoPosts(8, post._id),
      postService.getAdjacentVideos(post),
    ]);

    res.render('classic-video-detail', {
      user: req.user || null, post, comments: commentsResult.comments, seriesEpisodes, relatedVideos,
      prevPost: adjacent.prev, nextPost: adjacent.next,
    });
  } catch (err) { next(err); }
};

module.exports = { home, postDetail, chat, messages, profile, publicProfile, search, createPost, createVideoPost, manageCategories, manageUsers, friends, getStats, videoList, videoDetail, classicBlog, classicBlogPost, classicVideoList, classicVideoDetail };
