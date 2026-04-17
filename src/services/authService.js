'use strict';

const crypto = require('crypto');
const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const { sendResetCode } = require('./emailService');

const JWT_SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return s || 'dev_secret_' + require('os').hostname();
};
const JWT_REFRESH_SECRET  = () => process.env.JWT_REFRESH_SECRET || JWT_SECRET() + '_refresh';
const JWT_EXPIRES_IN      = () => process.env.JWT_EXPIRES_IN || '7d';

/**
 * Tạo access token
 */
const generateToken = (user) =>
  jwt.sign(user.toJWTPayload(), JWT_SECRET(), { expiresIn: JWT_EXPIRES_IN() });

/**
 * Đặt token vào cookie httpOnly
 */
const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 ngày
  });
};

/**
 * Đăng ký user mới
 */
const register = async ({ username, password, displayName, email }) => {
  const existing = await User.findOne({ username: { $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (existing) throw Object.assign(new Error('Tên đăng nhập đã tồn tại'), { status: 400 });

  const user = await User.create({
    username,
    password,
    displayName: displayName || username,
    email: email || '',
  });

  return user;
};

/**
 * Đăng nhập
 */
const login = async ({ username, password }) => {
  const user = await User.findOne({ username: { $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }).select('+password');

  // Luôn chạy bcrypt để tránh timing attack
  const DUMMY_HASH = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
  const match = user
    ? await user.comparePassword(password)
    : (await require('bcryptjs').compare(password, DUMMY_HASH), false);

  if (!user || !match) {
    throw Object.assign(new Error('Sai tên đăng nhập hoặc mật khẩu'), { status: 401 });
  }

  // Cập nhật lastLogin
  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user);
  return { token, user };
};

/**
 * Bước 1: Gửi mã xác minh qua email
 */
const forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) throw Object.assign(new Error('Email không tồn tại trong hệ thống'), { status: 404 });

  const code = crypto.randomInt(100000, 999999).toString();
  user.resetCode       = code;
  user.resetCodeExpire = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateModifiedOnly: true });

  await sendResetCode(email, code);
  return { message: 'Mã xác minh đã được gửi qua email' };
};

/**
 * Bước 2: Xác minh mã code → trả resetToken
 */
const verifyResetCode = async (email, code) => {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+resetCode +resetCodeExpire');
  if (!user) throw Object.assign(new Error('Email không tồn tại'), { status: 404 });
  if (!user.resetCode || !user.resetCodeExpire) throw Object.assign(new Error('Chưa yêu cầu đặt lại mật khẩu'), { status: 400 });
  if (user.resetCodeExpire < new Date()) throw Object.assign(new Error('Mã xác minh đã hết hạn'), { status: 400 });
  if (user.resetCode !== code) throw Object.assign(new Error('Mã xác minh không đúng'), { status: 400 });

  const resetToken = jwt.sign({ userId: user._id, purpose: 'reset' }, JWT_SECRET(), { expiresIn: '5m' });
  return { resetToken };
};

/**
 * Bước 3: Đặt mật khẩu mới (dùng resetToken)
 */
const resetPassword = async (resetToken, newPassword) => {
  let payload;
  try { payload = jwt.verify(resetToken, JWT_SECRET()); }
  catch { throw Object.assign(new Error('Phiên đặt lại mật khẩu đã hết hạn'), { status: 400 }); }

  if (payload.purpose !== 'reset') throw Object.assign(new Error('Token không hợp lệ'), { status: 400 });

  const user = await User.findById(payload.userId).select('+resetCode +resetCodeExpire');
  if (!user) throw Object.assign(new Error('Người dùng không tồn tại'), { status: 404 });

  user.password        = newPassword;
  user.resetCode       = undefined;
  user.resetCodeExpire = undefined;
  await user.save();

  return { message: 'Đặt lại mật khẩu thành công' };
};

/**
 * Đổi mật khẩu (user đã đăng nhập)
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw Object.assign(new Error('Người dùng không tồn tại'), { status: 404 });

  const match = await user.comparePassword(currentPassword);
  if (!match) throw Object.assign(new Error('Mật khẩu hiện tại không đúng'), { status: 400 });

  user.password = newPassword;
  await user.save();

  return { message: 'Đổi mật khẩu thành công' };
};

module.exports = { register, login, generateToken, setTokenCookie, forgotPassword, verifyResetCode, resetPassword, changePassword };
