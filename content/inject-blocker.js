// ============================================================================
// Shield Pro - Inject Blocker v5 (Red/Blue Team Defense Edition)
// ============================================================================
// 此腳本必須在頁面任何其他腳本之前執行 (world: MAIN, run_at: document_start)
// 採用紅藍隊對抗思維設計，涵蓋各種已知攻擊向量
// ============================================================================

(function() {
'use strict';

// ============================================================================
// Configuration (可由 storage 動態更新)
// ============================================================================
const CONFIG = {
    enabled: true,
    devMode: false,
    sensitivity: 5, // 1-10, 覆蓋層偵測敏感度
    logPrefix: '🛡️ [Shield Pro v5]'
};

function log(...args) {
    if (CONFIG.devMode) {
        console.log(CONFIG.logPrefix, ...args);
    }
}

function warn(...args) {
    console.warn(CONFIG.logPrefix, ...args);
}

// ============================================================================
// 🔴 RED TEAM ATTACK PATTERNS DATABASE
// ============================================================================
// 這些是惡意網站常用的攻擊模式，藍隊防護針對這些進行設計
const ATTACK_PATTERNS = {
    // 已知惡意廣告域名
    maliciousDomains: [
        // 原有 patterns
        'agreerinfimum', 'pemsrv', 'intellipopup', 'exoclick', 'trafficjunky',
        'juicyads', 'popads', 'magsrv', 'spbeknkulo', 'heqbjkhcexwt',
        'gentlyimpoliteprize', 'DMP_picture_captcha',
        // 廣告網路
        'propellerads', 'popcash', 'adcash', 'hilltopads', 'popunder',
        'clickadu', 'admaven', 'richpush', 'pushground', 'evadav',
        'mondoads', 'adsterra', 'bidvertiser', 'popadscdn', 'topadvert',
        'adxpansion', 'adskeeper', 'mgid.com', 'revcontent', 'contentad',
        'brightroar', 'nativead',
        // 成人/詐騙
        'stripchat', 'clackattending', 'chaturbate', 'cam4', 'livejasmin',
        'bongacams', 'xhamsterlive', 'jerkmate', 'imlive', 'jerkhub',
        'jerk-hub', 'instacoins', 'novapcgames', 'hotzcam', 'onlyfans',
        // 測試發現的新域名
        'slotjp668', 'trackingclick',
        // 通用廣告路徑
        'ad-delivery', 'adserving', 'advertising',
        'click.php', 'track.php', 'redirect.php', 'go.php', 'out.php',
        'cpm.', 'cpa.', 'aff.', 'affiliate', 'partner.', 'promo.',
        'banner.', 'sponsored'
    ],
    
    // 可疑 CSS 類名/ID
    suspiciousClassNames: [
        'overlay', 'cover', 'mask', 'clickjack', 'popup', 'modal',
        'interstitial', 'lightbox', 'backdrop', 'blocker', 'ad-overlay',
        'click-overlay', 'invisible-link', 'hidden-ad'
    ],
    
    // 社交分享 URL (常被濫用於彈窗)
    socialSharePatterns: [
        'tiktok.com/share', 'facebook.com/share', 'twitter.com/intent',
        'pinterest.com/pin', 'reddit.com/submit', 'tumblr.com/share',
        'linkedin.com/share', 'whatsapp.com', 't.me'
    ]
};

// ============================================================================
// 🔵 BLUE TEAM DEFENSE: URL 檢測
// ============================================================================
function isBlockedUrl(url) {
    if (!url) return false;
    const urlStr = String(url).toLowerCase();
    return ATTACK_PATTERNS.maliciousDomains.some(pattern => 
        urlStr.includes(pattern.toLowerCase())
    ) || ATTACK_PATTERNS.socialSharePatterns.some(pattern =>
        urlStr.includes(pattern.toLowerCase())
    );
}

// ============================================================================
// 🔵 DEFENSE #1: window.open 完全鎖死
// 對抗紅隊攻擊: 延遲彈窗、事件劫持彈窗
// ============================================================================
const originalOpen = window.open;
const blockedOpen = function(url, target, features) {
    warn('已阻擋 window.open:', url ? String(url).substring(0, 80) : '(empty)');
    return createFakeWindow();
};

function createFakeWindow() {
    return {
        closed: true,
        close: () => {},
        focus: () => {},
        blur: () => {},
        postMessage: () => {},
        location: { href: '', assign: () => {}, replace: () => {} },
        document: { write: () => {}, writeln: () => {} }
    };
}

// 統計計數器 (移到外層作為模組級變數) - 當前頁面統計
let pageStats = {
    adsBlocked: 0,
    trackersBlocked: 0,
    popupsBlocked: 0
};
let networkInterceptionInitialized = false;

function lockWindowOpen() {
    try {
        Object.defineProperty(window, 'open', {
            value: blockedOpen,
            writable: false,
            configurable: false,
            enumerable: true
        });
        // window.open 被阻擋算作彈窗攔截
        pageStats.popupsBlocked++;
    } catch (e) {
        window.open = blockedOpen;
    }
}

/**
 * 回報統計數據給 Background (用於總計)
 */
function reportStats() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'UPDATE_STATS', count: 1 });
    }
}

