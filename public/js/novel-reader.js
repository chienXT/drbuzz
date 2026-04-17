(function () {
  'use strict';

  var state = window.__CHAPTER_STATE__ || null;
  if (!state) return;

  var chapterTitle = document.getElementById('readerChapterTitle');
  var chapterContent = document.getElementById('readerChapterContent');
  var chapterMeta = document.getElementById('readerChapterMeta');
  var prevBtn = document.getElementById('readerPrev');
  var nextBtn = document.getElementById('readerNext');
  var quickList = document.getElementById('readerQuickList');
  var themeBtn = document.getElementById('readerThemeToggle');

  function syncNav() {
    if (state.prevChapter) {
      prevBtn.href = '/story/' + state.story.slug + '/' + state.prevChapter.chapterNumber;
      prevBtn.classList.remove('is-disabled');
      prevBtn.setAttribute('aria-disabled', 'false');
    } else {
      prevBtn.href = '#';
      prevBtn.classList.add('is-disabled');
      prevBtn.setAttribute('aria-disabled', 'true');
    }

    if (state.nextChapter) {
      nextBtn.href = '/story/' + state.story.slug + '/' + state.nextChapter.chapterNumber;
      nextBtn.classList.remove('is-disabled');
      nextBtn.setAttribute('aria-disabled', 'false');
    } else {
      nextBtn.href = '#';
      nextBtn.classList.add('is-disabled');
      nextBtn.setAttribute('aria-disabled', 'true');
    }
  }

  function syncMeta() {
    chapterTitle.textContent = 'Chuong ' + state.chapter.chapterNumber + ': ' + state.chapter.title;
    chapterMeta.textContent = state.story.title + ' - ' + state.story.author;
    chapterContent.innerHTML = state.chapter.content;
    document.title = state.story.title + ' - Chuong ' + state.chapter.chapterNumber;

    if (window.NovelStore) {
      window.NovelStore.pushReadHistory({
        slug: state.story.slug,
        title: state.story.title,
        chapterNumber: state.chapter.chapterNumber,
        chapterTitle: state.chapter.title,
        url: '/story/' + state.story.slug + '/' + state.chapter.chapterNumber,
      });
    }

    if (quickList) {
      quickList.value = String(state.chapter.chapterNumber);
    }
  }

  function navigateTo(chapterNumber, pushState) {
    if (!chapterNumber || Number(chapterNumber) < 1) return;
    var url = '/story/' + state.story.slug + '/' + chapterNumber + '?ajax=1';

    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) return;
        state = data;
        syncMeta();
        syncNav();
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (pushState) {
          history.pushState(
            { chapter: state.chapter.chapterNumber },
            '',
            '/story/' + state.story.slug + '/' + state.chapter.chapterNumber
          );
        }
      })
      .catch(function () {});
  }

  prevBtn.addEventListener('click', function (e) {
    if (!state.prevChapter) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    navigateTo(state.prevChapter.chapterNumber, true);
  });

  nextBtn.addEventListener('click', function (e) {
    if (!state.nextChapter) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    navigateTo(state.nextChapter.chapterNumber, true);
  });

  if (quickList) {
    quickList.addEventListener('change', function () {
      navigateTo(Number(this.value), true);
    });
  }

  window.addEventListener('popstate', function () {
    var bits = window.location.pathname.split('/').filter(Boolean);
    var chapterNumber = bits[bits.length - 1];
    navigateTo(chapterNumber, false);
  });

  var themeKey = 'reader_theme_v1';

  function applyTheme(value) {
    document.documentElement.setAttribute('data-reader-theme', value);
    themeBtn.textContent = value === 'dark' ? 'Che do sang' : 'Che do toi';
  }

  applyTheme(localStorage.getItem(themeKey) || 'light');

  themeBtn.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-reader-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(themeKey, next);
    applyTheme(next);
  });

  syncMeta();
  syncNav();
})();
