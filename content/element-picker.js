// Element Picker - 互動式元素選擇器
// 類似 uBlock Origin 的 Element Zapper 功能
// 允許用戶透過滑鼠選取並移除網頁元素

(function () {
  "use strict";

  // 狀態
  let isPickerActive = false;
  let highlightedElement = null;
  let overlay = null;
  let tooltip = null;

  // 樣式常數
  const HIGHLIGHT_COLOR = "rgba(255, 0, 0, 0.3)";
  const HIGHLIGHT_BORDER = "2px solid #ff0000";
  const TOOLTIP_BG = "#333";

  // ========== 創建 UI 元素 ==========
  function createOverlay() {
    overlay = document.createElement("div");
    overlay.id = "__element_picker_overlay__";
    overlay.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 2147483646;
            background: ${HIGHLIGHT_COLOR};
            border: ${HIGHLIGHT_BORDER};
            transition: all 0.1s ease;
            display: none;
        `;
    document.body.appendChild(overlay);
  }

  function createTooltip() {
    tooltip = document.createElement("div");
    tooltip.id = "__element_picker_tooltip__";
    tooltip.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            background: ${TOOLTIP_BG};
            color: #fff;
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-family: monospace;
            max-width: 400px;
            word-wrap: break-word;
            pointer-events: none;
            display: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
    document.body.appendChild(tooltip);
  }

  // ========== CSS 選擇器生成 ==========
  function generateSelector(element) {
    if (
      !element ||
      element === document.body ||
      element === document.documentElement
    ) {
      return null;
    }

    // 優先使用 ID
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    // 嘗試使用 class 組合
    if (element.classList.length > 0) {
      const classes = Array.from(element.classList)
        .filter((c) => !c.startsWith("__")) // 過濾我們自己的類
        .slice(0, 3) // 最多取 3 個
        .map((c) => `.${CSS.escape(c)}`)
        .join("");

      if (classes) {
        const selector = `${element.tagName.toLowerCase()}${classes}`;
        // 驗證選擇器唯一性
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1) {
          return selector;
        }
      }
    }

    // 使用 nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      const parentSelector = generateSelector(parent);

      if (parentSelector) {
        return `${parentSelector} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
      }
    }

    // 降級使用標籤名
    return element.tagName.toLowerCase();
  }

  // ========== 事件處理 ==========
  function onMouseMove(e) {
    if (!isPickerActive) return;

    const target = e.target;

    // 忽略我們自己的元素
    if (target.id?.startsWith("__element_picker_")) return;

    if (target !== highlightedElement) {
      highlightedElement = target;
      updateHighlight(target);
      updateTooltip(target, e);
    }
  }

  function onMouseOver(e) {
    if (!isPickerActive) return;
    e.stopPropagation();
  }

  function onClick(e) {
    if (!isPickerActive) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = highlightedElement;
    if (!target || target.id?.startsWith("__element_picker_")) return;

    const selector = generateSelector(target);

    // 移除元素
    target.remove();
    console.log("🎯 [Picker] 已移除元素:", selector);

    // 儲存規則
    if (selector) {
      saveHiddenElement(selector);
    }

    // 隱藏高亮
    hideHighlight();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      deactivatePicker();
    }
  }

  // ========== UI 更新 ==========
  function updateHighlight(element) {
    if (!overlay) return;

    const rect = element.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = "block";
  }

  function updateTooltip(element, e) {
    if (!tooltip) return;

    const selector = generateSelector(element);
    const dimensions = `${element.offsetWidth}×${element.offsetHeight}`;

    tooltip.textContent = `${selector} (${dimensions})`;
    tooltip.style.top = `${e.clientY + 15}px`;
    tooltip.style.left = `${e.clientX + 15}px`;
    tooltip.style.display = "block";

    // 防止超出視窗
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
    }
    if (tooltipRect.bottom > window.innerHeight) {
      tooltip.style.top = `${e.clientY - tooltipRect.height - 10}px`;
    }
  }

  function hideHighlight() {
    if (overlay) overlay.style.display = "none";
    if (tooltip) tooltip.style.display = "none";
    highlightedElement = null;
  }

  // ========== 規則儲存 ==========
  function saveHiddenElement(selector) {
    try {
      chrome.runtime.sendMessage({
        action: "hideElement",
        selector: selector,
        hostname: window.location.hostname,
      });
    } catch (e) {
      // 備用：存到 localStorage
      const rules = JSON.parse(
        localStorage.getItem("__hidden_elements__") || "[]"
      );
      rules.push({
        selector: selector,
        hostname: window.location.hostname,
        timestamp: Date.now(),
      });
      localStorage.setItem("__hidden_elements__", JSON.stringify(rules));
    }
  }

  // ========== 啟動/停止 ==========
  function activatePicker() {
    if (isPickerActive) return;

    isPickerActive = true;

    // 創建 UI
    if (!overlay) createOverlay();
    if (!tooltip) createTooltip();

    // 添加事件監聽
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);

    // 改變游標
    document.body.style.cursor = "crosshair";

    console.log("🎯 [Picker] 元素選擇器已啟動 - 點擊元素移除，ESC 取消");
  }

  function deactivatePicker() {
    if (!isPickerActive) return;

    isPickerActive = false;

    // 移除事件監聽
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);

    // 恢復游標
    document.body.style.cursor = "";

    // 隱藏 UI
    hideHighlight();

    console.log("🎯 [Picker] 元素選擇器已停用");
  }

  // ========== 訊息監聽 ==========
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "activatePicker") {
      activatePicker();
      sendResponse({ success: true });
    } else if (request.action === "deactivatePicker") {
      deactivatePicker();
      sendResponse({ success: true });
    }
    return true;
  });

  // ========== 快捷鍵啟動 (Alt + Z) ==========
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "z") {
      if (isPickerActive) {
        deactivatePicker();
      } else {
        activatePicker();
      }
    }
  });

  console.log("🎯 Element Picker 已載入 - 按 Alt+Z 啟動");
})();
