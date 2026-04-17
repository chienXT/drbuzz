'use strict';

const sanitizeHtml = require('sanitize-html');
const Status        = require('../models/Status');
const StatusComment = require('../models/StatusComment');
const Friendship    = require('../models/Friendship');
const Activity      = require('../models/Activity');
const cache         = require('../utils/cache');
const mongoose      = require('mongoose');

const SANITIZE_OPTS = {
  allowedTags: [],
  allowedAttributes: {},
};

const sanitize = (text) => sanitizeHtml(text, SANITIZE_OPTS).trim();
const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parse hashtags from text and normalize to lower-case */
const extractHashtags = (text = '') => {
  const tags = [];
  const regex = /#([\p{L}\p{N}_]{2,50})/gu;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tags.push(match[1].toLowerCase());
  }
  return tags;
};

/** List statuses with pagination */
const getStatuses = async ({ page = 1, limit = 15, sort = 'smart', tag = '', viewerId = null }) => {
  const sortMap = {
    newest:  { createdAt: -1 },
    popular: { likes: -1, createdAt: -1 },
  };
  const normalizedTag = String(tag || '').trim().replace(/^#/, '').toLowerCase();
  const filter = normalizedTag
    ? { content: { $regex: new RegExp(`(^|\\s)#${escapeRegex(normalizedTag)}(?=$|\\s|[.,!?;:])`, 'i') } }
    : {};

  // smart feed: prioritize by level, then most recent interaction/activity
  if (sort === 'smart') {
    let friendIds = [];
    if (viewerId) {
      const [fwd, rev] = await Promise.all([
        Friendship.find({ requester: viewerId, status: 'accepted' }).select('recipient').lean(),
        Friendship.find({ recipient: viewerId, status: 'accepted' }).select('requester').lean(),
      ]);
      friendIds = [
        ...fwd.map((f) => String(f.recipient)),
        ...rev.map((f) => String(f.requester)),
      ];
    }

    const friendObjectIds = friendIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const now = Date.now();
    const recentWindowMs = 6 * 60 * 60 * 1000;
    const recentSince = new Date(now - recentWindowMs);

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'statuscomments',
          let: { sid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$status', '$$sid'] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, createdAt: 1 } },
          ],
          as: 'latestComment',
        },
      },
      {
        $addFields: {
          lastCommentAt: { $ifNull: [{ $arrayElemAt: ['$latestComment.createdAt', 0] }, null] },
          likesCount: { $size: { $ifNull: ['$likes', []] } },
          isFriendAuthor: friendObjectIds.length > 0 ? { $in: ['$author', friendObjectIds] } : false,
        },
      },
      {
        $addFields: {
          activityAt: {
            $max: ['$createdAt', { $ifNull: ['$lastCommentAt', '$createdAt'] }],
          },
          isRecentlyCreated: { $gte: ['$createdAt', recentSince] },
          hasRecentComment: {
            $and: [
              { $ne: ['$lastCommentAt', null] },
              { $gte: ['$lastCommentAt', recentSince] },
            ],
          },
        },
      },
      {
        $addFields: {
          priorityLevel: {
            $add: [
              { $cond: ['$isRecentlyCreated', 4, 0] },
              { $cond: ['$isFriendAuthor', 2, 0] },
              { $cond: ['$hasRecentComment', 1, 0] },
            ],
          },
        },
      },
      { $sort: { priorityLevel: -1, activityAt: -1, createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { latestComment: 0 } },
    ];

    const [statuses, total] = await Promise.all([
      Status.aggregate(pipeline),
      Status.countDocuments(filter),
    ]);

    await Status.populate(statuses, { path: 'author', select: 'displayName avatar username isAdmin' });
    return { statuses, total, pages: Math.ceil(total / limit), page };
  }

  const [statuses, total] = await Promise.all([
    Status.find(filter)
      .sort(sortMap[sort] || sortMap.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'displayName avatar username isAdmin')
      .lean(),
    Status.countDocuments(filter),
  ]);
  return { statuses, total, pages: Math.ceil(total / limit), page };
};

/** Create a new status */
const createStatus = async ({ author, content, images = [] }) => {
  const clean = sanitize(content);
  if (!clean) throw Object.assign(new Error('Nội dung không được để trống'), { status: 400 });
  if (clean.length > 2000) throw Object.assign(new Error('Trạng thái quá dài (tối đa 2000 ký tự)'), { status: 400 });
  const status = await Status.create({ author, content: clean, images });
  await status.populate('author', 'displayName avatar username isAdmin');
  return status;
};

