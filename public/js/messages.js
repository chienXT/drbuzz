/* =============================================
   DramaBuzz V4 – messages.js
   Private 1-1 messaging with Socket.io
   ============================================= */
'use strict';

if (typeof ME === 'undefined') var ME = window.CURRENT_USER || null;
if (!ME) { location.href = '/?login=1'; }

const socket = window._socket || io('/', { withCredentials: true });
window._socket = socket;

/* ── DOM refs ── */
const convListEl  = document.getElementById('convList');
const friendListEl= document.getElementById('friendList');
const pmSearchEl  = document.getElementById('pmSearch');
const pmEmptyEl   = document.getElementById('pmEmpty');
const pmChatWin   = document.getElementById('pmChatWindow');
const pmMsgsEl    = document.getElementById('pmMessages');
const pmInputEl   = document.getElementById('pmInput');
const pmSendBtn   = document.getElementById('pmSendBtn');
const pmTypingEl  = document.getElementById('pmTypingEl');
const pmBackBtn   = document.getElementById('pmBackBtn');
const pmHeaderName= document.getElementById('pmHeaderName');
const pmStatusTxt = document.getElementById('pmStatusText');

/* ── State ── */
let activePartnerId   = null;
let activePartnerInfo = null;
let typingTimer       = null;
let isLoadingChat     = false;
const onlineIds       = new Set();

/* ── Helpers ── */
const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function timeStr(ts) {
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  if (diff === 1) return 'Hôm qua';
  if (diff <  7)  return d.toLocaleDateString('vi-VN', { weekday:'short' });
  return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
}

function avatarEl(user, size = 38) {
  const src = user && user.avatar ? user.avatar : '/images/default-avatar.svg';
  return `<img src="${esc(src)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
}

function scrollBottom(force = false) {
  const atBottom = pmMsgsEl.scrollHeight - pmMsgsEl.scrollTop - pmMsgsEl.clientHeight < 80;
  if (force || atBottom) pmMsgsEl.scrollTop = pmMsgsEl.scrollHeight;
}

function applyDMBadgeCount(count) {
  const badge = document.getElementById('dmBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
    badge.style.opacity = '1';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
    badge.style.opacity = '0';
  }
}

async function refreshDMBadgeFromServer() {
  try {
    const data = await api(`/api/messages/unread-count?_=${Date.now()}`, { cache: 'no-store' });
    applyDMBadgeCount(data.count || 0);
  } catch {}
}

function syncDMBadgeFromConversations(conversations) {
  const totalUnread = (conversations || []).reduce((sum, c) => sum + (parseInt(c.unread || 0, 10) || 0), 0);
  applyDMBadgeCount(totalUnread);
}

/* ── Load conversations ── */
async function loadConversations() {
  convListEl.innerHTML = '<div style="padding:20px;text-align:center"><div class="spinner" style="margin:0 auto 6px"></div><span style="font-size:.8rem;color:var(--ink-4)">Đang tải...</span></div>';
  try {
    const data = await api(`/api/messages?_=${Date.now()}`, { cache: 'no-store' });
    convListEl.innerHTML = '';
    if (!data.conversations?.length) {
      convListEl.innerHTML = '<div style="padding:24px;text-align:center;font-size:.82rem;color:var(--ink-4)">Chưa có cuộc trò chuyện nào.<br>Kết bạn và bắt đầu nhắn tin!</div>';
      await refreshDMBadgeFromServer();
      return;
    }
    syncDMBadgeFromConversations(data.conversations);
    data.conversations.forEach(renderConvItem);
    // After conversations are loaded, check if we should auto-open a chat from URL
    checkURLOpenChat();
  } catch (e) {
    convListEl.innerHTML = `<div style="padding:16px;color:var(--primary);font-size:.82rem">${e.message}</div>`;
  }
}

function renderConvItem(conv) {
  const { partner, lastMsg, unread } = conv;
  const div = document.createElement('div');
  div.className = 'pm-conv-item';
  div.dataset.uid = partner._id;

  let preview = 'Bắt đầu cuộc trò chuyện';
  if (lastMsg?.recalled) {
    preview = '📵 Tin đã thu hồi';
  } else if (lastMsg?.text) {
    const text = esc(lastMsg.text);
    preview = text.length > 38 ? text.slice(0, 38) + '…' : text;
  }

  const isOnline = onlineIds.has(String(partner._id));

  div.innerHTML = `
    <div class="pm-avatar">${avatarEl(partner, 40)}<span class="pm-status-dot${isOnline?' online':''}" id="status-${partner._id}"></span></div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:.88rem;color:var(--ink)">${esc(partner.displayName)}</div>
      <div class="pm-conv-preview" id="preview-${partner._id}">${preview}</div>
    </div>
    <div class="pm-conv-meta">
      <span class="pm-conv-time">${lastMsg ? timeStr(new Date(lastMsg.createdAt).getTime()) : ''}</span>
      ${unread > 0 ? `<span class="pm-unread-badge" id="unread-${partner._id}">${unread}</span>` : `<span id="unread-${partner._id}"></span>`}
    </div>`;

  div.addEventListener('click', () => openChat(partner));
  convListEl.appendChild(div);
}

/* ── Open chat ── */
async function openChat(partner) {
  if (isLoadingChat) return;
  isLoadingChat = true;
  
  activePartnerId   = String(partner._id || partner.id);
  activePartnerInfo = partner;

  // Update URL so reload preserves the active chat
  const url = new URL(window.location);
  url.searchParams.set('with', activePartnerId);
  history.replaceState(null, '', url);

  document.querySelectorAll('.pm-conv-item,.pm-user-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-uid="${activePartnerId}"]`)?.classList.add('active');

  pmEmptyEl.style.display  = 'none';
  pmChatWin.classList.remove('hidden');

  if (window.innerWidth <= 768) {
    document.querySelector('.pm-layout')?.classList.add('chat-open');
  }

  // Update header
  pmHeaderName.textContent = partner.displayName;
  
  updateStatus(activePartnerId);

  pmInputEl.disabled  = false;
  pmSendBtn.disabled  = false;
  pmInputEl.placeholder = `Nhắn tin với ${partner.displayName}...`;

  // Load history
  pmMsgsEl.innerHTML = '<div style="padding:20px;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const data = await api(`/api/messages/${activePartnerId}?_=${Date.now()}`, { cache: 'no-store' });
    pmMsgsEl.innerHTML = '';
    lastMsgDateStr = '';
    if (data.messages?.length) {
      data.messages.forEach(m => appendMessage(m));
      scrollBottom(true);
    } else {
      pmMsgsEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--ink-4);font-size:.875rem">👋 Hãy bắt đầu cuộc trò chuyện!</div>';
    }
  } catch (e) {
    pmMsgsEl.innerHTML = `<div style="padding:16px;color:var(--primary)">${e.message}</div>`;
  } finally {
    isLoadingChat = false;
  }

  // Mark as read
  api(`/api/messages/${activePartnerId}/read`, { method:'POST' }).catch(()=>{});
  clearBadge(activePartnerId);
  socket.emit('pm:read', { fromUserId: activePartnerId });
  pmInputEl.focus();
}