/**
 * 攔截網路請求 (XHR/Fetch)
 * 注意: 這主要針對無法使用 declarativeNetRequest 覆蓋的動態請求
 */
function interceptNetworkRequests() {
    // 防止重複初始化
    if (networkInterceptionInitialized) return;
    networkInterceptionInitialized = true;
    
    const originalXhrOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
        if (isBlockedUrl(url)) {
            console.log('Shield Pro: Blocked XHR', url);
            // 判斷是廣告還是追蹤器
            if (isTrackerUrl(url)) {
                pageStats.trackersBlocked++;
            } else {
                pageStats.adsBlocked++;
            }
            reportStats();
            return; // 阻止請求
        }
        return originalXhrOpen.apply(this, arguments);
    };
    
    // Fetch 攔截
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = input;
        if (input instanceof Request) {
            url = input.url;
        }
        
        if (isBlockedUrl(url)) {
            console.log('Shield Pro: Blocked Fetch', url);
            if (isTrackerUrl(url)) {
                pageStats.trackersBlocked++;
            } else {
                pageStats.adsBlocked++;
            }
            reportStats();
            return Promise.reject(new TypeError('Failed to fetch'));
        }
        
        return originalFetch.apply(this, arguments);
    };
    
    log('網路請求攔截已初始化');
}

/**
 * 判斷 URL 是否為追蹤器
 */
function isTrackerUrl(url) {
    const urlStr = String(url).toLowerCase();
    const trackerPatterns = [
        'track', 'analytics', 'pixel', 'beacon', 'metric',
        'stats', 'collect', 'log.', 'telemetry', 'fingerprint'
    ];
    return trackerPatterns.some(p => urlStr.includes(p));
}

/**
 * 設定 Chrome 訊息監聽器
 */
function setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // 回傳當前頁面統計
            if (request.action === 'getPageStats' || request.type === 'GET_PAGE_STATS') {
                sendResponse({
                    adsBlocked: pageStats.adsBlocked,
                    trackersBlocked: pageStats.trackersBlocked,
                    popupsBlocked: pageStats.popupsBlocked
                });
                return true;
            }
            if (request.type === 'TOGGLE_AD_BLOCKING') {
                console.log('收到開關指令:', request.enabled);
            }
        });
    }
}

// 初始化
lockWindowOpen();
interceptNetworkRequests();
setupMessageListener();

// 初始回報
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'UPDATE_STATS', count: 0 });
}

// 持續監控並恢復
setInterval(() => {
    if (window.open !== blockedOpen) {
        warn('偵測到 window.open 被篡改，正在恢復...');
        lockWindowOpen();
    }
}, 200);

// ============================================================================
// 🔵 DEFENSE #2: a 標籤 click() 攔截
// 對抗紅隊攻擊: 動態創建 a 標籤並觸發 click
// ============================================================================
const originalAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function() {
    const href = this.href || '';
    const target = this.target || '';
    
    if (target === '_blank' || isBlockedUrl(href)) {
        warn('已阻擋 a.click():', href.substring(0, 80));
        return;
    }
    return originalAnchorClick.call(this);
};

