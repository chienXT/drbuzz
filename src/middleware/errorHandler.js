'use strict';

const multer = require('multer');

/**
 * Xử lý lỗi 404
 */
const notFound = (req, res, next) => {
  const err = new Error(`Không tìm thấy: ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

/**
 * Xử lý lỗi tập trung
 */
const errorHandler = (err, req, res, next) => {
  // Multer file size error
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'File quá lớn, vui lòng thử lại với file nhỏ hơn'
      : err.message;
    return res.status(400).json({ success: false, message: msg });
  }

  // File type error (custom)
  if (err.message?.includes('Chỉ chấp nhận')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  // Mongoose validation
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} đã tồn tại`,
    });
  }

  const status  = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Lỗi server'
    : err.message || 'Lỗi server';

  console.error(`[${status}] ${err.message}`);
  if (req.accepts('html') && status === 404) {
    return res.status(404).render('404', { user: req.user || null });
  }

  res.status(status).json({ success: false, message });
};

module.exports = { notFound, errorHandler };