/* ── Render message ── */
let lastMsgDateStr = '';
function appendMessage(msg, prepend = false) {
  const isMine  = String(msg.sender?._id || msg.sender) === String(ME.id);
  const sender  = msg.sender || activePartnerInfo || {};
  const canRecall = isMine && !msg.recalled;
  
  // Add date separator if date changed
  const msgDate = new Date(msg.createdAt);
  const msgDateStr = msgDate.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  
  if (msgDateStr !== lastMsgDateStr) {
    const sep = document.createElement('div');
    sep.className = 'pm-msg-separator';
    sep.innerHTML = `<span class="pm-separator-text">${msgDateStr}</span>`;
    if (prepend) pmMsgsEl.insertBefore(sep, pmMsgsEl.firstChild);
    else pmMsgsEl.appendChild(sep);
    lastMsgDateStr = msgDateStr;
  }

  const wrap = document.createElement('div');
  wrap.className = `pm-msg${isMine ? ' mine' : ''}`;
  wrap.dataset.id = msg._id;

  const recallBtn = canRecall
    ? `<button class="pm-msg-action-btn" data-recall="${msg._id}"><i class="fas fa-undo"></i></button>`
    : '';

  wrap.innerHTML = `
    <div class="pm-msg-avatar">${avatarEl(sender, 32)}</div>
    <div class="pm-msg-body">
      <div class="pm-bubble-wrap">
        <div class="pm-bubble${msg.recalled ? ' recalled' : ''}">
          ${msg.recalled ? '<i class="fas fa-ban" style="opacity:.5;margin-right:5px"></i><em>Tin đã thu hồi</em>' : esc(msg.text)}
        </div>
        ${recallBtn}
      </div>
      <div class="pm-bubble-time">${timeStr(msgDate.getTime())}</div>
    </div>`;

  if (prepend) pmMsgsEl.insertBefore(wrap, pmMsgsEl.firstChild);
  else pmMsgsEl.appendChild(wrap);
}

