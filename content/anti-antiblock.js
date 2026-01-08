// ============================================================================
// Shield Pro - Anti-Antiblock Module v1.0
// ============================================================================
// 專門針對 adblock 偵測機制的繞過模組
// 此腳本必須在頁面任何其他腳本之前執行 (world: MAIN, run_at: document_start)
// ============================================================================

(function() {
'use strict';

const LOG_PREFIX = '🔓 [Anti-Antiblock]';

function log(...args) {
    console.log(LOG_PREFIX, ...args);
}

// ============================================================================
// 1. 偽造廣告載入成功的所有標準 API
// ============================================================================
function fakeAdAPIs() {
    // Google AdSense
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.loaded = true;
    window.adsbygoogle.push = function() { return true; };
    Object.defineProperty(window.adsbygoogle, 'length', {
        get: () => 1,
        set: () => {}
    });
    
    // Google Ads
    window.google_ad_client = 'ca-pub-1234567890123456';
    window.google_ads_loaded = true;
    window.google_ad_loaded = true;
    
    // 模擬 googletag
    if (!window.googletag) {
        window.googletag = {
            cmd: [],
            pubads: function() {
                return {
                    setTargeting: function() { return this; },
                    enableSingleRequest: function() {},
                    collapseEmptyDivs: function() {},
                    refresh: function() {},
                    addEventListener: function() {},
                    getSlots: function() { return []; },
                    getSlotIdMap: function() { return {}; }
                };
            },
            enableServices: function() {},
            defineSlot: function() {
                return {
                    addService: function() { return this; },
                    setTargeting: function() { return this; }
                };
            },
            display: function() {}
        };
    }
    
    // ExoClick (常見成人廣告網路)
    window.ExoLoader = {
        loaded: true,
        serve: function() {},
        addZone: function() { return true; }
    };
    
    // JuicyAds
    window.juicyads = window.juicyads || {};
    window.juicyads.loaded = true;
    
    // TrafficJunky
    window.trafficjunky = window.trafficjunky || {};
    window.trafficjunky.loaded = true;
    
    // Generic ad loaders
    window.adsLoaded = true;
    window.ads_loaded = true;
    window.adLoaded = true;
    window.ad_loaded = true;
}

// ============================================================================
// 2. 阻止 Adblock 偵測變數
// ============================================================================
function blockAdblockDetection() {
    const adblockVariables = [
        'adblock', 'adBlock', 'AdBlock', 'ADBLOCK',
        'adBlocker', 'adblocker', 'adBlockDetected',
        'isAdBlockActive', 'isAdblockActive', 
        'adBlockEnabled', 'adBlockDisabled',
        'hasAdblock', 'detectAdblock',
        'blockAds', 'adsBlocked'
    ];
    
    adblockVariables.forEach(varName => {
        try {
            Object.defineProperty(window, varName, {
                get: () => false,
                set: () => {},
                configurable: false
            });
        } catch (e) {}
    });
    
    // 讓 canRunAds 永遠為 true
    try {
        Object.defineProperty(window, 'canRunAds', {
            get: () => true,
            set: () => {},
            configurable: false
        });
        
        Object.defineProperty(window, 'canShowAds', {
            get: () => true,
            set: () => {},
            configurable: false
        });
    } catch (e) {}
}

// ============================================================================
// 3. 偽造 FuckAdBlock / BlockAdBlock 等偵測庫
// ============================================================================
function fakeDetectionLibraries() {
    const fakeDetectorBase = {
        check: function() { return false; },
        checkCallback: function() {},
        onDetected: function(callback) { return this; },
        onNotDetected: function(callback) { 
            if (typeof callback === 'function') {
                setTimeout(callback, 1);
            }
            return this; 
        },
        emitEvent: function() {},
        clearEvent: function() {},
        setOption: function() { return this; },
        on: function(detected, notDetected) {
            if (typeof notDetected === 'function') {
                setTimeout(notDetected, 1);
            }
            return this;
        }
    };
    
    window.fuckAdBlock = Object.create(fakeDetectorBase);
    window.FuckAdBlock = function() { return Object.create(fakeDetectorBase); };
    window.blockAdBlock = Object.create(fakeDetectorBase);
    window.BlockAdBlock = function() { return Object.create(fakeDetectorBase); };
    window.sniffAdBlock = Object.create(fakeDetectorBase);
    window.SniffAdBlock = function() { return Object.create(fakeDetectorBase); };
    
    // Adblock Notify
    window.adblockNotify = Object.create(fakeDetectorBase);
}

// ============================================================================
// 4. 創建誘餌廣告元素 (Bait Elements)
// ============================================================================
function createBaitElements() {
    // 常用的 bait class 名稱
    const baitClasses = [
        'ad', 'ads', 'adsbox', 'ad-box', 'ad_box',
        'ad-banner', 'ad_banner', 'adbanner',
        'ad-placeholder', 'ad_placeholder',
        'advertisement', 'advertising',
        'banner-ad', 'banner_ad', 'bannerad',
        'pub_300x250', 'pub_728x90', 'pub_300x600',
        'textad', 'text-ad', 'text_ad',
        'banner-ads', 'bannerads'
    ];
    
    const createDecoy = () => {
        baitClasses.forEach(className => {
            if (!document.querySelector('.' + className)) {
                const decoy = document.createElement('div');
                decoy.className = className;
                decoy.id = className;
                // 必須有實際尺寸才能騙過某些偵測
                decoy.style.cssText = `
                    position: absolute !important;
                    left: -9999px !important;
                    top: -9999px !important;
                    width: 1px !important;
                    height: 1px !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                `;
                decoy.innerHTML = '&nbsp;';
                
                // 確保 offsetHeight/offsetWidth 返回正值
                Object.defineProperty(decoy, 'offsetHeight', { value: 1 });
                Object.defineProperty(decoy, 'offsetWidth', { value: 1 });
                
                if (document.body) {
                    document.body.appendChild(decoy);
                }
            }
        });
    };
    
    // DOM 準備好後創建
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDecoy);
    } else {
        createDecoy();
    }
    
    // 定期檢查並重新創建（防止被移除）
    setInterval(createDecoy, 5000);
}

