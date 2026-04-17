'use strict';

const sanitizeHtml = require('sanitize-html');
const Story = require('../models/Story');
const Chapter = require('../models/Chapter');

const DEFAULT_COVER = '/images/default-cover.svg';

const sanitizeRichText = (raw) =>
  sanitizeHtml(String(raw || ''), {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'blockquote',
      'strong',
      'em',
      'u',
      'ul',
      'ol',
      'li',
      'hr',
      'code',
      'pre',
      'span',
    ],
    allowedAttributes: {
      span: ['class'],
    },
    allowedClasses: {
      span: ['text-muted', 'text-note'],
    },
  }).trim();

const sanitizePlain = (raw) =>
  sanitizeHtml(String(raw || ''), {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();

const parseChapterNumber = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value);
  const match = str.match(/\d+/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
};

const uniqueSlug = async (baseSlug) => {
  let candidate = baseSlug;
  let counter = 2;

  // Keep slug generation predictable: slug, slug-2, slug-3...
  // This avoids random suffixes and is friendlier for SEO.
  while (await Story.exists({ slug: candidate })) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return candidate;
};

const mapStoryCard = (story) => ({
  _id: story._id,
  title: story.title,
  slug: story.slug,
  author: story.author,
  description: story.description,
  coverImage: story.coverImage || DEFAULT_COVER,
  genres: story.genres || [],
  status: story.status,
  views: story.views || 0,
  createdAt: story.createdAt,
});

const home = async (req, res, next) => {
  try {
    const [newStories, hotStories] = await Promise.all([
      Story.find({})
        .sort({ createdAt: -1 })
        .limit(12)
        .lean(),
      Story.find({})
        .sort({ views: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    res.render('novel-home', {
      pageTitle: 'Trang chu truyen',
      metaDesc: 'Doc truyen online voi danh sach truyen moi va truyen hot cap nhat lien tuc.',
      newStories: newStories.map(mapStoryCard),
      hotStories: hotStories.map(mapStoryCard),
    });
  } catch (err) {
    next(err);
  }
};

const listStories = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 18;
    const q = sanitizePlain(req.query.q || '');
    const genre = sanitizePlain(req.query.genre || '');
    const status = sanitizePlain(req.query.status || '');
    const sort = sanitizePlain(req.query.sort || 'new');

    const filter = {};
    if (q) {
      filter.$or = [
        { title: new RegExp(q, 'i') },
        { author: new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') },
      ];
    }
    if (genre) filter.genres = genre;
    if (status && ['ongoing', 'completed'].includes(status)) filter.status = status;

    let sortBy = { createdAt: -1 };
    if (sort === 'hot') sortBy = { views: -1, createdAt: -1 };
    if (sort === 'title') sortBy = { title: 1 };

    const [stories, total, genreAgg] = await Promise.all([
      Story.find(filter)
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Story.countDocuments(filter),
      Story.aggregate([
        { $unwind: '$genres' },
        { $group: { _id: '$genres', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 20 },
      ]),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));
    const payload = {
      stories: stories.map(mapStoryCard),
      page,
      pages,
      total,
      filters: { q, genre, status, sort },
      genres: genreAgg.map((g) => ({ name: g._id, count: g.count })),
    };

    if (req.query.ajax === '1') {
      return res.json({ success: true, ...payload });
    }

    res.render('novel-stories', {
      pageTitle: 'Danh sach truyen',
      metaDesc: 'Kham pha kho truyen day du the loai, loc theo trang thai va do hot.',
      ...payload,
    });
  } catch (err) {
    next(err);
  }
};

const storyDetail = async (req, res, next) => {
  try {
    const slug = sanitizePlain(req.params.slug);
    const story = await Story.findOne({ slug }).lean();
    if (!story) return res.status(404).render('404', { user: req.user || null });

    const chapters = await Chapter.find({ storyId: story._id })
      .sort({ chapterNumber: 1 })
      .select('chapterNumber title createdAt')
      .lean();

    const firstChapter = chapters.length ? chapters[0].chapterNumber : null;

    res.render('story-detail', {
      pageTitle: story.title,
      metaDesc: sanitizePlain(story.description).slice(0, 160),
      canonical: `/story/${story.slug}`,
      story: mapStoryCard(story),
      chapters,
      firstChapter,
    });
  } catch (err) {
    next(err);
  }
};

const readChapter = async (req, res, next) => {
  try {
    const slug = sanitizePlain(req.params.slug);
    const chapterNumber = parseChapterNumber(req.params.chapter);

    if (!chapterNumber || chapterNumber < 1) {
      return res.status(400).json({ success: false, message: 'Invalid chapter number' });
    }

    const story = await Story.findOne({ slug }).lean();
    if (!story) return res.status(404).render('404', { user: req.user || null });

    const chapter = await Chapter.findOne({ storyId: story._id, chapterNumber }).lean();
    if (!chapter) return res.status(404).render('404', { user: req.user || null });

    const [prevChapter, nextChapter] = await Promise.all([
      Chapter.findOne({
        storyId: story._id,
        chapterNumber: { $lt: chapter.chapterNumber },
      })
        .sort({ chapterNumber: -1 })
        .select('chapterNumber title')
        .lean(),
      Chapter.findOne({
        storyId: story._id,
        chapterNumber: { $gt: chapter.chapterNumber },
      })
        .sort({ chapterNumber: 1 })
        .select('chapterNumber title')
        .lean(),
    ]);

    await Story.updateOne({ _id: story._id }, { $inc: { views: 1 } });

    const chapterPayload = {
      _id: chapter._id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      content: chapter.content,
      createdAt: chapter.createdAt,
    };

    if (req.query.ajax === '1') {
      return res.json({
        success: true,
        story: mapStoryCard(story),
        chapter: chapterPayload,
        prevChapter,
        nextChapter,
      });
    }

    return res.render('chapter-read', {
      pageTitle: `${story.title} - Chuong ${chapter.chapterNumber}`,
      metaDesc: `${story.title} chuong ${chapter.chapterNumber}: ${chapter.title}`,
      canonical: `/story/${story.slug}/${chapter.chapterNumber}`,
      story: mapStoryCard(story),
      chapter: chapterPayload,
      prevChapter,
      nextChapter,
    });
  } catch (err) {
    next(err);
  }
};

const createStory = async (req, res, next) => {
  try {
    const title = sanitizePlain(req.body.title);
    const author = sanitizePlain(req.body.author);
    const status = sanitizePlain(req.body.status || 'ongoing');
    const coverImage = sanitizePlain(req.body.coverImage || '');

    if (!title || !author) {
      return res.status(400).json({ success: false, message: 'title and author are required' });
    }

    const rawSlug = sanitizePlain(req.body.slug || title);
    const description = sanitizeRichText(req.body.description || '');

    const genres = Array.isArray(req.body.genres)
      ? req.body.genres.map((g) => sanitizePlain(g)).filter(Boolean)
      : String(req.body.genres || '')
          .split(',')
          .map((g) => sanitizePlain(g))
          .filter(Boolean);

    const baseSlug = rawSlug
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const slug = await uniqueSlug(baseSlug || `story-${Date.now()}`);

    const story = await Story.create({
      title,
      slug,
      author,
      description,
      coverImage,
      genres,
      status: ['ongoing', 'completed'].includes(status) ? status : 'ongoing',
    });

    res.status(201).json({ success: true, story: mapStoryCard(story.toObject()) });
  } catch (err) {
    next(err);
  }
};

const createChapter = async (req, res, next) => {
  try {
    const storyId = sanitizePlain(req.body.storyId);
    const chapterNumber = Number(req.body.chapterNumber);
    const title = sanitizePlain(req.body.title);
    const content = sanitizeRichText(req.body.content);

    if (!storyId || !chapterNumber || !title || !content) {
      return res.status(400).json({
        success: false,
        message: 'storyId, chapterNumber, title, content are required',
      });
    }

    const story = await Story.findById(storyId).lean();
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const chapter = await Chapter.create({
      storyId,
      chapterNumber,
      title,
      content,
    });

    res.status(201).json({ success: true, chapter });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Chapter number already exists' });
    }
    next(err);
  }
};

const getStoryChapters = async (req, res, next) => {
  try {
    const storyId = sanitizePlain(req.params.id);
    const chapters = await Chapter.find({ storyId })
      .sort({ chapterNumber: 1 })
      .select('chapterNumber title createdAt')
      .lean();

    res.json({ success: true, chapters });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  home,
  listStories,
  storyDetail,
  readChapter,
  createStory,
  createChapter,
  getStoryChapters,
};
