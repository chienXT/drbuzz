(function () {
  'use strict';

  var grid = document.getElementById('storiesGrid');
  var sentinel = document.getElementById('storiesSentinel');
  if (!grid || !sentinel) return;

  var currentPage = Number(grid.dataset.page || 1);
  var totalPages = Number(grid.dataset.pages || 1);
  var loading = false;

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cardHtml(story) {
    var tags = (story.genres || [])
      .slice(0, 3)
      .map(function (g) { return '<span class="story-card__tag">' + esc(g) + '</span>'; })
      .join('');

    return (
      '<a class="story-card" href="/story/' + esc(story.slug) + '">' +
        '<img class="story-card__cover" loading="lazy" src="' + esc(story.coverImage || '/images/default-cover.svg') + '" alt="' + esc(story.title) + '">' +
        '<div class="story-card__body">' +
          '<div class="story-card__title">' + esc(story.title) + '</div>' +
          '<div class="story-card__meta">Tac gia: ' + esc(story.author) + '</div>' +
          '<div class="story-card__meta">Luot doc: ' + Number(story.views || 0).toLocaleString('vi-VN') + '</div>' +
          '<div class="story-card__tags">' + tags + '</div>' +
        '</div>' +
      '</a>'
    );
  }

  function loadNext() {
    if (loading || currentPage >= totalPages) return;
    loading = true;

    var u = new URL(window.location.href);
    u.searchParams.set('page', String(currentPage + 1));
    u.searchParams.set('ajax', '1');

    fetch(u.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.stories) || data.stories.length === 0) {
          sentinel.remove();
          return;
        }
        var html = data.stories.map(cardHtml).join('');
        grid.insertAdjacentHTML('beforeend', html);
        currentPage = data.page;
        totalPages = data.pages;
        grid.dataset.page = String(currentPage);
        grid.dataset.pages = String(totalPages);

        if (currentPage >= totalPages) {
          sentinel.remove();
        }
      })
      .catch(function () {})
      .finally(function () {
        loading = false;
      });
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) loadNext();
    });
  }, { rootMargin: '500px 0px' });

  observer.observe(sentinel);
})();
