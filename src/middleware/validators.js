'use strict';

const { body, param, query, validationResult } = require('express-validator');

/**
 * Lấy lỗi từ express-validator và trả về response
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array()[0].msg;
    return res.status(400).json({ success: false, message });
  }
  next();
};

/* ─── Auth ─────────────────────────────────── */
const registerRules = [
  body('username')
    .trim().notEmpty().withMessage('Username không được trống')
    .isLength({ min: 3, max: 50 }).withMessage('Username từ 3–50 ký tự')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username chỉ chứa chữ, số, gạch dưới'),
  body('password')
    .isLength({ min: 6, max: 100 }).withMessage('Mật khẩu từ 6–100 ký tự'),
  body('displayName')
    .optional().trim().isLength({ max: 80 }).withMessage('Tên hiển thị tối đa 80 ký tự'),
  body('email')
    .optional({ values: 'falsy' }).trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
];

const loginRules = [
  body('username').trim().notEmpty().withMessage('Vui lòng nhập username'),
  body('password').notEmpty().withMessage('Vui lòng nhập mật khẩu'),
];

/* ─── Post ──────────────────────────────────── */
const postRules = [
  body('title')
    .trim().isLength({ min: 3, max: 200 }).withMessage('Tiêu đề từ 3–200 ký tự'),
  body('excerpt')
    .trim().isLength({ min: 5, max: 500 }).withMessage('Tóm tắt từ 5–500 ký tự'),
  body('content')
    .optional({ checkFalsy: false })
    .trim().isLength({ min: 10 }).withMessage('Nội dung tối thiểu 10 ký tự'),
];

/* ─── Comment ───────────────────────────────── */
const commentRules = [
  body('text')
    .trim().isLength({ min: 1, max: 2000 }).withMessage('Bình luận từ 1–2000 ký tự'),
];

/* ─── Profile ───────────────────────────────── */
const profileRules = [
  body('displayName')
    .optional().trim().isLength({ max: 80 }).withMessage('Tên hiển thị tối đa 80 ký tự'),
  body('email')
    .optional().trim().isEmail().withMessage('Email không hợp lệ').isLength({ max: 200 }),
  body('bio')
    .optional().trim().isLength({ max: 500 }).withMessage('Bio tối đa 500 ký tự'),
];

/* ─── Category ──────────────────────────────── */
const categoryRules = [
  body('name').trim().notEmpty().isLength({ max: 60 }).withMessage('Tên category tối đa 60 ký tự'),
  body('target').optional().isIn(['blog', 'video']).withMessage('Loại danh mục không hợp lệ'),
  body('color').optional().trim().isLength({ max: 20 }),
  body('icon').optional().trim().isLength({ max: 10 }),
];

/* ─── Forgot / Reset Password ───────────────── */
const forgotPasswordRules = [
  body('email').trim().notEmpty().withMessage('Vui lòng nhập email').isEmail().withMessage('Email không hợp lệ'),
];

const verifyResetCodeRules = [
  body('email').trim().notEmpty().isEmail().withMessage('Email không hợp lệ'),
  body('code').trim().notEmpty().withMessage('Vui lòng nhập mã xác minh')
    .isLength({ min: 6, max: 6 }).withMessage('Mã xác minh phải 6 chữ số'),
];

const resetPasswordRules = [
  body('resetToken').notEmpty().withMessage('Token không hợp lệ'),
  body('newPassword').isLength({ min: 6, max: 100 }).withMessage('Mật khẩu từ 6–100 ký tự'),
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại'),
  body('newPassword').isLength({ min: 6, max: 100 }).withMessage('Mật khẩu mới từ 6–100 ký tự'),
];

module.exports = {
  validate,
  registerRules, loginRules,
  postRules, commentRules,
  profileRules, categoryRules,
  forgotPasswordRules, verifyResetCodeRules, resetPasswordRules, changePasswordRules,
};
