/* =============================================
   DramaBuzz v3 – post.js
   Post detail page interactions
   ============================================= */

'use strict';

const POST_ID = window.POST_ID;
if (typeof ME === 'undefined') var ME = window.CURRENT_USER || null;

/* ── Like post ──────────────────────────────── */
function initLike() {
  const btn = document.getElementById('likeBtn');
  if (!btn || !ME) return;

  btn.addEventListener('click', async () => {
    try {
      const data = await api(`/api/posts/${POST_ID}/like`, { method: 'POST' });
      const countEl = document.getElementById('likeCount');
      if (countEl) countEl.textContent = data.count;

      const icon = btn.querySelector('i');
      btn.classList.toggle('liked', data.liked);
      if (icon) icon.className = data.liked ? 'fas fa-heart' : 'far fa-heart';

      showToast(data.liked ? '❤️ Đã thích bài viết' : 'Đã bỏ thích', 'info', 2000);
    } catch (err) {
      showToast(err.message || 'Lỗi', 'error');
    }
  });
}

/* ── Bookmark post ──────────────────────────── */
function initBookmark() {
  const btn = document.getElementById('bookmarkBtn');
  if (!btn || !ME) return;

  btn.addEventListener('click', async () => {
    try {
      const data = await api(`/api/posts/${POST_ID}/bookmark`, { method: 'POST' });
      btn.classList.toggle('bookmarked', data.bookmarked);
      const icon = btn.querySelector('i');
      if (icon) icon.className = data.bookmarked ? 'fas fa-bookmark' : 'far fa-bookmark';
      showToast(data.bookmarked ? '🔖 Đã lưu bài viết' : 'Đã bỏ lưu', 'success', 2000);
    } catch (err) {
      showToast(err.message || 'Lỗi', 'error');
    }
  });
}

/* ── Comments ───────────────────────────────── */
let replyingTo = null; // { commentId, displayName }

function initComments() {
  const submitBtn  = document.getElementById('submitComment');
  const input      = document.getElementById('commentInput');
  const cancelBtn  = document.getElementById('cancelReply');
  if (!submitBtn || !input || !ME) return;

  /* Submit comment */
  submitBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return showToast('Vui lòng nhập bình luận', 'error');
    setLoading(submitBtn, true);

    try {
      const body = { text };
      if (replyingTo) body.parentId = replyingTo.commentId;

      const data = await api(`/api/posts/${POST_ID}/comments`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      input.value = '';
      const parentId = replyingTo?.commentId;
      const wasReply = !!replyingTo;
      cancelReplyMode();
      appendComment(data.comment, parentId);

      // Update count
      const countEl = document.getElementById('commentCount');
      if (countEl) {
        const n = parseInt(countEl.textContent.replace(/\D/g,'')) || 0;
        countEl.textContent = `(${n + 1})`;
      }

      showToast('💬 Đã gửi bình luận', 'success', 2000);
    } catch (err) {
      showToast(err.message || 'Lỗi gửi bình luận', 'error');
    } finally {
      setLoading(submitBtn, false);
    }
  });

  /* Cancel reply */
  cancelBtn?.addEventListener('click', cancelReplyMode);

  /* Ctrl+Enter shortcut */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitBtn.click();
  });

  /* Like / reply / delete / replies-toggle – delegated */
  document.getElementById('commentList')?.addEventListener('click', async (e) => {
    const likeBtn    = e.target.closest('.like-comment');
    const replyBtn   = e.target.closest('.reply-btn');
    const deleteBtn  = e.target.closest('.delete-comment');
    const toggleBtn  = e.target.closest('.wb-replies-toggle');

    if (likeBtn)   await handleLikeComment(likeBtn);
    if (replyBtn)  handleReply(replyBtn);
    if (deleteBtn) await handleDeleteComment(deleteBtn);
    if (toggleBtn) onRepliesToggle(toggleBtn);
  });

  // Init collapse on page load
  document.querySelectorAll('.wb-replies').forEach(applyRepliesCollapse);
}

function cancelReplyMode() {
  replyingTo = null;
  const input = document.getElementById('commentInput');
  if (input) { input.placeholder = 'Viết bình luận của bạn...'; input.value = ''; }
  document.getElementById('cancelReply').style.display = 'none';
}

