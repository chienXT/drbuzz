/* =============================================
   DramaBuzz v3 – common.js
   Shared across all pages
   ============================================= */

'use strict';

/* ── HTML escape helper ────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ── Dark mode ─────────────────────────────── */
const THEME_KEY = 'db_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('darkIcon');
  if (icon) {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}

function initTheme() {
  if (window.__videoPageForceDark) { applyTheme('dark'); return; }
  const saved = localStorage.getItem(THEME_KEY) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function initImageFallbacks() {
  document.querySelectorAll('img[data-fallback-src]').forEach(img => {
    img.addEventListener('error', () => {
      img.src = img.dataset.fallbackSrc;
    }, { once: true });
  });
}

/* ── Toast notifications ───────────────────── */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const icon = document.createElement('i');
  icon.className = `fas ${icons[type] || icons.info}`;
  const span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(icon);
  toast.appendChild(span);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ── API helper ────────────────────────────── */
async function api(url, options = {}) {
  const defaults = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };

  // If body is FormData, remove Content-Type so browser sets boundary
  if (options.body instanceof FormData) {
    delete defaults.headers['Content-Type'];
  }

  const res  = await fetch(url, { ...defaults, ...options, headers: { ...defaults.headers, ...options.headers } });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw Object.assign(new Error(data.message || 'Lỗi server'), { status: res.status, data });
  }
  return data;
}

/* ── Auth Modal ────────────────────────────── */
function showAuthModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('open');
  switchTab(tab);
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('open');
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${name}`));
}

function setLoading(btn, loading, text = '') {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._originalHTML = btn.innerHTML;
    btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> ${text || 'Đang xử lý...'}`;
  } else {
    btn.innerHTML = btn._originalHTML || text;
  }
}

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

/* ── Login form ─────────────────────────────── */
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const fd  = new FormData(form);
    showFormError('loginError', '');
    setLoading(btn, true);

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
      });
      showToast(`Chào mừng, ${data.user.displayName}! 🎉`, 'success');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      showFormError('loginError', err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ── Register form ──────────────────────────── */
function initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const fd  = new FormData(form);
    showFormError('registerError', '');
    showFormError('registerSuccess', '');
    setLoading(btn, true);

    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username:    fd.get('username'),
          password:    fd.get('password'),
          displayName: fd.get('displayName'),
          email:       fd.get('email'),
        }),
      });
      const successEl = document.getElementById('registerSuccess');
      if (successEl) { successEl.textContent = '✅ Đăng ký thành công! Đang chuyển sang đăng nhập...'; successEl.style.display = 'block'; }
      form.reset();
      setTimeout(() => switchTab('login'), 1200);
    } catch (err) {
      showFormError('registerError', err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

/* ── Logout ─────────────────────────────────── */
async function doLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  } catch {
    location.href = '/';
  }
}

/* ── Forgot Password Flow ──────────────────── */
function initForgotPassword() {
  const showBtn  = document.getElementById('showForgotPassword');
  const backBtn  = document.getElementById('backToLogin');
  const forgotTab = document.getElementById('tab-forgot');
  const loginTab  = document.getElementById('tab-login');
  const tabBar    = forgotTab?.closest('.modal-body')?.querySelector('.tab-bar');

  let forgotEmail = '';
  let resetToken  = '';

  function showForgot() {
    loginTab.classList.remove('active'); loginTab.style.display = 'none';
    document.getElementById('tab-register').classList.remove('active');
    document.getElementById('tab-register').style.display = 'none';
    if (tabBar) tabBar.style.display = 'none';
    forgotTab.style.display = 'block';
    document.getElementById('forgotStep1').style.display = 'block';
    document.getElementById('forgotStep2').style.display = 'none';
    document.getElementById('forgotStep3').style.display = 'none';
  }

  function showLogin() {
    forgotTab.style.display = 'none';
    loginTab.style.display = 'block';
    loginTab.classList.add('active');
    document.getElementById('tab-register').style.display = '';
    if (tabBar) tabBar.style.display = '';
  }

  showBtn?.addEventListener('click', (e) => { e.preventDefault(); showForgot(); });
  backBtn?.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });

  // Step 1: Send code
  document.getElementById('forgotEmailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    showFormError('forgotError', '');
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      forgotEmail = email;
      document.getElementById('forgotStep1').style.display = 'none';
      document.getElementById('forgotStep2').style.display = 'block';
    } catch (err) {
      showFormError('forgotError', err.message);
    }
  });

  // Step 2: Verify code
  document.getElementById('verifyCodeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim();
    showFormError('verifyError', '');
    try {
      const data = await api('/api/auth/verify-reset-code', { method: 'POST', body: JSON.stringify({ email: forgotEmail, code }) });
      resetToken = data.resetToken;
      document.getElementById('forgotStep2').style.display = 'none';
      document.getElementById('forgotStep3').style.display = 'block';
    } catch (err) {
      showFormError('verifyError', err.message);
    }
  });

  // Step 3: New password
  document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword     = e.target.newPassword.value;
    const confirmPassword = e.target.confirmPassword.value;
    showFormError('resetError', '');
    showFormError('resetSuccess', '');

    if (newPassword !== confirmPassword) { showFormError('resetError', 'Mật khẩu không khớp'); return; }
    if (newPassword.length < 6) { showFormError('resetError', 'Mật khẩu tối thiểu 6 ký tự'); return; }

    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, newPassword }) });
      const el = document.getElementById('resetSuccess');
      if (el) { el.textContent = '✅ Đặt lại mật khẩu thành công! Đang chuyển...'; el.style.display = 'block'; }
      setTimeout(() => showLogin(), 2000);
    } catch (err) {
      showFormError('resetError', err.message);
    }
  });
}