/* ── Send ── */
function sendMessage() {
  const text = pmInputEl.value.trim();
  if (!text || !activePartnerId) return;
  socket.emit('pm:send', { toUserId: activePartnerId, text });
  pmInputEl.value = '';
  pmInputEl.style.height = 'auto';
  clearTimeout(typingTimer);
  socket.emit('pm:typing', { toUserId: activePartnerId, isTyping: false });
}

pmSendBtn.addEventListener('click', sendMessage);
pmInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
pmInputEl.addEventListener('input', () => {
  pmInputEl.style.height = 'auto';
  pmInputEl.style.height = Math.min(pmInputEl.scrollHeight, 120) + 'px';
  if (!activePartnerId) return;
  socket.emit('pm:typing', { toUserId: activePartnerId, isTyping: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit('pm:typing', { toUserId: activePartnerId, isTyping: false }), 1500);
});

/* ── Recall via delegation ── */
pmMsgsEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-recall]');
  if (!btn) return;
  const id = btn.dataset.recall;
  if (!confirm('Thu hồi tin nhắn này?')) return;
  try {
    await api(`/api/messages/${id}/recall`, { method:'PATCH' });
  } catch (err) { showToast(err.message, 'error'); }
});

/* ── Back button (mobile) ── */
pmBackBtn?.addEventListener('click', () => {
  document.querySelector('.pm-layout')?.classList.remove('chat-open');
  activePartnerId = null;
});

/* ── Search friends ── */
pmSearchEl?.addEventListener('input', () => {
  const q = pmSearchEl.value.trim().toLowerCase();
  if (q) {
    convListEl.style.display  = 'none';
    friendListEl.style.display = 'block';
    document.querySelectorAll('.pm-user-item').forEach(el => {
      el.style.display = el.dataset.name.toLowerCase().includes(q) ? '' : 'none';
    });
  } else {
    convListEl.style.display   = 'block';
    friendListEl.style.display = 'none';
  }
});

document.querySelectorAll('.pm-user-item').forEach(el => {
  el.addEventListener('click', () => {
    openChat({ _id: el.dataset.uid, id: el.dataset.uid, displayName: el.dataset.name, avatar: el.dataset.avatar, username: '' });
    pmSearchEl.value = '';
    convListEl.style.display   = 'block';
    friendListEl.style.display = 'none';
  });
});

/* ── Status helpers ── */
function updateStatus(userId) {
  const isOnline = onlineIds.has(String(userId));
  if (pmStatusTxt) pmStatusTxt.textContent = isOnline ? 'Đang online' : 'Offline';
}

function clearBadge(userId) {
  const el = document.getElementById(`unread-${userId}`);
  if (el) { el.textContent = ''; el.className = ''; }
  updateDMBadge();
}

function updateDMBadge() {
  let total = 0;
  document.querySelectorAll('[id^="unread-"]').forEach(el => { total += parseInt(el.textContent||0); });

  // If no active chat is opened, do not clear badge optimistically.
  // Keep badge in sync with server to avoid disappearing right after clicking icon.
  if (total === 0 && !activePartnerId) {
    refreshDMBadgeFromServer();
    return;
  }

  applyDMBadgeCount(total);
}

/* ── Typing display ── */
const typingPartners = new Map();
function showTyping() {
  const names = Array.from(typingPartners.values());
  if (pmTypingEl) pmTypingEl.textContent = names.length ? `${names[0]} đang nhập...` : '';
}

