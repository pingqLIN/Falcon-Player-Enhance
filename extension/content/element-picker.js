// Element Picker - 互動式元素選擇器
// 左鍵選取封鎖，右鍵/ESC/再次點擊按鈕可退出

(function () {
  'use strict';

  if (window.__falconElementPickerInitialized) {
    return;
  }
  window.__falconElementPickerInitialized = true;

  let isPickerActive = false;
  let highlightedElement = null;
  let overlay = null;
  let tooltip = null;
  let confirmDialog = null;
  let statusToast = null;
  let pickerAutoOffTimer = null;
  const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;

  const HIGHLIGHT_BORDER = '2px solid #58a6ff';
  const HIGHLIGHT_OUTLINE = '1px solid rgba(255, 255, 255, 0.75)';
  const HIGHLIGHT_GLOW =
    '0 0 0 2px rgba(88, 166, 255, 0.45), 0 0 20px 8px rgba(88, 166, 255, 0.75), inset 0 0 0 1px rgba(255,255,255,0.55), 0 0 0 200vmax rgba(2, 10, 20, 0.22)';
  const PICKER_AUTO_OFF_MS = 2 * 60 * 1000;
  const PICKER_TARGET_CLASS = '__falcon_picker_target__';
  const SELECTOR_CANDIDATE_LIMIT = 8;

  function clearPickerAutoOffTimer() {
    if (!pickerAutoOffTimer) return;
    clearTimeout(pickerAutoOffTimer);
    pickerAutoOffTimer = null;
  }

  function resetPickerAutoOffTimer() {
    clearPickerAutoOffTimer();
    pickerAutoOffTimer = setTimeout(() => {
      hideConfirmDialog();
      deactivatePicker();
    }, PICKER_AUTO_OFF_MS);
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

  function ensureStatusToast() {
    if (statusToast?.isConnected) return statusToast;

    statusToast = document.createElement('div');
    statusToast.id = '__element_picker_status__';
    statusToast.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      z-index: 2147483649;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(20, 20, 24, 0.94);
      color: #fff;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 10px 24px rgba(0,0,0,0.28);
      display: none;
      pointer-events: none;
      max-width: min(90vw, 420px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    getPickerParent().appendChild(statusToast);
    return statusToast;
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

    confirmDialog.innerHTML = `
      <div style="margin-bottom: 14px;">
        <div style="font-size: 18px; font-weight: 650; color: #222; margin-bottom: 8px;">🚫 ${t('pickerConfirmTitle')}</div>
        <div style="font-size: 14px; color: #666; line-height: 1.5;">${t('pickerConfirmDesc')}</div>
        <div id="__element_picker_confirm_selector__" style="font-size: 12px; color: #8c8c8c; margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; word-break: break-all;"></div>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="__element_picker_cancel__" style="padding: 8px 14px; border: 1px solid #ddd; border-radius: 7px; background: #fff; color: #666; cursor: pointer;">${t('pickerCancel')}</button>
        <button id="__element_picker_confirm_btn__" style="padding: 8px 14px; border: 0; border-radius: 7px; background: #ff3b30; color: #fff; font-weight: 600; cursor: pointer;">${t('pickerConfirmAction')}</button>
      </div>
    `;
    getPickerParent().appendChild(confirmDialog);
  }

  function isStableClassName(name) {
    const value = String(name || '').trim();
    if (!value) return false;
    if (value.startsWith('__')) return false;
    if (/^(active|selected|hover|focus|open|show|hide|visible|hidden|current)$/i.test(value)) return false;
    if (/\d{4,}/.test(value)) return false;
    return true;
  }

  function buildClassSelector(element) {
    if (!element?.classList?.length) return '';
    const classes = Array.from(element.classList)
      .filter(isStableClassName)
      .slice(0, 3)
      .map((name) => `.${CSS.escape(name)}`)
      .join('');
    if (!classes) return '';
    return `${element.tagName.toLowerCase()}${classes}`;
  }

  function buildAttributeSelectors(element) {
    const selectors = [];
    const tagName = element?.tagName?.toLowerCase?.();
    if (!tagName || !element?.getAttribute) return selectors;

    const attributes = ['data-testid', 'data-id', 'aria-label', 'title', 'name', 'alt', 'src', 'href'];
    attributes.forEach((name) => {
      const value = String(element.getAttribute(name) || '').trim();
      if (!value || value.length > 160) return;
      selectors.push(`${tagName}[${name}="${CSS.escape(value)}"]`);
    });
    return selectors;
  }

  function buildNthOfTypeSelector(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return '';
    }

    const segments = [];
    let current = element;
    let depth = 0;
    while (current && current !== document.body && current !== document.documentElement && depth < 5) {
      const tagName = current.tagName?.toLowerCase?.();
      if (!tagName) break;

      if (current.id) {
        segments.unshift(`#${CSS.escape(current.id)}`);
        break;
      }

      const classSelector = buildClassSelector(current);
      if (classSelector && document.querySelectorAll(classSelector).length === 1) {
        segments.unshift(classSelector);
        break;
      }

      const siblings = Array.from(current.parentElement?.children || []).filter(
        (node) => node.tagName === current.tagName
      );
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${tagName}:nth-of-type(${Math.max(index, 1)})`);
      current = current.parentElement;
      depth += 1;
    }

    return segments.join(' > ');
  }

  function generateSelectorCandidates(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return [];
    }

    const selectors = [];
    const tagName = element.tagName?.toLowerCase?.();
    if (!tagName) return selectors;

    if (element.id) {
      selectors.push(`#${CSS.escape(element.id)}`);
    }

    const classSelector = buildClassSelector(element);
    if (classSelector) {
      selectors.push(classSelector);
    }

    selectors.push(...buildAttributeSelectors(element));

    let ancestor = element.parentElement;
    let depth = 0;
    while (ancestor && ancestor !== document.body && depth < 3) {
      const ancestorSelector = ancestor.id
        ? `#${CSS.escape(ancestor.id)}`
        : buildClassSelector(ancestor);
      if (ancestorSelector) {
        if (classSelector) {
          selectors.push(`${ancestorSelector} > ${classSelector}`);
          selectors.push(`${ancestorSelector} ${classSelector}`);
        }
        selectors.push(...buildAttributeSelectors(element).map((selector) => `${ancestorSelector} ${selector}`));
        break;
      }
      ancestor = ancestor.parentElement;
      depth += 1;
    }

    const nthOfTypeSelector = buildNthOfTypeSelector(element);
    if (nthOfTypeSelector) {
      selectors.push(nthOfTypeSelector);
    }

    return [...new Set(selectors.map((selector) => String(selector || '').trim()).filter(Boolean))]
      .filter((selector) => {
        try {
          return document.querySelectorAll(selector).length >= 1;
        } catch {
          return false;
        }
      })
      .slice(0, SELECTOR_CANDIDATE_LIMIT);
  }

  function generateSelector(element) {
    return generateSelectorCandidates(element)[0] || null;
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

    currentTooltip.textContent = `${selector} (${dimensions})`;
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
    const dialog = ensureConfirmDialog();
    if (!dialog) return;

    const selector = generateSelector(target);
    const selectorNode = dialog.querySelector('#__element_picker_confirm_selector__');
    if (selectorNode) {
      selectorNode.textContent = selector || t('pickerSelectorUnavailable');
    }

    const cancelBtn = dialog.querySelector('#__element_picker_cancel__');
    const confirmBtn = dialog.querySelector('#__element_picker_confirm_btn__');

    const newCancelBtn = cancelBtn.cloneNode(true);
    const newConfirmBtn = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newCancelBtn.addEventListener('click', hideConfirmDialog);
    newConfirmBtn.addEventListener('click', () => {
      hideConfirmDialog();
      blockElement(target);
    });

    dialog.style.display = 'block';
  }

  function hideConfirmDialog() {
    if (confirmDialog) {
      confirmDialog.style.display = 'none';
    }
  }

  function showStatusToast(message) {
    const toast = ensureStatusToast();
    if (!toast) return;

    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toast.__hideTimer);
    toast.__hideTimer = setTimeout(() => {
      if (toast.isConnected) {
        toast.style.display = 'none';
      }
    }, 1600);
  }

  function saveHiddenElement(selectors, callback) {
    const selectorList = [...new Set((Array.isArray(selectors) ? selectors : [selectors]).map((value) => String(value || '').trim()).filter(Boolean))];
    const primarySelector = selectorList[0] || '';
    if (!primarySelector) {
      if (callback) callback(false);
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          action: 'hideElement',
          selector: primarySelector,
          selectors: selectorList,
          hostname: window.location.hostname
        },
        (response) => {
          if (callback) callback(response?.success !== false);
        }
      );
    } catch {
      const rules = JSON.parse(localStorage.getItem('__hidden_elements__') || '[]');
      rules.push({
        selector: primarySelector,
        selectors: selectorList,
        hostname: window.location.hostname,
        timestamp: Date.now()
      });
      localStorage.setItem('__hidden_elements__', JSON.stringify(rules));
      if (callback) callback(true);
    }
  }

  function hideBlockedElements(selectors, target) {
    const hidden = new Set();
    const markHidden = (node) => {
      if (!(node instanceof HTMLElement) || hidden.has(node)) return;
      node.style.setProperty('display', 'none', 'important');
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
      hidden.add(node);
    };

    if (target instanceof HTMLElement) {
      markHidden(target);
    }

    selectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((node) => markHidden(node));
      } catch {}
    });
  }

  function blockElement(target) {
    const selectors = generateSelectorCandidates(target);
    if (selectors.length === 0) {
      target.remove();
      showStatusToast(t('pickerToastRemoved'));
      deactivatePicker();
      return;
    }

    hideBlockedElements(selectors, target);
    saveHiddenElement(selectors, (success) => {
      if (!success) {
        showStatusToast(t('pickerToastRemoved'));
        deactivatePicker();
        return;
      }
      showStatusToast(t('pickerToastBlockedSaved'));
      deactivatePicker();
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

  function activatePicker() {
    if (isPickerActive) return;

    isPickerActive = true;

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

    console.log('🎯 [Picker] 已啟動：左鍵封鎖，右鍵/ESC 可退出');
  }

  function deactivatePicker() {
    if (!isPickerActive) return;

    isPickerActive = false;

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

    hideConfirmDialog();
    hideHighlight();

    console.log('🎯 [Picker] 已停用');
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'activatePicker' || request.action === 'activateElementPicker') {
      activatePicker();
      sendResponse({ success: true, active: true });
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
        activatePicker();
      }
      sendResponse({ success: true, active: isPickerActive });
      return true;
    }

    if (request.action === 'getPickerState') {
      sendResponse({ active: isPickerActive });
      return true;
    }

    return false;
  });

  window.addEventListener('__shield_pro_activate_picker__', () => {
    activatePicker();
  });

  window.addEventListener('__shield_pro_deactivate_picker__', () => {
    deactivatePicker();
  });

  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'z') {
      if (isPickerActive) {
        deactivatePicker();
      } else {
        activatePicker();
      }
    }
  });

  window.addEventListener('pagehide', () => {
    deactivatePicker();
  });

  if (!isPickerActive) {
    activatePicker();
  }

  console.log('🎯 Element Picker 已載入 - Alt+Shift+Z 啟動/停用');
})();