/** Update an existing status */
const updateStatus = async ({ statusId, userId, isAdmin, content, keepImages = null, newImages = [] }) => {
  const clean = sanitize(content);
  if (!clean) throw Object.assign(new Error('Nội dung không được để trống'), { status: 400 });
  if (clean.length > 2000) throw Object.assign(new Error('Trạng thái quá dài (tối đa 2000 ký tự)'), { status: 400 });

  const existing = await Status.findById(statusId).select('author images');
  if (!existing) throw Object.assign(new Error('Không tìm thấy trạng thái'), { status: 404 });
  if (!isAdmin && String(existing.author) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền chỉnh sửa'), { status: 403 });
  }

  const currentImages = Array.isArray(existing.images) ? existing.images : [];
  const requestedKeep = keepImages === null
    ? currentImages.slice()
    : (Array.isArray(keepImages)
      ? keepImages.map((x) => String(x).trim()).filter(Boolean)
      : [String(keepImages || '').trim()].filter(Boolean));
  const safeKeep = currentImages.filter((img) => requestedKeep.includes(img));

  const safeNew = Array.isArray(newImages)
    ? newImages.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const slotsLeft = Math.max(0, 4 - safeKeep.length);
  const finalImages = [...safeKeep, ...safeNew.slice(0, slotsLeft)].slice(0, 4);
  const removedImages = currentImages.filter((img) => !finalImages.includes(img));

  const updated = await Status.findByIdAndUpdate(
    statusId,
    { $set: { content: clean, images: finalImages } },
    { new: true }
  ).populate('author', 'displayName avatar username isAdmin');

  return {
    status: updated,
    removedImages,
  };
};

/** Delete a status */
const deleteStatus = async (statusId, userId, isAdmin) => {
  const status = await Status.findById(statusId);
  if (!status) throw Object.assign(new Error('Không tìm thấy trạng thái'), { status: 404 });
  if (!isAdmin && String(status.author) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền xóa'), { status: 403 });
  }
  await Promise.all([
    Status.findByIdAndDelete(statusId),
    StatusComment.deleteMany({ status: statusId }),
  ]);
  return status;
};

/** Toggle like on a status */
const toggleLike = async (statusId, userId) => {
  const existing = await Status.findById(statusId).select('likes author').lean();
  if (!existing) throw Object.assign(new Error('Không tìm thấy trạng thái'), { status: 404 });
  const isLiking = !existing.likes.map(String).includes(String(userId));
  const updated = isLiking
    ? await Status.findByIdAndUpdate(statusId, { $addToSet: { likes: userId } }, { new: true, select: 'likes' })
    : await Status.findByIdAndUpdate(statusId, { $pull: { likes: userId } }, { new: true, select: 'likes' });

  try {
    if (isLiking) {
      await Activity.create({
        type: 'status_liked',
        user: userId,
        status: statusId,
        targetUser: existing.author || null,
      });
    } else {
      await Activity.deleteOne({ type: 'status_liked', user: userId, status: statusId });
    }
    cache.delete('recent_activities_20');
  } catch (err) {
    // ignore duplicate/cleanup errors
  }

  return { liked: isLiking, count: updated ? updated.likes.length : existing.likes.length };
};

/** Get comments for a status */
const getComments = async (statusId) => {
  return StatusComment.find({ status: statusId })
    .sort({ createdAt: 1 })
    .populate('author', 'displayName avatar username isAdmin')
    .lean();
};

/** Add a comment to a status */
const addComment = async ({ status: statusId, author, text }) => {
  const clean = sanitize(text);
  if (!clean) throw Object.assign(new Error('Bình luận không được để trống'), { status: 400 });
  const parentStatus = await Status.findById(statusId).select('author').lean();
  if (!parentStatus) throw Object.assign(new Error('Không tìm thấy trạng thái'), { status: 404 });

  const comment = await StatusComment.create({ status: statusId, author, text: clean });
  await comment.populate('author', 'displayName avatar username isAdmin');
  await Status.findByIdAndUpdate(statusId, { $inc: { commentCount: 1 } });

  try {
    await Activity.create({
      type: 'status_commented',
      user: author,
      status: statusId,
      comment: comment._id,
      targetUser: parentStatus.author || null,
    });
    cache.delete('recent_activities_20');
  } catch (err) {
    // ignore duplicate activity errors
  }

  return comment;
};

/** Get top hashtags used in statuses over the last N days */
const getWeeklyTrendingHashtags = async ({ days = 7, limit = 5 } = {}) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const statuses = await Status.find({ createdAt: { $gte: since } })
    .select('content')
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const counts = new Map();
  for (const status of statuses) {
    const uniqInStatus = new Set(extractHashtags(status.content || ''));
    for (const tag of uniqInStatus) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
};

/** Delete a comment */
const deleteComment = async (commentId, userId, isAdmin) => {
  const comment = await StatusComment.findById(commentId);
  if (!comment) throw Object.assign(new Error('Không tìm thấy bình luận'), { status: 404 });
  if (!isAdmin && String(comment.author) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền xóa'), { status: 403 });
  }
  await StatusComment.findByIdAndDelete(commentId);
  await Status.findByIdAndUpdate(comment.status, { $inc: { commentCount: -1 } });
  try {
    await Activity.deleteMany({ type: 'status_commented', comment: comment._id });
    cache.delete('recent_activities_20');
  } catch (err) {
    // ignore cleanup errors
  }
  return comment;
};

module.exports = {
  getStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
  toggleLike,
  getComments,
  addComment,
  deleteComment,
  getWeeklyTrendingHashtags,
};
