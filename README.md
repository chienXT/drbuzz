# 🔥 DramaBuzz V4 — Production-Ready Social Blog

Phiên bản V4 tích hợp tất cả tính năng từ V3 (MongoDB, JWT, MVC, Socket.io) cộng với hệ thống xã hội đầy đủ từ phiên bản `fin`.

## 🆕 Tính năng mới so với V3

| Tính năng | Mô tả |
|-----------|-------|
| 👥 Friend System | Kết bạn, chấp nhận/từ chối lời mời |
| ✉️ Private Messaging | Nhắn tin 1-1 chỉ với bạn bè, typing, thu hồi |
| 🔍 Trang tìm kiếm | Tìm bài viết + người dùng cùng lúc |
| 👤 Public Profile | Trang `/u/:username` công khai, nút kết bạn |
| 🔔 Notifications | Realtime: kết bạn, like, comment, DM |
| 📊 Unread badges | Header badge cho DM + thông báo |
| 📡 PM Notifications | Toast popup khi có tin nhắn mới |
| 🔗 Tác giả bài viết | Avatar + tên tác giả trên mỗi bài |

## 📁 Cấu trúc V4

```
src/
├── models/
│   ├── User.js
│   ├── Post.js
│   ├── Comment.js
│   ├── Message.js          (public chat)
│   ├── PrivateMessage.js   ← MỚI
│   ├── Friendship.js       ← MỚI
│   ├── Notification.js     ← MỚI
│   └── Category.js
├── services/
│   ├── authService.js
│   ├── postService.js
│   ├── commentService.js
│   ├── chatService.js
│   ├── friendService.js    ← MỚI
│   ├── privateMessageService.js  ← MỚI
│   └── searchService.js    ← MỚI
├── controllers/
│   ├── authController.js
│   ├── postController.js
│   ├── commentController.js
│   ├── userController.js
│   ├── categoryController.js
│   ├── chatController.js
│   ├── friendController.js      ← MỚI
│   ├── privateMessageController.js ← MỚI
│   ├── notificationController.js   ← MỚI
│   ├── searchController.js         ← MỚI
│   └── viewController.js
├── middleware/
│   ├── auth.js
│   ├── upload.js
│   ├── validators.js
│   └── errorHandler.js
├── routes/index.js
├── socketHandler.js        (public chat + DM + notifications)
└── utils/seed.js
views/
├── index.ejs
├── post.ejs
├── chat.ejs
├── messages.ejs    ← MỚI
├── search.ejs      ← MỚI
├── profile.ejs
├── profile-public.ejs  ← MỚI
├── 404.ejs
└── partials/
    ├── header.ejs  (cập nhật: search bar, notif, friend badges)
    └── sidebar.ejs
public/js/
├── common.js   (+ notifications + friend requests)
├── messages.js ← MỚI
├── index.js
├── post.js
├── chat.js
└── profile.js
```

## 🚀 Cài đặt & Chạy

```bash
# 1. Sao chép và cấu hình .env
cp .env.example .env
# Sửa MONGODB_URI nếu cần (mặc định: localhost:27017/dramabuzz_v4)

# 2. Cài packages
npm install

# 3. Seed dữ liệu mẫu
npm run seed
# Tạo admin: admin / Admin@123456

# 4. Chạy server
npm run dev       # development
npm start         # production
```

## 🔑 API mới trong V4

### Friends
| Method | URL | Mô tả |
|--------|-----|-------|
| GET  | `/api/friends` | Danh sách bạn bè |
| GET  | `/api/friends/pending` | Lời mời chờ |
| GET  | `/api/friends/status/:userId` | Trạng thái với user X |
| POST | `/api/friends/request` | Gửi lời mời |
| POST | `/api/friends/accept` | Chấp nhận |
| POST | `/api/friends/remove` | Hủy/từ chối |

### Private Messages
| Method | URL | Mô tả |
|--------|-----|-------|
| GET   | `/api/messages` | Inbox (conversations) |
| GET   | `/api/messages/unread-count` | Số unread |
| GET   | `/api/messages/:userId` | Lịch sử với user X |
| POST  | `/api/messages/:userId/read` | Đánh dấu đã đọc |
| PATCH | `/api/messages/:id/recall` | Thu hồi tin |

### Notifications
| Method | URL | Mô tả |
|--------|-----|-------|
| GET  | `/api/notifications` | Danh sách |
| GET  | `/api/notifications/unread-count` | Số unread |
| POST | `/api/notifications/read-all` | Đọc tất cả |

### Search
| Method | URL | Mô tả |
|--------|-----|-------|
| GET | `/api/search?q=...` | Tìm posts + users |
| GET | `/search?q=...` | Trang kết quả |

## 🔌 Socket.io Events V4

| Event | Direction | Mô tả |
|-------|-----------|-------|
| `pm:send` | Client→Server | Gửi tin nhắn riêng |
| `pm:message` | Server→Client | Tin nhắn mới |
| `pm:typing` | Both | Đang nhập |
| `pm:read` | Client→Server | Đã đọc |
| `pm:read_ack` | Server→Client | Xác nhận đã đọc |
| `pm:recalled` | Server→Client | Tin bị thu hồi |
| `pm:notification` | Server→Client | Toast tin mới |
| `friend:notify` | Client→Server | Thông báo kết bạn |
| `friend:new_request` | Server→Client | Có lời mời mới |
| `user:online/offline` | Server→All | Trạng thái |

## 📊 So sánh V3 vs V4

| Tính năng | V3 | V4 |
|-----------|----|----|
| MongoDB + Mongoose | ✅ | ✅ |
| JWT Authentication | ✅ | ✅ |
| MVC Architecture | ✅ | ✅ |
| Dark mode | ✅ | ✅ |
| Public chat | ✅ | ✅ |
| Like/bookmark post | ✅ | ✅ |
| Nested comments | ✅ | ✅ |
| Multiple images | ✅ | ✅ |
| **Friend system** | ❌ | ✅ |
| **Private DM** | ❌ | ✅ |
| **Search page** | ❌ | ✅ |
| **Public profile** | ❌ | ✅ |
| **Notifications** | ❌ | ✅ |
| **Unread badges** | ❌ | ✅ |
| **PM toast** | ❌ | ✅ |

---
Made with ❤️ · DramaBuzz V4
