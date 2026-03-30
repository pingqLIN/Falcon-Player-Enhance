(function() {
  'use strict';

  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;
  const POPUP_AUTO_FIT_KEY = 'popupPlayerAutoFitWindow';
  const POPUP_RUNTIME_STATE_PREFIX = 'popupPlayerState:';
  const SHARPEN_FILTER_IDS = [
    '',
    'popup-player-sharpen-1',
    'popup-player-sharpen-2',
    'popup-player-sharpen-3'
  ];

  const sourceDisplay = document.getElementById('source-display');
  const playerContainer = document.getElementById('player-container');
  const mediaShell = document.getElementById('media-shell');
  const stageFrame = document.getElementById('stage-frame');
  const interactionShield = document.getElementById('interaction-shield');
  const modeChip = document.getElementById('mode-chip');
  const playbackState = document.getElementById('playback-state');
  const shieldState = document.getElementById('shield-state');
  const timeReadout = document.getElementById('time-readout');
  const transportNote = document.getElementById('transport-note');
  const timelineNote = document.getElementById('timeline-note');
  const iframeHint = document.getElementById('iframe-hint');
  const btnPin = document.getElementById('btn-pin');
  const btnPip = document.getElementById('btn-pip');
  const btnClose = document.getElementById('btn-close');
  const btnBackward = document.getElementById('btn-backward');
  const btnPlayToggle = document.getElementById('btn-play-toggle');
  const btnPlayLabel = document.getElementById('btn-play-label');
  const btnForward = document.getElementById('btn-forward');
  const btnMuteToggle = document.getElementById('btn-mute-toggle');
  const btnMuteLabel = document.getElementById('btn-mute-label');
  const btnLoopToggle = document.getElementById('btn-loop-toggle');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const timelineSlider = document.getElementById('timeline-slider');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeValue = document.getElementById('volume-value');
  const speedSelect = document.getElementById('speed-select');
  const btnFitToggle = document.getElementById('btn-fit-toggle');
  const brightnessSlider = document.getElementById('brightness-slider');
  const brightnessValue = document.getElementById('brightness-value');
  const contrastSlider = document.getElementById('contrast-slider');
  const contrastValue = document.getElementById('contrast-value');
  const saturationSlider = document.getElementById('saturation-slider');
  const saturationValue = document.getElementById('saturation-value');
  const sharpnessSlider = document.getElementById('sharpness-slider');
  const sharpnessValue = document.getElementById('sharpness-value');
  const btnResetImage = document.getElementById('btn-reset-image');
  const btnLinkShield = document.getElementById('btn-link-shield');
  const btnResetStage = document.getElementById('btn-reset-stage');
  const hueSlider = document.getElementById('hue-slider');
  const hueValue = document.getElementById('hue-value');
  const temperatureSlider = document.getElementById('temperature-slider');
  const temperatureValue = document.getElementById('temperature-value');
  const temperatureMatrix = document.getElementById('popup-player-temp-matrix');
  const btnTheme = document.getElementById('btn-theme');
  const DEFAULT_VISUAL_STATE = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
    hue: 0,
    temperature: 0
  };

  let windowInstanceId = null;
  let chromeWindowId = null;
  let currentParams = null;
  let currentVideo = null;
  let currentIframe = null;
  let autoFitWindow = true;
  let isPinned = false;
  let linkShieldEnabled = false;
  let timelineScrubbing = false;
  let currentMode = 'idle';
  let remoteSyncInterval = null;
  let remotePlayerState = null;
  let popupStateStorageKey = '';
  let restoredPopupState = null;
  let popupStatePersistTimer = null;
  let pinSyncTimer = null;
  let lastPlaybackPersistAt = 0;
  let remoteRestoreInFlight = false;
  let remoteRestoreApplied = false;
  let remoteFallbackTriggered = false;

  const visualState = { ...DEFAULT_VISUAL_STATE };

  function clampNumber(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  function hashString(value) {
    let hash = 5381;
    for (const char of String(value || '')) {
      hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
    }
    return (hash >>> 0).toString(16);
  }

  function getPopupRuntimeIdentity(params = {}) {
    const identity = {
      playerId: params.playerId || '',
      sourceTabUrl: params.sourceTabUrl || '',
      videoSrc: params.videoSrc || '',
      iframeSrc: params.iframeSrc || '',
      title: params.title || ''
    };
    if (!identity.playerId && !identity.sourceTabUrl && !identity.videoSrc && !identity.iframeSrc) {
      return '';
    }
    return JSON.stringify(identity);
  }

  function getPopupRuntimeStateKey(params = {}) {
    const identity = getPopupRuntimeIdentity(params);
    if (!identity) return '';
    return POPUP_RUNTIME_STATE_PREFIX + hashString(identity);
  }

  function normalizePopupVisualState(value) {
    const ui = value && typeof value === 'object' ? value : {};
    return {
      brightness: clampNumber(ui.brightness, 50, 150, DEFAULT_VISUAL_STATE.brightness),
      contrast: clampNumber(ui.contrast, 50, 150, DEFAULT_VISUAL_STATE.contrast),
      saturation: clampNumber(ui.saturation, 0, 200, DEFAULT_VISUAL_STATE.saturation),
      sharpness: clampNumber(ui.sharpness, 0, 100, DEFAULT_VISUAL_STATE.sharpness),
      hue: clampNumber(ui.hue, -180, 180, DEFAULT_VISUAL_STATE.hue),
      temperature: clampNumber(ui.temperature, -100, 100, DEFAULT_VISUAL_STATE.temperature)
    };
  }

  function normalizePopupRuntimeState(value) {
    const state = value && typeof value === 'object' ? value : {};
    const playback = state.playback && typeof state.playback === 'object' ? state.playback : {};

    return {
      version: 1,
      playback: {
        currentTime: clampNumber(playback.currentTime, 0, Number.MAX_SAFE_INTEGER, 0),
        volume: clampNumber(playback.volume, 0, 1, 1),
        muted: playback.muted === true,
        playbackRate: clampNumber(playback.playbackRate, 0.25, 4, 1)
      },
      ui: normalizePopupVisualState(state.ui)
    };
  }

  function shouldAutoRestoreRuntimeState(params = {}) {
    return params.pin === true;
  }

  function loadPopupRuntimeState(key) {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return normalizePopupRuntimeState(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function collectPopupRuntimeState() {
    const state = {
      version: 1,
      playback: {
        currentTime: 0,
        volume: 1,
        muted: false,
        playbackRate: 1
      },
      ui: normalizePopupVisualState(visualState)
    };

    if (currentMode === 'video' && currentVideo) {
      state.playback.currentTime = clampNumber(currentVideo.currentTime, 0, Number.MAX_SAFE_INTEGER, 0);
      state.playback.volume = clampNumber(currentVideo.volume, 0, 1, 1);
      state.playback.muted = currentVideo.muted === true;
      state.playback.playbackRate = clampNumber(currentVideo.playbackRate, 0.25, 4, 1);
      return state;
    }

    if (currentMode === 'remote' && remotePlayerState) {
      state.playback.currentTime = clampNumber(remotePlayerState.currentTime, 0, Number.MAX_SAFE_INTEGER, 0);
      state.playback.volume = clampNumber(remotePlayerState.volume, 0, 1, 1);
      state.playback.muted = remotePlayerState.muted === true;
      state.playback.playbackRate = clampNumber(remotePlayerState.playbackRate, 0.25, 4, 1);
      return state;
    }

    if (currentMode === 'iframe') {
      return state;
    }

    return state;
  }

  function persistPopupRuntimeState() {
    if (!popupStateStorageKey) return;
    try {
      localStorage.setItem(popupStateStorageKey, JSON.stringify(collectPopupRuntimeState()));
    } catch (_) {
      // no-op
    }
  }

  function schedulePopupRuntimeStatePersist(force = false) {
    if (!popupStateStorageKey) return;
    if (force) {
      if (popupStatePersistTimer) {
        clearTimeout(popupStatePersistTimer);
        popupStatePersistTimer = null;
      }
      persistPopupRuntimeState();
      return;
    }
    if (popupStatePersistTimer) return;
    popupStatePersistTimer = window.setTimeout(() => {
      popupStatePersistTimer = null;
      persistPopupRuntimeState();
    }, 180);
  }

  function notePlaybackProgressForPersistence() {
    const now = Date.now();
    if (now - lastPlaybackPersistAt < 1000) return;
    lastPlaybackPersistAt = now;
    schedulePopupRuntimeStatePersist();
  }

  function applyRestoredVisualState() {
    if (!restoredPopupState?.ui) return;
    const restoredVisualState = normalizePopupVisualState(restoredPopupState.ui);
    Object.assign(visualState, restoredVisualState);
    if (brightnessSlider) {
      brightnessSlider.value = String(visualState.brightness);
    }
    if (contrastSlider) {
      contrastSlider.value = String(visualState.contrast);
    }
    if (saturationSlider) {
      saturationSlider.value = String(visualState.saturation);
    }
    if (sharpnessSlider) {
      sharpnessSlider.value = String(visualState.sharpness);
    }
    if (hueSlider) {
      hueSlider.value = String(visualState.hue);
    }
    if (temperatureSlider) {
      temperatureSlider.value = String(visualState.temperature);
    }
    applyVisualAdjustments();
  }

  function getVideoParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      videoSrc: params.get('videoSrc'),
      iframeSrc: params.get('iframeSrc'),
      poster: params.get('poster'),
      title: params.get('title'),
      sourceTabUrl: params.get('sourceTabUrl'),
      sourceTabId: Number(params.get('sourceTabId') || 0),
      playerId: params.get('playerId'),
      remoteControlPreferred: params.get('remote') === '1',
      windowId: params.get('windowId'),
      restoreWidth: Number(params.get('restoreWidth') || 0),
      restoreHeight: Number(params.get('restoreHeight') || 0),
      restoreLeft: Number(params.get('restoreLeft') || 0),
      restoreTop: Number(params.get('restoreTop') || 0),
      pin: params.get('pin') === '1'
    };
  }

  function applyRequestedWindowBounds(params = {}) {
    const width = Math.round(Number(params.restoreWidth || 0));
    const height = Math.round(Number(params.restoreHeight || 0));
    const left = Math.round(Number(params.restoreLeft));
    const top = Math.round(Number(params.restoreTop));
    const hasSize = Number.isFinite(width) && width >= 480 && Number.isFinite(height) && height >= 320;
    const hasPosition = Number.isFinite(left) && Number.isFinite(top);
    if (!hasSize && !hasPosition) return;

    try {
      if (hasPosition && typeof window.moveTo === 'function') {
        window.moveTo(left, top);
      }
      if (hasSize) {
        window.resizeTo(width, height);
      }
    } catch (_) {
      // no-op
    }
  }

  function showError(message) {
    playerContainer.innerHTML = `
      <div class="error-message">
        <h2>${t('popupPlayerErrorTitle')}</h2>
        <p>${message}</p>
      </div>
    `;
    playbackState.textContent = 'Error';
    playbackState.classList.remove('active');
  }

  function canFallbackToRemoteMode() {
    if (remoteFallbackTriggered) return false;
    return Number(currentParams?.sourceTabId || 0) > 0;
  }

  function switchToRemoteMode(reason = '') {
    if (!canFallbackToRemoteMode()) return false;
    remoteFallbackTriggered = true;
    currentParams = {
      ...(currentParams || {}),
      remoteControlPreferred: true
    };
    schedulePopupRuntimeStatePersist(true);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('remote', '1');
    if (Number(currentParams?.sourceTabId || 0) > 0) {
      nextUrl.searchParams.set('sourceTabId', String(Number(currentParams.sourceTabId)));
    }
    window.location.replace(nextUrl.toString());
    console.warn('Popup player direct video load failed, switching to remote mode:', reason);
    return true;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function setControlButtonState(button, active, strongText, detailText) {
    if (!button) return;
    button.classList.toggle('active', Boolean(active));
    const strong = button.querySelector('strong');
    const detail = button.querySelector('span');
    if (strong && strongText) {
      strong.textContent = strongText;
    }
    if (detail && detailText) {
      detail.textContent = detailText;
    }
  }

  function getCurrentChromeWindowId() {
    return new Promise((resolve) => {
      try {
        chrome.windows.getCurrent({}, (win) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(win?.id ?? null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function syncPinStateToBackground() {
    if (!chromeWindowId) return;
    try {
      chrome.runtime.sendMessage({
        action: 'setPopupPlayerPin',
        pinned: isPinned,
        chromeWindowId,
        windowId: currentParams?.windowId || '',
        videoSrc: currentParams?.videoSrc || '',
        iframeSrc: currentParams?.iframeSrc || '',
        poster: currentParams?.poster || '',
        sourceTabUrl: currentParams?.sourceTabUrl || '',
        sourceTabId: currentParams?.sourceTabId || 0,
        playerId: currentParams?.playerId || '',
        remoteControlPreferred: currentParams?.remoteControlPreferred === true,
        title: currentParams?.title || '',
        pin: isPinned,
        windowBounds: getCurrentWindowBounds()
      }).catch(() => {});
    } catch (_) {
      // no-op
    }
  }

  function getCurrentWindowBounds() {
    const left = Number.isFinite(window.screenX) ? window.screenX : window.screenLeft;
    const top = Number.isFinite(window.screenY) ? window.screenY : window.screenTop;
    return {
      left: Math.round(Number(left || 0)),
      top: Math.round(Number(top || 0)),
      width: Math.round(Number(window.outerWidth || 0)),
      height: Math.round(Number(window.outerHeight || 0))
    };
  }

  function schedulePinnedWindowBoundsSync(delay = 120) {
    if (!isPinned) return;
    if (pinSyncTimer) {
      clearTimeout(pinSyncTimer);
    }
    pinSyncTimer = setTimeout(() => {
      pinSyncTimer = null;
      syncPinStateToBackground();
    }, delay);
  }

  function updatePinButton() {
    btnPin.classList.toggle('active', isPinned);
    btnPin.textContent = isPinned ? t('popupPlayerPinned') : t('popupPlayerPin');
    btnPin.title = isPinned ? t('popupPlayerPinTitlePinned') : t('popupPlayerPinTitleUnpinned');
  }

  function applyAutoFitWindow(enabled) {
    autoFitWindow = enabled !== false;
    document.body.classList.toggle('auto-fit-enabled', autoFitWindow);
    btnFitToggle.classList.toggle('active', autoFitWindow);
    btnFitToggle.textContent = autoFitWindow ? 'Auto Fit On' : 'Auto Fit Off';
  }

  async function persistAutoFitWindow() {
    try {
      await chrome.storage.local.set({ [POPUP_AUTO_FIT_KEY]: autoFitWindow });
    } catch (_) {
      // no-op
    }
  }

  async function loadPopupPlayerSettings() {
    try {
      const result = await chrome.storage.local.get([POPUP_AUTO_FIT_KEY]);
      applyAutoFitWindow(result[POPUP_AUTO_FIT_KEY] !== false);
    } catch (_) {
      applyAutoFitWindow(true);
    }
  }

  function setMode(mode) {
    currentMode = mode;
    const isVideo = mode === 'video';
    const isIframe = mode === 'iframe';
    const isRemote = mode === 'remote';
    modeChip.textContent = isVideo ? 'Video' : isIframe ? 'Embed' : isRemote ? 'Remote' : 'Unknown';
    transportNote.textContent = isVideo
      ? 'Direct video controls'
      : isRemote
        ? 'Remote control original page video'
        : 'External embed transport limited';
    timelineNote.textContent = isVideo || isRemote ? 'Scrub active media' : 'Timeline unavailable for embeds';
    iframeHint.style.display = isIframe ? 'block' : 'none';

    [btnBackward, btnPlayToggle, btnForward, btnMuteToggle, btnLoopToggle, btnFullscreen].forEach((control) => {
      control.disabled = !(isVideo || isRemote);
    });
    timelineSlider.disabled = !(isVideo || isRemote);
    volumeSlider.disabled = !(isVideo || isRemote);
    speedSelect.disabled = !(isVideo || isRemote);
    btnFitToggle.disabled = isRemote;
    btnPip.disabled = !isVideo;
    [brightnessSlider, contrastSlider, saturationSlider, sharpnessSlider, hueSlider, temperatureSlider, btnResetImage].forEach((control) => {
      if (control) control.disabled = isRemote;
    });
    btnLinkShield.disabled = !isIframe;
    btnResetStage.disabled = false;
  }

  function createRemoteControllerStage() {
    const card = document.createElement('div');
    card.className = 'error-message';

    const title = document.createElement('h2');
    title.textContent = 'Remote Control Mode';
    title.style.color = 'var(--accent)';

    const copy = document.createElement('p');
    copy.textContent = 'The original page keeps the locked playing video. This window acts as a remote deck when direct distraction-free playback is not reliable.';

    const source = document.createElement('p');
    source.style.marginTop = '12px';
    source.textContent = currentParams?.sourceTabUrl || currentParams?.title || 'Source tab';

    card.appendChild(title);
    card.appendChild(copy);
    card.appendChild(source);
    return card;
  }

  async function sendRemotePlayerMessage(message) {
    const sourceTabId = Number(currentParams?.sourceTabId || 0);
    if (!Number.isFinite(sourceTabId) || sourceTabId <= 0) {
      return null;
    }
    try {
      return await chrome.tabs.sendMessage(sourceTabId, {
        ...message,
        playerId: currentParams?.playerId || message.playerId || undefined
      });
    } catch (_) {
      return null;
    }
  }

  function applyRemoteState(state) {
    remotePlayerState = state && state.found ? state : null;

    if (!remotePlayerState) {
      playbackState.textContent = 'Remote Offline';
      playbackState.classList.remove('active');
      timeCurrent.textContent = '--:--';
      timeDuration.textContent = '--:--';
      timeReadout.textContent = '--:-- / --:--';
      setControlButtonState(btnPlayToggle, false, 'Play', 'Remote');
      setControlButtonState(btnMuteToggle, false, 'Mute', 'Remote');
      setControlButtonState(btnLoopToggle, false, 'Loop', 'Remote');
      volumeValue.textContent = '--';
      return;
    }

    const current = formatTime(Number(remotePlayerState.currentTime || 0));
    const duration = Number.isFinite(remotePlayerState.duration) ? formatTime(remotePlayerState.duration) : '00:00';
    timeCurrent.textContent = current;
    timeDuration.textContent = duration;
    timeReadout.textContent = `${current} / ${duration}`;
    playbackState.textContent = remotePlayerState.paused ? 'Remote Paused' : 'Remote Playing';
    playbackState.classList.toggle('active', !remotePlayerState.paused);
    setControlButtonState(btnPlayToggle, !remotePlayerState.paused, remotePlayerState.paused ? 'Play' : 'Pause', 'Remote');
    setControlButtonState(
      btnMuteToggle,
      remotePlayerState.muted || Number(remotePlayerState.volume || 0) === 0,
      remotePlayerState.muted || Number(remotePlayerState.volume || 0) === 0 ? 'Muted' : 'Mute',
      `${Math.round(Number(remotePlayerState.volume || 0) * 100)}%`
    );
    setControlButtonState(btnLoopToggle, remotePlayerState.loop, 'Loop', remotePlayerState.loop ? 'Repeat on' : 'Repeat off');
    if (!timelineScrubbing && Number.isFinite(remotePlayerState.duration) && remotePlayerState.duration > 0) {
      timelineSlider.value = String(
        Math.round((Number(remotePlayerState.currentTime || 0) / Number(remotePlayerState.duration || 1)) * 1000)
      );
    }
    volumeSlider.value = String(Math.round(Number(remotePlayerState.volume || 0) * 100));
    volumeValue.textContent = `${Math.round(Number(remotePlayerState.volume || 0) * 100)}%`;
    speedSelect.value = String(remotePlayerState.playbackRate || 1);
    shieldState.textContent = 'Remote Link Shield';
    shieldState.classList.remove('active');
    notePlaybackProgressForPersistence();
  }

  async function applyRestoredRemoteState() {
    if (!shouldAutoRestoreRuntimeState(currentParams || {})) return;
    if (!restoredPopupState?.playback) return;
    if (!remotePlayerState || remoteRestoreApplied || remoteRestoreInFlight) return;

    remoteRestoreInFlight = true;
    try {
      const playback = restoredPopupState.playback;
      const desiredVolume = clampNumber(playback.volume, 0, 1, 1);
      const desiredRate = clampNumber(playback.playbackRate, 0.25, 4, 1);
      const desiredTime = clampNumber(playback.currentTime, 0, Number.MAX_SAFE_INTEGER, 0);
      const desiredMuted = playback.muted === true;
      let restoreComplete = true;

      if (Math.abs(Number(remotePlayerState.volume || 0) - desiredVolume) > 0.01) {
        await sendRemoteControl('setVolume', desiredVolume);
      }
      if (Math.abs(Number(remotePlayerState?.volume || 0) - desiredVolume) > 0.01) {
        restoreComplete = false;
      }

      if (Math.abs(Number(remotePlayerState.playbackRate || 1) - desiredRate) > 0.01) {
        await sendRemoteControl('setSpeed', desiredRate);
      }
      if (Math.abs(Number(remotePlayerState?.playbackRate || 1) - desiredRate) > 0.01) {
        restoreComplete = false;
      }

      const isMutedBeforeToggle = remotePlayerState?.muted === true || Number(remotePlayerState?.volume || 0) === 0;
      if (desiredMuted !== isMutedBeforeToggle) {
        await sendRemoteControl('toggleMute');
      }
      const isMutedAfterToggle = remotePlayerState?.muted === true || Number(remotePlayerState?.volume || 0) === 0;
      if (desiredMuted !== isMutedAfterToggle) {
        restoreComplete = false;
      }

      const remoteDuration = Number(remotePlayerState?.duration || 0);
      if (!(Number.isFinite(remoteDuration) && remoteDuration > 0)) {
        restoreComplete = false;
      } else {
        const currentTime = Number(remotePlayerState.currentTime || 0);
        if (Math.abs(currentTime - desiredTime) > 1) {
          await sendRemoteControl('seekToRatio', Math.max(0, Math.min(1, desiredTime / remoteDuration)));
        }
        if (Math.abs(Number(remotePlayerState?.currentTime || 0) - desiredTime) > 1) {
          restoreComplete = false;
        }
      }

      remoteRestoreApplied = restoreComplete;
      if (restoreComplete) {
        schedulePopupRuntimeStatePersist(true);
      }
    } catch (_) {
      // no-op
    } finally {
      remoteRestoreInFlight = false;
    }
  }

  async function refreshRemoteState() {
    const response = await sendRemotePlayerMessage({ action: 'getPlayerState' });
    applyRemoteState(response);
    await applyRestoredRemoteState();
  }

  function startRemoteSync() {
    if (remoteSyncInterval) {
      clearInterval(remoteSyncInterval);
    }
    refreshRemoteState().catch(() => {});
    remoteSyncInterval = window.setInterval(() => {
      refreshRemoteState().catch(() => {});
    }, 1200);
  }

  async function sendRemoteControl(command, value) {
    const response = await sendRemotePlayerMessage({
      action: 'playerControl',
      command,
      value
    });
    applyRemoteState(response);
  }

  function getSharpnessFilterId(sharpness) {
    if (sharpness < 15) return '';
    if (sharpness < 40) return SHARPEN_FILTER_IDS[1];
    if (sharpness < 75) return SHARPEN_FILTER_IDS[2];
    return SHARPEN_FILTER_IDS[3];
  }

  function applyVisualAdjustments() {
    // Apply color temperature via SVG feColorMatrix (warm/cool white balance)
    if (temperatureMatrix) {
      const t = visualState.temperature / 50; // -1 (cool) to +1 (warm)
      const r = (1 + t * 0.18).toFixed(4);
      const g = (1 + t * 0.04).toFixed(4);
      const b = (1 - t * 0.18).toFixed(4);
      temperatureMatrix.setAttribute('values',
        `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`
      );
    }

    const filters = [
      `url(#popup-player-temp)`,
      `brightness(${visualState.brightness}%)`,
      `contrast(${visualState.contrast}%)`,
      `saturate(${visualState.saturation}%)`,
      `hue-rotate(${visualState.hue}deg)`
    ];
    const sharpenFilterId = getSharpnessFilterId(visualState.sharpness);
    if (sharpenFilterId) {
      filters.unshift(`url(#${sharpenFilterId})`);
    }
    mediaShell.style.filter = filters.join(' ');

    brightnessValue.textContent = `${visualState.brightness}%`;
    contrastValue.textContent = `${visualState.contrast}%`;
    saturationValue.textContent = `${visualState.saturation}%`;
    sharpnessValue.textContent = `${visualState.sharpness}%`;
    if (hueValue) {
      const h = visualState.hue;
      hueValue.textContent = h === 0 ? '0°' : `${h > 0 ? '+' : ''}${h}°`;
    }
    if (temperatureValue) {
      const tmp = visualState.temperature;
      temperatureValue.textContent = tmp === 0 ? '中性' : tmp > 0 ? `+${tmp} 暖` : `${tmp} 冷`;
    }
  }

  function resetImageAdjustments() {
    visualState.brightness = 100;
    visualState.contrast = 100;
    visualState.saturation = 100;
    visualState.sharpness = 0;
    visualState.hue = 0;
    visualState.temperature = 0;
    brightnessSlider.value = '100';
    contrastSlider.value = '100';
    saturationSlider.value = '100';
    sharpnessSlider.value = '0';
    if (hueSlider) hueSlider.value = '0';
    if (temperatureSlider) temperatureSlider.value = '0';
    applyVisualAdjustments();
  }

  function updateShieldUI() {
    const visible = linkShieldEnabled && currentMode === 'iframe';
    interactionShield.classList.toggle('visible', visible);
    shieldState.textContent = visible ? 'Link Shield On' : currentMode === 'iframe' ? 'Link Shield Off' : 'Native Video';
    shieldState.classList.toggle('active', visible);
    setControlButtonState(
      btnLinkShield,
      visible,
      visible ? 'Shield On' : 'Shield Off',
      visible ? 'Block embedded links' : 'Allow embedded links'
    );
  }

  function setLinkShield(enabled) {
    linkShieldEnabled = enabled === true;
    updateShieldUI();
  }

  function createVideoPlayer(src, poster) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.controls = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';

    if (poster) {
      video.poster = poster;
    }

    let restoredPlaybackApplied = false;
    let restoredTimeApplied = false;

    const syncPlaybackUI = () => {
      const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
      if (!timelineScrubbing && hasDuration) {
        timelineSlider.value = String(Math.round((video.currentTime / video.duration) * 1000));
      }
      const current = formatTime(video.currentTime);
      const duration = hasDuration ? formatTime(video.duration) : '00:00';
      timeCurrent.textContent = current;
      timeDuration.textContent = duration;
      timeReadout.textContent = `${current} / ${duration}`;
      const playLabel = video.paused ? 'Play' : 'Pause';
      btnPlayLabel.textContent = playLabel;
      setControlButtonState(btnPlayToggle, !video.paused, playLabel, video.paused ? 'Toggle' : 'Live');
      btnMuteLabel.textContent = video.muted || video.volume === 0 ? 'Unmute' : 'Mute';
      setControlButtonState(
        btnMuteToggle,
        video.muted || video.volume === 0,
        video.muted || video.volume === 0 ? 'Muted' : 'Audio',
        `${Math.round((video.muted ? 0 : video.volume) * 100)}%`
      );
      setControlButtonState(btnLoopToggle, video.loop, 'Loop', video.loop ? 'Repeat on' : 'Repeat off');
      volumeSlider.value = String(Math.round((video.muted ? 0 : video.volume) * 100));
      volumeValue.textContent = `${Math.round((video.muted ? 0 : video.volume) * 100)}%`;
      speedSelect.value = String(video.playbackRate);
      playbackState.textContent = video.paused ? 'Paused' : 'Playing';
      playbackState.classList.toggle('active', !video.paused);
    };

    const applyRestoredVideoState = () => {
      if (!shouldAutoRestoreRuntimeState(currentParams || {})) return;
      if (!restoredPopupState?.playback) return;

      const playback = restoredPopupState.playback;
      if (!restoredPlaybackApplied) {
        video.volume = clampNumber(playback.volume, 0, 1, 1);
        video.muted = playback.muted === true;
        video.playbackRate = clampNumber(playback.playbackRate, 0.25, 4, 1);
        restoredPlaybackApplied = true;
        schedulePopupRuntimeStatePersist(true);
      }
      if (!restoredTimeApplied && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(video.duration, clampNumber(playback.currentTime, 0, Number.MAX_SAFE_INTEGER, 0));
        restoredTimeApplied = true;
        schedulePopupRuntimeStatePersist(true);
      }
    };

    video.addEventListener('loadedmetadata', () => {
      applyRestoredVideoState();
      syncPlaybackUI();
      if (autoFitWindow) {
        fitWindowToVideo(video).catch(() => {});
      }
    });
    video.addEventListener('durationchange', () => {
      applyRestoredVideoState();
      syncPlaybackUI();
    });
    video.addEventListener('timeupdate', () => {
      syncPlaybackUI();
      notePlaybackProgressForPersistence();
    });
    video.addEventListener('seeking', syncPlaybackUI);
    video.addEventListener('seeked', () => {
      syncPlaybackUI();
      schedulePopupRuntimeStatePersist(true);
    });
    video.addEventListener('play', () => {
      syncPlaybackUI();
      schedulePopupRuntimeStatePersist();
    });
    video.addEventListener('pause', () => {
      syncPlaybackUI();
      schedulePopupRuntimeStatePersist(true);
    });
    video.addEventListener('volumechange', () => {
      syncPlaybackUI();
      schedulePopupRuntimeStatePersist();
    });
    video.addEventListener('ratechange', () => {
      syncPlaybackUI();
      schedulePopupRuntimeStatePersist();
    });
    video.addEventListener('enterpictureinpicture', () => {
      btnPip.textContent = t('popupPlayerExitPip');
    });
    video.addEventListener('leavepictureinpicture', () => {
      btnPip.textContent = t('popupPlayerPip');
    });
    video.addEventListener('error', () => {
      const errorCode = Number(video.error?.code || 0);
      if (errorCode > 0 && switchToRemoteMode(`video_error_${errorCode}`)) {
        playbackState.textContent = 'Switching to Remote...';
        playbackState.classList.remove('active');
        return;
      }
      playbackState.textContent = 'Error';
      playbackState.classList.remove('active');
    });

    video.src = src;
    video.load();
    applyRestoredVideoState();
    video.play().catch(() => {
      syncPlaybackUI();
    });
    syncPlaybackUI();
    return video;
  }

  function createIframePlayer(src) {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    playbackState.textContent = 'Embed Ready';
    playbackState.classList.add('active');
    timeCurrent.textContent = '--:--';
    timeDuration.textContent = '--:--';
    timeReadout.textContent = '--:-- / --:--';
    btnPip.textContent = t('popupPlayerPip');
    return iframe;
  }

  async function fitWindowToVideo(video) {
    if (!video || !Number.isFinite(video.videoWidth) || !Number.isFinite(video.videoHeight)) return;
    const screenWidth = window.screen?.availWidth || 1600;
    const screenHeight = window.screen?.availHeight || 900;
    const controlsWidth = 360;
    const chromeWidth = 72;
    const chromeHeight = 170;
    const maxStageWidth = Math.min(Math.round(screenWidth * 0.8), 1480);
    const maxStageHeight = Math.min(Math.round(screenHeight * 0.76), 900);
    let stageWidth = maxStageWidth;
    let stageHeight = Math.round(stageWidth * (video.videoHeight / video.videoWidth));

    if (stageHeight > maxStageHeight) {
      stageHeight = maxStageHeight;
      stageWidth = Math.round(stageHeight * (video.videoWidth / video.videoHeight));
    }

    const targetWidth = Math.max(980, stageWidth + controlsWidth + chromeWidth);
    const targetHeight = Math.max(640, stageHeight + chromeHeight);
    try {
      window.resizeTo(targetWidth, targetHeight);
    } catch (_) {
      // no-op
    }
  }

  function cleanupPlayer() {
    if (remoteSyncInterval) {
      clearInterval(remoteSyncInterval);
      remoteSyncInterval = null;
    }
    if (currentVideo) {
      currentVideo.pause();
      currentVideo.removeAttribute('src');
      currentVideo.load();
    }
    playerContainer.innerHTML = '';
    currentVideo = null;
    currentIframe = null;
  }

  async function togglePin() {
    isPinned = !isPinned;
    currentParams = {
      ...(currentParams || {}),
      pin: isPinned
    };
    updatePinButton();
    if (!chromeWindowId) {
      chromeWindowId = await getCurrentChromeWindowId();
    }
    schedulePopupRuntimeStatePersist(true);
    syncPinStateToBackground();
  }

  async function cleanupAndClose() {
    if (isPinned) {
      alert(t('popupPlayerAlertUnpinBeforeClose'));
      return;
    }
    cleanupPlayer();
    window.close();
  }

  function bindVideoControls(video) {
    btnBackward.addEventListener('click', () => {
      video.currentTime = Math.max(0, video.currentTime - 10);
    });

    btnPlayToggle.addEventListener('click', () => {
      if (video.paused) {
        video.play().catch(() => {});
        return;
      }
      video.pause();
    });

    btnForward.addEventListener('click', () => {
      const duration = Number.isFinite(video.duration) ? video.duration : video.currentTime + 10;
      video.currentTime = Math.min(duration, video.currentTime + 10);
    });

    btnMuteToggle.addEventListener('click', () => {
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) {
        video.volume = 1;
      }
    });

    btnLoopToggle.addEventListener('click', () => {
      video.loop = !video.loop;
      setControlButtonState(btnLoopToggle, video.loop, 'Loop', video.loop ? 'Repeat on' : 'Repeat off');
    });

    timelineSlider.addEventListener('input', () => {
      timelineScrubbing = true;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const nextTime = (Number(timelineSlider.value) / 1000) * video.duration;
      timeCurrent.textContent = formatTime(nextTime);
      timeReadout.textContent = `${formatTime(nextTime)} / ${formatTime(video.duration)}`;
    });

    timelineSlider.addEventListener('change', () => {
      timelineScrubbing = false;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      video.currentTime = (Number(timelineSlider.value) / 1000) * video.duration;
    });

    volumeSlider.addEventListener('input', () => {
      const nextVolume = Number(volumeSlider.value) / 100;
      video.volume = nextVolume;
      video.muted = nextVolume === 0;
    });

    speedSelect.addEventListener('change', () => {
      const nextRate = Number(speedSelect.value || 1);
      if (Number.isFinite(nextRate) && nextRate > 0) {
        video.playbackRate = nextRate;
      }
    });

    btnPip.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          return;
        }
        await video.requestPictureInPicture();
      } catch (_) {
        alert(t('popupPlayerAlertPipUnsupported'));
      }
    });
  }

  function bindRemoteControls() {
    btnBackward.addEventListener('click', () => {
      sendRemoteControl('seekBackLong').catch(() => {});
    });

    btnPlayToggle.addEventListener('click', () => {
      sendRemoteControl('togglePlay').catch(() => {});
    });

    btnForward.addEventListener('click', () => {
      sendRemoteControl('seekForwardLong').catch(() => {});
    });

    btnMuteToggle.addEventListener('click', () => {
      sendRemoteControl('toggleMute').catch(() => {});
    });

    btnLoopToggle.addEventListener('click', () => {
      sendRemoteControl('toggleLoop').catch(() => {});
    });

    timelineSlider.addEventListener('input', () => {
      timelineScrubbing = true;
      if (!remotePlayerState || !Number.isFinite(remotePlayerState.duration) || remotePlayerState.duration <= 0) return;
      const nextTime = (Number(timelineSlider.value) / 1000) * Number(remotePlayerState.duration);
      timeCurrent.textContent = formatTime(nextTime);
      timeReadout.textContent = `${formatTime(nextTime)} / ${formatTime(remotePlayerState.duration)}`;
    });

    timelineSlider.addEventListener('change', () => {
      timelineScrubbing = false;
      sendRemoteControl('seekToRatio', Number(timelineSlider.value) / 1000).catch(() => {});
    });

    volumeSlider.addEventListener('input', () => {
      sendRemoteControl('setVolume', Number(volumeSlider.value) / 100).catch(() => {});
    });

    speedSelect.addEventListener('change', () => {
      sendRemoteControl('setSpeed', Number(speedSelect.value || 1)).catch(() => {});
    });
  }

  function bindSharedControls() {
    btnClose.addEventListener('click', () => {
      cleanupAndClose();
    });

    btnPin.addEventListener('click', async () => {
      await togglePin();
    });

    btnFullscreen.addEventListener('click', async () => {
      if (currentMode === 'remote') {
        sendRemoteControl('toggleFullscreen').catch(() => {});
        return;
      }
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await stageFrame.requestFullscreen();
        }
      } catch (_) {
        // no-op
      }
    });

    btnFitToggle.addEventListener('click', async () => {
      applyAutoFitWindow(!autoFitWindow);
      await persistAutoFitWindow();
      if (autoFitWindow && currentVideo) {
        fitWindowToVideo(currentVideo).catch(() => {});
      }
    });

    brightnessSlider.addEventListener('input', () => {
      visualState.brightness = Number(brightnessSlider.value);
      applyVisualAdjustments();
      schedulePopupRuntimeStatePersist();
    });

    contrastSlider.addEventListener('input', () => {
      visualState.contrast = Number(contrastSlider.value);
      applyVisualAdjustments();
      schedulePopupRuntimeStatePersist();
    });

    saturationSlider.addEventListener('input', () => {
      visualState.saturation = Number(saturationSlider.value);
      applyVisualAdjustments();
      schedulePopupRuntimeStatePersist();
    });

    sharpnessSlider.addEventListener('input', () => {
      visualState.sharpness = Number(sharpnessSlider.value);
      applyVisualAdjustments();
      schedulePopupRuntimeStatePersist();
    });

    if (hueSlider) {
      hueSlider.addEventListener('input', () => {
        visualState.hue = Number(hueSlider.value);
        applyVisualAdjustments();
        schedulePopupRuntimeStatePersist();
      });
    }

    if (temperatureSlider) {
      temperatureSlider.addEventListener('input', () => {
        visualState.temperature = Number(temperatureSlider.value);
        applyVisualAdjustments();
        schedulePopupRuntimeStatePersist();
      });
    }

    btnResetImage.addEventListener('click', () => {
      resetImageAdjustments();
      schedulePopupRuntimeStatePersist(true);
    });

    btnLinkShield.addEventListener('click', () => {
      if (currentMode !== 'iframe') return;
      setLinkShield(!linkShieldEnabled);
    });

    btnResetStage.addEventListener('click', () => {
      resetImageAdjustments();
      if (currentVideo) {
        currentVideo.playbackRate = 1;
        currentVideo.volume = 1;
        currentVideo.muted = false;
        currentVideo.loop = false;
        currentVideo.currentTime = 0;
        currentVideo.play().catch(() => {});
      }
      if (currentMode === 'remote') {
        sendRemoteControl('setSpeed', 1).catch(() => {});
        sendRemoteControl('setVolume', 1).catch(() => {});
        sendRemoteControl('seekToRatio', 0).catch(() => {});
        if (remotePlayerState?.loop) {
          sendRemoteControl('toggleLoop').catch(() => {});
        }
      }
      setLinkShield(currentMode === 'iframe');
      schedulePopupRuntimeStatePersist(true);
    });

    interactionShield.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    document.addEventListener(
      'click',
      (event) => {
        if (!linkShieldEnabled) return;
        const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        cleanupAndClose();
        return;
      }

      if (currentMode === 'remote') {
        if (event.key === ' ' || event.code === 'Space') {
          event.preventDefault();
          sendRemoteControl('togglePlay').catch(() => {});
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          sendRemoteControl('seekBack').catch(() => {});
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          sendRemoteControl('seekForward').catch(() => {});
          return;
        }
        if (event.key === 'm' || event.key === 'M') {
          event.preventDefault();
          sendRemoteControl('toggleMute').catch(() => {});
          return;
        }
        if (event.key === 'f' || event.key === 'F') {
          event.preventDefault();
          sendRemoteControl('toggleFullscreen').catch(() => {});
        }
        return;
      }

      if (!currentVideo) return;

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (currentVideo.paused) {
          currentVideo.play().catch(() => {});
        } else {
          currentVideo.pause();
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        currentVideo.currentTime = Math.max(0, currentVideo.currentTime - 5);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const duration = Number.isFinite(currentVideo.duration)
          ? currentVideo.duration
          : currentVideo.currentTime + 5;
        currentVideo.currentTime = Math.min(duration, currentVideo.currentTime + 5);
        return;
      }

      if (event.key === 'm' || event.key === 'M') {
        currentVideo.muted = !currentVideo.muted;
        return;
      }

      if (event.key === 'f' || event.key === 'F') {
        btnFullscreen.click();
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[POPUP_AUTO_FIT_KEY]) return;
      applyAutoFitWindow(changes[POPUP_AUTO_FIT_KEY].newValue !== false);
    });

    window.addEventListener('resize', () => {
      if (!isPinned) return;
      syncPinStateToBackground();
    });

    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
        document.body.dataset.theme = next;
        btnTheme.textContent = next === 'light' ? '🌙' : '☀';
        localStorage.setItem('player-theme', next);
      });
    }
  }

  async function init() {
    // Restore theme before anything renders to avoid flash
    const savedTheme = localStorage.getItem('player-theme') || 'dark';
    document.body.dataset.theme = savedTheme;
    if (btnTheme) btnTheme.textContent = savedTheme === 'light' ? '🌙' : '☀';

    bindSharedControls();
    await loadPopupPlayerSettings();

    const params = getVideoParams();
    currentParams = params;
    popupStateStorageKey = getPopupRuntimeStateKey(params);
    restoredPopupState = loadPopupRuntimeState(popupStateStorageKey);
    windowInstanceId = params.windowId;
    isPinned = Boolean(params.pin);
    updatePinButton();
    chromeWindowId = await getCurrentChromeWindowId();
    if (params.pin) {
      applyRequestedWindowBounds(params);
      window.setTimeout(() => {
        applyRequestedWindowBounds(params);
        schedulePinnedWindowBoundsSync(0);
      }, 220);
    }
    if (isPinned) {
      syncPinStateToBackground();
    }

    const displaySrc = params.videoSrc || params.iframeSrc || '';
    const displayValue = displaySrc || params.sourceTabUrl || '';
    sourceDisplay.textContent = displayValue || '';
    sourceDisplay.title = displayValue || '';

    if (params.title) {
      document.title = `${params.title} - Falcon-Player-Enhance`;
    }

    resetImageAdjustments();
    applyRestoredVisualState();

    if ((params.remoteControlPreferred || (!params.videoSrc && !params.iframeSrc)) && params.sourceTabId > 0) {
      setMode('remote');
      setLinkShield(false);
      playerContainer.appendChild(createRemoteControllerStage());
      bindRemoteControls();
      startRemoteSync();
      return;
    }

    if (params.videoSrc) {
      setMode('video');
      setLinkShield(false);
      currentVideo = createVideoPlayer(params.videoSrc, params.poster);
      playerContainer.appendChild(currentVideo);
      bindVideoControls(currentVideo);
      return;
    }

    if (params.iframeSrc) {
      setMode('iframe');
      setLinkShield(true);
      currentIframe = createIframePlayer(params.iframeSrc);
      playerContainer.appendChild(currentIframe);
      updateShieldUI();
      return;
    }

    setMode('idle');
    setLinkShield(false);
    showError(t('popupPlayerErrorInvalidSource'));
  }

  window.addEventListener('beforeunload', () => {
    schedulePopupRuntimeStatePersist(true);
    syncPinStateToBackground();
  });
  window.addEventListener('pagehide', () => {
    schedulePopupRuntimeStatePersist(true);
    syncPinStateToBackground();
  });
  window.addEventListener('resize', () => {
    schedulePinnedWindowBoundsSync();
  });

  init();
})();