// ============================================================================
// 5. 攔截 Fetch 和 XHR 對 adblock 偵測的請求
// ============================================================================
function interceptDetectionRequests() {
    // 攔截 fetch
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = String(args[0] || '').toLowerCase();
        
        // 阻擋常見的 adblock 偵測 endpoint
        if (url.includes('adblock') || 
            url.includes('detect') ||
            url.includes('blocker') ||
            url.includes('pagead')) {
            
            // 返回假的成功響應
            return Promise.resolve(new Response(JSON.stringify({
                detected: false,
                blocked: false,
                success: true
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        
        return originalFetch.apply(this, args);
    };
    
    // 攔截 XMLHttpRequest
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return originalXhrOpen.call(this, method, url, ...rest);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
        const url = String(this._url || '').toLowerCase();
        
        if (url.includes('adblock') || 
            url.includes('detect') ||
            url.includes('blocker')) {
            
            // 模擬成功響應
            Object.defineProperty(this, 'status', { value: 200 });
            Object.defineProperty(this, 'responseText', { 
                value: JSON.stringify({ detected: false }) 
            });
            setTimeout(() => {
                if (this.onload) this.onload();
                if (this.onreadystatechange) {
                    Object.defineProperty(this, 'readyState', { value: 4 });
                    this.onreadystatechange();
                }
            }, 10);
            return;
        }
        
        return originalXhrSend.apply(this, args);
    };
}

// ============================================================================
// 6. 阻止 console.clear() (防止網站清除偵錯資訊)
// ============================================================================
function preventConsoleClear() {
    const originalClear = console.clear;
    console.clear = function() {
        // 不執行任何操作
    };
}

// ============================================================================
// 7. 處理播放器特定的 Anti-Adblock 訊息
// ============================================================================
function removeAdblockMessages() {
    const selectors = [
        // 通用 adblock 訊息選擇器
        '[class*="adblock"]',
        '[id*="adblock"]',
        '[class*="Adblock"]',
        '[id*="Adblock"]',
        '[class*="adb-"]',
        '[class*="blocker-warning"]',
        '[class*="blocker-message"]',
        '[class*="ad-blocker"]',
        // 播放器錯誤訊息
        '.player-error-message',
        '.video-error',
        '[class*="error-message"]',
        // 特定網站
        '.no-adblock',
        '.disable-adblock',
        '#adblock-message',
        '#adblock-warning'
    ];
    
    const removeMessages = () => {
        selectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    const text = el.textContent?.toLowerCase() || '';
                    if (text.includes('adblock') || 
                        text.includes('ad blocker') ||
                        text.includes('ad-block') ||
                        text.includes('disable') ||
                        text.includes('whitelist')) {
                        el.style.display = 'none';
                        el.remove();
                    }
                });
            } catch (e) {}
        });
    };
    
    // DOM 準備好後執行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', removeMessages);
    } else {
        removeMessages();
    }
    
    // 持續監控
    const observer = new MutationObserver(removeMessages);
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
    
    setInterval(removeMessages, 2000);
}

