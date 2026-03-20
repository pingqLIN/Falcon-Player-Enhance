(function() {
  'use strict';

  const GLOBAL_KEY = '__falconDirectPopupOverlay';
  if (window[GLOBAL_KEY] && typeof window[GLOBAL_KEY].refresh === 'function') {
    window[GLOBAL_KEY].refresh();
    return;
  }

  const STYLE_ID = 'falcon-direct-popup-overlay-style';
  const FILTERS_ID = 'falcon-direct-popup-overlay-filters';
  const ROOT_ID = 'falcon-direct-popup-overlay-root';
  const GAMMA_FILTER_ID = 'falcon-direct-popup-gamma';
  const SHARPEN_FILTER_ID = 'falcon-direct-popup-sharpen';
  const PANEL_WIDTH = 336;
  const originalVideoStyles = new WeakMap();

  const state = {
    root: null,
    launcher: null,
    panel: null,
    shield: null,
    targetVideo: null,
    targetAbortController: null,
    expanded: true,
    shieldEnabled: true,
    mirrorEnabled: false,
    cropEnabled: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    gamma: 100,
    temperature: 0,
    sharpness: 0,
    monitorInterval: null,
    monitorObserver: null,
    layoutRaf: 0,
    refs: {}
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  function ensureStyles() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${ROOT_ID} {
          all: initial;
          position: fixed;
          inset: 0;
          z-index: 2147483644;
          pointer-events: none;
          font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
          color: #f7f2e8;
        }
        #${ROOT_ID} * {
          box-sizing: border-box;
          font-family: inherit;
        }
        .falcon-popup-launcher,
        .falcon-popup-panel,
        .falcon-popup-shield {
          pointer-events: auto;
        }
        .falcon-popup-launcher {
          position: fixed;
          right: 12px;
          top: 22vh;
          width: 48px;
          min-height: 132px;
          border: 1px solid rgba(247, 204, 112, 0.4);
          border-radius: 18px 0 0 18px;
          padding: 14px 10px;
          background: linear-gradient(145deg, rgba(246, 191, 90, 0.92), rgba(215, 140, 58, 0.92));
          color: #24160a;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.35);
          cursor: pointer;
          writing-mode: vertical-rl;
          text-orientation: mixed;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .falcon-popup-panel {
          position: fixed;
          width: ${PANEL_WIDTH}px;
          max-width: min(${PANEL_WIDTH}px, calc(100vw - 24px));
          top: 12px;
          right: 12px;
          bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background:
            radial-gradient(circle at top left, rgba(247, 202, 120, 0.12), transparent 26%),
            linear-gradient(180deg, rgba(17, 20, 31, 0.94), rgba(9, 11, 20, 0.97));
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
          backdrop-filter: blur(18px);
          overflow: auto;
        }
        .falcon-popup-panel[hidden] {
          display: none;
        }
        .falcon-popup-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .falcon-popup-kicker {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(238, 226, 206, 0.66);
        }
        .falcon-popup-title {
          margin-top: 2px;
          font-size: 18px;
          font-weight: 800;
          color: #fcf7ef;
        }
        .falcon-popup-subtitle {
          margin-top: 4px;
          font-size: 12px;
          line-height: 1.45;
          color: rgba(238, 226, 206, 0.7);
        }
        .falcon-popup-head-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .falcon-popup-mini-btn,
        .falcon-popup-btn,
        .falcon-popup-chip {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f6efe4;
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
        }
        .falcon-popup-mini-btn {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          font-size: 16px;
          font-weight: 700;
        }
        .falcon-popup-block {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .falcon-popup-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .falcon-popup-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(238, 226, 206, 0.64);
        }
        .falcon-popup-stat {
          font-size: 12px;
          color: rgba(255, 245, 230, 0.84);
          font-variant-numeric: tabular-nums;
        }
        .falcon-popup-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .falcon-popup-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .falcon-popup-btn,
        .falcon-popup-chip {
          border-radius: 16px;
          min-height: 48px;
          padding: 10px 12px;
          text-align: left;
        }
        .falcon-popup-btn strong,
        .falcon-popup-chip strong {
          display: block;
          font-size: 14px;
          line-height: 1.1;
        }
        .falcon-popup-btn span,
        .falcon-popup-chip span {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: rgba(238, 226, 206, 0.66);
        }
        .falcon-popup-btn.is-active,
        .falcon-popup-chip.is-active {
          border-color: rgba(247, 202, 120, 0.38);
          background: linear-gradient(180deg, rgba(247, 202, 120, 0.26), rgba(247, 202, 120, 0.08));
        }
        .falcon-popup-slider-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .falcon-popup-slider-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          color: rgba(238, 226, 206, 0.76);
        }
        .falcon-popup-slider-head strong {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #fcf7ef;
        }
        .falcon-popup-slider-value {
          min-width: 48px;
          text-align: right;
          color: #f7ca78;
          font-variant-numeric: tabular-nums;
        }
        .falcon-popup-slider {
          width: 100%;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          outline: none;
        }
        .falcon-popup-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #f7ca78;
          border: 2px solid rgba(17, 20, 31, 0.9);
          box-shadow: 0 0 0 4px rgba(247, 202, 120, 0.14);
          cursor: pointer;
        }
        .falcon-popup-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #f7ca78;
          border: 2px solid rgba(17, 20, 31, 0.9);
          box-shadow: 0 0 0 4px rgba(247, 202, 120, 0.14);
          cursor: pointer;
        }
        .falcon-popup-inline {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 88px;
          gap: 8px;
          align-items: center;
        }
        .falcon-popup-select {
          width: 100%;
          appearance: none;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.06);
          padding: 11px 12px;
          color: #f6efe4;
          font: inherit;
        }
        .falcon-popup-hint {
          font-size: 12px;
          line-height: 1.5;
          color: rgba(238, 226, 206, 0.66);
        }
        .falcon-popup-shield {
          position: fixed;
          display: none;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          background:
            linear-gradient(180deg, rgba(11, 14, 24, 0.18), rgba(11, 14, 24, 0.62)),
            repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.02) 10px, transparent 10px, transparent 20px);
          border: none;
          cursor: not-allowed;
        }
        .falcon-popup-shield.is-visible {
          display: flex;
        }
        .falcon-popup-shield-box {
          max-width: 320px;
          padding: 18px 20px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(10, 12, 20, 0.76);
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.35);
        }
        .falcon-popup-shield-box strong {
          display: block;
          margin-bottom: 8px;
          font-size: 12px;
          color: #f7ca78;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .falcon-popup-shield-box span {
          font-size: 12px;
          line-height: 1.5;
          color: rgba(238, 226, 206, 0.72);
        }
        @media (max-width: 860px) {
          .falcon-popup-panel {
            width: min(${PANEL_WIDTH}px, calc(100vw - 18px));
            top: 9px;
            right: 9px;
            bottom: 9px;
          }
          .falcon-popup-inline {
            grid-template-columns: 1fr;
          }
          .falcon-popup-grid,
          .falcon-popup-grid-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .falcon-popup-launcher {
            right: 9px;
          }
        }
      `;
      document.documentElement.appendChild(style);
    }

    if (!document.getElementById(FILTERS_ID)) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('id', FILTERS_ID);
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      svg.style.width = '0';
      svg.style.height = '0';
      svg.innerHTML = `
        <defs>
          <filter id="${GAMMA_FILTER_ID}" color-interpolation-filters="sRGB">
            <feComponentTransfer>
              <feFuncR id="${GAMMA_FILTER_ID}-r" type="gamma" amplitude="1" exponent="1" offset="0"></feFuncR>
              <feFuncG id="${GAMMA_FILTER_ID}-g" type="gamma" amplitude="1" exponent="1" offset="0"></feFuncG>
              <feFuncB id="${GAMMA_FILTER_ID}-b" type="gamma" amplitude="1" exponent="1" offset="0"></feFuncB>
            </feComponentTransfer>
          </filter>
          <filter id="${SHARPEN_FILTER_ID}">
            <feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 5.8 -1 0 -1 0" divisor="1.8"></feConvolveMatrix>
          </filter>
        </defs>
      `;
      document.documentElement.appendChild(svg);
    }
  }

  function createRoot() {
    ensureStyles();
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      existing.remove();
    }

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <button class="falcon-popup-launcher" type="button">Falcon Deck</button>
      <section class="falcon-popup-panel">
        <div class="falcon-popup-head">
          <div>
            <div class="falcon-popup-kicker">Popup Overlay</div>
            <div class="falcon-popup-title">Falcon Deck</div>
            <div class="falcon-popup-subtitle" data-role="video-summary">Scanning active video...</div>
          </div>
          <div class="falcon-popup-head-actions">
            <button class="falcon-popup-mini-btn" type="button" data-action="scan" title="Rescan target">↻</button>
            <button class="falcon-popup-mini-btn" type="button" data-action="collapse" title="Collapse panel">−</button>
          </div>
        </div>
        <section class="falcon-popup-block">
          <div class="falcon-popup-row">
            <div class="falcon-popup-label">Transport</div>
            <div class="falcon-popup-stat" data-role="time-readout">00:00 / 00:00</div>
          </div>
          <div class="falcon-popup-grid">
            <button class="falcon-popup-btn" type="button" data-action="rewind"><strong>-10s</strong><span>Rewind</span></button>
            <button class="falcon-popup-btn is-active" type="button" data-action="play"><strong>Play</strong><span>Toggle</span></button>
            <button class="falcon-popup-btn" type="button" data-action="forward"><strong>+10s</strong><span>Skip</span></button>
            <button class="falcon-popup-btn" type="button" data-action="mute"><strong>Mute</strong><span>Audio</span></button>
            <button class="falcon-popup-btn" type="button" data-action="pip"><strong>PiP</strong><span>Float</span></button>
            <button class="falcon-popup-btn" type="button" data-action="fullscreen"><strong>Full</strong><span>Stage</span></button>
          </div>
        </section>
        <section class="falcon-popup-block">
          <div class="falcon-popup-row">
            <div class="falcon-popup-label">Playback</div>
            <div class="falcon-popup-stat" data-role="playback-status">Idle</div>
          </div>
          <div class="falcon-popup-slider-wrap">
            <div class="falcon-popup-slider-head"><strong>Volume</strong><span class="falcon-popup-slider-value" data-role="volume-value">100%</span></div>
            <input class="falcon-popup-slider" type="range" min="0" max="100" value="100" data-setting="volume">
          </div>
          <div class="falcon-popup-inline">
            <select class="falcon-popup-select" data-setting="speed">
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
            <button class="falcon-popup-chip" type="button" data-action="reset-playback"><strong>Reset</strong><span>Playback</span></button>
          </div>
        </section>
        <section class="falcon-popup-block">
          <div class="falcon-popup-row">
            <div class="falcon-popup-label">Image</div>
            <div class="falcon-popup-stat">Non-persistent</div>
          </div>
          <div class="falcon-popup-slider-wrap">
            <div class="falcon-popup-slider-head"><strong>Brightness</strong><span class="falcon-popup-slider-value" data-role="brightness-value">100%</span></div>
            <input class="falcon-popup-slider" type="range" min="50" max="200" value="100" data-setting="brightness">
          </div>
          <div class="falcon-popup-slider-wrap">
            <div class="falcon-popup-slider-head"><strong>Contrast</strong><span class="falcon-popup-slider-value" data-role="contrast-value">100%</span></div>
            <input class="falcon-popup-slider" type="range" min="50" max="200" value="100" data-setting="contrast">
          </div>
          <div class="falcon-popup-slider-wrap">
            <div class="falcon-popup-slider-head"><strong>Saturation</strong><span class="falcon-popup-slider-value" data-role="saturation-value">100%</span></div>
            <input class="falcon-popup-slider" type="range" min="0" max="200" value="100" data-setting="saturation">
          </div>
          <div class="falcon-popup-slider-wrap">
            <div class="falcon-popup-slider-head"><strong>Temperature</strong><span class="falcon-popup-slider-value" data-role="temperature-value">0</span></div>
            <input class="falcon-popup-slider" type="range" min="-100" max="100" value="0" data-setting="temperature">
          </div>
          <div class="falcon-popup-slider-wrap">
            <div class="falcon-popup-slider-head"><strong>Gamma</strong><span class="falcon-popup-slider-value" data-role="gamma-value">1.00</span></div>
            <input class="falcon-popup-slider" type="range" min="50" max="180" value="100" data-setting="gamma">
          </div>
          <div class="falcon-popup-slider-wrap">
            <div class="falcon-popup-slider-head"><strong>Sharpness</strong><span class="falcon-popup-slider-value" data-role="sharpness-value">0%</span></div>
            <input class="falcon-popup-slider" type="range" min="0" max="100" value="0" data-setting="sharpness">
          </div>
          <div class="falcon-popup-grid-2">
            <button class="falcon-popup-chip" type="button" data-action="mirror"><strong>Mirror</strong><span>Flip X</span></button>
            <button class="falcon-popup-chip" type="button" data-action="crop"><strong>Crop</strong><span>Cover</span></button>
            <button class="falcon-popup-chip is-active" type="button" data-action="shield"><strong>Shield</strong><span>Block clicks</span></button>
            <button class="falcon-popup-chip" type="button" data-action="reset-image"><strong>Reset</strong><span>Image</span></button>
          </div>
        </section>
        <div class="falcon-popup-hint">This overlay targets the highest-confidence active video in the popup. It is generic by design and does not rely on site-specific controls.</div>
      </section>
      <button class="falcon-popup-shield" type="button" aria-label="Shield overlay">
        <span class="falcon-popup-shield-box">
          <strong>Link Shield Active</strong>
          <span>Clicks on the video area are blocked to reduce accidental ads or outbound navigation. Disable Shield only when you need the page's native controls.</span>
        </span>
      </button>
    `;

    document.documentElement.appendChild(root);
    state.root = root;
    state.launcher = root.querySelector('.falcon-popup-launcher');
    state.panel = root.querySelector('.falcon-popup-panel');
    state.shield = root.querySelector('.falcon-popup-shield');
    state.refs = {
      summary: root.querySelector('[data-role="video-summary"]'),
      timeReadout: root.querySelector('[data-role="time-readout"]'),
      playbackStatus: root.querySelector('[data-role="playback-status"]'),
      volumeValue: root.querySelector('[data-role="volume-value"]'),
      brightnessValue: root.querySelector('[data-role="brightness-value"]'),
      contrastValue: root.querySelector('[data-role="contrast-value"]'),
      saturationValue: root.querySelector('[data-role="saturation-value"]'),
      temperatureValue: root.querySelector('[data-role="temperature-value"]'),
      gammaValue: root.querySelector('[data-role="gamma-value"]'),
      sharpnessValue: root.querySelector('[data-role="sharpness-value"]'),
      volume: root.querySelector('[data-setting="volume"]'),
      speed: root.querySelector('[data-setting="speed"]'),
      brightness: root.querySelector('[data-setting="brightness"]'),
      contrast: root.querySelector('[data-setting="contrast"]'),
      saturation: root.querySelector('[data-setting="saturation"]'),
      temperature: root.querySelector('[data-setting="temperature"]'),
      gamma: root.querySelector('[data-setting="gamma"]'),
      sharpness: root.querySelector('[data-setting="sharpness"]'),
      playButton: root.querySelector('[data-action="play"]'),
      muteButton: root.querySelector('[data-action="mute"]'),
      shieldButton: root.querySelector('[data-action="shield"]'),
      mirrorButton: root.querySelector('[data-action="mirror"]'),
      cropButton: root.querySelector('[data-action="crop"]')
    };
  }

  function rememberOriginalVideoStyle(video) {
    if (!video || originalVideoStyles.has(video)) return;
    originalVideoStyles.set(video, {
      filter: video.style.filter,
      transform: video.style.transform,
      objectFit: video.style.objectFit,
      objectPosition: video.style.objectPosition,
      transition: video.style.transition,
      willChange: video.style.willChange
    });
  }

  function restoreVideoStyle(video) {
    if (!video || !originalVideoStyles.has(video)) return;
    const original = originalVideoStyles.get(video);
    video.style.filter = original.filter;
    video.style.transform = original.transform;
    video.style.objectFit = original.objectFit;
    video.style.objectPosition = original.objectPosition;
    video.style.transition = original.transition;
    video.style.willChange = original.willChange;
  }

  function getVideoCandidates() {
    return Array.from(document.querySelectorAll('video')).filter((video) => {
      if (!video || !video.isConnected) return false;
      const style = window.getComputedStyle(video);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) < 0.05) {
        return false;
      }
      const rect = video.getBoundingClientRect();
      return rect.width >= 120 && rect.height >= 80;
    });
  }

  function scoreVideo(video) {
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    const resolution = (video.videoWidth || 0) * (video.videoHeight || 0);
    const isPlaying = !video.paused && !video.ended && video.readyState >= 2;
    const isVisibleInViewport =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth);

    let score = 0;
    if (isPlaying) score += 6_000_000_000;
    if (isVisibleInViewport) score += 2_000_000_000;
    score += resolution * 40;
    score += area * 8;
    score += Math.max(video.currentTime || 0, 0);
    score += (video.readyState || 0) * 1000;
    return score;
  }

  function findBestVideo() {
    const candidates = getVideoCandidates();
    if (!candidates.length) return null;
    return candidates.sort((left, right) => scoreVideo(right) - scoreVideo(left))[0] || null;
  }

  function setGammaExponent(exponent) {
    ['r', 'g', 'b'].forEach((channel) => {
      const element = document.getElementById(`${GAMMA_FILTER_ID}-${channel}`);
      if (element) {
        element.setAttribute('exponent', String(exponent));
      }
    });
  }

  function buildFilterChain() {
    const gammaFactor = clamp(state.gamma / 100, 0.5, 1.8);
    const gammaExponent = clamp(1 / gammaFactor, 0.55, 2);
    setGammaExponent(gammaExponent);

    const warmAmount = Math.max(state.temperature, 0);
    const coolAmount = Math.max(-state.temperature, 0);
    const sepia = clamp(warmAmount * 0.55, 0, 55);
    const hueRotate = warmAmount > 0 ? clamp(-warmAmount * 0.16, -18, 0) : clamp(coolAmount * 0.2, 0, 20);
    const saturateBoost = warmAmount > 0 ? 100 + warmAmount * 0.12 : 100 + coolAmount * 0.05;
    const brightnessBias = coolAmount > 0 ? 100 + coolAmount * 0.04 : 100;
    const filters = [`url(#${GAMMA_FILTER_ID})`];
    if (state.sharpness >= 20) {
      filters.push(`url(#${SHARPEN_FILTER_ID})`);
    }
    filters.push(
      `brightness(${Math.round((state.brightness * brightnessBias) / 100)}%)`,
      `contrast(${state.contrast}%)`,
      `saturate(${Math.round((state.saturation * saturateBoost) / 100)}%)`,
      `sepia(${Math.round(sepia)}%)`,
      `hue-rotate(${Math.round(hueRotate)}deg)`
    );
    return filters.join(' ');
  }

  function applyVideoAdjustments() {
    const video = state.targetVideo;
    if (!video) return;
    rememberOriginalVideoStyle(video);
    const original = originalVideoStyles.get(video);
    const mirrorTransform = state.mirrorEnabled ? ' scaleX(-1)' : '';
    video.style.transition = 'filter 120ms ease, transform 120ms ease';
    video.style.willChange = 'filter, transform';
    video.style.filter = buildFilterChain();
    video.style.transform = `${original.transform || ''}${mirrorTransform}`.trim();
    video.style.objectFit = state.cropEnabled ? 'cover' : original.objectFit || 'contain';
    video.style.objectPosition = state.cropEnabled ? 'center center' : original.objectPosition || '';
  }

  function updateLauncherAndPanelPosition() {
    if (!state.launcher || !state.panel) return;
    cancelAnimationFrame(state.layoutRaf);
    state.layoutRaf = requestAnimationFrame(() => {
      state.launcher.style.display = state.expanded ? 'none' : 'flex';
      state.panel.hidden = !state.expanded;

      if (!state.targetVideo) {
        state.shield.classList.remove('is-visible');
        return;
      }

      const rect = state.targetVideo.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 50) {
        state.shield.classList.remove('is-visible');
        return;
      }

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      const showShield = state.shieldEnabled && !document.fullscreenElement;
      state.shield.classList.toggle('is-visible', showShield);
      if (showShield) {
        state.shield.style.left = `${clamp(rect.left, 0, viewportWidth)}px`;
        state.shield.style.top = `${clamp(rect.top, 0, viewportHeight)}px`;
        state.shield.style.width = `${Math.max(0, Math.min(rect.width, viewportWidth - rect.left))}px`;
        state.shield.style.height = `${Math.max(0, Math.min(rect.height, viewportHeight - rect.top))}px`;
      }
    });
  }

  function updateTextValues() {
    state.refs.brightnessValue.textContent = `${state.brightness}%`;
    state.refs.contrastValue.textContent = `${state.contrast}%`;
    state.refs.saturationValue.textContent = `${state.saturation}%`;
    state.refs.temperatureValue.textContent = String(state.temperature);
    state.refs.gammaValue.textContent = (state.gamma / 100).toFixed(2);
    state.refs.sharpnessValue.textContent = `${state.sharpness}%`;
  }

  function syncPlaybackUI() {
    const video = state.targetVideo;
    if (!video) {
      state.refs.summary.textContent = 'Scanning active video...';
      state.refs.timeReadout.textContent = '00:00 / 00:00';
      state.refs.playbackStatus.textContent = 'Idle';
      state.refs.playButton.classList.remove('is-active');
      state.refs.muteButton.classList.remove('is-active');
      return;
    }

    const width = video.videoWidth || Math.round(video.getBoundingClientRect().width);
    const height = video.videoHeight || Math.round(video.getBoundingClientRect().height);
    const current = formatTime(video.currentTime || 0);
    const duration = Number.isFinite(video.duration) ? formatTime(video.duration) : '00:00';
    state.refs.summary.textContent = `${document.location.hostname} · ${width}x${height}`;
    state.refs.timeReadout.textContent = `${current} / ${duration}`;
    state.refs.playbackStatus.textContent = video.paused ? 'Paused' : 'Playing';
    state.refs.playButton.classList.toggle('is-active', !video.paused);
    state.refs.playButton.querySelector('strong').textContent = video.paused ? 'Play' : 'Pause';
    state.refs.playButton.querySelector('span').textContent = video.paused ? 'Resume stream' : 'Pause stream';
    state.refs.muteButton.classList.toggle('is-active', video.muted || video.volume === 0);
    state.refs.muteButton.querySelector('strong').textContent = video.muted || video.volume === 0 ? 'Muted' : 'Mute';
    state.refs.muteButton.querySelector('span').textContent = `${Math.round((video.muted ? 0 : video.volume) * 100)}%`;
    state.refs.volume.value = String(Math.round((video.muted ? 0 : video.volume) * 100));
    state.refs.volumeValue.textContent = `${Math.round((video.muted ? 0 : video.volume) * 100)}%`;
    state.refs.speed.value = String(video.playbackRate || 1);
    state.refs.mirrorButton.classList.toggle('is-active', state.mirrorEnabled);
    state.refs.cropButton.classList.toggle('is-active', state.cropEnabled);
    state.refs.shieldButton.classList.toggle('is-active', state.shieldEnabled);
  }

  function bindTarget(video) {
    if (state.targetAbortController) {
      state.targetAbortController.abort();
      state.targetAbortController = null;
    }
    if (!video) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const refresh = () => {
      syncPlaybackUI();
      updateLauncherAndPanelPosition();
    };
    ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'volumechange', 'ratechange', 'enterpictureinpicture', 'leavepictureinpicture']
      .forEach((eventName) => video.addEventListener(eventName, refresh, { signal }));
    state.targetAbortController = controller;
  }

  function setTargetVideo(video) {
    if (state.targetVideo === video) {
      applyVideoAdjustments();
      syncPlaybackUI();
      updateLauncherAndPanelPosition();
      return;
    }

    if (state.targetVideo) {
      restoreVideoStyle(state.targetVideo);
    }

    state.targetVideo = video;
    bindTarget(video);
    if (video) {
      applyVideoAdjustments();
    }
    syncPlaybackUI();
    updateLauncherAndPanelPosition();
  }

  function refreshTarget() {
    const bestVideo = findBestVideo();
    setTargetVideo(bestVideo);
  }

  function resetPlayback() {
    const video = state.targetVideo;
    if (!video) return;
    video.playbackRate = 1;
    video.muted = false;
    video.volume = 1;
    syncPlaybackUI();
  }

  function resetImage() {
    state.brightness = 100;
    state.contrast = 100;
    state.saturation = 100;
    state.temperature = 0;
    state.gamma = 100;
    state.sharpness = 0;
    state.mirrorEnabled = false;
    state.cropEnabled = false;
    state.refs.brightness.value = String(state.brightness);
    state.refs.contrast.value = String(state.contrast);
    state.refs.saturation.value = String(state.saturation);
    state.refs.temperature.value = String(state.temperature);
    state.refs.gamma.value = String(state.gamma);
    state.refs.sharpness.value = String(state.sharpness);
    updateTextValues();
    applyVideoAdjustments();
    syncPlaybackUI();
  }

  function handleAction(action) {
    const video = state.targetVideo;
    switch (action) {
      case 'collapse':
        state.expanded = !state.expanded;
        state.panel.querySelector('[data-action="collapse"]').textContent = state.expanded ? '−' : '+';
        updateLauncherAndPanelPosition();
        return;
      case 'scan':
        refreshTarget();
        return;
      case 'rewind':
        if (video) video.currentTime = Math.max(0, video.currentTime - 10);
        return;
      case 'play':
        if (!video) return;
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        return;
      case 'forward':
        if (video) {
          const duration = Number.isFinite(video.duration) ? video.duration : video.currentTime + 10;
          video.currentTime = Math.min(duration, video.currentTime + 10);
        }
        return;
      case 'mute':
        if (!video) return;
        video.muted = !video.muted;
        if (!video.muted && video.volume === 0) {
          video.volume = 1;
        }
        return;
      case 'pip':
        if (!video) return;
        if (!document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== 'function') {
          return;
        }
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        } else {
          video.requestPictureInPicture().catch(() => {});
        }
        return;
      case 'fullscreen':
        if (!video) return;
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          const requestFullscreen =
            (typeof video.requestFullscreen === 'function' && video.requestFullscreen.bind(video)) ||
            (typeof document.documentElement.requestFullscreen === 'function' &&
              document.documentElement.requestFullscreen.bind(document.documentElement));
          if (requestFullscreen) {
            requestFullscreen().catch(() => {});
          }
        }
        return;
      case 'reset-playback':
        resetPlayback();
        return;
      case 'mirror':
        state.mirrorEnabled = !state.mirrorEnabled;
        applyVideoAdjustments();
        syncPlaybackUI();
        return;
      case 'crop':
        state.cropEnabled = !state.cropEnabled;
        applyVideoAdjustments();
        syncPlaybackUI();
        return;
      case 'shield':
        state.shieldEnabled = !state.shieldEnabled;
        syncPlaybackUI();
        updateLauncherAndPanelPosition();
        return;
      case 'reset-image':
        resetImage();
        return;
      default:
        return;
    }
  }

  function bindControls() {
    state.launcher.addEventListener('click', () => {
      state.expanded = !state.expanded;
      state.panel.querySelector('[data-action="collapse"]').textContent = state.expanded ? '−' : '+';
      updateLauncherAndPanelPosition();
    });

    state.panel.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action]');
      if (!trigger) return;
      handleAction(trigger.getAttribute('data-action'));
    });

    state.refs.volume.addEventListener('input', () => {
      const video = state.targetVideo;
      if (!video) return;
      const nextVolume = Number(state.refs.volume.value) / 100;
      video.volume = nextVolume;
      video.muted = nextVolume === 0;
      syncPlaybackUI();
    });

    state.refs.speed.addEventListener('change', () => {
      const video = state.targetVideo;
      if (!video) return;
      const nextRate = Number(state.refs.speed.value || 1);
      if (Number.isFinite(nextRate) && nextRate > 0) {
        video.playbackRate = nextRate;
        syncPlaybackUI();
      }
    });

    ['brightness', 'contrast', 'saturation', 'temperature', 'gamma', 'sharpness'].forEach((key) => {
      state.refs[key].addEventListener('input', () => {
        state[key] = Number(state.refs[key].value);
        updateTextValues();
        applyVideoAdjustments();
      });
    });

    state.shield.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    window.addEventListener('resize', updateLauncherAndPanelPosition, { passive: true });
    window.addEventListener('scroll', updateLauncherAndPanelPosition, { passive: true, capture: true });
    document.addEventListener('fullscreenchange', updateLauncherAndPanelPosition);
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && state.expanded) {
          state.expanded = false;
          state.panel.querySelector('[data-action="collapse"]').textContent = '+';
          updateLauncherAndPanelPosition();
          return;
        }

        const video = state.targetVideo;
        if (!video) return;

        if (event.code === 'Space') {
          event.preventDefault();
          handleAction('play');
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          handleAction('rewind');
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          handleAction('forward');
          return;
        }
        if (event.key === 'm' || event.key === 'M') {
          event.preventDefault();
          handleAction('mute');
          return;
        }
        if (event.key === 'f' || event.key === 'F') {
          event.preventDefault();
          handleAction('fullscreen');
        }
      },
      true
    );
  }

  function startMonitoring() {
    if (!state.monitorObserver) {
      state.monitorObserver = new MutationObserver(() => {
        refreshTarget();
      });
      state.monitorObserver.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'src']
      });
    }

    if (!state.monitorInterval) {
      state.monitorInterval = window.setInterval(refreshTarget, 1800);
    }
  }

  function init() {
    createRoot();
    bindControls();
    updateTextValues();
    refreshTarget();
    startMonitoring();
  }

  init();

  window[GLOBAL_KEY] = {
    refresh: refreshTarget
  };
})();
