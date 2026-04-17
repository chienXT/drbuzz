/* =============================================
   DramaBuzz v3 – profile.js
   Profile page interactions
   ============================================= */

'use strict';

if (typeof ME === 'undefined') var ME = window.CURRENT_USER || null;

/* ── Edit profile toggle ────────────────────── */
function initEditToggle() {
  const editBtn   = document.getElementById('editProfileBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const formCard  = document.getElementById('editFormCard');

  editBtn?.addEventListener('click', () => {
    formCard.style.display = 'block';
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editBtn.style.display = 'none';
  });

  cancelBtn?.addEventListener('click', () => {
    formCard.style.display = 'none';
    editBtn.style.display = 'inline-flex';
  });
}

/* ── Avatar preview before upload ──────────── */
function initAvatarPreview() {
  const input   = document.getElementById('avatarInput');
  const preview = document.getElementById('avatarPreviewWrap');
  if (!input || !preview) return;

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);

    preview.innerHTML = `<img src="${url}" alt="" id="avatarPreviewImg" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  });
}

/* ── Cover preview before upload ───────────── */
function initCoverPreview() {
  const input = document.getElementById('coverInput');
  const preview = document.getElementById('coverPreviewWrap');
  if (!input || !preview) return;

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    preview.style.backgroundImage = `url('${url}')`;
    preview.classList.add('has-image');
  });
}

/* ── Quick edit avatar/cover buttons ──────── */
function initQuickImageEditButtons() {
  const editForm = document.getElementById('editFormCard');
  const editBtn = document.getElementById('editProfileBtn');
  const avatarInput = document.getElementById('avatarInput');
  const coverInput = document.getElementById('coverInput');
  const quickAvatarBtn = document.getElementById('quickEditAvatarBtn');
  const quickCoverBtn = document.getElementById('quickEditCoverBtn');

  const openEditForm = () => {
    if (!editForm) return;
    editForm.style.display = 'block';
    if (editBtn) editBtn.style.display = 'none';
    editForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  quickAvatarBtn?.addEventListener('click', () => {
    openEditForm();
    avatarInput?.click();
  });

  quickCoverBtn?.addEventListener('click', () => {
    openEditForm();
    coverInput?.click();
  });
}

/* ── Save profile ───────────────────────────── */
function initProfileForm() {
  const form = document.getElementById('profileForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProfileBtn');
    const msg = document.getElementById('profileMsg');
    setLoading(btn, true);
    if (msg) msg.style.display = 'none';

    try {
      const fd = new FormData(form);
      const res = await fetch('/api/users/me', {
        method: 'PUT', body: fd, credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // Update visible profile info
      const u = data.user;
      const dispNameEl = document.getElementById('profileDisplayName');
      const bioEl      = document.getElementById('profileBio');
      const headerAvatar = document.querySelector('.header-avatar');

      if (dispNameEl) dispNameEl.textContent = u.displayName;
      if (bioEl) {
        bioEl.textContent = u.bio || '';
        bioEl.style.fontStyle = u.bio ? 'normal' : 'italic';
        bioEl.style.color     = u.bio ? '' : 'var(--ink-4)';
      }

      // Update header avatar
      if (headerAvatar && u.avatar) {
        headerAvatar.innerHTML = `<img src="${u.avatar}" alt="${u.displayName}">`;
      }

      // Update profile card avatar
      const profileAvatarEl = document.getElementById('profileAvatarPreview');
      if (profileAvatarEl && u.avatar) {
        profileAvatarEl.innerHTML = `<img src="${u.avatar}" alt="">`;
      }

      // Update profile cover
      const coverEl = document.getElementById('profileCoverPreview');
      const coverPreviewEl = document.getElementById('coverPreviewWrap');
      if (u.coverImage) {
        if (coverEl) {
          coverEl.style.backgroundImage = `url('${u.coverImage}')`;
          coverEl.classList.add('has-image');
        }
        if (coverPreviewEl) {
          coverPreviewEl.style.backgroundImage = `url('${u.coverImage}')`;
          coverPreviewEl.classList.add('has-image');
        }
      }

      showToast('✅ Đã cập nhật thông tin', 'success');
      document.getElementById('editFormCard').style.display = 'none';
      document.getElementById('editProfileBtn').style.display = 'inline-flex';
    } catch (err) {
      if (msg) { msg.textContent = err.message; msg.style.color = 'var(--primary)'; msg.style.display = 'block'; }
      showToast(err.message || 'Lỗi cập nhật', 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ── Profile tabs (Bài viết / Đã lưu) ──────── */
function initProfileTabs() {
  let postsLoaded     = false;
  let bookmarksLoaded = false;

  function showTab(name) {
    document.querySelectorAll('#profileTabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.getElementById('tab-posts')?.classList.toggle('active', name === 'posts');
    document.getElementById('tab-bookmarks')?.classList.toggle('active', name === 'bookmarks');

    if (name === 'posts' && !postsLoaded)         { loadMyPosts();     postsLoaded = true; }
    if (name === 'bookmarks' && !bookmarksLoaded)  { loadBookmarks();   bookmarksLoaded = true; }
  }

  // Initial load
  showTab('posts');

  document.getElementById('profileTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn?.dataset.tab) showTab(btn.dataset.tab);
  });

  // Hash nav
  if (location.hash === '#bookmarks') showTab('bookmarks');
}

/* ── Load my posts ──────────────────────────── */
async function loadMyPosts() {
  const el = document.getElementById('myPostsList');
  if (!el || !ME) return;

  try {
    const data = await api(`/api/users/${ME.username}`);
    const posts = data.posts || [];

    document.getElementById('statPosts').textContent = posts.length;

    if (!posts.length) {
      el.innerHTML = `<div class="empty-state" style="padding:30px">
        <div class="empty-state-icon">📝</div>
        <p>Chưa có bài viết nào.</p></div>`;
      return;
    }

    el.innerHTML = posts.map(p => postCardHtml(p)).join('');
  } catch (err) {
    el.innerHTML = `<p style="color:var(--primary)">${err.message}</p>`;
  }
}

/* ── Load bookmarks ─────────────────────────── */
async function loadBookmarks() {
  const el = document.getElementById('bookmarksList');
  if (!el) return;

  try {
    const data = await api('/api/users/me/bookmarks');
    const posts = data.bookmarks || [];

    document.getElementById('statBookmarks').textContent = posts.length;

    if (!posts.length) {
      el.innerHTML = `<div class="empty-state" style="padding:30px">
        <div class="empty-state-icon">🔖</div>
        <p>Chưa lưu bài viết nào.</p></div>`;
      return;
    }

    el.innerHTML = posts.map(p => postCardHtml(p)).join('');
  } catch (err) {
    el.innerHTML = `<p style="color:var(--primary)">${err.message}</p>`;
  }
}

/* ── Mini post card HTML ────────────────────── */
function postCardHtml(post) {
  const img = post.thumbnail || (post.images && post.images[0]) || `https://picsum.photos/seed/${post._id}/400/250`;
  const date = new Date(post.createdAt).toLocaleDateString('vi-VN');
  const cats = (post.categories || []).slice(0,2).map(c => `<span class="badge badge-cat" style="background:${c.color||'#fee2e2'};font-size:.72rem">${c.icon||''} ${c.name}</span>`).join('');

  return `
    <a href="/bai-viet/${post._id}" class="post-card-link">
      <img src="${img}" alt="${escHtml(post.title)}" loading="lazy"
        style="width:80px;height:65px;object-fit:cover;border-radius:8px;flex-shrink:0"
        data-fallback-src="https://picsum.photos/seed/${post._id}/200/130">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">${cats}</div>
        <div style="font-weight:600;font-size:.9rem;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4">${escHtml(post.title)}</div>
        <div style="font-size:.76rem;color:var(--ink-4);margin-top:5px;display:flex;gap:10px">
          <span>📅 ${date}</span>
          <span>❤️ ${post.likes?.length || 0}</span>
          <span>👁 ${post.views || 0}</span>
        </div>
      </div>
    </a>`;
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Load comment count ─────────────────────── */
async function loadCommentCount() {
  if (!ME) return;
  try {
    const data = await api(`/api/users/${ME.username}`);
    const el = document.getElementById('statComments');
    if (el && data.user) el.textContent = data.user.commentCount || 0;
  } catch { /* non-critical */ }
}

/* ── Init ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initEditToggle();
  initAvatarPreview();
  initCoverPreview();
  initQuickImageEditButtons();
  initProfileForm();
  initProfileTabs();
  loadCommentCount();
  initChangePassword();
});

/* ── Đổi mật khẩu ──────────────────────────── */
function initChangePassword() {
  const form = document.getElementById('changePasswordForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('passwordMsg');
    const data = new FormData(form);
    const currentPassword = data.get('currentPassword');
    const newPassword     = data.get('newPassword');
    const confirmPassword = data.get('confirmPassword');

    if (newPassword !== confirmPassword) {
      msg.textContent = 'Mật khẩu mới không khớp';
      msg.style.color = 'var(--red, #e63946)';
      return;
    }
    if (newPassword.length < 6) {
      msg.textContent = 'Mật khẩu mới tối thiểu 6 ký tự';
      msg.style.color = 'var(--red, #e63946)';
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Có lỗi xảy ra');

      msg.textContent = 'Đổi mật khẩu thành công!';
      msg.style.color = 'var(--green, #2ecc71)';
      form.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = 'var(--red, #e63946)';
    }
  });
}