// ============================================================================
// 🔵 DEFENSE #3: createElement 監控
// 對抗紅隊攻擊: 動態創建惡意元素
// ============================================================================
const originalCreateElement = document.createElement.bind(document);
document.createElement = function(tagName, options) {
    const el = originalCreateElement(tagName, options);
    const tag = tagName.toLowerCase();
    
    // 監控 a 標籤的 href 設置
    if (tag === 'a') {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'href');
        if (descriptor) {
            Object.defineProperty(el, 'href', {
                set: function(val) {
                    if (isBlockedUrl(val)) {
                        warn('已阻擋設置惡意 href:', String(val).substring(0, 50));
                        return;
                    }
                    descriptor.set.call(this, val);
                },
                get: function() {
                    return descriptor.get.call(this);
                },
                configurable: true
            });
        }
    }
    
    // 監控 iframe 創建
    if (tag === 'iframe') {
        const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
        if (srcDescriptor) {
            Object.defineProperty(el, 'src', {
                set: function(val) {
                    if (isBlockedUrl(val)) {
                        warn('已阻擋惡意 iframe src:', String(val).substring(0, 50));
                        return;
                    }
                    srcDescriptor.set.call(this, val);
                },
                get: function() {
                    return srcDescriptor.get.call(this);
                },
                configurable: true
            });
        }
    }
    
    return el;
};

// ============================================================================
// 🔵 DEFENSE #4: Form 提交攔截
// 對抗紅隊攻擊: 創建 form 並 submit 到新窗口
// ============================================================================
const originalFormSubmit = HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit = function() {
    const action = this.action || '';
    const target = this.target || '';
    
    if (target === '_blank' || isBlockedUrl(action)) {
        warn('已阻擋 form.submit():', action.substring(0, 80));
        return;
    }
    return originalFormSubmit.call(this);
};

// ============================================================================
// 🔵 DEFENSE #5: location 重定向攔截
// 對抗紅隊攻擊: location.assign/replace/href 重定向
// ============================================================================
const origAssign = window.location.assign?.bind(window.location);
const origReplace = window.location.replace?.bind(window.location);

if (origAssign) {
    window.location.assign = function(url) {
        if (isBlockedUrl(url)) {
            warn('已阻擋 location.assign:', String(url).substring(0, 60));
            return;
        }
        return origAssign(url);
    };
}

if (origReplace) {
    window.location.replace = function(url) {
        if (isBlockedUrl(url)) {
            warn('已阻擋 location.replace:', String(url).substring(0, 60));
            return;
        }
        return origReplace(url);
    };
}

// ============================================================================
// 🔵 DEFENSE #6: History API 攔截
// 對抗紅隊攻擊: pushState/replaceState 濫用
// ============================================================================
const origPushState = history.pushState?.bind(history);
const origReplaceState = history.replaceState?.bind(history);

if (origPushState) {
    history.pushState = function(state, title, url) {
        if (url && isBlockedUrl(url)) {
            warn('已阻擋 history.pushState:', String(url).substring(0, 60));
            return;
        }
        return origPushState(state, title, url);
    };
}

if (origReplaceState) {
    history.replaceState = function(state, title, url) {
        if (url && isBlockedUrl(url)) {
            warn('已阻擋 history.replaceState:', String(url).substring(0, 60));
            return;
        }
        return origReplaceState(state, title, url);
    };
}

// ============================================================================
// 🔵 DEFENSE #7: setTimeout/setInterval 字串執行攔截
// 對抗紅隊攻擊: setTimeout("window.open(...)", 100)
// ============================================================================
const origSetTimeout = window.setTimeout;
const origSetInterval = window.setInterval;

window.setTimeout = function(fn, delay, ...args) {
    if (typeof fn === 'string') {
        const fnLower = fn.toLowerCase();
        if (fnLower.includes('open(') || fnLower.includes('location') || 
            fnLower.includes('href') || fnLower.includes('submit')) {
            warn('已阻擋可疑 setTimeout 字串執行');
            return 0;
        }
    }
    return origSetTimeout.call(window, fn, delay, ...args);
};

