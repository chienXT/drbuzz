'use strict';

const authService = require('../services/authService');

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { username, password, displayName, email } = req.body;
    await authService.register({ username, password, displayName, email });
    res.status(201).json({ success: true, message: 'Đăng ký thành công! Vui lòng đăng nhập.' });
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const { token, user } = await authService.login({ username, password });

    authService.setTokenCookie(res, token);

    res.json({
      success: true,
      token,
      user: {
        id:          user._id,
        username:    user.username,
        displayName: user.displayName,
        avatar:      user.avatar,
        isAdmin:     user.isAdmin,
      },
    });
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/logout
 */
const logout = (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Đăng xuất thành công' });
};

/**
 * GET /api/auth/me
 */
const me = (req, res) => {
  res.json({ success: true, user: req.user });
};

/**
 * POST /api/auth/forgot-password  — Bước 1: gửi mã email
 */
const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/verify-reset-code — Bước 2: xác minh mã
 */
const verifyResetCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const result = await authService.verifyResetCode(email, code);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/reset-password — Bước 3: đặt mật khẩu mới
 */
const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;
    const result = await authService.resetPassword(resetToken, newPassword);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/change-password — Đổi mật khẩu (đã đăng nhập)
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user._id, currentPassword, newPassword);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

module.exports = { register, login, logout, me, forgotPassword, verifyResetCode, resetPassword, changePassword };
