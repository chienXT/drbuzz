/* ═══════════════════════════════════════════════
   DramaBuzz Classic – Client-side interactions
   ═══════════════════════════════════════════════ */
'use strict';

(function () {
  /* ── Dark mode toggle (uses same data-theme as main site) ── */
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  /* ── Comment form ── */
  const commentForm = document.getElementById('classicCommentForm');
  if (commentForm) {
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const postId = commentForm.dataset.postId;
      const textarea = commentForm.querySelector('textarea[name="text"]');
      const text = textarea.value.trim();
      if (!text) return;

      const btn = commentForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

      try {
        const res = await fetch(`/api/posts/${postId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (data.success || data.comment) {
          // Reload to show new comment
          window.location.reload();
        } else {
          showClassicToast(data.message || 'Lỗi khi gửi bình luận', 'error');
        }
      } catch {
        showClassicToast('Không thể kết nối đến server', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi bình luận';
      }
    });
  }

  /* ── Like button ── */
  const likeBtn = document.getElementById('classicLikeBtn');
  if (likeBtn) {
    likeBtn.addEventListener('click', async () => {
      const postId = likeBtn.dataset.postId;
      try {
        const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
        const data = await res.json();
        if (data.success !== false) {
          const icon = likeBtn.querySelector('i');
          const label = likeBtn.querySelector('span');
          if (data.liked) {
            icon.className = 'fas fa-heart';
            label.textContent = 'Đã thích';
            likeBtn.dataset.liked = '1';
          } else {
            icon.className = 'far fa-heart';
            label.textContent = 'Thích';
            likeBtn.dataset.liked = '0';
          }
        }
      } catch {
        showClassicToast('Lỗi khi thích bài viết', 'error');
      }
    });
  }

  /* ── Bookmark button ── */
  const bookmarkBtn = document.getElementById('classicBookmarkBtn');
  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', async () => {
      const postId = bookmarkBtn.dataset.postId;
      try {
        const res = await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' });
        const data = await res.json();
        if (data.success !== false) {
          const icon = bookmarkBtn.querySelector('i');
          const label = bookmarkBtn.querySelector('span');
          if (data.bookmarked) {
            icon.className = 'fas fa-bookmark';
            label.textContent = 'Đã lưu';
            bookmarkBtn.dataset.bookmarked = '1';
          } else {
            icon.className = 'far fa-bookmark';
            label.textContent = 'Lưu';
            bookmarkBtn.dataset.bookmarked = '0';
          }
        }
      } catch {
        showClassicToast('Lỗi khi lưu bài viết', 'error');
      }
    });
  }

  /* ── Simple toast notification ── */
  function showClassicToast(msg, type) {
    let container = document.getElementById('classicToast');
    if (!container) {
      container = document.createElement('div');
      container.id = 'classicToast';
      container.style.cssText = 'position:fixed;top:80px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.style.cssText = `padding:12px 20px;border-radius:6px;font-size:.9rem;color:#fff;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,.15);animation:fadeIn .3s;background:${type === 'error' ? '#c0392b' : '#27ae60'}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000);
  }

  /* ── Lazy image loading fallback ── */
  document.querySelectorAll('img[loading="lazy"]').forEach(img => {
    img.addEventListener('error', () => {
      img.src = '/images/default-avatar.svg';
    });
  });
})();