window.setInterval = function(fn, delay, ...args) {
    if (typeof fn === 'string') {
        const fnLower = fn.toLowerCase();
        if (fnLower.includes('open(') || fnLower.includes('location') ||
            fnLower.includes('href') || fnLower.includes('submit')) {
            warn('已阻擋可疑 setInterval 字串執行');
            return 0;
        }
    }
    return origSetInterval.call(window, fn, delay, ...args);
};

// ============================================================================
// 🔵 DEFENSE #8: eval 攔截
// 對抗紅隊攻擊: eval("window['op'+'en'](...)")
// ============================================================================
const originalEval = window.eval;
window.eval = function(code) {
    if (typeof code === 'string') {
        const codeLower = code.toLowerCase();
        // 檢測混淆的 window.open 調用
        if (codeLower.includes("['op") || codeLower.includes('["op') ||
            codeLower.includes("open(") || codeLower.includes('window.open')) {
            warn('已阻擋可疑 eval 執行');
            return undefined;
        }
    }
    return originalEval.call(window, code);
};

// ============================================================================
// 🔵 DEFENSE #9: Web Worker 監控
// 對抗紅隊攻擊: 通過 Worker 觸發彈窗
// ============================================================================
const OriginalWorker = window.Worker;
if (OriginalWorker) {
    window.Worker = function(scriptUrl, options) {
        if (isBlockedUrl(scriptUrl)) {
            warn('已阻擋可疑 Worker 創建:', String(scriptUrl).substring(0, 50));
            // 返回一個假的 Worker
            return {
                postMessage: () => {},
                terminate: () => {},
                addEventListener: () => {},
                removeEventListener: () => {}
            };
        }
        return new OriginalWorker(scriptUrl, options);
    };
}

// ============================================================================
// 🔵 DEFENSE #10: MutationObserver 監控 Meta Refresh
// 對抗紅隊攻擊: <meta http-equiv="refresh" content="0;url=...">
// ============================================================================
function setupMetaRefreshBlocker() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeName === 'META') {
                    const httpEquiv = node.getAttribute('http-equiv');
                    const content = node.getAttribute('content') || '';
                    if (httpEquiv?.toLowerCase() === 'refresh' && isBlockedUrl(content)) {
                        warn('已阻擋惡意 meta refresh:', content.substring(0, 50));
                        node.remove();
                    }
                }
            }
        }
    });

    if (document.head) {
        observer.observe(document.head, { childList: true, subtree: true });
    }
    
    // 延遲監控 (頁面可能還沒載入 head)
    document.addEventListener('DOMContentLoaded', () => {
        if (document.head) {
            observer.observe(document.head, { childList: true, subtree: true });
        }
    });
}

setupMetaRefreshBlocker();

// ============================================================================
// 🔵 DEFENSE #11: 覆蓋層偵測與移除
// 對抗紅隊攻擊: 透明覆蓋層、點擊劫持
// ============================================================================
function isClickjackingLayer(element) {
    if (!element || element.tagName === 'VIDEO' || element.tagName === 'IFRAME') return false;
    
    const style = window.getComputedStyle(element);
    const tagName = element.tagName?.toLowerCase() || '';
    
    // 允許正常的互動元素
    if (['a', 'button', 'input', 'select', 'textarea', 'label'].includes(tagName)) {
        return false;
    }
    
    // 計算特徵分數 (基於敏感度設定)
    const threshold = 11 - CONFIG.sensitivity; // sensitivity 1-10 -> threshold 10-1
    let score = 0;
    
    const width = element.offsetWidth || 0;
    const height = element.offsetHeight || 0;
    const isLarge = width > window.innerWidth * 0.3 && height > window.innerHeight * 0.3;
    const isPositioned = style.position === 'fixed' || style.position === 'absolute';
    const zIndex = parseInt(style.zIndex) || 0;
    const opacity = parseFloat(style.opacity);
    const bgColor = style.backgroundColor;
    
    // 透明度檢測
    const isTransparent = opacity < 0.3 ||
        bgColor === 'transparent' ||
        bgColor === 'rgba(0, 0, 0, 0)' ||
        (bgColor.includes('rgba') && parseFloat(bgColor.split(',')[3]) < 0.3);
    
    // 評分系統
    if (isPositioned) score += 2;
    if (zIndex > 9999) score += 3;
    if (zIndex > 999) score += 1;
    if (isLarge) score += 2;
    if (isTransparent) score += 2;
    if (style.pointerEvents !== 'none') score += 1;
    
    // 類名/ID 檢測
    const className = element.className?.toString()?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    for (const pattern of ATTACK_PATTERNS.suspiciousClassNames) {
        if (className.includes(pattern) || id.includes(pattern)) {
            score += 2;
            break;
        }
    }
    
    return score >= threshold;
}

