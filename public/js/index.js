/* =============================================
   DramaBuzz v3 – index.js
   Home page interactions (Status feed)
   ============================================= */

'use strict';

if (typeof ME === 'undefined') var ME = window.CURRENT_USER || null;

if (!ME) {
  const bootEl = document.getElementById('currentUserData');
  if (bootEl) {
    ME = {
      id: bootEl.dataset.id || '',
      username: bootEl.dataset.username || '',
      displayName: bootEl.dataset.displayName || '',
      avatar: bootEl.dataset.avatar || '',
      isAdmin: bootEl.dataset.isAdmin === 'true',
    };
  }
}

/* ── Post status form ───────────────────────── */
function initStatusForm() {
  const form = document.getElementById('statusForm');
  if (!form) return;

  const textarea = form.querySelector('textarea[name="content"]');
  const charCount = document.getElementById('statusCharCount');
  const imageInput = document.getElementById('statusImageInput');
  const preview = document.getElementById('statusImagePreview');
  const MAX_IMAGES = 4;
  let selectedFiles = [];

  function syncInputFiles() {
    if (!imageInput) return;
    try {
      const dt = new DataTransfer();
      selectedFiles.forEach((file) => dt.items.add(file));
      imageInput.files = dt.files;
    } catch {
      // Some browsers may block assigning files programmatically.
    }
  }

  function renderSelectedPreview() {
    if (!preview) return;
    preview.innerHTML = '';
    selectedFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'compose-preview-item';
        div.innerHTML = `<img src="${e.target.result}" alt=""><button type="button" class="compose-preview-remove" title="Xóa">✕</button>`;
        div.querySelector('button')?.addEventListener('click', () => {
          selectedFiles.splice(index, 1);
          syncInputFiles();
          renderSelectedPreview();
        });
        preview.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  }

  function appendImageFiles(files) {
    if (!files || !files.length) return;
    const valid = files.filter((f) => f && /^image\//i.test(f.type));
    if (!valid.length) return;

    const slotsLeft = Math.max(0, MAX_IMAGES - selectedFiles.length);
    if (!slotsLeft) {
      showToast(`Chỉ cho phép tối đa ${MAX_IMAGES} ảnh`, 'info');
      return;
    }

    selectedFiles.push(...valid.slice(0, slotsLeft));
    syncInputFiles();
    renderSelectedPreview();
  }

  // Character counter
  textarea?.addEventListener('input', () => {
    if (charCount) charCount.textContent = textarea.value.length;
  });

  // Image preview
  imageInput?.addEventListener('change', () => {
    const files = Array.from(imageInput.files || []);
    appendImageFiles(files);
  });

  // Paste images directly from clipboard into the compose textarea
  textarea?.addEventListener('paste', (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const pastedImages = items
      .filter((item) => item.kind === 'file' && /^image\//i.test(item.type))
      .map((item) => item.getAsFile())
      .filter(Boolean);

    if (!pastedImages.length) return;

    e.preventDefault();
    appendImageFiles(pastedImages);
    showToast('Đã dán ảnh vào bài đăng', 'success');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = textarea.value.trim();
    if (!content) return showToast('Viết gì đó đi!', 'info');

    const btn = document.getElementById('statusSubmitBtn');
    setLoading(btn, true);

    try {
      const fd = new FormData();
      fd.append('content', content);
      selectedFiles.forEach((file) => fd.append('images', file));
      const res = await fetch('/api/statuses', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi đăng trạng thái');

      showToast('✅ Đã đăng trạng thái!', 'success');
      form.reset();
      selectedFiles = [];
      syncInputFiles();
      renderSelectedPreview();
      if (charCount) charCount.textContent = '0';
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      showToast(err.message || 'Lỗi', 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ── Delete status ───────────────────────────── */
function initDeleteStatuses() {
  document.querySelectorAll('.status-delete-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm('Xóa trạng thái này?')) return;
      try {
        await api(`/api/statuses/${id}`, { method: 'DELETE' });
        const item = btn.closest('.sf-item');
        item?.remove();
        showToast('Đã xóa trạng thái', 'success');
      } catch (err) {
        showToast(err.message || 'Không thể xóa', 'error');
      }
    });
  });
}

/* ── Edit status (own posts) ─────────────────── */
function initEditStatuses() {
  const modal = document.getElementById('statusEditModal');
  const form = document.getElementById('statusEditForm');
  const idInput = document.getElementById('statusEditId');
  const contentInput = document.getElementById('statusEditContent');
  const imageInput = document.getElementById('statusEditImageInput');
  const existingGrid = document.getElementById('statusEditExistingImages');
  const newGrid = document.getElementById('statusEditNewImages');
  const closeBtn = document.getElementById('closeStatusEditModal');
  const cancelBtn = document.getElementById('statusEditCancelBtn');
  const submitBtn = document.getElementById('statusEditSubmitBtn');
  if (!modal || !form || !idInput || !contentInput || !imageInput || !existingGrid || !newGrid) return;

  const MAX_IMAGES = 4;
  let keepingImages = [];
  let addingFiles = [];

  const normalizeLocalImagePath = (url) => {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.origin);
      if (u.origin === window.location.origin) return u.pathname;
      return raw;
    } catch {
      return raw;
    }
  };

  const renderStatusMediaHtml = (images = []) => {
    const list = Array.isArray(images) ? images.slice(0, 4) : [];
    if (!list.length) return '';
    return `<div class="sf-media-grid sf-media-${Math.min(list.length, 4)}">${list.map((img) => `<div class="sf-media"><img src="${escapeTextHtml(img)}" alt="Ảnh trạng thái" loading="lazy" width="300" height="220"></div>`).join('')}</div>`;
  };

  const renderExistingGrid = () => {
    if (!keepingImages.length) {
      existingGrid.innerHTML = '<div class="status-edit-empty">Không có ảnh hiện có</div>';
      return;
    }

    existingGrid.innerHTML = keepingImages.map((img, index) => `
      <div class="status-edit-thumb">
        <img src="${escapeTextHtml(img)}" alt="Ảnh hiện có">
        <button type="button" class="status-edit-remove" data-type="existing" data-index="${index}" title="Xóa">✕</button>
      </div>
    `).join('');
  };

  const renderNewGrid = () => {
    if (!addingFiles.length) {
      newGrid.innerHTML = '<div class="status-edit-empty">Chưa thêm ảnh mới</div>';
      return;
    }

    newGrid.innerHTML = '';
    addingFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'status-edit-thumb';
        div.innerHTML = `<img src="${e.target.result}" alt="Ảnh mới"><button type="button" class="status-edit-remove" data-type="new" data-index="${index}" title="Xóa">✕</button>`;
        newGrid.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  };

  const appendNewFiles = (files = []) => {
    const imgs = files.filter((f) => f && /^image\//i.test(f.type));
    if (!imgs.length) return;

    const slotsLeft = Math.max(0, MAX_IMAGES - keepingImages.length - addingFiles.length);
    if (!slotsLeft) {
      showToast(`Chỉ cho phép tối đa ${MAX_IMAGES} ảnh`, 'info');
      return;
    }

    addingFiles.push(...imgs.slice(0, slotsLeft));
    renderNewGrid();
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    idInput.value = '';
    imageInput.value = '';
    keepingImages = [];
    addingFiles = [];
    renderExistingGrid();
    renderNewGrid();
  };

  const openModal = (statusId, text, images) => {
    idInput.value = statusId;
    contentInput.value = text || '';
    keepingImages = (images || []).map(normalizeLocalImagePath).filter(Boolean);
    addingFiles = [];
    renderExistingGrid();
    renderNewGrid();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    contentInput.focus();
    contentInput.setSelectionRange(contentInput.value.length, contentInput.value.length);
  };

  if (modal.dataset.bound !== '1') {
    modal.dataset.bound = '1';
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    imageInput.addEventListener('change', () => {
      appendNewFiles(Array.from(imageInput.files || []));
      imageInput.value = '';
    });

    existingGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-edit-remove[data-type="existing"]');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= keepingImages.length) return;
      keepingImages.splice(idx, 1);
      renderExistingGrid();
    });

    newGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-edit-remove[data-type="new"]');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= addingFiles.length) return;
      addingFiles.splice(idx, 1);
      renderNewGrid();
    });
  }

  document.querySelectorAll('.status-edit-btn').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const statusId = btn.dataset.id;
      const item = btn.closest('.sf-item');
      const contentText = item?.querySelector('.sf-content')?.textContent?.trim() || '';
      const images = Array.from(item?.querySelectorAll('.sf-media img') || []).map((img) => img.getAttribute('src') || img.src);
      openModal(statusId, contentText, images);
    });
  });

  if (form.dataset.bound !== '1') {
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusId = idInput.value;
      const content = (contentInput.value || '').trim();
      if (!statusId || !content) {
        showToast('Nội dung không được để trống', 'info');
        return;
      }

      setLoading(submitBtn, true);
      try {
        const fd = new FormData();
        fd.append('content', content);
        keepingImages.forEach((img) => fd.append('keepImages', normalizeLocalImagePath(img)));
        addingFiles.forEach((file) => fd.append('images', file));

        const data = await api(`/api/statuses/${statusId}`, {
          method: 'PUT',
          body: fd,
        });

        const item = document.querySelector(`.sf-item[data-status-id="${statusId}"]`);
        const contentEl = item?.querySelector('.sf-content');
        if (contentEl) {
          contentEl.innerHTML = linkifyTextHashtags(data.status?.content || content);
        }
        const bodyEl = item?.querySelector('.sf-item__body');
        const oldMedia = bodyEl?.querySelector('.sf-media-grid');
        if (oldMedia) oldMedia.remove();
        if (bodyEl && Array.isArray(data.status?.images) && data.status.images.length) {
          bodyEl.insertAdjacentHTML('beforeend', renderStatusMediaHtml(data.status.images));
        }
        const metaEl = item?.querySelector('.sf-meta-row');
        if (metaEl && !metaEl.querySelector('.sf-edited-label')) {
          metaEl.insertAdjacentHTML('beforeend', '<span class="sf-edited-label">đã chỉnh sửa</span>');
        }

        closeModal();
        showToast('Đã cập nhật bài đăng', 'success');
      } catch (err) {
        showToast(err.message || 'Không thể cập nhật bài đăng', 'error');
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }
}

