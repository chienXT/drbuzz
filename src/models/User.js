'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String, required: true, unique: true, trim: true,
      minlength: 3, maxlength: 50,
      match: [/^[a-zA-Z0-9_]+$/, 'Username chỉ chứa chữ, số, dấu gạch dưới'],
    },
    password:    { type: String, required: true, minlength: 6, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    email:       { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
    avatar:      { type: String, default: '' },
    bio:         { type: String, maxlength: 500, default: '' },
    isAdmin:     { type: Boolean, default: false },
    isBanned:    { type: Boolean, default: false },
    lastLogin:   { type: Date },

    // Bookmarks (bài viết đã lưu)
    bookmarks:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],

    // Thống kê nhanh
    postCount:    { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },

    // Trạng thái online/away/offline
    status:      { type: String, enum: ['online', 'away', 'offline'], default: 'offline' },
    lastSeen:    { type: Date, default: Date.now },

    // Mốc đọc hoạt động (activity) để tính badge thông báo hợp nhất
    lastActivityReadAt: { type: Date, default: Date.now },

    // Password reset
    resetCode:       { type: String, select: false },
    resetCodeExpire: { type: Date, select: false },
  },
  { timestamps: true }
);

/* ── Hash password trước khi lưu ── */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/* ── Indexes để tối ưu tìm kiếm ── */
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ isAdmin: 1 });

/* ── So sánh password ── */
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

/* ── Trả về object an toàn (không password) ── */
userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

/* ── Toàn bộ field cần cho JWT payload ── */
userSchema.methods.toJWTPayload = function () {
  return {
    id:          this._id,
    username:    this.username,
    displayName: this.displayName,
    avatar:      this.avatar,
    isAdmin:     this.isAdmin,
  };
};

/* ── Indexes ── */
userSchema.index({ email: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
