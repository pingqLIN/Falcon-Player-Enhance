// Element Picker - 互動式元素選擇器
// 左鍵選取封鎖，右鍵/ESC/再次點擊按鈕可退出

(function () {
  'use strict';

  let isPickerActive = false;
  let highlightedElement = null;
  let overlay = null;
  let tooltip = null;
  let confirmDialog = null;
  let pickerAutoOffTimer = null;

  const HIGHLIGHT_BORDER = '2px solid #58a6ff';
  const HIGHLIGHT_OUTLINE = '1px solid rgba(255, 255, 255, 0.75)';
  const HIGHLIGHT_GLOW =
    '0 0 0 2px rgba(88, 166, 255, 0.45), 0 0 20px 8px rgba(88, 166, 255, 0.75), inset 0 0 0 1px rgba(255,255,255,0.55), 0 0 0 200vmax rgba(2, 10, 20, 0.22)';
  const PICKER_AUTO_OFF_MS = 2 * 60 * 1000;
  const PICKER_TARGET_CLASS = '__falcon_picker_target__';

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
        <div style="font-size: 18px; font-weight: 650; color: #222; margin-bottom: 8px;">🚫 確認封鎖元件</div>
        <div style="font-size: 14px; color: #666; line-height: 1.5;">確認後將儲存規則並重新載入頁面</div>
        <div id="__element_picker_confirm_selector__" style="font-size: 12px; color: #8c8c8c; margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; word-break: break-all;"></div>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="__element_picker_cancel__" style="padding: 8px 14px; border: 1px solid #ddd; border-radius: 7px; background: #fff; color: #666; cursor: pointer;">取消</button>
        <button id="__element_picker_confirm_btn__" style="padding: 8px 14px; border: 0; border-radius: 7px; background: #ff3b30; color: #fff; font-weight: 600; cursor: pointer;">確認封鎖</button>
      </div>
    `;
    getPickerParent().appendChild(confirmDialog);
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
      selectorNode.textContent = selector || '(無法生成選擇器)';
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


