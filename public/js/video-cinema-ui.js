(function () {
  var ratingWrap = document.getElementById('vdpRating');
  if (!ratingWrap) return;

  var postId = ratingWrap.getAttribute('data-post-id') || 'global';
  var scoreText = document.getElementById('vdpRatingScore');
  var stars = Array.prototype.slice.call(ratingWrap.querySelectorAll('.vdp-star'));
  if (!stars.length || !scoreText) return;

  var key = 'vdp-rating-' + postId;
  var state = { sum: 0, count: 0, user: 0 };

  try {
    var saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (typeof saved.sum === 'number') state.sum = saved.sum;
    if (typeof saved.count === 'number') state.count = saved.count;
    if (typeof saved.user === 'number') state.user = saved.user;
  } catch (e) {
    state = { sum: 0, count: 0, user: 0 };
  }

  function renderStars(active, hover) {
    var val = hover || active || 0;
    stars.forEach(function (btn) {
      var n = parseInt(btn.getAttribute('data-value'), 10) || 0;
      btn.classList.toggle('is-active', n <= active && !hover);
      btn.classList.toggle('is-hover', !!hover && n <= hover);
      btn.innerHTML = n <= val ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    });
  }

  function renderScore() {
    var avg = state.count ? (state.sum / state.count) : 0;
    scoreText.textContent = avg.toFixed(1) + ' / 10 (' + state.count + ' đánh giá)';
    renderStars(state.user, 0);
  }

  function save() {
    localStorage.setItem(key, JSON.stringify(state));
  }

  stars.forEach(function (btn) {
    var value = parseInt(btn.getAttribute('data-value'), 10) || 0;

    btn.addEventListener('mouseenter', function () {
      renderStars(state.user, value);
    });

    btn.addEventListener('click', function () {
      if (value < 1 || value > 10) return;
      if (state.user > 0) {
        state.sum -= state.user;
      } else {
        state.count += 1;
      }
      state.user = value;
      state.sum += value;
      save();
      renderScore();
    });
  });

  ratingWrap.addEventListener('mouseleave', function () {
    renderStars(state.user, 0);
  });

  renderScore();
})();