/* ── URL open direct chat ── */
let urlChatChecked = false;
function checkURLOpenChat() {
  if (urlChatChecked) return;
  const params = new URLSearchParams(location.search);
  const withId = params.get('with');
  if (!withId) return;
  urlChatChecked = true;

  // Try to find partner from friends list or conversation list DOM
  const friend = window.FRIENDS_LIST?.find(f => String(f.id) === String(withId));
  if (friend) { openChat(friend); return; }

  // Fallback: find from rendered conversation item
  const convEl = document.querySelector(`.pm-conv-item[data-uid="${withId}"]`);
  if (convEl) {
    const nameEl = convEl.querySelector('[style*="font-weight"]');
    openChat({ _id: withId, id: withId, displayName: nameEl?.textContent || '', avatar: '', username: '' });
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SOCKET EVENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
socket.on('pm:message', (msg) => {
  const partnerId = String(msg.sender?._id) === String(ME.id) ? String(msg.receiver) : String(msg.sender?._id);
  if (partnerId === activePartnerId && !pmChatWin.classList.contains('hidden')) {
    document.querySelector('.pm-messages [style*="text-align:center"]')?.remove();
    appendMessage(msg);
    scrollBottom();
    // Only auto-read if this tab is actually visible/focused
    if (document.hasFocus()) {
      api(`/api/messages/${activePartnerId}/read`, { method:'POST' }).catch(()=>{});
      socket.emit('pm:read', { fromUserId: activePartnerId });
      clearBadge(activePartnerId);
    } else {
      // Tab is in background - show unread badge, will read when tab gains focus
      const el = document.getElementById(`unread-${partnerId}`);
      if (el) { el.textContent = (parseInt(el.textContent||0)+1); el.className='pm-unread-badge'; }
      updateDMBadge();
    }
  } else {
    // update unread badge
    const el = document.getElementById(`unread-${partnerId}`);
    if (el) { el.textContent = (parseInt(el.textContent||0)+1); el.className='pm-unread-badge'; }
    else loadConversations();
    updateDMBadge();
  }
  // update preview in conv list
  const previewEl = document.getElementById(`preview-${partnerId}`);
  if (previewEl && !msg.recalled) previewEl.textContent = esc(msg.text?.slice(0,38))||'';
});

socket.on('pm:recalled', ({ msgId }) => {
  const el = pmMsgsEl.querySelector(`[data-id="${msgId}"] .pm-bubble`);
  if (el) { 
    el.classList.add('recalled');
    el.innerHTML='<i class="fas fa-ban" style="opacity:.5;margin-right:5px"></i><em>Tin đã thu hồi</em>'; 
  }
});

socket.on('pm:typing', ({ fromUserId, fromName, isTyping }) => {
  if (String(fromUserId) !== activePartnerId) return;
  isTyping ? typingPartners.set(String(fromUserId), fromName) : typingPartners.delete(String(fromUserId));
  showTyping();
});

socket.on('pm:notification', ({ fromUserId, fromName, fromAvatar, preview }) => {
  if (String(fromUserId) === activePartnerId) return;
  // Show toast
  const toast = document.getElementById('pmNotifToast');
  if (toast) {
    document.getElementById('pmToastName').textContent    = fromName;
    document.getElementById('pmToastPreview').textContent = preview;
    const avatarDiv = document.getElementById('pmToastAvatar');
    avatarDiv.innerHTML = fromAvatar ? `<img src="${esc(fromAvatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<img src="/images/default-avatar.svg" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    toast.style.display = 'flex';
    toast.onclick = () => {
      toast.style.display = 'none';
      const friend = window.FRIENDS_LIST?.find(f => String(f.id) === String(fromUserId));
      if (friend) openChat(friend); else location.href = '/messages?with=' + fromUserId;
    };
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display='none'; }, 6000);
  }
});

socket.on('pm:error', ({ message }) => {
  showToast(message || 'Không thể gửi tin nhắn', 'error');
});

socket.on('online:list', (users) => {
  onlineIds.clear();
  users.forEach(u => onlineIds.add(String(u.id)));
  document.querySelectorAll('[id^="status-"]').forEach(el => {
    const uid = el.id.replace('status-','');
    el.classList.toggle('online', onlineIds.has(uid));
  });
  if (activePartnerId) updateStatus(activePartnerId);
});

socket.on('user:online',  ({ userId }) => { onlineIds.add(String(userId));    document.querySelectorAll(`#status-${userId}`).forEach(el=>el.classList.add('online'));    if(activePartnerId===String(userId)) updateStatus(userId); });
socket.on('user:offline', ({ userId }) => { onlineIds.delete(String(userId)); document.querySelectorAll(`#status-${userId}`).forEach(el=>el.classList.remove('online')); if(activePartnerId===String(userId)) updateStatus(userId); });

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  refreshDMBadgeFromServer();
  loadConversations();
  // checkURLOpenChat is called after loadConversations completes
});

// When tab regains focus, mark active chat as read (if messages arrived while tab was in background)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activePartnerId && !pmChatWin.classList.contains('hidden')) {
    api(`/api/messages/${activePartnerId}/read`, { method:'POST' }).catch(()=>{});
    socket.emit('pm:read', { fromUserId: activePartnerId });
    clearBadge(activePartnerId);
  }
});
