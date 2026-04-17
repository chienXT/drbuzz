(function () {
  'use strict';

  var BOOKMARK_KEY = 'novel_bookmarks_v1';
  var HISTORY_KEY = 'novel_read_history_v1';

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getBookmarks() {
    return readJson(BOOKMARK_KEY, []);
  }

  function toggleBookmark(story) {
    var list = getBookmarks();
    var exists = list.find(function (item) { return item.slug === story.slug; });

    if (exists) {
      list = list.filter(function (item) { return item.slug !== story.slug; });
      writeJson(BOOKMARK_KEY, list);
      return { bookmarked: false, list: list };
    }

    list.unshift({
      slug: story.slug,
      title: story.title,
      coverImage: story.coverImage || '/images/default-cover.svg',
      author: story.author || '',
      savedAt: Date.now(),
    });

    list = list.slice(0, 60);
    writeJson(BOOKMARK_KEY, list);
    return { bookmarked: true, list: list };
  }

  function isBookmarked(slug) {
    return !!getBookmarks().find(function (item) { return item.slug === slug; });
  }

  function pushReadHistory(entry) {
    var list = readJson(HISTORY_KEY, []);
    list = list.filter(function (item) {
      return !(item.slug === entry.slug && item.chapterNumber === entry.chapterNumber);
    });

    list.unshift({
      slug: entry.slug,
      title: entry.title,
      chapterNumber: entry.chapterNumber,
      chapterTitle: entry.chapterTitle,
      url: entry.url,
      readAt: Date.now(),
    });

    writeJson(HISTORY_KEY, list.slice(0, 200));
  }

  function getReadHistory(limit) {
    return readJson(HISTORY_KEY, []).slice(0, limit || 20);
  }

  window.NovelStore = {
    getBookmarks: getBookmarks,
    toggleBookmark: toggleBookmark,
    isBookmarked: isBookmarked,
    pushReadHistory: pushReadHistory,
    getReadHistory: getReadHistory,
  };
})();