/* ── Dropdown ───────────────────────────────── */
function initDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (!dropdown) return;

  const btn = document.getElementById('avatarBtn');
  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => dropdown.classList.remove('open'));
}

/* ── Mobile nav ─────────────────────────────── */
function initMobileNav() {
  const hamburger   = document.getElementById('hamburger');
  const mobileNav   = document.getElementById('mobileNav');
  const closeBtn    = document.getElementById('mobileNavClose');

  hamburger?.addEventListener('click', () => mobileNav?.classList.add('open'));
  closeBtn?.addEventListener('click',  () => mobileNav?.classList.remove('open'));
  mobileNav?.addEventListener('click', (e) => {
    if (e.target === mobileNav) mobileNav.classList.remove('open');
  });
}

function initMessagesPopup() {
  const trigger = document.getElementById('dmPopupTrigger');
  const overlay = document.getElementById('dmPopupOverlay');
  const closeBtn = document.getElementById('dmPopupClose');
  const dockRightBtn = document.getElementById('dmPopupDockRight');
  const resetBtn = document.getElementById('dmPopupReset');
  const modal = overlay?.querySelector('.dm-popup-modal');
  const modalHeader = overlay?.querySelector('.dm-popup-header');
  const resizeHandle = document.getElementById('dmPopupResize');
  if (!trigger || !overlay || !closeBtn || !modal) return;
  const popupLocked = true;

  if (popupLocked) {
    dockRightBtn?.setAttribute('hidden', 'hidden');
    resetBtn?.setAttribute('hidden', 'hidden');
    resizeHandle?.setAttribute('hidden', 'hidden');
    modalHeader?.classList.add('dm-popup-header-fixed');
  }

  const sizeStorageKey = 'dm-popup-size';
  const positionStorageKey = 'dm-popup-position';

  const clearInlinePlacement = () => {
    modal.style.removeProperty('--dm-popup-left');
    modal.style.removeProperty('--dm-popup-top');
    modal.style.removeProperty('--dm-popup-right');
    modal.style.removeProperty('--dm-popup-width');
    modal.style.removeProperty('--dm-popup-height');
  };

  const getBounds = () => ({
    minWidth: 340,
    minHeight: 420,
    maxWidth: Math.max(340, window.innerWidth - 48),
    maxHeight: Math.max(420, window.innerHeight - 24),
  });

  const clampSize = (width, height) => {
    const bounds = getBounds();
    return {
      width: Math.min(Math.max(width, bounds.minWidth), bounds.maxWidth),
      height: Math.min(Math.max(height, bounds.minHeight), bounds.maxHeight),
    };
  };

  const getPositionBounds = (width, height) => ({
    minTop: Math.max(8, (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 64) + 12),
    maxTop: Math.max(8, window.innerHeight - height - 16),
    minLeft: 16,
    maxLeft: Math.max(16, window.innerWidth - width - 16),
  });

  const applySidebarRightPreset = () => {
    if (window.innerWidth <= 768) return;

    const getVisibleRect = (el) => {
      if (!el) return null;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return rect;
    };

    const sidebarCandidates = Array.from(document.querySelectorAll('.home-sidebar-left, .home-sidebar-right, .sidebar.home-sidebar-right, .sidebar'));
    const visibleSidebars = sidebarCandidates
      .map((el) => ({ el, rect: getVisibleRect(el) }))
      .filter((item) => item.rect && item.rect.left >= 0 && item.rect.left < window.innerWidth);

    // Prefer the right sidebar edge so popup width matches the right column boundary.
    const preferredRightSidebar = visibleSidebars.find(({ el }) =>
      el.classList.contains('home-sidebar-right') ||
      el.classList.contains('sidebar-right')
    );

    // Fallback: choose the visible sidebar whose right edge is closest to the viewport right side.
    if (!preferredRightSidebar) {
      visibleSidebars.sort((a, b) => b.rect.right - a.rect.right);
    }

    const anchorRight = preferredRightSidebar
      ? preferredRightSidebar.rect.right
      : (visibleSidebars.length ? visibleSidebars[0].rect.right : null);

    const availableWidth = Number.isFinite(anchorRight)
      ? Math.round(window.innerWidth - anchorRight)
      : 420;

    const targetWidth = Math.max(availableWidth, 0);

    const targetHeight = window.innerHeight;

    modal.style.removeProperty('--dm-popup-left');
    modal.style.setProperty('--dm-popup-right', '0px');
    modal.style.setProperty('--dm-popup-top', '0px');
    modal.style.setProperty('--dm-popup-width', `${targetWidth}px`);
    modal.style.setProperty('--dm-popup-height', `${targetHeight}px`);
  };

  const applyPosition = (left, top) => {
    if (window.innerWidth <= 768) {
      modal.style.removeProperty('--dm-popup-left');
      modal.style.removeProperty('--dm-popup-right');
      modal.style.removeProperty('--dm-popup-top');
      return;
    }

    const rect = modal.getBoundingClientRect();
    const bounds = getPositionBounds(rect.width, rect.height);
    const nextLeft = Math.min(Math.max(left, bounds.minLeft), bounds.maxLeft);
    const nextTop = Math.min(Math.max(top, bounds.minTop), bounds.maxTop);

    modal.style.setProperty('--dm-popup-left', `${nextLeft}px`);
    modal.style.setProperty('--dm-popup-top', `${nextTop}px`);
    modal.style.setProperty('--dm-popup-right', 'auto');
  };

  const dockRight = () => {
    if (window.innerWidth <= 768) return;

    const rect = modal.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const top = Math.max(76, Math.min(rect.top, window.innerHeight - height - 16));
    const left = Math.max(16, window.innerWidth - width - 24);

    applyPosition(left, top);
    localStorage.setItem(positionStorageKey, JSON.stringify({
      left: Math.round(left),
      top: Math.round(top),
    }));
  };

  const resetPopup = () => {
    localStorage.removeItem(sizeStorageKey);
    localStorage.removeItem(positionStorageKey);
    applySidebarRightPreset();
  };

  const applySize = (width, height) => {
    if (window.innerWidth <= 768) {
      modal.style.removeProperty('--dm-popup-width');
      modal.style.removeProperty('--dm-popup-height');
      return;
    }

    const next = clampSize(width, height);
    modal.style.setProperty('--dm-popup-width', `${next.width}px`);
    modal.style.setProperty('--dm-popup-height', `${next.height}px`);

    if (modal.style.getPropertyValue('--dm-popup-left')) {
      applyPosition(
        parseFloat(modal.style.getPropertyValue('--dm-popup-left')) || modal.getBoundingClientRect().left,
        parseFloat(modal.style.getPropertyValue('--dm-popup-top')) || modal.getBoundingClientRect().top,
      );
    }
  };

  const restoreSize = () => {
    if (window.innerWidth <= 768) {
      modal.style.removeProperty('--dm-popup-width');
      modal.style.removeProperty('--dm-popup-height');
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(sizeStorageKey) || 'null');
      if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
        applySize(saved.width, saved.height);
      }
    } catch {}
  };

  const restorePosition = () => {
    if (window.innerWidth <= 768) {
      modal.style.removeProperty('--dm-popup-left');
      modal.style.removeProperty('--dm-popup-right');
      modal.style.removeProperty('--dm-popup-top');
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(positionStorageKey) || 'null');
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        applyPosition(saved.left, saved.top);
      } else {
        modal.style.removeProperty('--dm-popup-left');
        modal.style.removeProperty('--dm-popup-top');
        modal.style.removeProperty('--dm-popup-right');
      }
    } catch {}
  };

  const openPopup = () => {
    applySidebarRightPreset();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dm-popup-open');
  };

  const closePopup = () => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dm-popup-open');
  };

  trigger.addEventListener('click', (e) => {
    // Keep normal navigation behavior when user wants new tab/window.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // On /messages page, keep default behavior.
    if (window.location.pathname.startsWith('/messages')) return;
    e.preventDefault();
    openPopup();
  });

  closeBtn.addEventListener('click', closePopup);
  if (!popupLocked) {
    dockRightBtn?.addEventListener('click', dockRight);
    resetBtn?.addEventListener('click', resetPopup);
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closePopup();
  });

  const startPointerDrag = (startEvent, onMoveFrame, onDone) => {
    const pointerId = startEvent.pointerId;
    const dragTarget = startEvent.currentTarget;
    let active = true;

    if (dragTarget?.setPointerCapture && Number.isFinite(pointerId)) {
      try { dragTarget.setPointerCapture(pointerId); } catch {}
    }

    const finish = () => {
      if (!active) return;
      active = false;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('blur', handleCancel);
      if (dragTarget?.releasePointerCapture && Number.isFinite(pointerId)) {
        try { dragTarget.releasePointerCapture(pointerId); } catch {}
      }
      onDone?.();
    };

    const handleMove = (moveEvent) => {
      if (!active) return;
      if (Number.isFinite(pointerId) && moveEvent.pointerId !== pointerId) return;
      if (moveEvent.buttons === 0) {
        finish();
        return;
      }
      onMoveFrame(moveEvent);
    };

    const handleUp = (upEvent) => {
      if (Number.isFinite(pointerId) && upEvent.pointerId !== pointerId) return;
      finish();
    };

    const handleCancel = () => finish();

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('blur', handleCancel);
  };

  if (!popupLocked) resizeHandle?.addEventListener('pointerdown', (e) => {
    if (window.innerWidth <= 768) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = modal.getBoundingClientRect();

    const onMove = (moveEvent) => {
      const nextWidth = startRect.width + (moveEvent.clientX - startX);
      const nextHeight = startRect.height + (moveEvent.clientY - startY);
      applySize(nextWidth, nextHeight);
    };

    const onUp = () => {
      const rect = modal.getBoundingClientRect();
      localStorage.setItem(sizeStorageKey, JSON.stringify({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }));
    };

    startPointerDrag(e, onMove, onUp);
  });

  if (!popupLocked) modalHeader?.addEventListener('pointerdown', (e) => {
    if (window.innerWidth <= 768) return;
    if (e.target.closest('button')) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = modal.getBoundingClientRect();

    const onMove = (moveEvent) => {
      const nextLeft = startRect.left + (moveEvent.clientX - startX);
      const nextTop = startRect.top + (moveEvent.clientY - startY);
      applyPosition(nextLeft, nextTop);
    };

    const onUp = () => {
      const rect = modal.getBoundingClientRect();
      localStorage.setItem(positionStorageKey, JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      }));
    };

    startPointerDrag(e, onMove, onUp);
  });

  window.addEventListener('resize', () => {
    if (!overlay.classList.contains('open')) return;
    applySidebarRightPreset();
  });
}

