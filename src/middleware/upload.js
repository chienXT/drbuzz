'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR       = path.join(__dirname, '../../uploads');
const ALLOWED_IMAGE    = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO    = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const ALLOWED_MIME     = [...ALLOWED_IMAGE, ...ALLOWED_VIDEO];
const MAX_SIZE         = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`);
  },
});

const fileFilter = (_req, file, cb) => {
  ALLOWED_MIME.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Chỉ chấp nhận ảnh (JPEG/PNG/GIF/WebP) hoặc video (MP4/WebM).'));
};

const upload = multer({ storage, limits: { fileSize: MAX_SIZE }, fileFilter });

module.exports = upload;