/* ── Like status ─────────────────────────────── */
function initStatusLikes() {
  document.querySelectorAll('.status-like-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const statusId = btn.dataset.statusId;
      if (!ME) { showToast('Vui lòng đăng nhập để thích', 'info'); return; }

      try {
        const data = await api(`/api/statuses/${statusId}/like`, { method: 'POST' });
        const countEl = btn.querySelector('.status-like-count');
        if (countEl) countEl.textContent = data.count;
        const icon = btn.querySelector('i');
        if (icon) {
          if (data.liked) {
            icon.className = 'fas fa-heart';
            btn.classList.add('is-liked');
          } else {
            icon.className = 'far fa-heart';
            btn.classList.remove('is-liked');
          }
        }
      } catch (err) { showToast(err.message || 'Lỗi', 'error'); }
    });
  });
}

/* ── Toggle comments section ─────────────────── */
function initStatusComments() {
  const modal = document.getElementById('statusDetailModal');
  const closeBtn = document.getElementById('closeStatusDetailModal');
  const titleEl = document.getElementById('statusDetailTitle');
  const contentEl = document.getElementById('statusDetailContent');
  const commentsList = document.getElementById('statusDetailCommentsList');
  const commentCountEl = document.getElementById('statusDetailCommentCount');
  const commentForm = document.getElementById('statusDetailCommentForm');
  const commentInput = document.getElementById('statusDetailCommentInput');
  if (!modal || !closeBtn || !contentEl || !commentsList || !commentCountEl) return;

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (titleEl) titleEl.textContent = 'Bài viết';
    contentEl.innerHTML = '';
    commentsList.innerHTML = '';
    commentCountEl.textContent = '0 bình luận';
    if (commentForm) commentForm.dataset.statusId = '';
    if (commentInput) commentInput.value = '';
  };

  const setCountLabel = (count) => {
    const n = Number(count || 0);
    commentCountEl.textContent = `${n} bình luận`;
  };

  const openModal = async (statusId, itemEl) => {
    const authorName = itemEl?.querySelector('.sf-author-name')?.textContent?.trim() || 'Người dùng';
    if (titleEl) titleEl.textContent = `Bài viết của ${authorName}`;
    const headHtml = itemEl?.querySelector('.sf-item__head')?.outerHTML || '';
    const bodyHtml = itemEl?.querySelector('.sf-item__body')?.outerHTML || '';
    contentEl.innerHTML = `<article class="sf-item sf-item--modal-preview" data-status-id="${statusId}">${headHtml}${bodyHtml}</article>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    if (commentForm) commentForm.dataset.statusId = statusId;

    commentsList.innerHTML = '<p style="color:var(--ink-4);font-size:.82rem">Đang tải bình luận...</p>';
    try {
      const data = await api(`/api/statuses/${statusId}/comments`);
      const list = Array.isArray(data.comments) ? data.comments : [];
      commentsList.innerHTML = list.length
        ? list.map((c) => renderComment(c)).join('')
        : '<p style="color:var(--ink-4);font-size:.82rem">Chưa có bình luận.</p>';
      setCountLabel(list.length);
      const feedCountEl = document.querySelector(`.sf-comment-toggle[data-id="${statusId}"] .sf-comment-count`);
      if (feedCountEl) feedCountEl.textContent = String(list.length);
      if (commentInput) commentInput.focus();
    } catch (err) {
      commentsList.innerHTML = `<p style="color:var(--ink-4);font-size:.82rem">Không tải được bình luận${err?.message ? `: ${escapeTextHtml(err.message)}` : ''}</p>`;
      setCountLabel(0);
    }
  };

  if (modal.dataset.bound !== '1') {
    modal.dataset.bound = '1';
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  document.querySelectorAll('.sf-comment-toggle').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const statusId = btn.dataset.id;
      const itemEl = btn.closest('.sf-item');
      if (!statusId || !itemEl) return;
      await openModal(statusId, itemEl);
    });
  });

  if (commentForm && commentForm.dataset.bound !== '1') {
    commentForm.dataset.bound = '1';
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusId = commentForm.dataset.statusId;
      const text = (commentInput?.value || '').trim();
      if (!statusId) {
        showToast('Không xác định được bài viết để bình luận', 'error');
        return;
      }
      if (!text) return;

      const submitBtn = commentForm.querySelector('button[type="submit"], button');
      setLoading(submitBtn, true, 'Đang gửi...');

      try {
        const data = await api(`/api/statuses/${statusId}/comments`, {
          method: 'POST',
          body: JSON.stringify({ text }),
        });

        const empty = commentsList.querySelector('p');
        if (empty) empty.remove();
        commentsList.insertAdjacentHTML('beforeend', renderComment(data.comment));
        if (commentInput) commentInput.value = '';

        const countEl = document.querySelector(`.sf-comment-toggle[data-id="${statusId}"] .sf-comment-count`);
        const newCount = (parseInt(countEl?.textContent || '0', 10) || 0) + 1;
        if (countEl) countEl.textContent = newCount;
        setCountLabel(newCount);
      } catch (err) {
        showToast(err.message || 'Lỗi', 'error');
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }
}

function renderComment(c) {
  const name = escapeHtml(c.author?.displayName || 'User');
  const avatar = c.author?.avatar || '/images/default-avatar.svg';
  const username = c.author?.username || '';
  const text = escapeHtml(c.text);
  const time = new Date(c.createdAt).toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<div class="sf-comment">
    <a href="/u/${username}" class="sf-comment-avatar"><img src="${avatar}" alt="${name}"></a>
    <div class="sf-comment-body">
      <a href="/u/${username}" class="sf-comment-name">${name}</a>
      <span class="sf-comment-text">${text}</span>
      <span class="sf-comment-time">${time}</span>
    </div>
  </div>`;
}