/* ── Init everything ────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  /* Dark toggle */
  document.getElementById('darkToggle')?.addEventListener('click', toggleTheme);

  /* Auth modal open/close */
  document.getElementById('openAuthModal')?.addEventListener('click',  () => showAuthModal('login'));
  document.getElementById('sidebarOpenAuth')?.addEventListener('click', () => showAuthModal('login'));
  document.getElementById('mobileOpenAuth')?.addEventListener('click',  () => { showAuthModal('login'); document.getElementById('mobileNav')?.classList.remove('open'); });
  document.getElementById('closeAuthModal')?.addEventListener('click',  hideAuthModal);
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModal') hideAuthModal();
  });

  /* Tab switching */
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      // Profile page tabs vs auth modal tabs
      if (btn.closest('#authModal')) {
        switchTab(tab);
      } else {
        // Profile page custom tab handler
        const event = new CustomEvent('tabSwitch', { detail: { tab } });
        document.dispatchEvent(event);
      }
    });
  });

  /* Auth forms */
  initLoginForm();
  initRegisterForm();
  initForgotPassword();

  /* Logout buttons */
  document.getElementById('logoutBtn')?.addEventListener('click', doLogout);
  document.getElementById('mobileLogout')?.addEventListener('click', (e) => { e.preventDefault(); doLogout(); });

  /* Dropdown */
  initDropdown();

  /* Mobile nav */
  initMobileNav();
  initMessagesPopup();

  /* PM toast close button */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="close-pm-toast"]')) {
      document.getElementById('pmNotifToast').style.display = 'none';
    }
  });

  /* Admin form shortcut */
  document.getElementById('openAdminForm')?.addEventListener('click', (e) => {
    e.preventDefault();
    const form = document.getElementById('adminForm');
    if (form) { form.scrollIntoView({ behavior: 'smooth' }); form.style.boxShadow = '0 0 0 2px var(--primary)'; setTimeout(() => form.style.boxShadow = '', 1500); }
    document.getElementById('userDropdown')?.classList.remove('open');
  });

  /* Auto-open auth if ?login=1 */
  if (new URLSearchParams(location.search).get('login') === '1') {
    setTimeout(() => showAuthModal('login'), 300);
  }

  /* Load site stats for sidebar */
  loadSiteStats();
});