// ============================================================================
// 8. 專門針對 javboys 播放器的處理 (增強版 v2)
// ============================================================================
function handleJavboysPlayer() {
    const host = window.location.hostname;
    
    // 適用於 javboys 相關網站和播放器 (包括播放器 iframe 內部)
    const isJavboysSite = host.includes('javboys') || host.includes('myvidplay') || host.includes('luluvdoo');
    const isPlayerIframe = host === 'player.javboys.online' || host === 'player.javboys.com' || host.includes('luluvdoo');

    
    if (!isJavboysSite && !isPlayerIframe) {
        return;
    }
    
    log('偵測到 javboys 相關網站/播放器，啟用進階處理...');
    
    // ===== 播放器 iframe 內部特殊處理 =====
    if (isPlayerIframe) {
        log('在播放器 iframe 內部執行 anti-adblock bypass...');
        
        // 1. 偽造 CVP (Core Video Player) 相關 API
        window.CVP = window.CVP || {};
        window.cvp_player = window.cvp_player || {};
        window.player_error = false;
        window.adblock_detected = false;
        window.ads_loaded = true;
        window.ad_init_success = true;
        
        // 2. 偽造 ExoLoader 完整 API
        window.ExoLoader = {
            loaded: true,
            ready: true,
            serve: function() { return true; },
            addZone: function() { return this; },
            zones: [{ id: 'fake-zone', loaded: true }],
            init: function() { return this; },
            showAd: function() { return true; },
            load: function() { return Promise.resolve(); },
            onReady: function(cb) { if (typeof cb === 'function') cb(); }
        };
        
        // 3. 阻止錯誤訊息變數
        try {
            Object.defineProperty(window, 'showAdblockMessage', {
                get: () => function() {},
                set: () => {},
                configurable: false
            });
            Object.defineProperty(window, 'adblockError', {
                get: () => false,
                set: () => {},
                configurable: false
            });
            Object.defineProperty(window, 'initError', {
                get: () => false,
                set: () => {},
                configurable: false
            });
        } catch (e) {}
        
        // 4. 移除播放器內部的錯誤訊息元素（增強版 v3）
        const removePlayerErrors = () => {
            // 常見的錯誤訊息選擇器
            const errorSelectors = [
                '.player-error', '.error-message', '.adblock-message',
                '.cvp-error', '.video-error', '.player-message',
                '[class*="error"]', '[class*="adblock"]', '[class*="blocker"]',
                '[class*="blocked"]', '[class*="warning"]', '[class*="overlay"]',
                '[class*="modal"]', '[class*="popup"]', '[class*="notice"]'
            ];
            
            // 需要阻擋的關鍵文字
            const blockTexts = [
                'please disable adblock',
                'please disable ad block',
                'disable adblock to watch',
                'disable your adblocker',
                'turn off adblock',
                'turn off ad blocker',
                'adblock detected',
                'ad blocker detected',
                'whitelist this site',
                'does not allow adblock',
                'error: init',
                'refresh page',
                'disable extensions',
                'please turn off',
                'blocking software'
            ];
            
            errorSelectors.forEach(selector => {
                try {
                    document.querySelectorAll(selector).forEach(el => {
                        const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                        // 避免誤刪除含有大量內容的容器
                        if (text.length > 500) return;

                        // 檢查是否包含任何阻擋文字
                        const hasBlockText = blockTexts.some(bt => text.includes(bt));
                        
                        if (hasBlockText) {
                            const style = window.getComputedStyle(el);
                            if (style.display !== 'none' && style.visibility !== 'hidden') {
                                el.style.setProperty('display', 'none', 'important');
                                el.style.setProperty('visibility', 'hidden', 'important');
                                el.style.setProperty('opacity', '0', 'important');
                                el.style.setProperty('pointer-events', 'none', 'important');
                                try { el.remove(); } catch(e) {}
                                log('移除播放器錯誤訊息: ' + text.substring(0, 50) + '...');
                            }
                        }
                    });
                } catch (e) {}
            });
            
            // 移除任何包含錯誤文字的元素（更積極的搜尋）
            const allElements = document.querySelectorAll('div, p, span, h1, h2, h3, h4, section, article');
            allElements.forEach(el => {
                const text = (el.textContent || '').toLowerCase();
                const hasBlockText = blockTexts.some(bt => text.includes(bt));
                
                if (hasBlockText && text.length < 300) {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important');
                    try { el.remove(); } catch(e) {}
                }
            });
            
            // 強制顯示 video 元素
            document.querySelectorAll('video').forEach(video => {
                video.style.setProperty('display', 'block', 'important');
                video.style.setProperty('visibility', 'visible', 'important');
                video.style.setProperty('opacity', '1', 'important');
            });
        };
        
        // 5. 即時執行 + 持續監控（提高頻率）
        removePlayerErrors();
        setInterval(removePlayerErrors, 150); // 更頻繁檢查
        
        // 使用 MutationObserver 即時監控
        const playerObserver = new MutationObserver(removePlayerErrors);
        if (document.body) {
            playerObserver.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                playerObserver.observe(document.body, { childList: true, subtree: true });
            });
        }
        
        // 6. 覆寫 alert/confirm 阻止彈窗錯誤訊息
        window.alert = function() {};
        window.confirm = function() { return true; };
        
        return; // 播放器內部處理完成
    }
    
    // ===== 主頁面處理 =====
    
    // 1. 偽造更多廣告網路 API
    window.ExoLoader = window.ExoLoader || {
        loaded: true,
        serve: function() { return true; },
        addZone: function() { return true; },
        zones: [],
        init: function() { return true; },
        showAd: function() { return true; }
    };
    
    // 偽造 VAST/VPAID 廣告系統
    window.VPAID = window.VPAID || { loaded: true };
    window.VAST = window.VAST || { loaded: true };
    window.IMALoader = window.IMALoader || { loaded: true };
    
    // 2. 移除 "For video advertisers" 覆蓋層和廣告元素
    const removeVideoAdvertiserOverlay = () => {
        const elements = document.querySelectorAll('a, div, img, span, section, aside');
        elements.forEach(el => {
            const href = el.href || '';
            const text = (el.textContent || '').toLowerCase();
            const alt = el.alt || '';
            const className = (el.className || '').toString().toLowerCase();
            const id = (el.id || '').toLowerCase();
            
            // 廣告網路連結
            const adNetworks = ['exoclick', 'juicyads', 'trafficjunky', 'adsterra', 'popads'];
            const isAdNetwork = adNetworks.some(net => href.includes(net));
            
            // 廣告相關文字
            const adTexts = ['video advertiser', 'for video', 'advertisement', 'sponsored'];
            const hasAdText = adTexts.some(t => text.includes(t));
            
            // 廣告相關 class/id
            const adClassPatterns = ['ad-', 'ads-', 'sponsor', 'banner', 'promo'];
            const hasAdClass = adClassPatterns.some(p => className.includes(p) || id.includes(p));
            
            if (isAdNetwork || hasAdText || alt.includes('banner')) {
                el.style.setProperty('display', 'none', 'important');
                if (el.parentNode && el.parentNode !== document.body) {
                    try { el.remove(); } catch(e) {}
                }
            }
            
            // 移除高 z-index 覆蓋層
            if (hasAdClass) {
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed' || style.position === 'absolute') {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                }
            }
        });
        
        // 3. 移除固定位置的廣告覆蓋層
        document.querySelectorAll('div, section, aside, span').forEach(el => {
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex) || 0;
            
            if ((style.position === 'fixed' || style.position === 'absolute') && zIndex > 1000) {
                // 排除播放器容器
                if (el.querySelector('video') || el.querySelector('iframe[src*="player"]')) {
                    return;
                }
                
                // 檢查是否為廣告
                const innerHTML = el.innerHTML.toLowerCase();
                const hasAdContent = el.querySelector('a[href*="exoclick"]') ||
                                    el.querySelector('a[href*="juicyads"]') ||
                                    el.querySelector('img[alt*="banner"]') ||
                                    innerHTML.includes('casino') ||
                                    innerHTML.includes('taipei') ||
                                    innerHTML.includes('bet') ||
                                    innerHTML.includes('slot');
                
                if (hasAdContent) {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                    log('移除廣告覆蓋層:', el.className || el.id);
                }
            }
        });
        
        // 4. 確保 iframe 播放器可見且可互動
        document.querySelectorAll('iframe[src*="javboys"], iframe[src*="myvidplay"]').forEach(iframe => {
            iframe.style.setProperty('pointer-events', 'auto', 'important');
            iframe.style.setProperty('z-index', '1', 'important');
            
            // 移除 iframe 上方的覆蓋層
            const rect = iframe.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) {
                const parent = iframe.parentElement;
                if (parent) {
                    Array.from(parent.children).forEach(sibling => {
                        if (sibling !== iframe && sibling.tagName !== 'SCRIPT') {
                            const sibStyle = window.getComputedStyle(sibling);
                            if (sibStyle.position === 'absolute' || sibStyle.position === 'fixed') {
                                sibling.style.setProperty('pointer-events', 'none', 'important');
                            }
                        }
                    });
                }
            }
        });
    };
    
    // DOM 準備好後執行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', removeVideoAdvertiserOverlay);
    } else {
        removeVideoAdvertiserOverlay();
    }
    
    // 持續監控 (更頻繁)
    setInterval(removeVideoAdvertiserOverlay, 500);
}

