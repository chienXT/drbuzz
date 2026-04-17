'use strict';

const User    = require('../models/User');
const Post    = require('../models/Post');
const Comment = require('../models/Comment');
const path    = require('path');
const fs      = require('fs');

/** GET /api/users/:username  — trang cá nhân công khai */
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -bookmarks');
    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    const [posts, recentComments] = await Promise.all([
      Post.find({ author: user._id, status: 'published' })
        .sort({ createdAt: -1 }).limit(10)
        .populate('categories', 'name slug color icon')
        .select('title thumbnail excerpt createdAt likes'),
      Comment.find({ author: user._id })
        .sort({ createdAt: -1 }).limit(5)
        .populate('post', 'title slug'),
    ]);

    res.json({ success: true, user, posts, recentComments });
  } catch (err) { next(err); }
};

/** PUT /api/users/me  — cập nhật profile */
const updateProfile = async (req, res, next) => {
  try {
    const { displayName, email, bio, avatarUrl, coverImageUrl } = req.body;
    const user = await User.findById(req.user._id);
    const avatarFile = req.files?.avatar?.[0] || req.file || null;
    const coverFile = req.files?.coverImage?.[0] || null;

    const normalizeRemoteImageUrl = (url) => {
      const raw = String(url || '').trim();
      if (!raw) return '';
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('URL_PROTOCOL_INVALID');
      }
      return parsed.toString();
    };

    if (displayName) user.displayName = displayName.trim().slice(0, 80);
    if (email !== undefined) user.email = email.trim().slice(0, 200);
    if (bio !== undefined)   user.bio   = bio.trim().slice(0, 500);

    // Avatar upload
    if (avatarFile) {
      // Xóa avatar cũ
      if (user.avatar?.startsWith('/uploads/')) {
        fs.unlink(path.join(__dirname, '../../', user.avatar), () => {});
      }
      user.avatar = '/uploads/' + avatarFile.filename;
    } else {
      const remoteAvatar = normalizeRemoteImageUrl(avatarUrl);
      if (remoteAvatar) {
        if (user.avatar?.startsWith('/uploads/')) {
          fs.unlink(path.join(__dirname, '../../', user.avatar), () => {});
        }
        user.avatar = remoteAvatar;
      }
    }

    // Cover upload
    if (coverFile) {
      if (user.coverImage?.startsWith('/uploads/')) {
        fs.unlink(path.join(__dirname, '../../', user.coverImage), () => {});
      }
      user.coverImage = '/uploads/' + coverFile.filename;
    } else {
      const remoteCover = normalizeRemoteImageUrl(coverImageUrl);
      if (remoteCover) {
        if (user.coverImage?.startsWith('/uploads/')) {
          fs.unlink(path.join(__dirname, '../../', user.coverImage), () => {});
        }
        user.coverImage = remoteCover;
      }
    }

    await user.save();

    const updated = user.toPublic();
    res.json({ success: true, user: updated });
  } catch (err) {
    if (err.message === 'URL_PROTOCOL_INVALID') {
      return res.status(400).json({ success: false, message: 'Link ảnh phải dùng http/https' });
    }
    next(err);
  }
};

/** GET /api/users/me/bookmarks */
const getBookmarks = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'bookmarks',
        populate: [
          { path: 'author', select: 'displayName avatar username' },
          { path: 'categories', select: 'name slug color' },
        ],
        options: { sort: { createdAt: -1 } },
      });

    res.json({ success: true, bookmarks: user.bookmarks });
  } catch (err) { next(err); }
};

/** GET /api/admin/users/:id — lấy chi tiết user (admin only) */
const getUserDetail = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    // Lấy thống kê
    const [postCount, commentCount] = await Promise.all([
      Post.countDocuments({ author: user._id }),
      Comment.countDocuments({ author: user._id })
    ]);

    user.postCount = postCount;
    user.commentCount = commentCount;

    res.json({ success: true, user });
  } catch (err) { next(err); }
};

/** PUT /api/admin/users/:id — cập nhật user (admin only) */
const updateUser = async (req, res, next) => {
  try {
    const { displayName, username, email, isAdmin, bio } = req.body;

    // Kiểm tra username unique
    if (username) {
      const existing = await User.findOne({ username, _id: { $ne: req.params.id } });
      if (existing) return res.status(400).json({ success: false, message: 'Username đã tồn tại' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(displayName && { displayName: displayName.trim() }),
        ...(username && { username: username.trim() }),
        ...(email !== undefined && { email: email.trim() }),
        ...(isAdmin !== undefined && { isAdmin: Boolean(isAdmin) }),
        ...(bio !== undefined && { bio: bio.trim() })
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    res.json({ success: true, user });
  } catch (err) { next(err); }
};

/** POST /api/admin/users/:id/ban — khóa/mở khóa user (admin only) */
const toggleBanUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    // Không thể khóa admin khác
    if (user.isAdmin && req.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Không thể khóa tài khoản admin khác' });
    }

    user.isBanned = !user.isBanned;
    await user.save();

    res.json({
      success: true,
      message: user.isBanned ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản',
      isBanned: user.isBanned
    });
  } catch (err) { next(err); }
};

/** DELETE /api/admin/users/:id — xóa user (admin only) */
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    // Không thể xóa admin khác
    if (user.isAdmin && req.user._id.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Không thể xóa tài khoản admin khác' });
    }

    // Xóa avatar file
    if (user.avatar?.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '../../', user.avatar), () => {});
    }

    // Xóa tất cả posts, comments của user
    await Promise.all([
      Post.deleteMany({ author: user._id }),
      Comment.deleteMany({ author: user._id }),
      User.findByIdAndDelete(user._id)
    ]);

    res.json({ success: true, message: 'Đã xóa tài khoản' });
  } catch (err) { next(err); }
};

/** POST /api/admin/users/:id/password — đổi mật khẩu user (admin only) */
const changeUserPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    user.password = password; // pre-save hook will hash it
    await user.save();

    res.json({ success: true, message: 'Đã đổi mật khẩu thành công' });
  } catch (err) { next(err); }
};

module.exports = { getProfile, updateProfile, getBookmarks, getUserDetail, updateUser, toggleBanUser, deleteUser, changeUserPassword };