/* ── Site Stats loader ─────────────────────── */
async function loadSiteStats() {
  const el = document.getElementById('siteStats');
  if (!el) return;
  try {
    const data = await api('/api/stats/visitors');
    if (data.success) {
      const fmt = n => Number(n || 0).toLocaleString('vi-VN');
      const sp = document.getElementById('statTotalPosts');
      const su = document.getElementById('statTotalUsers');
      const sv = document.getElementById('statTotalViews');
      if (sp) sp.textContent = fmt(data.posts);
      if (su) su.textContent = fmt(data.users);
      if (sv) sv.textContent = fmt(data.visitors);
    }
  } catch { /* silent */ }
}

/* Expose globally */
window.showToast    = showToast;
window.showAuthModal = showAuthModal;
window.api          = api;
window.setLoading   = setLoading;
window.addActivityToSidebar = addActivityToSidebar;
window.formatRelativeTime = formatRelativeTime;

/* ── Format relative time ────────────────────────── */
function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours}h trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  if (diffWeeks < 4) return `${diffWeeks} tuần trước`;
  if (diffMonths < 12) return `${diffMonths} tháng trước`;
  return `${Math.floor(diffMonths / 12)} năm trước`;
}

/* ── Add activity to sidebar ──────────────────────────── */
function addActivityToSidebar(activity) {
  // Try multiple selectors to find activity items
  let activityItems = document.querySelector('.activity-panel .activity-items');
  
  if (!activityItems) {
    // Fallback: search for activity-panel anywhere in document
    const panel = document.querySelector('.activity-panel');
    if (panel) activityItems = panel.querySelector('.activity-items');
  }

  if (!activityItems) return;

  // Determine action text and post link
  let actionText = 'có tương tác mới';
  if (activity.type === 'post_liked') actionText = 'đã thích bài: ';
  else if (activity.type === 'comment_created') actionText = 'bình luận: ';
  else if (activity.type === 'post_created') actionText = 'đã đăng bài';
  else if (activity.type === 'comment_replied') actionText = 'đã trả lời bình luận của bạn tại ';

  // Build post link HTML if post exists
  let postHtml = '';
  if (activity.post && (activity.type === 'post_liked' || activity.type === 'comment_created' || activity.type === 'comment_replied')) {
    const postTitle = activity.post.title || 'Bài viết';
    const displayTitle = postTitle.length > 30 ? postTitle.substring(0, 30) + '...' : postTitle;
    postHtml = `<a href="/bai-viet/${activity.post._id}" title="${postTitle}" style="color:var(--primary);font-weight:500;text-decoration:none;">"${displayTitle}"</a>`;
  }

  // Create activity HTML
  const activityHtml = `
    <div class="activity-item-compact">
      <div class="activity-avatar">
        <img src="${(activity.user && activity.user.avatar) ? activity.user.avatar : '/images/default-avatar.svg'}" alt="">
      </div>
      <div class="activity-info">
        <div class="activity-text-compact">
          <a href="/u/${activity.user?.username || ''}" class="activity-user">${activity.user?.displayName || 'Ai đó'}</a>
          <span> ${actionText}</span>
          ${postHtml}
        </div>
        <div class="activity-time">${formatRelativeTime(activity.createdAt)}</div>
      </div>
    </div>
  `;

  // Insert at the beginning
  activityItems.insertAdjacentHTML('afterbegin', activityHtml);

  // Keep only 5 items
  const items = activityItems.querySelectorAll('.activity-item-compact');
  for (let i = items.length - 1; i >= 5; i--) {
    items[i].remove();
  }

  // Hide empty state if visible
  const emptyState = document.querySelector('.activity-panel .empty-state');
  if (emptyState) {
    emptyState.style.display = 'none';
  }
}