// ============================================================================
// 9. 重要：保護 iframe 不被阻擋偵測影響
// ============================================================================
function protectIframes() {
    // 監控 iframe 內容載入
    document.addEventListener('DOMContentLoaded', () => {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            // 確保 iframe 可見
            iframe.style.setProperty('display', 'block', 'important');
            iframe.style.setProperty('visibility', 'visible', 'important');
            iframe.style.setProperty('opacity', '1', 'important');
            
            // 移除可能的遮罩
            const parent = iframe.parentElement;
            if (parent) {
                const siblings = parent.children;
                Array.from(siblings).forEach(sibling => {
                    if (sibling !== iframe && sibling.tagName !== 'SCRIPT') {
                        const style = window.getComputedStyle(sibling);
                        const pos = style.position;
                        const zIndex = parseInt(style.zIndex) || 0;
                        
                        // 如果是覆蓋在 iframe 上的元素
                        if ((pos === 'absolute' || pos === 'fixed') && zIndex > 0) {
                            sibling.style.setProperty('pointer-events', 'none', 'important');
                        }
                    }
                });
            }
        });
    });
}

// ============================================================================
// 初始化所有防護
// ============================================================================
function init() {
    // 設定標記，讓 inject-blocker.js 知道此模組已載入
    window.__antiAdblockBypassLoaded = true;
    
    fakeAdAPIs();
    blockAdblockDetection();
    fakeDetectionLibraries();
    createBaitElements();
    interceptDetectionRequests();
    preventConsoleClear();
    removeAdblockMessages();
    handleJavboysPlayer();
    protectIframes();
    
    log('Anti-Antiblock 模組已載入');
}

// 立即執行（在任何其他腳本之前）
init();

})();