function handleReply(btn) {
  // Close any other open inline reply box
  document.querySelectorAll('.wb-inline-reply').forEach(el => el.remove());

  if (!ME) return showToast('Vui lòng đăng nhập để trả lời', 'error');

  const commentId  = btn.dataset.id;
  const authorName = btn.dataset.name;

  // Find the root parent comment id (in case replying to a nested reply)
  const rootCmt = btn.closest('.wb-cmt:not(.wb-reply)') || btn.closest('.wb-cmt');
  const rootId  = rootCmt?.id?.replace('comment-', '') || commentId;

  const cmtBody = btn.closest('.wb-cmt-body');
  if (!cmtBody) return;

  const wrap = document.createElement('div');
  wrap.className = 'wb-inline-reply';
  wrap.innerHTML = `
    <input class="wb-inline-reply-input" type="text"
      placeholder="Trả lời ${authorName}... (Enter để gửi)" autocomplete="off">
    <button type="button" class="wb-inline-reply-cancel" title="Hủy"><i class="fas fa-times"></i></button>`;

  // Insert right after wb-cmt-actions
  const actionsEl = cmtBody.querySelector('.wb-cmt-actions');
  actionsEl ? actionsEl.insertAdjacentElement('afterend', wrap) : cmtBody.appendChild(wrap);

  const input     = wrap.querySelector('.wb-inline-reply-input');
  const cancelBtn = wrap.querySelector('.wb-inline-reply-cancel');
  input.focus();

  cancelBtn.addEventListener('click', () => wrap.remove());

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { wrap.remove(); return; }
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.disabled = true;
    cancelBtn.disabled = true;
    try {
      const data = await api(`/api/posts/${POST_ID}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text, parentId: rootId }),
      });
      wrap.remove();
      appendComment(data.comment, rootId);

      const countEl = document.getElementById('commentCount');
      if (countEl) {
        const n = parseInt(countEl.textContent.replace(/\D/g, '')) || 0;
        countEl.textContent = `(${n + 1})`;
      }
      showToast('💬 Đã gửi bình luận', 'success', 2000);
    } catch (err) {
      input.disabled = false;
      cancelBtn.disabled = false;
      showToast(err.message || 'Lỗi gửi bình luận', 'error');
    }
  });
}

async function handleLikeComment(btn) {
  if (!ME) return showToast('Vui lòng đăng nhập', 'error');
  const id = btn.dataset.id;
  try {
    const data = await api(`/api/comments/${id}/like`, { method: 'POST' });
    const countEl = btn.querySelector('span');
    if (countEl) countEl.textContent = data.count;
    btn.classList.toggle('liked', data.liked);
    const icon = btn.querySelector('i');
    if (icon) icon.className = data.liked ? 'fas fa-heart' : 'far fa-heart';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteComment(btn) {
  const id = btn.dataset.id;
  if (!confirm('Xóa bình luận này?')) return;
  try {
    await api(`/api/comments/${id}`, { method: 'DELETE' });
    document.getElementById(`comment-${id}`)?.remove();
    showToast('Đã xóa bình luận', 'success');

    const countEl = document.getElementById('commentCount');
    if (countEl) {
      const n = Math.max(0, parseInt(countEl.textContent.replace(/\D/g,'')) - 1);
      countEl.textContent = `(${n})`;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ── HTML escape helper ─────────────────────── */
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function appendComment(comment, parentId) {
  const avatarHtml   = comment.author?.avatar
    ? `<img src="${escHtml(comment.author.avatar)}" alt="">`
    : `<img src="/images/default-avatar.svg" alt="">`;

  const canDelete = ME?.isAdmin || String(ME?.id) === String(comment.author?._id);
  const displayName = escHtml(comment.author?.displayName || 'Bạn');
  const commentText = escHtml(comment.text);

  const html = `
    <div class="wb-cmt" id="comment-${comment._id}">
      <div class="wb-cmt-avatar">${avatarHtml}</div>
      <div class="wb-cmt-body">
        <div class="wb-cmt-name-row">
          <span class="wb-cmt-name">${displayName}</span>
          <span class="wb-cmt-time">Vừa xong</span>
        </div>
        <div class="wb-cmt-text">${commentText}</div>
        <div class="wb-cmt-actions">
          <button class="wb-cmt-btn like-comment" data-id="${comment._id}">
            <i class="far fa-heart"></i> <span>0</span>
          </button>
          <button class="wb-cmt-btn reply-btn" data-id="${comment._id}" data-name="${displayName}">
            <i class="fas fa-reply"></i> Trả lời
          </button>
          ${canDelete ? `<button class="wb-cmt-btn delete-comment" data-id="${comment._id}" style="color:var(--primary)"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;

  if (parentId) {
    // Prepend as reply (newest first) inside parent
    let replyWrap = document.querySelector(`#comment-${parentId} .wb-replies`);
    if (!replyWrap) {
      replyWrap = document.createElement('div');
      replyWrap.className = 'wb-replies';
      const parentBody = document.getElementById(`comment-${parentId}`)?.querySelector('.wb-cmt-body');
      if (parentBody) parentBody.appendChild(replyWrap);
    }
    // Insert after any existing toggle button stays at bottom
    const toggleBtn = replyWrap.querySelector('.wb-replies-toggle');
    if (toggleBtn) {
      toggleBtn.insertAdjacentHTML('beforebegin', html);
    } else {
      replyWrap.insertAdjacentHTML('afterbegin', html);
    }
    applyRepliesCollapse(replyWrap);
  } else {
    // Remove empty state if present
    document.querySelector('.wb-cmt-list .wb-cmt-empty')?.remove();
    document.getElementById('commentList')?.insertAdjacentHTML('beforeend', html);
  }
}

/* ── Collapse replies: keep first 3 visible ── */
function applyRepliesCollapse(replyWrap) {
  const replies = Array.from(replyWrap.querySelectorAll('.wb-reply'));
  const LIMIT = 3;
  let toggleBtn = replyWrap.querySelector('.wb-replies-toggle');

  replies.forEach((r, i) => {
    if (i < LIMIT) {
      r.classList.remove('wb-reply-hidden');
    } else {
      r.classList.add('wb-reply-hidden');
    }
  });

  const hidden = replies.length - LIMIT;
  if (hidden > 0) {
    if (!toggleBtn) {
      toggleBtn = document.createElement('button');
      toggleBtn.className = 'wb-replies-toggle';
      replyWrap.appendChild(toggleBtn);
      toggleBtn.addEventListener('click', () => onRepliesToggle(toggleBtn));
    }
    const expanded = toggleBtn.dataset.expanded === '1';
    toggleBtn.dataset.total = replies.length;
    if (!expanded) {
      toggleBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Xem thêm ${hidden} trả lời`;
    }
  } else if (toggleBtn) {
    toggleBtn.remove();
  }
}

function onRepliesToggle(btn) {
  const replyWrap = btn.closest('.wb-replies');
  if (!replyWrap) return;
  const replies  = Array.from(replyWrap.querySelectorAll('.wb-reply'));
  const expanded = btn.dataset.expanded === '1';
  const LIMIT    = 3;

  if (expanded) {
    // Collapse back to 3
    replies.forEach((r, i) => r.classList.toggle('wb-reply-hidden', i >= LIMIT));
    btn.dataset.expanded = '0';
    btn.innerHTML = `<i class="fas fa-chevron-down"></i> Xem thêm ${replies.length - LIMIT} trả lời`;
  } else {
    // Show all
    replies.forEach(r => r.classList.remove('wb-reply-hidden'));
    btn.dataset.expanded = '1';
    btn.innerHTML = `<i class="fas fa-chevron-up"></i> Ẩn bớt`;
  }
}

/* ── Init ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initLike();
  initBookmark();
  initComments();
  initActionButtons();

  // Scroll to comment input when clicking comment count button
  document.getElementById('goToComment')?.addEventListener('click', () => {
    document.getElementById('commentFormWrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('commentInput')?.focus(), 400);
  });
});

/* ── Action buttons (auth modal, share, image open) ── */
function initActionButtons() {
  // Handle all data-action buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;

    switch (action) {
      case 'show-auth-modal':
        if (window.showAuthModal) window.showAuthModal();
        break;

      case 'share-post':
        const title = btn.dataset.title || document.title;
        if (navigator.share) {
          navigator.share({ title, url: location.href });
        } else {
          navigator.clipboard.writeText(location.href).then(() => {
            showToast('Đã copy link!', 'success');
          }).catch(() => {
            showToast('Không thể copy link', 'error');
          });
        }
        break;

      case 'open-image':
        const src = btn.dataset.src;
        if (src) window.open(src, '_blank');
        break;
    }
  });
}