function initNotifDropdown() {
  const btn      = document.getElementById('notifBtn');
  const dropdown = document.getElementById('notifDropdown');
  if (!btn || !dropdown) return;

  let closeTimeout;
  
  // Hover to open
  dropdown.addEventListener('mouseenter', () => {
    clearTimeout(closeTimeout);
    dropdown.classList.add('open');
    loadNotifications();
  });
  
  // Leave to close with delay
  dropdown.addEventListener('mouseleave', () => {
    closeTimeout = setTimeout(() => {
      dropdown.classList.remove('open');
    }, 100);
  });
  
  // Also support click on button to toggle (for touch devices)
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(closeTimeout);
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) loadNotifications();
  });
  
  // Stop propagation inside dropdown to prevent auto-close
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  // Read all
  document.getElementById('readAllNotif')?.addEventListener('click', async () => {
    await api('/api/notifications/read-all', { method:'POST' }).catch(()=>{});
    document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.style.display = 'none';
      badge.style.opacity = '0';
    }
  });
}

function getNotificationUrl(notification) {
  if (notification.type === 'private_message' && notification.sender?._id) {
    return `/messages?with=${notification.sender._id}`;
  }
  if (['post_created', 'post_liked', 'comment_created', 'comment_replied'].includes(notification.type) && notification.refPost?._id) {
    return `/bai-viet/${notification.refPost._id}`;
  }
  if (['status_liked', 'status_commented'].includes(notification.type) && notification.refStatus?._id) {
    return `/social#status-${notification.refStatus._id}`;
  }
  if (['post_like', 'post_comment', 'comment_like'].includes(notification.type) && notification.refPost?._id) {
    return `/bai-viet/${notification.refPost._id}`;
  }
  if ((notification.type === 'friend_request' || notification.type === 'friend_accept') && notification.sender?.username) {
    return `/u/${encodeURIComponent(notification.sender.username)}`;
  }
  return '';
}

function renderFriendRequestActions(notification) {
  if (notification.type !== 'friend_request' || notification.source !== 'notification' || !notification.sender?._id) {
    return '';
  }
  return `<div class="friend-req-btns notif-friend-actions">
    <button class="freq-btn-accept" data-action="accept-friend-notif" data-user-id="${notification.sender._id}" data-notif-id="${notification._id}">Đồng ý</button>
    <button class="freq-btn-decline" data-action="decline-friend-notif" data-user-id="${notification.sender._id}" data-notif-id="${notification._id}">Từ chối</button>
  </div>`;
}

function renderNotificationMessage(notification, icon) {
  const message = escapeHtml(notification.message || '');
  if ((notification.type === 'friend_request' || notification.type === 'friend_accept') && notification.sender?.username && notification.sender?.displayName) {
    const senderName = escapeHtml(notification.sender.displayName);
    const profileUrl = `/u/${encodeURIComponent(notification.sender.username)}`;
    const trimmedMessage = message.replace(senderName, '').trim();
    return `<span class="notif-text-row"><span class="notif-type-icon" aria-hidden="true">${icon}</span><span class="notif-message-body"><a href="${profileUrl}" class="link-primary notif-sender-link">${senderName}</a>${trimmedMessage ? ` ${trimmedMessage}` : ''}</span></span>`;
  }
  return `<span class="notif-text-row"><span class="notif-type-icon" aria-hidden="true">${icon}</span><span class="notif-message-body">${message}</span></span>`;
}