/* ── Hashtag linkify + filter fallback ─────────── */
function escapeTextHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkifyStatusHashtags() {
  const regex = /(^|\s)#([\p{L}\p{N}_]{2,50})/gu;
  document.querySelectorAll('.sf-content').forEach((el) => {
    if (el.querySelector('.sf-hashtag')) return;
    const text = el.textContent || '';
    let last = 0;
    let out = '';
    let match;
    while ((match = regex.exec(text)) !== null) {
      const full = match[0];
      const lead = match[1] || '';
      const tag = match[2] || '';
      const hashPosInFull = full.indexOf('#');
      const matchIndex = match.index;
      out += escapeTextHtml(text.slice(last, matchIndex));
      out += escapeTextHtml(lead);
      out += `<a href="/social?tag=${encodeURIComponent(tag.toLowerCase())}" class="sf-hashtag">#${escapeTextHtml(tag)}</a>`;
      last = matchIndex + hashPosInFull + 1 + tag.length;
    }
    out += escapeTextHtml(text.slice(last));
    el.innerHTML = out;
  });
}

function applyTagFilterFallback() {
  const params = new URLSearchParams(window.location.search);
  const rawTag = (params.get('tag') || '').trim().replace(/^#/, '').toLowerCase();
  if (!rawTag) return;

  const pattern = new RegExp(`(^|\\s)#${rawTag.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?=$|\\s|[.,!?;:])`, 'i');
  const items = Array.from(document.querySelectorAll('.sf-item'));
  let visible = 0;

  items.forEach((item) => {
    const contentEl = item.querySelector('.sf-content');
    const text = contentEl ? (contentEl.textContent || '') : '';
    const matched = pattern.test(text);
    item.style.display = matched ? '' : 'none';
    if (matched) visible += 1;
  });

  if (visible === 0) {
    const feed = document.getElementById('statusFeed');
    if (feed && !feed.querySelector('.empty-state')) {
      const div = document.createElement('div');
      div.className = 'empty-state';
      div.innerHTML = '<div class="empty-illustration"><i class="fas fa-hashtag"></i></div><h3>Không có bài viết phù hợp</h3><p>Chưa có trạng thái nào chứa hashtag này.</p>';
      feed.appendChild(div);
    }
  }
}

function ensureTagFilterAlert() {
  const alertEl = document.getElementById('tagFilterAlert');
  if (!alertEl) return;

  const fromServer = (alertEl.dataset.currentTag || '').trim().replace(/^#/, '').toLowerCase();
  const fromUrl = (new URLSearchParams(window.location.search).get('tag') || '').trim().replace(/^#/, '').toLowerCase();
  const tag = fromUrl || fromServer;

  if (!tag) {
    alertEl.style.display = 'none';
    return;
  }

  const valueEl = document.getElementById('tagFilterValue');
  if (valueEl) {
    valueEl.textContent = '#' + tag;
    valueEl.setAttribute('href', '/social?tag=' + encodeURIComponent(tag));
  }
  alertEl.style.display = '';
}

function formatRelativeTimeText(value) {
  const date = new Date(value);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Vừa xong';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} ngày trước`;
  return date.toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function linkifyTextHashtags(text) {
  const safe = escapeTextHtml(text || '');
  return safe.replace(/(^|\s)#([\p{L}\p{N}_]{2,50})/gu, (m, p1, tag) => {
    return `${p1}<a href="/social?tag=${encodeURIComponent(tag.toLowerCase())}" class="sf-hashtag">#${escapeTextHtml(tag)}</a>`;
  });
}

function renderStatusItem(status) {
  const id = String(status._id || '');
  const author = status.author || {};
  const authorName = escapeTextHtml(author.displayName || 'Người dùng');
  const authorUsername = encodeURIComponent(author.username || '');
  const authorAvatar = escapeTextHtml(author.avatar || '/images/default-avatar.svg');
  const content = linkifyTextHashtags(status.content || '');
  const createdAtTitle = escapeTextHtml(new Date(status.createdAt).toLocaleString('vi-VN'));
  const createdAtText = escapeTextHtml(formatRelativeTimeText(status.createdAt));
  const edited = status.updatedAt && (new Date(status.updatedAt).getTime() > new Date(status.createdAt).getTime());
  const editedLabel = edited ? '<span class="sf-edited-label">đã chỉnh sửa</span>' : '';
  const isAdminBadge = author.isAdmin ? '<span class="sf-badge-admin"><i class="fas fa-shield-alt"></i> Admin</span>' : '';
  const canDelete = !!(ME && (ME.isAdmin || String(ME.id) === String(author._id || '')));
  const canEdit = !!(ME && String(ME.id) === String(author._id || ''));
  const headActions = (canDelete || canEdit)
    ? `<div class="sf-head-actions">
        ${canEdit ? `<button class="status-edit-btn sf-more-btn" data-id="${id}" title="Chỉnh sửa"><i class="fas fa-pen"></i></button>` : ''}
        ${canDelete ? `<button class="status-delete-btn sf-more-btn" data-id="${id}" title="Xóa"><i class="fas fa-trash-alt"></i></button>` : ''}
      </div>`
    : '';

  const imgs = Array.isArray(status.images) ? status.images.slice(0, 4) : [];
  const media = imgs.length
    ? `<div class="sf-media-grid sf-media-${Math.min(imgs.length, 4)}">${imgs.map((img) => `<div class="sf-media"><img src="${escapeTextHtml(img)}" alt="Ảnh trạng thái" loading="lazy" width="300" height="220"></div>`).join('')}</div>`
    : '';

  const liked = !!status.likedByMe;
  const likeCount = Array.isArray(status.likes) ? status.likes.length : 0;
  const commentCount = Number(status.commentCount || 0);
  const commentsForm = ME
    ? `<form class="sf-comment-form" data-status-id="${id}"><input type="text" placeholder="Viết bình luận..." maxlength="1000" class="sf-comment-input" required><button type="submit" class="btn btn-sm btn-primary"><i class="fas fa-paper-plane"></i></button></form>`
    : '';

  return `<article class="sf-item" id="status-${id}" data-status-id="${id}">
    <div class="sf-item__head">
      <a href="/u/${authorUsername}" class="sf-avatar">
        <img src="${authorAvatar}" alt="${authorName}" loading="lazy" width="42" height="42">
      </a>
      <div class="sf-author-info">
        <div class="sf-author-row">
          <a href="/u/${authorUsername}" class="sf-author-name">${authorName}</a>
          ${isAdminBadge}
        </div>
        <div class="sf-meta-row"><span class="sf-time" title="${createdAtTitle}">${createdAtText}</span>${editedLabel}</div>
      </div>
      ${headActions}
    </div>
    <div class="sf-item__body">
      <p class="sf-content">${content}</p>
      ${media}
    </div>
    <div class="sf-item__foot">
      <button class="sf-action sf-share-btn" data-id="${id}" title="Chia sẻ"><i class="fas fa-retweet"></i> <span>Chia sẻ</span></button>
      <button class="sf-action sf-comment-toggle" data-id="${id}" title="Bình luận"><i class="far fa-comment-dots"></i> <span class="sf-comment-count">${commentCount}</span></button>
      <button class="sf-action status-like-btn ${liked ? 'is-liked' : ''}" data-status-id="${id}" title="Thích"><i class="${liked ? 'fas' : 'far'} fa-heart"></i><span class="status-like-count">${likeCount}</span></button>
    </div>
    <div class="sf-comments" id="comments-${id}" style="display:none">
      <div class="sf-comments-list"></div>
      ${commentsForm}
    </div>
  </article>`;
}

function refreshStatusBindings() {
  initEditStatuses();
  initDeleteStatuses();
  initStatusLikes();
  initStatusComments();
  initShareButtons();
}

function initInfiniteStatusScroll() {
  const feed = document.getElementById('statusFeed');
  const sentinel = document.getElementById('statusFeedSentinel');
  const loading = document.getElementById('statusFeedLoading');
  if (!feed || !sentinel) return;

  let currentPage = Number(feed.dataset.page || 1);
  let totalPages = Number(feed.dataset.pages || 1);
  const sort = feed.dataset.sort || 'newest';
  const tag = (feed.dataset.tag || '').trim();
  let busy = false;

  if (!Number.isFinite(currentPage) || !Number.isFinite(totalPages) || currentPage >= totalPages) return;

  const loadNext = async () => {
    if (busy) return;
    if (currentPage >= totalPages) return;
    busy = true;
    if (loading) loading.style.display = 'block';

    try {
      const nextPage = currentPage + 1;
      const query = new URLSearchParams({ page: String(nextPage), limit: '15', sort });
      if (tag) query.set('tag', tag);
      const res = await fetch('/api/statuses?' + query.toString(), { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Không tải được thêm bài viết');

      const statuses = Array.isArray(data.statuses) ? data.statuses : [];
      if (statuses.length) {
        const html = statuses.map(renderStatusItem).join('');
        feed.insertAdjacentHTML('beforeend', html);
        refreshStatusBindings();
      }

      currentPage = Number(data.page || nextPage);
      totalPages = Number(data.pages || totalPages);
      feed.dataset.page = String(currentPage);
      feed.dataset.pages = String(totalPages);

      if (currentPage >= totalPages) {
        observer.disconnect();
        sentinel.style.display = 'none';
      }
    } catch (err) {
      showToast(err.message || 'Không tải được thêm bài viết', 'error');
    } finally {
      busy = false;
      if (loading) loading.style.display = 'none';
    }
  };

  const observer = new IntersectionObserver((entries) => {
    const hit = entries.some((e) => e.isIntersecting);
    if (hit) loadNext();
  }, { root: null, threshold: 0.1, rootMargin: '260px 0px' });

  observer.observe(sentinel);
}

function initFeaturedCarousel() {
  const viewport = document.getElementById('homeFeaturedViewport');
  if (!viewport) return;

  const prevBtn = document.querySelector('[data-featured-nav="prev"]');
  const nextBtn = document.querySelector('[data-featured-nav="next"]');
  if (!prevBtn || !nextBtn) return;

  const getStep = () => Math.max(280, Math.floor(viewport.clientWidth * 0.92));

  const syncButtons = () => {
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth - 4);
    prevBtn.disabled = viewport.scrollLeft <= 4;
    nextBtn.disabled = viewport.scrollLeft >= maxScrollLeft;
  };

  prevBtn.addEventListener('click', () => {
    viewport.scrollBy({ left: -getStep(), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    viewport.scrollBy({ left: getStep(), behavior: 'smooth' });
  });

  viewport.addEventListener('scroll', syncButtons, { passive: true });
  window.addEventListener('resize', syncButtons);
  syncButtons();
}

/* ── Post form (still needed for create-post page) ── */
function initPostForm() {
  const form = document.getElementById('postForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('postSubmitBtn');
    const msg = document.getElementById('postFormMsg');
    setLoading(btn, true);
    if (msg) { msg.style.display = 'none'; }
    const pendingUrl = document.getElementById('videoUrlInput');
    if (pendingUrl && pendingUrl.value.trim()) {
      const addBtn = document.getElementById('videoUrlAddBtn');
      addBtn && addBtn.click();
    }
    try {
      const fd = new FormData(form);
      const editId = form.dataset.editId;
      const res = await fetch(editId ? `/api/posts/${editId}` : '/api/posts', { method: editId ? 'PUT' : 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi lưu bài');
      showToast(editId ? '✅ Đã lưu thay đổi!' : '✅ Đăng thành công!', 'success');
      const isVideo = form.querySelector('input[name="postType"]')?.value === 'video';
      if (data.post?._id && isVideo) { setTimeout(() => location.href = '/video/' + data.post._id, 800); }
      else if (editId && data.post?.slug) { setTimeout(() => location.href = '/p/' + data.post.slug, 800); }
      else { form.reset(); setTimeout(() => location.reload(), 1000); }
    } catch (err) {
      if (msg) { msg.textContent = err.message; msg.style.color = 'var(--primary)'; msg.style.display = 'block'; }
      showToast(err.message || 'Lỗi đăng bài', 'error');
    } finally { setLoading(btn, false); }
  });
}

/* ── Category management (admin sidebar) ─────── */
function initCategoryAdmin() {
  const catForm = document.getElementById('catForm');
  catForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd   = new FormData(catForm);
    const name = fd.get('name')?.trim();
    const icon = fd.get('icon')?.trim() || '📂';
    if (!name) return showToast('Nhập tên category!', 'error');
    try {
      const data = await api('/api/categories', { method: 'POST', body: JSON.stringify({ name, icon }) });
      showToast(`✅ Đã thêm: ${name}`, 'success');
      catForm.reset();
      const list = document.getElementById('catList');
      const div  = document.createElement('div');
      div.className = 'cat-chip-admin';
      div.dataset.id = data.category._id;
      div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg);border-radius:8px;font-size:.85rem';
      div.innerHTML = `<span>${icon}</span><span style="flex:1">${name}</span>
        <button class="btn-cat-delete" data-id="${data.category._id}" style="background:none;border:none;color:var(--ink-4);cursor:pointer;font-size:.8rem"><i class="fas fa-trash"></i></button>`;
      list?.appendChild(div);
      bindCatDelete(div.querySelector('.btn-cat-delete'));
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.querySelectorAll('.btn-cat-delete').forEach(bindCatDelete);
}

function bindCatDelete(btn) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    if (!confirm('Xóa danh mục này?')) return;
    try {
      await api(`/api/categories/${id}`, { method: 'DELETE' });
      btn.closest('.cat-chip-admin')?.remove();
      showToast('Đã xóa danh mục', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  });
}

/* ── Video URL add button ───────────────────── */
function initVideoUrlAdd() {
  const addBtn   = document.getElementById('videoUrlAddBtn');
  const urlInput = document.getElementById('videoUrlInput');
  const chipsEl  = document.getElementById('videoUrlChips');
  const hiddenEl = document.getElementById('videoUrlHiddenInputs');
  if (!addBtn || !urlInput) return;
  function addUrl(url) {
    url = url.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) { showToast('URL không hợp lệ', 'error'); return; }
    const inp = document.createElement('input'); inp.type = 'hidden'; inp.name = 'videoUrls[]'; inp.value = url;
    hiddenEl.appendChild(inp);
    const chip = document.createElement('div'); chip.className = 'cp-url-chip';
    chip.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px" title="${url}">${url}</span>
      <button type="button" style="background:none;border:none;cursor:pointer;color:var(--ink-4);font-size:.85rem;flex-shrink:0" title="Xóa">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => { chip.remove(); inp.remove(); });
    chipsEl.appendChild(chip);
    urlInput.value = '';
  }
  addBtn.addEventListener('click', () => addUrl(urlInput.value));
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(urlInput.value); } });
}

/* ── Share status (copy link) ────────────────── */
function initShareButtons() {
  document.querySelectorAll('.sf-share-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const url = location.origin + '/?status=' + id;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast('Đã sao chép liên kết!', 'success'));
      } else {
        showToast('Không thể sao chép', 'info');
      }
    });
  });
}

/* ── Init ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  ensureTagFilterAlert();
  linkifyStatusHashtags();
  applyTagFilterFallback();
  initFeaturedCarousel();
  initStatusForm();
  initEditStatuses();
  initDeleteStatuses();
  initStatusLikes();
  initStatusComments();
  initShareButtons();
  initInfiniteStatusScroll();
  initPostForm();
  initCategoryAdmin();
  initVideoUrlAdd();
});
