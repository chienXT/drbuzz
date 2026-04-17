'use strict';

const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const Friendship = require('../models/Friendship');
const User = require('../models/User');

const toDateMs = (v) => new Date(v || 0).getTime();

const TARGETED_ACTIVITY_TYPES = ['comment_replied', 'status_liked', 'status_commented'];

const isRelevantActivityForUser = (activity, myId, friendIds) => {
  const actorId = String(activity.user?._id || activity.user || '');
  if (!actorId || actorId === myId) return false;
  if (friendIds.has(actorId)) return true;
  const targetId = String(activity.targetUser?._id || activity.targetUser || '');
  return targetId === myId && TARGETED_ACTIVITY_TYPES.includes(activity.type);
};

const mapActivityToNotif = (a, read = true) => {
  const actorName = a.user?.displayName || 'Ai đó';
  const postTitle = a.post?.title
    ? `"${a.post.title.length > 35 ? a.post.title.substring(0, 35) + '...' : a.post.title}"`
    : 'một bài viết';
  const statusSnippet = a.status?.content
    ? `"${a.status.content.length > 35 ? a.status.content.substring(0, 35) + '...' : a.status.content}"`
    : 'một trạng thái';

  const messageByType = {
    post_created: `${actorName} đã đăng ${postTitle}`,
    post_liked: `${actorName} đã thích ${postTitle}`,
    comment_created: `${actorName} đã bình luận tại ${postTitle}`,
    comment_replied: `${actorName} đã trả lời bình luận của bạn tại ${postTitle}`,
    status_liked: `${actorName} đã thích ${statusSnippet}`,
    status_commented: `${actorName} đã bình luận ${statusSnippet}`,
  };

  return {
    _id: a._id,
    source: 'activity',
    type: a.type,
    sender: a.user || null,
    refPost: a.post || null,
    refStatus: a.status || null,
    message: messageByType[a.type] || `${actorName} có tương tác mới`,
    read,
    createdAt: a.createdAt,
  };
};

const buildActivityScope = async (userId) => {
  const myId = String(userId);
  const [fwd, rev] = await Promise.all([
    Friendship.find({ requester: userId, status: 'accepted' }).select('recipient').lean(),
    Friendship.find({ recipient: userId, status: 'accepted' }).select('requester').lean(),
  ]);

  const friendIds = new Set([
    ...fwd.map((x) => String(x.recipient)),
    ...rev.map((x) => String(x.requester)),
  ]);

  const friendObjectIds = [...friendIds];
  const activityQuery = {
    $or: [
      ...(friendObjectIds.length ? [{ user: { $in: friendObjectIds } }] : []),
      { type: { $in: TARGETED_ACTIVITY_TYPES }, targetUser: userId, user: { $ne: userId } },
    ],
  };

  return { myId, friendIds, activityQuery };
};

/** GET /api/notifications */
const list = async (req, res, next) => {
  try {
    const myId = String(req.user._id);
    const activityReadAt = new Date(req.user.lastActivityReadAt || req.user.createdAt || 0);

    const [{ friendIds, activityQuery }, notifs] = await Promise.all([
      buildActivityScope(req.user._id),
      Notification.find({ recipient: req.user._id, type: { $ne: 'private_message' } })
        .sort({ createdAt: -1 })
        .limit(30)
        .populate('sender', 'displayName avatar username')
        .populate('refPost', 'title')
        .lean(),
    ]);

    const activities = await Activity.find(activityQuery)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate({ path: 'user', select: 'displayName avatar username _id' })
      .populate({ path: 'post', select: '_id title' })
      .populate({ path: 'status', select: '_id content' })
      .populate({ path: 'targetUser', select: '_id' })
      .lean();

    const activityItems = activities
      .filter((a) => isRelevantActivityForUser(a, myId, friendIds))
      .slice(0, 20)
      .map((a) => mapActivityToNotif(a, toDateMs(a.createdAt) <= toDateMs(activityReadAt)));

    const dbNotifs = notifs.map((n) => ({ ...n, source: 'notification' }));

    const merged = [...dbNotifs, ...activityItems]
      .sort((a, b) => toDateMs(b.createdAt) - toDateMs(a.createdAt))
      .slice(0, 30);

    res.json({ success: true, notifications: merged });
  } catch (err) { next(err); }
};

/** POST /api/notifications/read-all */
const readAll = async (req, res, next) => {
  try {
    const now = new Date();
    await Promise.all([
      Notification.updateMany({ recipient: req.user._id, read: false, type: { $ne: 'private_message' } }, { read: true }),
      User.updateOne({ _id: req.user._id }, { $set: { lastActivityReadAt: now } }),
    ]);
    res.json({ success: true });
  } catch (err) { next(err); }
};

/** POST /api/notifications/:id/read */
const markRead = async (req, res, next) => {
  try {
    await Notification.updateOne({ _id: req.params.id, recipient: req.user._id }, { read: true });
    res.json({ success: true });
  } catch (err) { next(err); }
};

/** GET /api/notifications/unread-count */
const unreadCount = async (req, res, next) => {
  try {
    const activityReadAt = new Date(req.user.lastActivityReadAt || req.user.createdAt || 0);
    const [{ myId, friendIds, activityQuery }, notifUnreadCount, activities] = await Promise.all([
      buildActivityScope(req.user._id),
      Notification.countDocuments({ recipient: req.user._id, read: false, type: { $ne: 'private_message' } }),
      Activity.find({ ...activityQuery, createdAt: { $gt: activityReadAt } })
        .select('type user targetUser createdAt')
        .lean(),
    ]);

    const activityUnreadCount = activities.filter((a) => isRelevantActivityForUser(a, myId, friendIds)).length;

    res.json({ success: true, count: notifUnreadCount + activityUnreadCount });
  } catch (err) { next(err); }
};

module.exports = { list, readAll, markRead, unreadCount };