async function handleFriendRequestNotification(action, userId, notifId, button) {
  if (!userId || !button) return;
  button.disabled = true;
  const row = button.closest('.notif-item');
  const otherButton = row?.querySelector(`[data-action="${action === 'accept' ? 'decline-friend-notif' : 'accept-friend-notif'}"]`);
  if (otherButton) otherButton.disabled = true;

  try {
    const endpoint = action === 'accept'
      ? `/api/friends/accept-from/${userId}`
      : `/api/friends/decline-from/${userId}`;
    await api(endpoint, { method:'POST' });
    if (notifId) {
      await api(`/api/notifications/${notifId}/read`, { method:'POST' }).catch(() => {});
    }
    showToast(action === 'accept' ? '✅ Đã chấp nhận lời mời kết bạn!' : 'Đã từ chối lời mời kết bạn', action === 'accept' ? 'success' : 'info');
    await Promise.all([loadNotifications(), loadNotifCount()]);
  } catch (e) {
    showToast(e.message || 'Lỗi xử lý lời mời kết bạn', 'error');
    button.disabled = false;
    if (otherButton) otherButton.disabled = false;
  }
}

async function navigateNotification(url, notifId) {
  if (notifId) {
    api(`/api/notifications/${notifId}/read`, { method:'POST' }).catch(() => {});
  }
  location.href = url;
}

async function loadNotifications() {
  const list = document.getElementById('notifList');
  if (!list) return;
  
  // Only show spinner if list is currently empty
  if (list.querySelector('.loading-container')) return; // Already loading
  
  list.innerHTML = '<div style="padding:16px;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const data = await api('/api/notifications');
    const notifs = data.notifications || [];
    if (!notifs.length) { list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--ink-4);font-size:.85rem">Chưa có thông báo nào.</div>'; return; }
    list.innerHTML = notifs.map(n => {
      const sender = n.sender || {};
      const avatarHtml = `<img src="${sender.avatar || '/images/default-avatar.svg'}" alt="">`;
      const notifId = n.source === 'notification' ? String(n._id || '') : '';
      const typeIcon = {
        friend_request: '👥', friend_accept: '🤝',
        post_like: '❤️', post_comment: '💬', comment_like: '👍',
        post_created: '📝', post_liked: '❤️', comment_created: '💬', comment_replied: '↩️',
        status_liked: '❤️', status_commented: '💬',
      };
      const icon = typeIcon[n.type] || '🔔';
      const url = getNotificationUrl(n);
      const hasUrl = Boolean(url) && !(n.type === 'friend_request' && n.source === 'notification');
      const unreadDot = n.read ? '' : '<div class="notif-unread-dot"></div>';
      const actionsHtml = renderFriendRequestActions(n);
      const messageHtml = renderNotificationMessage(n, icon);
      const timeStr = (() => {
        const diff = Date.now() - new Date(n.createdAt);
        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' phút trước';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' giờ trước';
        return new Date(n.createdAt).toLocaleDateString('vi-VN');
      })();
      return `<div class="notif-item${n.read ? '' : ' unread'}${hasUrl ? ' clickable' : ''}"${notifId ? ` data-notif-id="${notifId}"` : ''}${hasUrl ? ` data-url="${url}"` : ''}>
        <div class="notif-avatar">${avatarHtml}</div>
        <div class="notif-content">
          <div class="notif-text">${messageHtml}</div>
          <div class="notif-time">${timeStr}</div>
          ${actionsHtml}
        </div>
        ${unreadDot}
      </div>`;
    }).join('');

    list.querySelectorAll('.notif-item[data-url]').forEach(el => {
      el.addEventListener('click', () => navigateNotification(el.dataset.url, el.dataset.notifId));
    });
    list.querySelectorAll('[data-action="accept-friend-notif"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFriendRequestNotification('accept', btn.dataset.userId, btn.dataset.notifId, btn);
      });
    });
    list.querySelectorAll('[data-action="decline-friend-notif"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFriendRequestNotification('decline', btn.dataset.userId, btn.dataset.notifId, btn);
      });
    });
  } catch (e) { list.innerHTML = `<div style="padding:16px;color:var(--primary);font-size:.82rem">${escapeHtml(e.message)}</div>`; }
}

/* Badge count cache to prevent flickering */
let notifCountCache = null;
let dmCountCache = null;
let friendCountCache = null;

function updateBadgeCount(badge, count) {
  if (!badge) return;
  const safeCount = Number(count || 0);
  if (safeCount > 0) {
    badge.textContent = safeCount;
    badge.style.display = 'inline-flex';
    badge.style.opacity = '1';
  } else {
    badge.style.display = 'none';
    badge.style.opacity = '0';
  }
}

async function loadNotifCount() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  
  // Do NOT load full notifications here - just get count
  try {
    const data = await api('/api/notifications/unread-count');
    const newCount = data.count || 0;
    
    // Only update if count changed to prevent flickering
    if (notifCountCache === newCount) return;
    notifCountCache = newCount;

    updateBadgeCount(badge, newCount);
  } catch {
    try {
      const data = await api('/api/notifications');
      const fallbackCount = (data.notifications || []).filter((n) => !n.read).length;
      if (notifCountCache === fallbackCount) return;
      notifCountCache = fallbackCount;
      updateBadgeCount(badge, fallbackCount);
    } catch {}
  }
}

