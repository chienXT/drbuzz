'use strict';

const searchService = require('../services/searchService');

/** GET /api/search?q=... */
const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, posts: [], users: [] });

    const [posts, users] = await Promise.all([
      searchService.searchPosts(q),
      searchService.searchUsers(q),
    ]);

    res.json({ success: true, posts, users, query: q });
  } catch (err) {
    next(err);
  }
};

/** GET /search — page */
const searchPage = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    let posts = [];
    let users = [];

    if (q) {
      [posts, users] = await Promise.all([
        searchService.searchPosts(q),
        searchService.searchUsers(q),
      ]);
    }

    res.render('search', { user: req.user || null, query: q, posts, users });
  } catch (err) {
    next(err);
  }
};

module.exports = { search, searchPage };
