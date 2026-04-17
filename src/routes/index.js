'use strict';
const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');

const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');
const upload    = require('../middleware/upload');
const { validate, registerRules, loginRules, postRules, commentRules, profileRules, categoryRules, forgotPasswordRules, verifyResetCodeRules, resetPasswordRules, changePasswordRules } = require('../middleware/validators');

const authCtrl    = require('../controllers/authController');
const postCtrl    = require('../controllers/postController');
const commentCtrl = require('../controllers/commentController');
const userCtrl    = require('../controllers/userController');
const catCtrl     = require('../controllers/categoryController');
const chatCtrl    = require('../controllers/chatController');
const friendCtrl  = require('../controllers/friendController');
const pmCtrl      = require('../controllers/privateMessageController');
const notifCtrl   = require('../controllers/notificationController');
const viewCtrl    = require('../controllers/viewController');
const storyCtrl   = require('../controllers/storyController');
const searchCtrl  = require('../controllers/searchController');
const statusCtrl  = require('../controllers/statusController');

const loginLimiter    = rateLimit({ windowMs: 15*60*1000, max: 10, message: { success:false, message:'Quá nhiều lần thử.' } });
const registerLimiter = rateLimit({ windowMs: 60*60*1000, max: 5,  message: { success:false, message:'Quá nhiều tài khoản.' } });
const friendLimiter   = rateLimit({ windowMs: 60*60*1000, max: 30, message: { success:false, message:'Quá nhiều yêu cầu kết bạn.' } });
const resetLimiter    = rateLimit({ windowMs: 15*60*1000, max: 5,  message: { success:false, message:'Quá nhiều yêu cầu, thử lại sau.' } });

/* PAGE ROUTES */
router.get('/',             optionalAuth, viewCtrl.home);
router.get('/social',       optionalAuth, viewCtrl.home);
router.get('/novel',        optionalAuth, storyCtrl.home);
router.get('/stories',      optionalAuth, storyCtrl.listStories);
router.get('/story/:slug',  optionalAuth, storyCtrl.storyDetail);
router.get('/story/:slug/:chapter', optionalAuth, storyCtrl.readChapter);
router.get('/bai-viet/:id', optionalAuth, viewCtrl.postDetail);
router.get('/chat',         requireAuth, viewCtrl.chat);
router.get('/messages',     requireAuth, viewCtrl.messages);
router.get('/quan-ly-danh-muc', requireAuth, requireAdmin, viewCtrl.manageCategories);
router.get('/quan-ly-nguoi-dung', requireAuth, requireAdmin, viewCtrl.manageUsers);
router.get('/profile',      requireAuth, viewCtrl.profile);
router.get('/friends',      requireAuth, viewCtrl.friends);
router.get('/u/:username',  optionalAuth, viewCtrl.publicProfile);
router.get('/search',       optionalAuth, viewCtrl.search);
router.get('/dang-bai',     requireAuth, viewCtrl.createPost);
router.get('/dang-video',   requireAuth, requireAdmin, viewCtrl.createVideoPost);
router.get('/video',        optionalAuth, viewCtrl.videoList);
router.get('/video/:id',    optionalAuth, viewCtrl.videoDetail);

/* CLASSIC BLOG/VIDEO */
router.get('/blog',            optionalAuth, viewCtrl.classicBlog);
router.get('/blog/video',      optionalAuth, viewCtrl.classicVideoList);
router.get('/blog/video/:id',  optionalAuth, viewCtrl.classicVideoDetail);
router.get('/blog/:slug',      optionalAuth, viewCtrl.classicBlogPost);

/* AUTH */
router.post('/api/auth/register', registerLimiter, registerRules, validate, authCtrl.register);
router.post('/api/auth/login',    loginLimiter,    loginRules,    validate, authCtrl.login);
router.post('/api/auth/logout',   authCtrl.logout);
router.get ('/api/auth/me',       requireAuth, authCtrl.me);

/* AUTH — Password reset */
router.post('/api/auth/forgot-password',    resetLimiter, forgotPasswordRules,    validate, authCtrl.forgotPassword);
router.post('/api/auth/verify-reset-code',  resetLimiter, verifyResetCodeRules,   validate, authCtrl.verifyResetCode);
router.post('/api/auth/reset-password',     resetLimiter, resetPasswordRules,     validate, authCtrl.resetPassword);
router.post('/api/auth/change-password',    requireAuth,  changePasswordRules,    validate, authCtrl.changePassword);

/* POSTS */
router.get   ('/api/posts',              postCtrl.list);
router.get   ('/api/posts/:id',          postCtrl.detail);
router.post  ('/api/posts',              requireAuth, requireAdmin, upload.fields([{name:'images',maxCount:9},{name:'videos',maxCount:3}]), postRules, validate, postCtrl.create);
router.put   ('/api/posts/:id',          requireAuth, upload.fields([{name:'images',maxCount:9},{name:'videos',maxCount:3}]), postRules, validate, postCtrl.update);
router.delete('/api/posts/:id',          requireAuth, postCtrl.remove);
router.post  ('/api/posts/:id/like',     requireAuth, postCtrl.toggleLike);
router.post  ('/api/posts/:id/bookmark', requireAuth, postCtrl.toggleBookmark);