async function loadDMBadgeCount() {
  const badge = document.getElementById('dmBadge');
  if (!badge) return;
  try {
    const data = await api('/api/messages/unread-count');
    const newCount = data.count || 0;
    
    // Only update if count changed to prevent flickering
    if (dmCountCache === newCount) return;
    dmCountCache = newCount;

    updateBadgeCount(badge, newCount);
  } catch {}
}
/* ── V4: Friend requests dropdown ─────────── */
function initFriendDropdown() {
  const btn      = document.getElementById('friendReqBtn');
  const dropdown = document.getElementById('friendDropdown');
  if (!btn || !dropdown) return;

  // Hover to open
  dropdown.addEventListener('mouseenter', () => {
    dropdown.classList.add('open');
    loadFriendRequests();
  });

  let closeTimeoutFriend;
  // Leave to close with delay (same as notif)
  dropdown.addEventListener('mouseleave', () => {
    closeTimeoutFriend = setTimeout(() => {
      dropdown.classList.remove('open');
    }, 200);
  });
  dropdown.addEventListener('mouseenter', () => clearTimeout(closeTimeoutFriend));
  
  // Also support click on button to toggle (for touch devices)
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) loadFriendRequests();
  });
  
  // Stop propagation inside dropdown to prevent auto-close
  dropdown.addEventListener('click', (e) => e.stopPropagation());
}

function initFriendRequestActions() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="accept-friend"], [data-action="decline-friend"]');
    if (!btn) return;
    e.preventDefault();

    const shipId = btn.dataset.shipId;
    if (!shipId) return;

    if (btn.dataset.action === 'accept-friend') {
      await acceptFriend(shipId, btn);
    } else if (btn.dataset.action === 'decline-friend') {
      await declineFriend(shipId, btn);
    }
  });
}

// Cập nhật badge count khi có lời mời kết bạn mới
async function loadFriendBadgeCount() {
  const badge = document.getElementById('friendBadge');
  if (!badge) return;
  try {
    const data = await api('/api/friends/pending');
    const newCount = (data.requests || []).length;
    
    // Only update if count changed to prevent flickering
    if (friendCountCache === newCount) return;
    friendCountCache = newCount;
    
    if (newCount > 0) { 
      badge.textContent = newCount; 
      badge.style.display = 'inline-flex';
      badge.style.opacity = '1';
    } else { 
      badge.style.display = 'none';
      badge.style.opacity = '0';
    }
  } catch {}
}