function removeClickjackingLayer(element) {
    if (!element) return;
    try {
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.remove();
        warn('已移除點擊劫持層:', 
            element.className?.substring?.(0, 50) || element.id || element.tagName);
    } catch (err) {}
}

// 點擊事件攔截
['click', 'touchstart', 'pointerdown', 'mousedown'].forEach(eventType => {
    document.addEventListener(eventType, function(e) {
        const target = e.target;
        if (!target) return;
        
        if (isClickjackingLayer(target)) {
            warn('已阻擋隱形覆蓋層', eventType);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            removeClickjackingLayer(target);
            return false;
        }
    }, true);
});

// 主動掃描並移除覆蓋層
function scanAndRemoveOverlays() {
    const elements = document.querySelectorAll(
        'div[style*="position"], div[style*="z-index"], ' +
        'span[style*="position"], section[style*="position"]'
    );
    elements.forEach(el => {
        if (isClickjackingLayer(el)) {
            removeClickjackingLayer(el);
        }
    });
}

// 定期掃描
setInterval(scanAndRemoveOverlays, 500);

// DOM 載入後立即掃描
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndRemoveOverlays);
} else {
    scanAndRemoveOverlays();
}

// ============================================================================
// 🔵 DEFENSE #12: beforeunload 防護
// 對抗紅隊攻擊: beforeunload 阻止離開
// ============================================================================
window.addEventListener('beforeunload', function(e) {
    delete e.returnValue;
}, true);

// ============================================================================
// 🔵 DEFENSE #13: target="_blank" 攔截
// 對抗紅隊攻擊: 修改所有連結的 target
// ============================================================================
function sanitizeLinks() {
    document.querySelectorAll('a[target="_blank"]').forEach(link => {
        if (isBlockedUrl(link.href)) {
            link.removeAttribute('target');
            link.href = 'javascript:void(0)';
            warn('已清理惡意連結:', link.textContent?.substring(0, 30));
        }
    });
}

// 監控新增的連結
const linkObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            sanitizeLinks();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    sanitizeLinks();
    linkObserver.observe(document.body, { childList: true, subtree: true });
});

// ============================================================================
// 🔵 DEFENSE #14: Proxy 監控 (進階保護)
// 對抗紅隊攻擊: 屬性混淆存取如 window['op'+'en']
// ============================================================================
try {
    const windowProxy = new Proxy(window, {
        get(target, prop) {
            const propStr = String(prop).toLowerCase();
            if (propStr === 'open') {
                return blockedOpen;
            }
            return Reflect.get(target, prop);
        }
    });
    
    // 注意：這可能導致某些腳本問題，因此僅記錄而不替換
    log('Proxy 監控已啟用');
} catch (e) {
    // Proxy 不支援或失敗
}

// ============================================================================
// 🔵 DEFENSE #15: 腳本注入監控
// 對抗紅隊攻擊: 動態插入廣告腳本
// ============================================================================
const scriptObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeName === 'SCRIPT') {
                const src = node.src || '';
                if (src && isBlockedUrl(src)) {
                    warn('已阻擋惡意腳本注入:', src.substring(0, 60));
                    node.remove();
                }
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
});

