// Anti-Popup Script v3 - 超強化版彈窗攔截
// 使用 script 標籤注入到主頁面,直接覆蓋 window.open

(function () {
    'use strict';

    const MAX_Z_INDEX = 2147483647;

    // ========== 0. 注入攔截腳本到主頁面 (MAIN world) ==========
    function injectBlockerScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('content/inject-blocker.js');
        script.onload = () => script.remove();

        // 盡可能早地注入
        const target = document.head || document.documentElement;
        if (target) {
            target.insertBefore(script, target.firstChild);
        }
    }

    // 立即注入
    injectBlockerScript();

    // ========== 1. 備用: Content Script 層面的 window.open 攔截 ==========
    const blockedOpen = function () {
        console.warn('🛡️ [CS] 已阻擋 window.open');
        try {
            chrome.runtime.sendMessage({ action: 'popupBlocked' });
        } catch (e) { }
        return null;
    };

    // 使用 Object.defineProperty 防止被重新定義 (Content Script 層面)
    try {
        Object.defineProperty(window, 'open', {
            value: blockedOpen,
            writable: false,
            configurable: false
        });
    } catch (e) {
        window.open = blockedOpen;
    }

    // ========== 2. 攔截 EventTarget.prototype.addEventListener ==========
    const origAddEvent = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, ...rest) {
        // 白名單：允許內部元素 (以 shield- 開頭的 class)
        if (this.nodeType === 1) { // Element node
            const className = this.className?.toString() || '';
            const dataAttr = this.dataset?.shieldInternal;
            
            if (className.split(/\s+/).some(cls => cls.startsWith('shield-')) || dataAttr === 'true') {
                return origAddEvent.call(this, type, fn, ...rest);
            }
        }
        
        // 攔截在 body/document 或大型覆蓋層上的 click 事件
        if (type === 'click' || type === 'mousedown') {
            if (this === document || this === document.body || this === window) {
                // 完全阻擋 document 級別的 click 監聽
                console.warn('🛡️ 已阻擋 document 級 click 事件監聽');
                return;
            }

            // 檢查是否為可疑的覆蓋層
            if (this.nodeType === 1) { // Element node
                const style = window.getComputedStyle(this);
                const rect = this.getBoundingClientRect();
                const isLargeOverlay = rect.width > window.innerWidth * 0.8 &&
                    rect.height > window.innerHeight * 0.8;
                const isPositioned = style.position === 'fixed' || style.position === 'absolute';

                if (isLargeOverlay && isPositioned) {
                    console.warn('🛡️ 已阻擋覆蓋層 click 事件監聽');
                    return;
                }
            }
        }
        return origAddEvent.call(this, type, fn, ...rest);
    };

    // ========== 3. 阻止 console.clear ==========
    try {
        Object.defineProperty(console, 'clear', {
            value: () => { },
            writable: false,
            configurable: false
        });
    } catch (e) { }

    // ========== 4. 移除 inset-0 fixed 類別的覆蓋層 ==========
    function removeInsetOverlays() {
        const elements = document.querySelectorAll('div, span, section');

        elements.forEach(element => {
            try {
                let className = '';
                if (element.className) {
                    if (typeof element.className === 'string') {
                        className = element.className;
                    } else if (element.className.baseVal) {
                        className = element.className.baseVal;
                    }
                }

                // 偵測 inset-0 fixed 或 pointer-events-auto 模式
                const hasInset = className.includes('inset-0') || className.includes('inset-');
                const hasFixed = className.includes('fixed');
                const hasPointerEvents = className.includes('pointer-events-auto');

                if ((hasInset && hasFixed) || (hasFixed && hasPointerEvents)) {
                    // 檢查是否包含視頻播放器
                    const hasPlayer = element.querySelector('video, iframe');
                    if (!hasPlayer) {
                        element.style.display = 'none';
                        element.style.pointerEvents = 'none';
                        element.remove(); // 直接移除
                        console.log('🛡️ 已移除覆蓋層:', className.substring(0, 50));
                    }
                }
            } catch (e) { }
        });
    }

    // ========== 5. 阻擋 target=_blank 連結 ==========
    function disableBlankTargets() {
        const links = document.querySelectorAll('a[target="_blank"]');
        links.forEach(link => {
            // 保留合法的外部連結 (如影片來源)
            const href = link.href || '';
            if (!href.includes('player') && !href.includes('video')) {
                link.removeAttribute('target');
                link.setAttribute('rel', 'noopener noreferrer');
            }
        });
    }

    // ========== 6. 標記播放器 iframe (不設 sandbox 以避免反廣告偵測) ==========
    function protectPlayerIframes() {
        const iframes = document.querySelectorAll('iframe');

        iframes.forEach(iframe => {
            const src = iframe.src || '';
            const isPlayer =
                src.includes('player') ||
                src.includes('myvidplay') ||
                src.includes('javboys.online') ||
                src.includes('embed');

            if (isPlayer && !iframe.dataset.protected) {
                // 不設 sandbox - 會觸發反廣告偵測
                // 改用 declarativeNetRequest 規則阻擋彈窗域名
                iframe.dataset.protected = 'true';
                console.log('🛡️ 已標記播放器 iframe:', src.substring(0, 50));
            }
        });
    }

    // ========== 7. 攔截 document.createElement ==========
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function (tagName, options) {
        const element = origCreateElement(tagName, options);

        if (tagName.toLowerCase() === 'div') {
            // 監控 className 設定
            const origDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'className') ||
                Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'className');

            if (origDescriptor && origDescriptor.set) {
                Object.defineProperty(element, 'className', {
                    set: function (value) {
                        if (typeof value === 'string' &&
                            (value.includes('inset-0') && value.includes('fixed'))) {
                            console.warn('🛡️ 已阻擋可疑 DIV 創建:', value.substring(0, 50));
                            return; // 不設定 className
                        }
                        origDescriptor.set.call(this, value);
                    },
                    get: function () {
                        return origDescriptor.get ? origDescriptor.get.call(this) : '';
                    }
                });
            }
        }

        return element;
    };

    // ========== 8. 阻擋 document.write ==========
    const originalDocumentWrite = document.write.bind(document);
    document.write = function (content) {
        if (typeof content === 'string' &&
            (content.includes('popup') ||
                content.includes('window.open') ||
                content.includes('pemsrv') ||
                content.includes('intellipopup') ||
                content.includes('inset-0'))) {
            console.warn('🛡️ 已阻擋 document.write');
            return;
        }
        return originalDocumentWrite(content);
    };

    // ========== 初始化 ==========
    function init() {
        console.log('🛡️ Anti-Popup Script v2 已啟動');

        // 立即執行
        removeInsetOverlays();
        disableBlankTargets();
        protectPlayerIframes();

        // 定期掃描 (每秒)
        setInterval(() => {
            removeInsetOverlays();
            protectPlayerIframes();
        }, 1000);

        // DOM 變化時掃描
        const observer = new MutationObserver((mutations) => {
            removeInsetOverlays();
            disableBlankTargets();
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            });
        }
    }

    init();
})();