/* STORIES */
router.post('/api/story', requireAuth, requireAdmin, storyCtrl.createStory);
router.post('/api/chapter', requireAuth, requireAdmin, storyCtrl.createChapter);
router.get('/api/story/:id/chapters', storyCtrl.getStoryChapters);

/* CATEGORIES */
router.get   ('/api/categories',       catCtrl.list);
router.get   ('/api/categories/:id',   catCtrl.detail);
router.post  ('/api/categories',       requireAuth, requireAdmin, categoryRules, validate, catCtrl.create);
router.put   ('/api/categories/:id',   requireAuth, requireAdmin, categoryRules, validate, catCtrl.update);
router.delete('/api/categories/:id',   requireAuth, requireAdmin, catCtrl.remove);

/* COMMENTS */
router.get   ('/api/posts/:postId/comments', commentCtrl.list);
router.post  ('/api/posts/:postId/comments', requireAuth, commentRules, validate, commentCtrl.create);
router.post  ('/api/comments/:id/like',      requireAuth, commentCtrl.toggleLike);
router.delete('/api/comments/:id',           requireAuth, commentCtrl.remove);

/* USERS */
router.get('/api/users/:username',    userCtrl.getProfile);
router.put('/api/users/me',           requireAuth, upload.single('avatar'), profileRules, validate, userCtrl.updateProfile);
router.get('/api/users/me/bookmarks', requireAuth, userCtrl.getBookmarks);

/* ADMIN USER MANAGEMENT */
router.get   ('/api/admin/users/:id',   requireAuth, requireAdmin, userCtrl.getUserDetail);
router.put   ('/api/admin/users/:id',   requireAuth, requireAdmin, userCtrl.updateUser);
router.post  ('/api/admin/users/:id/ban', requireAuth, requireAdmin, userCtrl.toggleBanUser);
router.delete('/api/admin/users/:id',   requireAuth, requireAdmin, userCtrl.deleteUser);
router.post  ('/api/admin/users/:id/password', requireAuth, requireAdmin, userCtrl.changeUserPassword);

/* FRIENDS */
router.get ('/api/friends',                requireAuth, friendCtrl.list);
router.get ('/api/friends/pending',        requireAuth, friendCtrl.pending);
router.get ('/api/friends/status/:userId', requireAuth, friendCtrl.status);
router.post('/api/friends/request',        requireAuth, friendLimiter, friendCtrl.sendRequest);
router.post('/api/friends/accept',         requireAuth, friendCtrl.accept);
router.post('/api/friends/accept-from/:userId', requireAuth, friendCtrl.acceptFromUser);
router.post('/api/friends/decline',        requireAuth, friendCtrl.decline);
router.post('/api/friends/decline-from/:userId', requireAuth, friendCtrl.declineFromUser);
router.post('/api/friends/remove',         requireAuth, friendCtrl.remove);

/* PRIVATE MESSAGES */
router.get  ('/api/messages',              requireAuth, pmCtrl.inbox);
router.get  ('/api/messages/unread-count', requireAuth, pmCtrl.unreadCount);
router.get  ('/api/messages/:userId',      requireAuth, pmCtrl.history);
router.post ('/api/messages/:userId/read', requireAuth, pmCtrl.markRead);
router.patch('/api/messages/:id/recall',   requireAuth, pmCtrl.recall);

/* NOTIFICATIONS */
router.get ('/api/notifications',               requireAuth, notifCtrl.list);
router.get ('/api/notifications/unread-count',  requireAuth, notifCtrl.unreadCount);
router.post('/api/notifications/read-all',      requireAuth, notifCtrl.readAll);
router.post('/api/notifications/:id/read',      requireAuth, notifCtrl.markRead);

/* PUBLIC CHAT */
router.get   ('/api/chat/history',    requireAuth, chatCtrl.history);
router.delete('/api/chat/:id',        requireAuth, chatCtrl.remove);
router.patch ('/api/chat/:id/recall', requireAuth, requireAdmin, chatCtrl.recall);

/* STATUSES */
router.get   ('/api/statuses',              optionalAuth, statusCtrl.list);
router.post  ('/api/statuses',              requireAuth, upload.fields([{name:'images',maxCount:4}]), statusCtrl.create);
router.put   ('/api/statuses/:id',          requireAuth, upload.fields([{name:'images',maxCount:4}]), statusCtrl.update);
router.delete('/api/statuses/:id',          requireAuth, statusCtrl.remove);
router.post  ('/api/statuses/:id/like',     requireAuth, statusCtrl.toggleLike);
router.get   ('/api/statuses/:id/comments', statusCtrl.getComments);
router.post  ('/api/statuses/:id/comments', requireAuth, statusCtrl.addComment);
router.delete('/api/statuses/comments/:id', requireAuth, statusCtrl.deleteComment);

/* SEARCH */
router.get('/api/search', searchCtrl.search);

/* STATS */
router.get('/api/stats/visitors', viewCtrl.getStats);

module.exports = router;