// ============================================================================
// 🔵 DEFENSE #16: 特定覆蓋層移除 (針對已知網站)
// 對抗紅隊攻擊: javboys.online 等播放器的覆蓋廣告
// ============================================================================
const KNOWN_OVERLAY_SELECTORS = [
    // javboys.online 播放器
    '.cvpboxOverlay', '.cvpcolorbox', '#cvpboxOverlay', '#cvpcolorbox',
    '[class*="cvpbox"]', '[id*="cvpbox"]',
    // 通用廣告覆蓋
    '.colorbox', '#colorbox', '.cboxOverlay', '#cboxOverlay',
    '.fancybox-overlay', '.modal-backdrop.ad',
    // 播放器廣告
    '[class*="player-overlay-ad"]', '[class*="video-ad-overlay"]',
    '[class*="preroll"]', '[class*="midroll"]',
    // 燈箱和彈窗容器
    '[id*="colorbox"]', '[class*="colorbox"]',
    '[class*="lightbox"]', '[id*="lightbox"]',
    // 覆蓋式廣告容器
    '[class*="ads-container"]', '[id*="ads-container"]',
    '[class*="overlay"][style*="z-index"]',
    'div[style*="position: fixed"][style*="z-index: 9999"]',
    'div[style*="position:fixed"][style*="z-index:9999"]'
];

function removeKnownOverlays() {
    KNOWN_OVERLAY_SELECTORS.forEach(selector => {
        try {
            document.querySelectorAll(selector).forEach(el => {
                if (el && el.parentNode) {
                    // 不移除 video 和 iframe 本身
                    if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') return;
                    
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                    el.style.setProperty('opacity', '0', 'important');
                    warn('已移除已知覆蓋層:', selector);
                }
            });
        } catch (e) {}
    });
    
    // 額外掃描：移除高 z-index 的定位元素（可能是動態創建的廣告）
    try {
        document.querySelectorAll('div, span, section, aside').forEach(el => {
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex) || 0;
            const position = style.position;
            
            // 高 z-index 且為 fixed/absolute 的元素
            if (zIndex >= 9999 && (position === 'fixed' || position === 'absolute')) {
                // 排除影片播放器和控制元素
                if (el.querySelector('video') || el.querySelector('iframe[src*="player"]')) return;
                if (el.closest('video') || el.closest('iframe')) return;
                
                // 檢查是否為廣告覆蓋層
                const className = (el.className || '').toString().toLowerCase();
                const id = (el.id || '').toLowerCase();
                
                const isAdOverlay = 
                    className.includes('box') ||
                    className.includes('overlay') ||
                    className.includes('ad') ||
                    id.includes('box') ||
                    id.includes('overlay') ||
                    id.includes('ad');
                
                if (isAdOverlay) {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                    warn('已移除高 z-index 覆蓋層:', className || id || 'z:' + zIndex);
                }
            }
        });
    } catch (e) {}
}

// 初始掃描 + 定期掃描
removeKnownOverlays();
setInterval(removeKnownOverlays, 1000);

document.addEventListener('DOMContentLoaded', removeKnownOverlays);

// ============================================================================
// 🔵 DEFENSE #17: 影片元素保護
// 對抗紅隊攻擊: 在 video/iframe 上覆蓋透明點擊劫持層
// ============================================================================
function protectVideoElements() {
    // 找出所有影片/播放器元素
    const mediaElements = document.querySelectorAll(
        'video, iframe[src*="player"], iframe[src*="embed"], ' +
        'iframe[src*="video"], [class*="video-player"], [class*="player-container"]'
    );
    
    mediaElements.forEach(media => {
        if (!media) return;
        
        const rect = media.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return; // 忽略太小的元素
        
        // 檢查覆蓋在 media 元素上的透明層
        const elementsAtMedia = document.elementsFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
        
        elementsAtMedia.forEach(el => {
            if (el === media) return;
            if (el.tagName === 'HTML' || el.tagName === 'BODY') return;
            if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') return;
            
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex) || 0;
            const opacity = parseFloat(style.opacity);
            const bgColor = style.backgroundColor;
            
            // 檢測透明覆蓋
            const isTransparent = opacity < 0.1 ||
                bgColor === 'transparent' ||
                bgColor === 'rgba(0, 0, 0, 0)';
            
            const isOverlay = (style.position === 'absolute' || style.position === 'fixed') &&
                              zIndex > 0 && isTransparent;
            
            if (isOverlay) {
                el.style.setProperty('pointer-events', 'none', 'important');
                warn('已禁用影片覆蓋層互動:', el.className || el.id || el.tagName);
            }
        });
    });
}

// 定期保護影片元素
setInterval(protectVideoElements, 800);

