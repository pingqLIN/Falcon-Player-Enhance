// Element Picker - 互動式元素選擇器
// 左鍵選取封鎖，右鍵/ESC/再次點擊按鈕可退出

(function () {
  'use strict';

  let isPickerActive = false;
  let highlightedElement = null;
  let overlay = null;
  let tooltip = null;
  let confirmDialog = null;
  let statusBadge = null;
  let toast = null;
  let toastTimer = null;
  let pickerAutoOffTimer = null;
  let pickerStatusTimer = null;
  let pickerDeadlineAt = 0;
  let pickerMode = 'block';

  const HIGHLIGHT_BORDER = '2px solid #58a6ff';
  const HIGHLIGHT_OUTLINE = '1px solid rgba(255, 255, 255, 0.75)';
  const HIGHLIGHT_GLOW =
    '0 0 0 2px rgba(88, 166, 255, 0.45), 0 0 20px 8px rgba(88, 166, 255, 0.75), inset 0 0 0 1px rgba(255,255,255,0.55), 0 0 0 200vmax rgba(2, 10, 20, 0.22)';
  const PICKER_AUTO_OFF_MS = 2 * 60 * 1000;
  const PICKER_TARGET_CLASS = '__falcon_picker_target__';

  function t(key, substitutions = [], fallback = '') {
    try {
      const message = chrome?.i18n?.getMessage?.(key, substitutions);
      if (message) return message;
    } catch (_) {
      // Ignore i18n lookup failures and fall back to inline copy.
    }
    return fallback || key;
  }

  function clearPickerAutoOffTimer() {
    if (!pickerAutoOffTimer) return;
    clearTimeout(pickerAutoOffTimer);
    pickerAutoOffTimer = null;
  }

  function clearPickerStatusTimer() {
    if (!pickerStatusTimer) return;
    clearInterval(pickerStatusTimer);
    pickerStatusTimer = null;
  }

  function getPickerRemainingMs() {
    return Math.max(0, pickerDeadlineAt - Date.now());
  }

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function resetPickerAutoOffTimer() {
    clearPickerAutoOffTimer();
    pickerDeadlineAt = Date.now() + PICKER_AUTO_OFF_MS;
    pickerAutoOffTimer = setTimeout(() => {
      hideConfirmDialog();
      showToast(t('pickerToastAutoClosed', [], 'Picker timed out and closed automatically.'), 'warning');
      deactivatePicker();
    }, PICKER_AUTO_OFF_MS);
    updateStatusBadge();
  }

  function ensurePickerStyle() {
    if (document.getElementById('__element_picker_style__')) return;
    const style = document.createElement('style');
    style.id = '__element_picker_style__';
    style.textContent = `
      @keyframes shieldPickerGlowPulse {
        0% {
          filter: brightness(1);
          transform: scale(1);
        }
        50% {
          filter: brightness(1.15);
          transform: scale(1.003);
        }
        100% {
          filter: brightness(1);
          transform: scale(1);
        }
      }

      .${PICKER_TARGET_CLASS} {
        outline: ${HIGHLIGHT_BORDER} !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.22), 0 0 24px 8px rgba(88, 166, 255, 0.4) !important;
        border-radius: 6px !important;
        animation: shieldPickerGlowPulse 1.1s ease-in-out infinite !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function getPickerParent() {
    if (document.body) return document.body;
    return document.documentElement;
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    createOverlay();
    return overlay;
  }

  function ensureTooltip() {
    if (tooltip?.isConnected) return tooltip;
    createTooltip();
    return tooltip;
  }

  function ensureConfirmDialog() {
    if (confirmDialog?.isConnected) return confirmDialog;
    createConfirmDialog();
    return confirmDialog;
  }

  function ensureStatusBadge() {
    if (statusBadge?.isConnected) return statusBadge;
    createStatusBadge();
    return statusBadge;
  }

  function ensureToast() {
    if (toast?.isConnected) return toast;
    createToast();
    return toast;
  }

  function setPickerCursor(value) {
    if (document.body) {
      document.body.style.cursor = value;
    }
    document.documentElement.style.cursor = value;
  }

  function isPickerNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.id?.startsWith('__element_picker_')) return true;
    return node.classList.contains(PICKER_TARGET_CLASS);
  }

  function resolveTarget(event) {
    if (typeof document.elementsFromPoint === 'function') {
      const stack = document.elementsFromPoint(event.clientX, event.clientY);
      const candidate = stack.find((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node === document.body || node === document.documentElement) return false;
        if (isPickerNode(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width >= 12 && rect.height >= 12;
      });
      if (candidate) return candidate;
    }

    if (event.target instanceof HTMLElement && !isPickerNode(event.target)) {
      if (event.target !== document.body && event.target !== document.documentElement) {
        return event.target;
      }
    }

    return null;
  }

  function setHighlightedElement(element) {
    if (highlightedElement === element) return;
    if (highlightedElement instanceof HTMLElement) {
      highlightedElement.classList.remove(PICKER_TARGET_CLASS);
    }
    highlightedElement = element;
    if (highlightedElement instanceof HTMLElement) {
      highlightedElement.classList.add(PICKER_TARGET_CLASS);
    }
  }

  function createOverlay() {
    ensurePickerStyle();

    overlay = document.createElement('div');
    overlay.id = '__element_picker_overlay__';
    overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      background: rgba(88, 166, 255, 0.14);
      border: ${HIGHLIGHT_BORDER};
      outline: ${HIGHLIGHT_OUTLINE};
      outline-offset: -1px;
      box-shadow: ${HIGHLIGHT_GLOW};
      border-radius: 6px;
      transition: all 0.08s ease-out;
      animation: shieldPickerGlowPulse 1.1s ease-in-out infinite;
      display: none;
    `;
    getPickerParent().appendChild(overlay);
  }

  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = '__element_picker_tooltip__';
    tooltip.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      background: rgba(20, 20, 24, 0.92);
      color: #fff;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      max-width: 420px;
      word-wrap: break-word;
      pointer-events: none;
      display: none;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    `;
    getPickerParent().appendChild(tooltip);
  }

  function createConfirmDialog() {
    confirmDialog = document.createElement('div');
    confirmDialog.id = '__element_picker_confirm__';
    confirmDialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483648;
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      min-width: 320px;
      max-width: min(90vw, 520px);
      box-shadow: 0 10px 36px rgba(0,0,0,0.35);
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    getPickerParent().appendChild(confirmDialog);
  }

  function createStatusBadge() {
    statusBadge = document.createElement('div');
    statusBadge.id = '__element_picker_status__';
    statusBadge.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483648;
      background: rgba(20, 20, 24, 0.94);
      color: #fff;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 10px 28px rgba(0,0,0,0.24);
      display: none;
      pointer-events: none;
    `;
    getPickerParent().appendChild(statusBadge);
  }

  function createToast() {
    toast = document.createElement('div');
    toast.id = '__element_picker_toast__';
    toast.style.cssText = `
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483648;
      max-width: min(420px, 88vw);
      background: rgba(20, 20, 24, 0.96);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.45;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 10px 28px rgba(0,0,0,0.28);
      display: none;
    `;
    getPickerParent().appendChild(toast);
  }

  function updateStatusBadge() {
    const badge = ensureStatusBadge();
    if (!badge) return;
    if (!isPickerActive) {
      badge.style.display = 'none';
      return;
    }

    const modeLabel = pickerMode === 'teach'
      ? t('pickerTeachBadge', [], 'Teach mode')
      : t('pickerBlockBadge', [], 'Block mode');
    badge.textContent = `${modeLabel} · ${formatCountdown(getPickerRemainingMs())}`;
    badge.style.display = 'block';
  }

  function startPickerStatusTimer() {
    clearPickerStatusTimer();
    pickerStatusTimer = setInterval(() => {
      if (!isPickerActive) {
        clearPickerStatusTimer();
        return;
      }
      updateStatusBadge();
    }, 250);
  }

  function showToast(message, tone = 'info') {
    const node = ensureToast();
    if (!node) return;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    const toneColor = tone === 'success'
      ? '#188038'
      : tone === 'warning'
      ? '#b26a00'
      : '#1a73e8';

    node.textContent = message;
    node.style.border = `1px solid ${toneColor}`;
    node.style.display = 'block';
    toastTimer = setTimeout(() => {
      node.style.display = 'none';
      toastTimer = null;
    }, 2400);
  }

  function renderDialogFrame({ title, subtitle, selector, bodyHtml = '', buttonsHtml = '' }) {
    const dialog = ensureConfirmDialog();
    if (!dialog) return null;

    dialog.innerHTML = `
      <div style="margin-bottom: 14px;">
        <div style="font-size: 18px; font-weight: 650; color: #222; margin-bottom: 8px;">${title}</div>
        <div style="font-size: 14px; color: #666; line-height: 1.5;">${subtitle}</div>
        <div style="font-size: 12px; color: #8c8c8c; margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; word-break: break-all;">${selector || t('pickerSelectorUnavailable', [], '(selector unavailable)')}</div>
      </div>
      ${bodyHtml}
      <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 14px;">
        ${buttonsHtml}
      </div>
    `;
    dialog.style.display = 'block';
    return dialog;
  }

  function generateSelector(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return null;
    }

    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    if (element.classList.length > 0) {
      const classes = Array.from(element.classList)
        .filter((name) => !name.startsWith('__'))
        .slice(0, 3)
        .map((name) => `.${CSS.escape(name)}`)
        .join('');

      if (classes) {
        const selector = `${element.tagName.toLowerCase()}${classes}`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      const parentSelector = generateSelector(parent);
      if (parentSelector) {
        return `${parentSelector} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
      }
    }

    return element.tagName.toLowerCase();
  }

  function updateHighlight(element) {
    if (!element) return;

    setHighlightedElement(element);

    const currentOverlay = ensureOverlay();
    if (!currentOverlay) return;

    const rect = element.getBoundingClientRect();
    currentOverlay.style.top = `${Math.max(rect.top, 0)}px`;
    currentOverlay.style.left = `${Math.max(rect.left, 0)}px`;
    currentOverlay.style.width = `${Math.max(rect.width, 0)}px`;
    currentOverlay.style.height = `${Math.max(rect.height, 0)}px`;
    currentOverlay.style.display = rect.width > 0 && rect.height > 0 ? 'block' : 'none';
  }

  function updateTooltip(element, event) {
    if (!element || !event) return;

    const currentTooltip = ensureTooltip();
    if (!currentTooltip) return;

    const selector = generateSelector(element) || element.tagName.toLowerCase();
    const dimensions = `${Math.round(element.offsetWidth)}x${Math.round(element.offsetHeight)}`;

    const modeLabel = pickerMode === 'teach'
      ? t('pickerTeachBadge', [], 'Teach mode')
      : t('pickerBlockBadge', [], 'Block mode');
    currentTooltip.textContent = `${selector} (${dimensions}) · ${modeLabel} · ${formatCountdown(getPickerRemainingMs())}`;
    currentTooltip.style.top = `${event.clientY + 14}px`;
    currentTooltip.style.left = `${event.clientX + 14}px`;
    currentTooltip.style.display = 'block';

    const tooltipRect = currentTooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth - 8) {
      currentTooltip.style.left = `${window.innerWidth - tooltipRect.width - 8}px`;
    }
    if (tooltipRect.bottom > window.innerHeight - 8) {
      currentTooltip.style.top = `${event.clientY - tooltipRect.height - 10}px`;
    }
  }

  function hideHighlight() {
    if (overlay) overlay.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';
    setHighlightedElement(null);
  }

  function showConfirmDialog(target) {
    const selector = generateSelector(target);
    const dialog = renderDialogFrame({
      title: `🚫 ${t('pickerBlockTitle', [], 'Confirm element block')}`,
      subtitle: t('pickerBlockSubtitle', [], 'This will save a rule and reload the page.'),
      selector,
      buttonsHtml: `
        <button id="__element_picker_cancel__" style="padding: 8px 14px; border: 1px solid #ddd; border-radius: 7px; background: #fff; color: #666; cursor: pointer;">${t('pickerActionCancel', [], 'Cancel')}</button>
        <button id="__element_picker_confirm_btn__" style="padding: 8px 14px; border: 0; border-radius: 7px; background: #ff3b30; color: #fff; font-weight: 600; cursor: pointer;">${t('pickerActionConfirmBlock', [], 'Block element')}</button>
      `
    });
    if (!dialog) return;

    const cancelBtn = dialog.querySelector('#__element_picker_cancel__');
    const confirmBtn = dialog.querySelector('#__element_picker_confirm_btn__');
    cancelBtn?.addEventListener('click', hideConfirmDialog);
    confirmBtn?.addEventListener('click', () => {
      hideConfirmDialog();
      blockElement(target);
    });
  }

  function extractTeachFeatures(target) {
    const rect = target.getBoundingClientRect();
    const closestLink = target.closest('a');
    const iframe = target.tagName === 'IFRAME' ? target : target.querySelector('iframe');
    const style = getComputedStyle(target);

    return {
      pageUrl: window.location.href,
      selector: generateSelector(target) || '',
      tagName: String(target.tagName || ''),
      id: String(target.id || ''),
      className: Array.from(target.classList || []).join(' '),
      text: String(target.innerText || target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280),
      href: String(closestLink?.href || ''),
      src: String(target.src || iframe?.src || ''),
      rect: {
        width: Number(rect.width || 0),
        height: Number(rect.height || 0),
        top: Number(rect.top || 0),
        left: Number(rect.left || 0)
      },
      computedStyle: {
        position: String(style.position || ''),
        zIndex: String(style.zIndex || ''),
        display: String(style.display || '')
      }
    };
  }

  function getTeachColor(category) {
    if (category === 'ad') return '#d93025';
    if (category === 'tracker') return '#1a73e8';
    if (category === 'benign') return '#188038';
    return '#b26a00';
  }

  function formatTeachCategory(category) {
    if (category === 'ad') return t('pickerTeachCategoryAd', [], 'Ad');
    if (category === 'tracker') return t('pickerTeachCategoryTracker', [], 'Tracker');
    if (category === 'benign') return t('pickerTeachCategoryBenign', [], 'Benign');
    return t('pickerTeachCategorySuspicious', [], 'Suspicious');
  }

  async function showTeachDialog(target) {
    const selector = generateSelector(target);
    const dialog = renderDialogFrame({
      title: `🎓 ${t('pickerTeachTitle', [], 'AI teaching mode')}`,
      subtitle: t('pickerTeachAnalyzing', [], 'Analyzing this element, please wait...'),
      selector,
      bodyHtml: `<div style="font-size: 13px; color: #666;">${t('pickerTeachAnalyzingBody', [], 'Sending the static AD LIST, current knowledge store, and element features for classification.')}</div>`,
      buttonsHtml: `<button id="__element_picker_cancel__" style="padding: 8px 14px; border: 1px solid #ddd; border-radius: 7px; background: #fff; color: #666; cursor: pointer;">${t('pickerActionCancel', [], 'Cancel')}</button>`
    });
    if (!dialog) return;
    dialog.querySelector('#__element_picker_cancel__')?.addEventListener('click', hideConfirmDialog);

    const features = extractTeachFeatures(target);
    let classification = {
      category: 'suspicious',
      confidence: 0.5,
      reason: t('pickerTeachClassificationUnavailable', [], 'AI classification unavailable')
    };

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'aiClassifyElement',
        hostname: window.location.hostname,
        features
      });
      if (response?.success && response.classification) {
        classification = response.classification;
      }
    } catch (_) {
      // Best effort only.
    }

    const color = getTeachColor(classification.category);
    const resultDialog = renderDialogFrame({
      title: `🎓 ${t('pickerTeachTitle', [], 'AI teaching mode')}`,
      subtitle: t(
        'pickerTeachSuggestion',
        [
          formatTeachCategory(String(classification.category || 'suspicious')),
          Number(classification.confidence || 0).toFixed(2)
        ],
        `AI suggestion: ${formatTeachCategory(String(classification.category || 'suspicious'))} · confidence ${Number(classification.confidence || 0).toFixed(2)}`
      ),
      selector,
      bodyHtml: `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 999px; background: ${color}1a; color: ${color}; font-size: 12px; font-weight: 700; text-transform: uppercase;">${formatTeachCategory(String(classification.category || 'suspicious'))}</span>
          <span style="font-size: 13px; color: #555;">${String(classification.reason || t('pickerTeachNoExplanation', [], 'No explanation'))}</span>
        </div>
        <div style="font-size: 12px; color: #777; line-height: 1.5;">${t('pickerTeachDecisionHint', [], 'Choose the final label to save into the knowledge store. This will not block the element immediately; it becomes an AI learning sample.')}</div>
      `,
      buttonsHtml: `
        <button data-teach-category="ad" style="padding: 8px 12px; border: 0; border-radius: 7px; background: #d93025; color: #fff; cursor: pointer;">${t('pickerTeachMarkAd', [], 'Mark as ad')}</button>
        <button data-teach-category="suspicious" style="padding: 8px 12px; border: 0; border-radius: 7px; background: #b26a00; color: #fff; cursor: pointer;">${t('pickerTeachMarkSuspicious', [], 'Mark as suspicious')}</button>
        <button data-teach-category="tracker" style="padding: 8px 12px; border: 0; border-radius: 7px; background: #1a73e8; color: #fff; cursor: pointer;">${t('pickerTeachMarkTracker', [], 'Mark as tracker')}</button>
        <button data-teach-category="benign" style="padding: 8px 12px; border: 1px solid #cfd5dc; border-radius: 7px; background: #fff; color: #444; cursor: pointer;">${t('pickerTeachMarkBenign', [], 'Mark as benign')}</button>
        <button id="__element_picker_cancel__" style="padding: 8px 14px; border: 1px solid #ddd; border-radius: 7px; background: #fff; color: #666; cursor: pointer;">${t('pickerActionCancel', [], 'Cancel')}</button>
      `
    });
    if (!resultDialog) return;
    resultDialog.querySelector('#__element_picker_cancel__')?.addEventListener('click', hideConfirmDialog);
    resultDialog.querySelectorAll('[data-teach-category]').forEach((button) => {
      button.addEventListener('click', async () => {
        const userCategory = button.getAttribute('data-teach-category') || classification.category;
        const response = await chrome.runtime.sendMessage({
          action: 'commitTeachObservation',
          hostname: window.location.hostname,
          features,
          classification,
          userCategory
        });
        hideConfirmDialog();
        if (!response?.success) {
          showToast(t('pickerToastSaveFailed', [], 'Unable to save teaching sample right now.'), 'warning');
          return;
        }
        resetPickerAutoOffTimer();
        updateStatusBadge();
        const baseMessage = t('pickerToastSavedCategory', [formatTeachCategory(userCategory)], `Saved as ${formatTeachCategory(userCategory)}`);
        const promotionMessage = response?.promoted
          ? ` ${t('pickerToastPromotionReady', [], 'Confirmed pattern strengthened for future AI review.')}`
          : '';
        showToast(`${baseMessage}.${promotionMessage}`.trim(), response?.promoted ? 'success' : 'info');
      });
    });
  }

  function hideConfirmDialog() {
    if (confirmDialog) {
      confirmDialog.style.display = 'none';
    }
  }

  function saveHiddenElement(selector, callback) {
    try {
      chrome.runtime.sendMessage(
        {
          action: 'hideElement',
          selector,
          hostname: window.location.hostname
        },
        () => {
          if (callback) callback();
        }
      );
    } catch {
      const rules = JSON.parse(localStorage.getItem('__hidden_elements__') || '[]');
      rules.push({
        selector,
        hostname: window.location.hostname,
        timestamp: Date.now()
      });
      localStorage.setItem('__hidden_elements__', JSON.stringify(rules));
      if (callback) callback();
    }
  }

  function blockElement(target) {
    const selector = generateSelector(target);
    if (!selector) {
      target.remove();
      deactivatePicker();
      return;
    }

    saveHiddenElement(selector, () => {
      window.location.reload();
    });
  }

  function onMouseMove(event) {
    if (!isPickerActive) return;

    const target = resolveTarget(event);
    if (!target) {
      hideHighlight();
      return;
    }

    if (target !== highlightedElement) {
      updateHighlight(target);
    }

    updateTooltip(target, event);
  }

  function onPointerGuard(event) {
    if (!isPickerActive) return;
    if (event.target?.closest?.('#__element_picker_confirm__')) return;
    if (isPickerNode(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onClick(event) {
    if (!isPickerActive) return;

    if (event.button !== 0) return;
    if (isPickerNode(event.target)) return;
    if (event.target?.closest?.('#__element_picker_confirm__')) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target = highlightedElement;
    if (!target || isPickerNode(target)) return;

    if (pickerMode === 'teach') {
      showTeachDialog(target);
      return;
    }

    showConfirmDialog(target);
  }

  function onContextMenu(event) {
    if (!isPickerActive) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    hideConfirmDialog();
    deactivatePicker();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideConfirmDialog();
      deactivatePicker();
    }
  }

  function activatePicker(mode = 'block') {
    if (isPickerActive) return;

    isPickerActive = true;
    pickerMode = mode === 'teach' ? 'teach' : 'block';

    ensureOverlay();
    ensureTooltip();
    ensureConfirmDialog();

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mousedown', onPointerGuard, true);
    document.addEventListener('mouseup', onPointerGuard, true);
    document.addEventListener('pointerdown', onPointerGuard, true);
    document.addEventListener('pointerup', onPointerGuard, true);
    document.addEventListener('auxclick', onPointerGuard, true);
    document.addEventListener('dragstart', onPointerGuard, true);
    document.addEventListener('touchstart', onPointerGuard, true);
    document.addEventListener('touchend', onPointerGuard, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);

    setPickerCursor('crosshair');
    resetPickerAutoOffTimer();
    startPickerStatusTimer();
    updateStatusBadge();

    console.log(`🎯 [Picker] activated: mode=${pickerMode}`);
  }

  function deactivatePicker() {
    if (!isPickerActive) return;

    isPickerActive = false;
    pickerMode = 'block';

    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mousedown', onPointerGuard, true);
    document.removeEventListener('mouseup', onPointerGuard, true);
    document.removeEventListener('pointerdown', onPointerGuard, true);
    document.removeEventListener('pointerup', onPointerGuard, true);
    document.removeEventListener('auxclick', onPointerGuard, true);
    document.removeEventListener('dragstart', onPointerGuard, true);
    document.removeEventListener('touchstart', onPointerGuard, true);
    document.removeEventListener('touchend', onPointerGuard, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('keydown', onKeyDown, true);

    setPickerCursor('');
    clearPickerAutoOffTimer();
    clearPickerStatusTimer();
    pickerDeadlineAt = 0;

    hideConfirmDialog();
    hideHighlight();
    const badge = ensureStatusBadge();
    if (badge) badge.style.display = 'none';

    console.log('🎯 [Picker] deactivated');
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'activatePicker' || request.action === 'activateElementPicker') {
      activatePicker('block');
      sendResponse({ success: true, active: true, mode: pickerMode });
      return true;
    }

    if (request.action === 'activateTeachMode') {
      activatePicker('teach');
      sendResponse({ success: true, active: true, mode: pickerMode });
      return true;
    }

    if (
      request.action === 'deactivatePicker' ||
      request.action === 'deactivateElementPicker' ||
      request.action === 'disableBlocking'
    ) {
      deactivatePicker();
      sendResponse({ success: true, active: false });
      return true;
    }

    if (request.action === 'toggleElementPicker') {
      if (isPickerActive) {
        deactivatePicker();
      } else {
        activatePicker('block');
      }
      sendResponse({ success: true, active: isPickerActive, mode: pickerMode });
      return true;
    }

    if (request.action === 'getPickerState') {
      sendResponse({ active: isPickerActive, mode: pickerMode });
      return true;
    }

    return false;
  });

  window.addEventListener('__shield_pro_activate_picker__', () => {
    activatePicker('block');
  });

  window.addEventListener('__shield_pro_deactivate_picker__', () => {
    deactivatePicker();
  });

  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'z') {
      if (isPickerActive) {
        deactivatePicker();
      } else {
        activatePicker('block');
      }
    }
  });

  window.addEventListener('pagehide', () => {
    deactivatePicker();
  });

  console.log('🎯 Element Picker loaded - Alt+Shift+Z toggles picker');
})();


