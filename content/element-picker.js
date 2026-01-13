// Element Picker - 互動式元素選擇器
// 類似 uBlock Origin 的 Element Zapper 功能
// 允許用戶透過滑鼠選取並移除網頁元素
// 支援左鍵直接封鎖、右鍵選單封鎖

(function () {
  "use strict";

  // 狀態
  let isPickerActive = false;
  let highlightedElement = null;
  let overlay = null;
  let tooltip = null;
  let contextMenu = null;
  let dimOverlay = null; // 全螢幕暗化層
  let confirmDialog = null; // 確認對話框

  // 樣式常數
  const HIGHLIGHT_COLOR = "rgba(255, 0, 0, 0.3)";
  const HIGHLIGHT_BORDER = "2px solid #ff0000";
  const TOOLTIP_BG = "#333";
  const MENU_BG = "#1c1c1e";
  const DIM_OVERLAY_COLOR = "rgba(0, 0, 0, 0.7)"; // 暗化層顏色

  // ========== 創建 UI 元素 ==========
  function createDimOverlay() {
    dimOverlay = document.createElement("div");
    dimOverlay.id = "__element_picker_dim_overlay__";
    dimOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: ${DIM_OVERLAY_COLOR};
            z-index: 2147483645;
            pointer-events: none;
            display: none;
            transition: opacity 0.3s ease;
        `;
    document.body.appendChild(dimOverlay);
  }

  function createOverlay() {
    overlay = document.createElement("div");
    overlay.id = "__element_picker_overlay__";
    overlay.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 2147483646;
            background: transparent;
            box-shadow: 0 0 0 9999px ${DIM_OVERLAY_COLOR};
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

  function createContextMenu() {
    contextMenu = document.createElement("div");
    contextMenu.id = "__element_picker_context_menu__";
    contextMenu.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            background: ${MENU_BG};
            border-radius: 8px;
            padding: 4px 0;
            min-width: 160px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
    
    const menuItem = document.createElement("div");
    menuItem.id = "__element_picker_menu_block__";
    menuItem.style.cssText = `
            padding: 10px 14px;
            color: #fff;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.15s ease;
        `;
    menuItem.innerHTML = `<span style="font-size: 14px;">🚫</span> 加入封鎖`;
    
    menuItem.addEventListener("mouseenter", () => {
      menuItem.style.background = "rgba(255,255,255,0.1)";
    });
    menuItem.addEventListener("mouseleave", () => {
      menuItem.style.background = "transparent";
    });
    menuItem.addEventListener("click", onMenuBlockClick);
    
    contextMenu.appendChild(menuItem);
    document.body.appendChild(contextMenu);
  }

  function createConfirmDialog() {
    confirmDialog = document.createElement("div");
    confirmDialog.id = "__element_picker_confirm__";
    confirmDialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 2147483648;
            background: #fff;
            border-radius: 12px;
            padding: 24px;
            min-width: 320px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
    
    confirmDialog.innerHTML = `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px;">
          🚫 確認封鎖元件
        </div>
        <div style="font-size: 14px; color: #666; line-height: 1.5;">
          確定要封鎖此元件嗎？頁面將會重新載入。
        </div>
        <div id="__element_picker_confirm_selector__" style="font-size: 12px; color: #999; margin-top: 8px; font-family: monospace; word-break: break-all;"></div>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="__element_picker_cancel__" style="
          padding: 8px 16px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: #fff;
          color: #666;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s ease;
        ">取消</button>
        <button id="__element_picker_confirm_btn__" style="
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          background: #ff3b30;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        ">確認封鎖</button>
      </div>
    `;
    
    const cancelBtn = confirmDialog.querySelector("#__element_picker_cancel__");
    const confirmBtn = confirmDialog.querySelector("#__element_picker_confirm_btn__");
    
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = "#f5f5f5";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = "#fff";
    });
    
    confirmBtn.addEventListener("mouseenter", () => {
      confirmBtn.style.background = "#ff2d21";
    });
    confirmBtn.addEventListener("mouseleave", () => {
      confirmBtn.style.background = "#ff3b30";
    });
    
    document.body.appendChild(confirmDialog);
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

    // 如果點擊的是選單，不處理
    if (e.target.id?.startsWith("__element_picker_menu")) return;
    
    // 如果點擊的是確認對話框內的元素，不處理
    if (e.target.closest("#__element_picker_confirm__")) return;

    // 隱藏選單（如果開啟的話）
    hideContextMenu();

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = highlightedElement;
    if (!target || target.id?.startsWith("__element_picker_")) return;

    // 顯示確認對話框
    showConfirmDialog(target);
  }

  function onContextMenu(e) {
    if (!isPickerActive) return;

    const target = e.target;
    // 忽略我們自己的元素
    if (target.id?.startsWith("__element_picker_")) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // 更新高亮元素
    highlightedElement = target;
    updateHighlight(target);

    // 顯示自訂右鍵選單
    showContextMenu(e.clientX, e.clientY);
  }

  function onMenuBlockClick(e) {
    e.preventDefault();
    e.stopPropagation();

    hideContextMenu();

    if (highlightedElement && !highlightedElement.id?.startsWith("__element_picker_")) {
      showConfirmDialog(highlightedElement);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (confirmDialog && confirmDialog.style.display !== "none") {
        hideConfirmDialog();
      } else if (contextMenu && contextMenu.style.display !== "none") {
        hideContextMenu();
      } else {
        deactivatePicker();
      }
    }
  }

  function onDocumentClick(e) {
    // 點擊其他地方時隱藏選單
    if (contextMenu && contextMenu.style.display !== "none") {
      if (!contextMenu.contains(e.target)) {
        hideContextMenu();
      }
    }
  }

  // ========== 封鎖元素 ==========
  function blockElement(target) {
    const selector = generateSelector(target);

    console.log("🎯 [Picker] 已移除元素:", selector);

    // 儲存規則
    if (selector) {
      saveHiddenElement(selector, () => {
        // 儲存成功後重新載入頁面
        console.log("🔄 [Picker] 重新載入頁面...");
        window.location.reload();
      });
    } else {
      // 如果沒有選擇器，直接移除元素但不重新載入
      target.remove();
      hideConfirmDialog();
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

  function showContextMenu(x, y) {
    if (!contextMenu) createContextMenu();

    contextMenu.style.display = "block";
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    // 防止超出視窗
    const menuRect = contextMenu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      contextMenu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
      contextMenu.style.top = `${y - menuRect.height}px`;
    }
  }

  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.style.display = "none";
    }
  }

  function showConfirmDialog(target) {
    if (!confirmDialog) createConfirmDialog();
    
    const selector = generateSelector(target);
    const selectorElement = confirmDialog.querySelector("#__element_picker_confirm_selector__");
    if (selectorElement) {
      selectorElement.textContent = selector || "(無法生成選擇器)";
    }
    
    // 顯示對話框
    confirmDialog.style.display = "block";
    
    // 綁定按鈕事件
    const cancelBtn = confirmDialog.querySelector("#__element_picker_cancel__");
    const confirmBtn = confirmDialog.querySelector("#__element_picker_confirm_btn__");
    
    // 移除舊的事件監聽器
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newConfirmBtn = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    // 添加新的事件監聽器
    newCancelBtn.addEventListener("click", () => {
      hideConfirmDialog();
    });
    
    newConfirmBtn.addEventListener("click", () => {
      hideConfirmDialog();
      blockElement(target);
    });
    
    // 重新綁定 hover 效果
    newCancelBtn.addEventListener("mouseenter", () => {
      newCancelBtn.style.background = "#f5f5f5";
    });
    newCancelBtn.addEventListener("mouseleave", () => {
      newCancelBtn.style.background = "#fff";
    });
    
    newConfirmBtn.addEventListener("mouseenter", () => {
      newConfirmBtn.style.background = "#ff2d21";
    });
    newConfirmBtn.addEventListener("mouseleave", () => {
      newConfirmBtn.style.background = "#ff3b30";
    });
  }

  function hideConfirmDialog() {
    if (confirmDialog) {
      confirmDialog.style.display = "none";
    }
  }

  function hideHighlight() {
    if (overlay) overlay.style.display = "none";
    if (tooltip) tooltip.style.display = "none";
    highlightedElement = null;
  }

  // ========== 規則儲存 ==========
  function saveHiddenElement(selector, callback) {
    try {
      chrome.runtime.sendMessage({
        action: "hideElement",
        selector: selector,
        hostname: window.location.hostname,
      }, (response) => {
        if (callback) callback();
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
      if (callback) callback();
    }
  }

  // ========== 啟動/停止 ==========
  function activatePicker() {
    if (isPickerActive) return;

    isPickerActive = true;

    // 創建 UI
    if (!dimOverlay) createDimOverlay();
    if (!overlay) createOverlay();
    if (!tooltip) createTooltip();
    if (!contextMenu) createContextMenu();
    if (!confirmDialog) createConfirmDialog();

    // 顯示暗化層
    if (dimOverlay) {
      dimOverlay.style.display = "block";
      // 觸發重排以啟動動畫
      dimOverlay.offsetHeight;
      dimOverlay.style.opacity = "1";
    }

    // 添加事件監聽
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onDocumentClick, false);

    // 改變游標
    document.body.style.cursor = "crosshair";

    console.log("🎯 [Picker] 元素選擇器已啟動 - 左鍵封鎖/右鍵選單，ESC 取消");
  }

  function deactivatePicker() {
    if (!isPickerActive) return;

    isPickerActive = false;

    // 移除事件監聽
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("click", onDocumentClick, false);

    // 恢復游標
    document.body.style.cursor = "";

    // 隱藏 UI
    hideHighlight();
    hideContextMenu();
    hideConfirmDialog();
    
    // 隱藏暗化層
    if (dimOverlay) {
      dimOverlay.style.opacity = "0";
      setTimeout(() => {
        if (dimOverlay) dimOverlay.style.display = "none";
      }, 300);
    }

    console.log("🎯 [Picker] 元素選擇器已停用");
  }

  // ========== 訊息監聽 ==========
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "activatePicker" || request.action === "activateElementPicker") {
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