// ============================================================================
// 🔵 DEFENSE #18: 反廣告偵測偽裝
// 對抗紅隊攻擊: 網站偵測是否使用廣告攔截器
// ============================================================================
function setupAntiAdblockBypass() {
    // 檢查是否已由 anti-antiblock.js 處理
    if (window.__antiAdblockBypassLoaded) {
        log('反廣告偵測已由 anti-antiblock.js 處理，跳過');
        return;
    }
    window.__antiAdblockBypassLoaded = true;
    
    // 1. 偽造廣告載入成功訊號
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.loaded = true;
    window.adsbygoogle.push = function() { return true; };
    
    // 2. 偽造常見廣告變數
    window.google_ad_client = 'ca-pub-0000000000000000';
    window.google_ads_loaded = true;
    
    // 3. 攔截常見 adblock 偵測變數
    const fakeAdBlockStatus = {
        detected: false,
        baitLoaded: true,
        adsBlocked: false
    };
    
    try {
        Object.defineProperty(window, 'adblock', {
            get: () => false,
            set: () => {},
            configurable: false
        });
        
        Object.defineProperty(window, 'canRunAds', {
            get: () => true,
            set: () => {},
            configurable: false
        });
        
        Object.defineProperty(window, 'isAdBlockActive', {
            get: () => false,
            set: () => {},
            configurable: false
        });
    } catch (e) {}
    
    // 4. 偽造 FuckAdBlock / BlockAdBlock
    window.fuckAdBlock = {
        check: () => false,
        emitEvent: () => {},
        clearEvent: () => {},
        on: () => ({ onDetected: () => {}, onNotDetected: () => {} }),
        onDetected: () => {},
        onNotDetected: () => {}
    };
    
    window.blockAdBlock = window.fuckAdBlock;
    window.sniffAdBlock = window.fuckAdBlock;
    
    // 5. 創建假的廣告元素（防止 bait 偵測）
    function createDecoyAds() {
        const decoyClasses = ['ad', 'ads', 'adsbox', 'ad-banner', 'ad-placeholder'];
        decoyClasses.forEach(cls => {
            if (!document.querySelector('.' + cls)) {
                const decoy = document.createElement('div');
                decoy.className = cls;
                decoy.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
                decoy.innerHTML = '&nbsp;';
                document.body?.appendChild(decoy);
            }
        });
    }
    
    document.addEventListener('DOMContentLoaded', createDecoyAds);
    setTimeout(createDecoyAds, 1000);
    
    log('反廣告偵測偽裝已啟用');
}

setupAntiAdblockBypass();

// ============================================================================
// 🔵 DEFENSE #19: 增強型事件攔截
// 對抗紅隊攻擊: 透過 addEventListener 注冊的彈窗觸發
// ============================================================================
const originalAddEventListener = EventTarget.prototype.addEventListener;
const suspiciousEventHandlers = new WeakMap();

EventTarget.prototype.addEventListener = function(type, listener, options) {
    // 監控 click 事件
    if (type === 'click' && typeof listener === 'function') {
        const listenerStr = listener.toString().toLowerCase();
        
        // 檢測可疑的點擊處理器（包含彈窗代碼）
        if (listenerStr.includes('window.open') ||
            listenerStr.includes("['open']") ||
            listenerStr.includes('["open"]') ||
            listenerStr.includes('location.href') ||
            listenerStr.includes('location.assign')) {
            
            warn('已攔截可疑 click 事件監聽器');
            
            // 替換為安全版本
            const safeListener = function(e) {
                // 只允許非覆蓋層元素的點擊
                if (!isClickjackingLayer(e.target)) {
                    // 不執行原始處理器，防止彈窗
                }
            };
            
            return originalAddEventListener.call(this, type, safeListener, options);
        }
    }
    
    return originalAddEventListener.call(this, type, listener, options);
};

