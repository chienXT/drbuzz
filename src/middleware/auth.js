'use strict';

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const getJwtSecret = () => {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return s || 'dev_secret_' + require('os').hostname();
};

/**
 * Lấy token từ cookie hoặc Authorization header
 */
const extractToken = (req) => {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
};

/**
 * Middleware: yêu cầu đăng nhập (trả JSON nếu là API, redirect nếu là page)
 */
const requireAuth = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    if (req.accepts('html')) return res.redirect('/?login=1');
    return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const user    = await User.findById(payload.id).select('-password');
    if (!user) throw new Error('User not found');

    // Kiểm tra tài khoản bị khóa
    if (user.isBanned) {
      res.clearCookie('token');
      if (req.accepts('html')) return res.redirect('/?banned=1');
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token');
    if (req.accepts('html')) return res.redirect('/?login=1');
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

/**
 * Middleware: gắn user vào req nếu có token (không bắt buộc)
 */
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = await User.findById(payload.id).select('-password');
  } catch {
    req.user = null;
  }
  next();
};

/**
 * Middleware: yêu cầu quyền admin
 */
const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    if (req.accepts('html')) return res.redirect('/');
    return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
  }
  next();
};

/**
 * Xác thực token cho Socket.io
 */
const socketAuth = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.cookie
        ?.split(';')
        .find((c) => c.trim().startsWith('token='))
        ?.split('=')[1];

    if (!token) return next(new Error('Unauthorized'));

    const payload = jwt.verify(token, getJwtSecret());
    const user    = await User.findById(payload.id).select('-password');
    if (!user) return next(new Error('User not found'));

    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
};

module.exports = { requireAuth, optionalAuth, requireAdmin, socketAuth };