// Full friend requests loading (chỉ gọi khi dropdown mở)
async function loadFriendRequests() {
  const list  = document.getElementById('friendReqList');
  const badge = document.getElementById('friendBadge');
  if (!list) return;
  try {
    const data = await api('/api/friends/pending');
    const reqs = data.requests || [];
    const newCount = reqs.length;
    
    // Update badge with cache check
    if (badge) { 
      if (friendCountCache !== newCount) {
        friendCountCache = newCount;
        badge.textContent = newCount || '';
        badge.style.display = newCount ? 'inline-flex' : 'none';
      }
    }
    
    if (!reqs.length) { list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--ink-4);font-size:.83rem">Không có lời mời nào.</div>'; return; }
    list.innerHTML = reqs.map(r => {
      const u = r.requester || {};
      const avt = `<img src="${u.avatar || '/images/default-avatar.svg'}" alt="">`;
      const timeStr = (() => {
        const diff = Date.now() - new Date(r.createdAt || Date.now());
        if (diff < 60000) return 'Vừa gửi';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' phút trước';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' giờ trước';
        return new Date(r.createdAt).toLocaleDateString('vi-VN');
      })();
      return `<div class="friend-req-item">
        <a href="/u/${u.username || ''}" class="freq-avatar">${avt}</a>
        <div class="freq-info">
          <a href="/u/${u.username || ''}" class="freq-name">${u.displayName || ''}</a>
          <div class="freq-meta">${timeStr}</div>
          <div class="friend-req-btns">
            <button class="freq-btn-accept" data-action="accept-friend" data-ship-id="${r._id}">Chấp nhận</button>
            <button class="freq-btn-decline" data-action="decline-friend" data-ship-id="${r._id}">Từ chối</button>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch {}
}

async function acceptFriend(shipId, btn) {
  btn.disabled = true;
  try {
    await api('/api/friends/accept', { method:'POST', body: JSON.stringify({ shipId }) });
    btn.closest('.friend-req-item')?.remove();
    showToast('✅ Đã chấp nhận lời mời!', 'success');
    await loadFriendBadgeCount();
    const dropdown = document.getElementById('friendDropdown');
    if (dropdown?.classList.contains('open')) loadFriendRequests();
  } catch(e) { showToast(e.message,'error'); btn.disabled=false; }
}

async function declineFriend(shipId, btn) {
  try {
    await api('/api/friends/decline', { method:'POST', body: JSON.stringify({ shipId }) });
    btn.closest('.friend-req-item')?.remove();
    await loadFriendBadgeCount();
    const dropdown = document.getElementById('friendDropdown');
    if (dropdown?.classList.contains('open')) loadFriendRequests();
  } catch(e) { showToast(e.message,'error'); }
}

/* ── Override DOMContentLoaded to add V4 inits ── */
document.addEventListener('DOMContentLoaded', () => {
  initNotifDropdown();
  // Load counts only when user is logged in (badge elements exist)
  // Do NOT load full requests list on page load - only load when dropdown opens
  if (document.getElementById('notifBadge')) {
    loadNotifCount();
    loadDMBadgeCount();
    setInterval(loadNotifCount, 15000);
    setInterval(loadDMBadgeCount, 15000);
  }
});

/* ── Socket.io real-time notifications ─────── */
let socketInitialized = false; // Prevent duplicate initialization
function initSocketNotifications() {
  // Only init if Socket.io is available and user is logged in
  if (typeof io === 'undefined' || !window.CURRENT_USER) return;
  if (socketInitialized) return; // Prevent duplicate socket listeners
  
  socketInitialized = true;
  const socket = io('/', { withCredentials: true });
  
  socket.on('connect', () => {
    console.log('[socket] connected for notifications');
  });
  
  // Friend request notifications
  socket.on('friend:new_request', (data) => {
    showToast(`👥 ${data.fromName} đã gửi lời mời kết bạn!`, 'info');
    loadNotifCount(); // Update notification badge
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown?.classList.contains('open')) loadNotifications();
  });
  
  socket.on('friend:accepted', (data) => {
    showToast(`🤝 ${data.fromName} đã chấp nhận lời mời kết bạn!`, 'success');
    loadNotifCount(); // Update notification badge
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown?.classList.contains('open')) loadNotifications();
  });
  
  // General notifications
  socket.on('notification:new', (data) => {
    showToast(data.message, 'info');
    loadNotifCount(); // Update notification badge
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown?.classList.contains('open')) loadNotifications();
  });

  // Private message notifications
  socket.on('pm:notification', (data) => {
    showToast(`✉️ ${data.fromName}: ${data.preview}`, 'info');
    loadDMBadgeCount();
  });

  // Real-time activity (e.g. someone replied to my comment)
  socket.on('activity:new', (activity) => {
    addActivityToSidebar(activity);
    loadNotifCount();
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown?.classList.contains('open')) loadNotifications();
    if (activity.type === 'comment_replied') {
      const postTitle = activity.post?.title ? `"${activity.post.title}"` : 'bài viết';
      showToast(`💬 ${activity.user?.displayName || 'Ai đó'} đã trả lời bình luận của bạn tại ${postTitle}`, 'info', 4000);
    } else if (activity.type === 'status_liked') {
      showToast(`❤️ ${activity.user?.displayName || 'Ai đó'} đã thích trạng thái của bạn`, 'info', 3500);
    } else if (activity.type === 'status_commented') {
      showToast(`💬 ${activity.user?.displayName || 'Ai đó'} đã bình luận trạng thái của bạn`, 'info', 4000);
    }
  });

  // Online users count
  socket.on('online:list', (onlineList) => {
    const onlineCountEl = document.getElementById('onlineCount');
    if (onlineCountEl) {
      onlineCountEl.textContent = onlineList.length;
    }
  });

  socket.on('user:online', (data) => {
    // Optionally request fresh online list
    socket.emit('request:online_list');
  });

  socket.on('user:offline', (data) => {
    // Update will come from online:list event
  });
}

// Update visitor/total connections count via API
const updateVisitorCount = async () => {
  try {
    const res = await fetch('/api/stats/visitors');
    const data = await res.json();
    const visitorEl = document.getElementById('visitorCount');
    if (visitorEl && data.visitors) {
      visitorEl.textContent = data.visitors;
    }
  } catch (e) {
    console.log('[stats] visitor count fetch failed');
  }
};

// Init socket notifications when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initSocketNotifications, 100); // Small delay to ensure Socket.io is loaded
  setTimeout(updateVisitorCount, 500); // Load visitor count, then refresh every minute
  setInterval(updateVisitorCount, 60000);
});

/* ── Add friend from suggestions ──────────── */
async function addFriend(btnOrUserId, userId) {
  // Support both addFriend(btn, userId) and legacy addFriend(userId)
  let button, uid;
  if (typeof btnOrUserId === 'string') {
    // Called as addFriend('userId') from old callers — get button from event
    uid = btnOrUserId;
    button = (typeof event !== 'undefined' && event?.target?.closest('button')) || null;
  } else {
    // Called as addFriend(this, 'userId')
    button = btnOrUserId;
    uid = userId;
  }
  if (!uid) return;
  if (button) setLoading(button, true);
  try {
    await api('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ recipientId: uid })
    });
    if (button) {
      button.innerHTML = '<i class="fas fa-check"></i> Đã gửi';
      button.disabled = true;
      button.classList.add('btn-success');
      button.classList.remove('btn-primary', 'wb-follow-btn');
    }
    showToast('✅ Đã gửi lời mời kết bạn!', 'success');
  } catch (e) {
    showToast(e.message || 'Lỗi khi gửi lời mời', 'error');
    if (button) setLoading(button, false);
  }
}

/* Expose */
window.acceptFriend  = acceptFriend;
window.declineFriend = declineFriend;
window.addFriend     = addFriend;