// ============================================================================
// 🔵 DEFENSE #21: Shadow DOM 覆蓋層移除
// 對抗紅隊攻擊: 使用 Shadow DOM 隱藏結構的全屏點擊劫持層
// ============================================================================
function removeShadowDOMOverlays() {
    // 目標選擇器 - 已知的 Shadow DOM 覆蓋層
    const shadowHostSelectors = [
        '#preact-border-shadow-host',
        '[id*="preact-border"]',
        '[id*="shadow-host"]',
        '[id*="preact_border"]',
        'div[style*="position: fixed"][style*="100vw"]',
        'div[style*="position:fixed"][style*="100vw"]'
    ];
    
    shadowHostSelectors.forEach(selector => {
        try {
            document.querySelectorAll(selector).forEach(host => {
                // 檢查是否為全屏覆蓋層
                const rect = host.getBoundingClientRect();
                const isFullScreen = rect.width >= window.innerWidth * 0.9 ||
                                     rect.height >= window.innerHeight * 0.9;
                
                const style = window.getComputedStyle(host);
                const isFixed = style.position === 'fixed' || style.position === 'absolute';
                
                if (isFixed && isFullScreen) {
                    // 確保不是播放器容器
                    if (!host.querySelector('video') && !host.querySelector('iframe[src*="player"]')) {
                        host.style.setProperty('display', 'none', 'important');
                        host.style.setProperty('visibility', 'hidden', 'important');
                        host.style.setProperty('pointer-events', 'none', 'important');
                        host.remove();
                        warn('已移除 Shadow DOM 覆蓋層:', host.id || selector);
                    }
                }
            });
        } catch (e) {}
    });
    
    // 額外掃描：檢測任何具有 shadowRoot 的可疑元素
    try {
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.shadowRoot) {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                
                const isLargeFixed = (style.position === 'fixed' || style.position === 'absolute') &&
                                     rect.width >= window.innerWidth * 0.5 &&
                                     rect.height >= window.innerHeight * 0.5;
                
                // 檢查是否為廣告相關 (通過 ID 或 class)
                const idClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
                const isSuspicious = idClass.includes('preact') || 
                                     idClass.includes('shadow') ||
                                     idClass.includes('overlay') ||
                                     idClass.includes('border');
                
                if (isLargeFixed && isSuspicious) {
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                    el.remove();
                    warn('已移除 Shadow Root 元素:', el.id || el.className);
                }
            }
        });
    } catch (e) {}
}

// 立即執行 + 定期掃描
removeShadowDOMOverlays();
setInterval(removeShadowDOMOverlays, 500);

document.addEventListener('DOMContentLoaded', removeShadowDOMOverlays);

// 使用 MutationObserver 監控新增的 Shadow DOM 覆蓋層
const shadowDOMObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const id = node.id || '';
                const className = node.className?.toString() || '';
                
                if (id.includes('preact') || id.includes('shadow') ||
                    className.includes('preact') || className.includes('shadow')) {
                    setTimeout(removeShadowDOMOverlays, 10);
                    return;
                }
            }
        }
    }
});

if (document.documentElement) {
    shadowDOMObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// ============================================================================
// 🔵 DEFENSE #22: 首次點擊保護
// 對抗紅隊攻擊: 網站劫持首次點擊觸發廣告
// ============================================================================
let firstClickProtected = false;
let clickCount = 0;

document.addEventListener('click', function(e) {
    clickCount++;
    
    // 前 3 次點擊加強保護
    if (clickCount <= 3) {
        const target = e.target;
        
        // 如果點擊的不是影片/播放器本身，可能是覆蓋層
        if (target.tagName !== 'VIDEO' && 
            !target.closest('video') &&
            !target.classList.contains('vjs-big-play-button') &&
            !target.closest('.video-js') &&
            !target.closest('[class*="player"]')) {
            
            // 檢查是否透明或可疑
            const style = window.getComputedStyle(target);
            const opacity = parseFloat(style.opacity);
            
            if (opacity < 0.5 || isClickjackingLayer(target)) {
                warn('已阻擋首次點擊劫持 (點擊 #' + clickCount + ')');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // 移除該層並模擬重新點擊
                target.style.setProperty('pointer-events', 'none', 'important');
                target.style.setProperty('display', 'none', 'important');
                
                return false;
            }
        }
    }
}, true);

// ============================================================================
// 初始化完成
// ============================================================================
console.log(CONFIG.logPrefix, 'v5.1 進階防護版已載入 - 20 道防線就緒');

})(); // IIFE 閉合
