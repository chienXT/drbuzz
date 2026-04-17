/* Standard video player controls for native video sources (mp4/hls/webm/ogg). */
(function () {
  var panel = document.getElementById('stdPlayerPanel');
  if (!panel) return;

  var isNative = panel.getAttribute('data-native-player') === 'true';
  var video = document.getElementById('stdVideoEl');
  if (!isNative || !video) return;

  var playBtn = document.getElementById('stdPlayBtn');
  var backBtn = document.getElementById('stdBackBtn');
  var forwardBtn = document.getElementById('stdForwardBtn');
  var muteBtn = document.getElementById('stdMuteBtn');
  var volumeInput = document.getElementById('stdVolume');
  var speedSelect = document.getElementById('stdSpeedSelect');
  var seekInput = document.getElementById('stdSeek');
  var currentTimeEl = document.getElementById('stdTimeCurrent');
  var totalTimeEl = document.getElementById('stdTimeTotal');
  var loopBtn = document.getElementById('stdLoopBtn');
  var autoplayBtn = document.getElementById('stdAutoplayBtn');
  var pipBtn = document.getElementById('stdPipBtn');
  var fullscreenBtn = document.getElementById('stdFullscreenBtn');
  var playerWrap = document.getElementById('vdpPlayer');

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '00:00';
    var s = Math.floor(sec % 60);
    var m = Math.floor((sec / 60) % 60);
    var h = Math.floor(sec / 3600);
    var p2 = function (n) { return String(n).padStart(2, '0'); };
    return h > 0 ? (p2(h) + ':' + p2(m) + ':' + p2(s)) : (p2(m) + ':' + p2(s));
  }

  function updatePlayLabel() {
    if (!playBtn) return;
    var paused = video.paused || video.ended;
    playBtn.innerHTML = paused
      ? '<i class="fas fa-play"></i> Phát'
      : '<i class="fas fa-pause"></i> Tạm dừng';
  }

  function updateMuteLabel() {
    if (!muteBtn) return;
    if (video.muted || video.volume === 0) {
      muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i> Tắt tiếng';
      return;
    }
    muteBtn.innerHTML = '<i class="fas fa-volume-up"></i> Âm thanh';
  }

  function syncTimeline() {
    if (!seekInput) return;
    var duration = video.duration || 0;
    var current = video.currentTime || 0;
    if (duration > 0) {
      seekInput.value = String((current / duration) * 100);
    } else {
      seekInput.value = '0';
    }
    if (currentTimeEl) currentTimeEl.textContent = fmtTime(current);
    if (totalTimeEl) totalTimeEl.textContent = fmtTime(duration);
  }

  function syncToggles() {
    if (loopBtn) loopBtn.classList.toggle('active', !!video.loop);
    if (autoplayBtn) autoplayBtn.classList.toggle('active', !!video.autoplay);
  }

  var savedAuto = localStorage.getItem('vdpAutoplay') === '1';
  video.autoplay = savedAuto;

  if (volumeInput) {
    volumeInput.value = String(video.volume || 1);
    volumeInput.addEventListener('input', function () {
      var v = parseFloat(volumeInput.value);
      if (!isFinite(v)) v = 1;
      video.volume = Math.max(0, Math.min(1, v));
      video.muted = video.volume === 0;
      updateMuteLabel();
    });
  }

  if (speedSelect) {
    speedSelect.value = '1';
    speedSelect.addEventListener('change', function () {
      var r = parseFloat(speedSelect.value);
      video.playbackRate = isFinite(r) ? r : 1;
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', function () {
      if (video.paused || video.ended) video.play();
      else video.pause();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
    });
  }

  if (forwardBtn) {
    forwardBtn.addEventListener('click', function () {
      var d = isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER;
      video.currentTime = Math.min(d, (video.currentTime || 0) + 10);
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      updateMuteLabel();
    });
  }

  if (seekInput) {
    seekInput.addEventListener('input', function () {
      var d = video.duration || 0;
      if (d <= 0) return;
      var p = parseFloat(seekInput.value);
      if (!isFinite(p)) p = 0;
      video.currentTime = (Math.max(0, Math.min(100, p)) / 100) * d;
    });
  }

  if (loopBtn) {
    loopBtn.addEventListener('click', function () {
      video.loop = !video.loop;
      syncToggles();
    });
  }

  if (autoplayBtn) {
    autoplayBtn.addEventListener('click', function () {
      video.autoplay = !video.autoplay;
      localStorage.setItem('vdpAutoplay', video.autoplay ? '1' : '0');
      syncToggles();
    });
  }

  if (pipBtn) {
    var pipSupport = !!document.pictureInPictureEnabled && !video.disablePictureInPicture;
    pipBtn.disabled = !pipSupport;
    pipBtn.addEventListener('click', async function () {
      if (!pipSupport) return;
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      } catch (e) {
        /* no-op */
      }
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', async function () {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          return;
        }
        if (playerWrap && playerWrap.requestFullscreen) await playerWrap.requestFullscreen();
      } catch (e) {
        /* no-op */
      }
    });
  }

  video.addEventListener('play', updatePlayLabel);
  video.addEventListener('pause', updatePlayLabel);
  video.addEventListener('ended', updatePlayLabel);
  video.addEventListener('timeupdate', syncTimeline);
  video.addEventListener('loadedmetadata', syncTimeline);
  video.addEventListener('volumechange', function () {
    if (volumeInput) volumeInput.value = String(video.muted ? 0 : video.volume);
    updateMuteLabel();
  });

  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (video.paused) video.play(); else video.pause();
    }
    if (e.key.toLowerCase() === 'j') video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
    if (e.key.toLowerCase() === 'l') {
      var d = isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER;
      video.currentTime = Math.min(d, (video.currentTime || 0) + 10);
    }
    if (e.key.toLowerCase() === 'm') video.muted = !video.muted;
    if (e.key.toLowerCase() === 'f' && playerWrap && playerWrap.requestFullscreen) {
      if (document.fullscreenElement) document.exitFullscreen();
      else playerWrap.requestFullscreen();
    }
  });

  updatePlayLabel();
  updateMuteLabel();
  syncTimeline();
  syncToggles();
})();
