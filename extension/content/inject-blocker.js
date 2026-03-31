// ============================================================================
// Falcon-Player-Enhance - Inject Blocker v6 (Player Protection Edition)
// ============================================================================
// 專注於播放器保護，移除與 uBOL 重複的通用廣告攔截功能
// 必須在頁面任何其他腳本之前執行 (world: MAIN, run_at: document_start)
// ============================================================================

(function() {
'use strict';

// ============================================================================
// Configuration
// ============================================================================
const CONFIG = {
    enabled: true,
    devMode: false,
    sensitivity: 5, // 1-10, 覆蓋層偵測敏感度
    logPrefix: '🎬 [Falcon-Player-Enhance]',
    // 隱蔽模式：對敏感網站放寬攔截，避免被 adblock 偵測
    stealthMode: true
};
const BASE_SENSITIVITY = CONFIG.sensitivity;
const aiDynamicBlockedDomains = new Set();
const BLOCKING_LEVEL = {
    OFF: 0,
    BASIC: 1,
    STANDARD: 2,
    HARDENED: 3
};
const L3_REDIRECT_TRAP_DOMAINS = [
    'sfnu-protect.sbs',
    'xsotrk.com',
    'exoclick-adb.com',
    'exoclick.com',
    'cooladblocker.app',
    'cooladblocker.com',
    'cyltor88mf.com',
    'drynvalo.info',
    'nn125.com',
    'playafterdark.com'
];
let protectionLevel = BLOCKING_LEVEL.BASIC;
const aiRuntimeState = {
    popupStrictMode: false,
    sensitivityBoost: 0,
    extraBlockedDomains: [],
    policyGate: {
        tier: 'T1',
        mode: 'advisory-only',
        allowReversibleActions: false,
        allowedActions: []
    }
};

// 此腳本已透過 content script matches 限定只在播放器站點載入
// 不再需要維護獨立的站點清單
const IS_PLAYER_SITE = true;

// 相容模式網站：避免侵入式攔截干擾播放器初始化
const DEFAULT_COMPATIBILITY_MODE_SITES = [
    'boyfriendtv.com'
];
let compatibilityModeSites = DEFAULT_COMPATIBILITY_MODE_SITES.slice();
const DEFAULT_KNOWN_OVERLAY_SELECTORS = [
    '.cvpboxOverlay', '.cvpcolorbox', '#cvpboxOverlay', '#cvpcolorbox',
    '[class*="cvpbox"]', '[id*="cvpbox"]',
    '.colorbox', '#colorbox', '.cboxOverlay', '#cboxOverlay',
    '.fancybox-overlay', '.modal-backdrop.ad',
    '[class*="player-overlay-ad"]', '[class*="video-ad-overlay"]',
    '[class*="preroll"]', '[class*="midroll"]',
    '[class*="ads-container"]', '[id*="ads-container"]'
];
let knownOverlaySelectors = DEFAULT_KNOWN_OVERLAY_SELECTORS.slice();
let siteProfilesLoadPromise = null;

// 已知惡意廣告域名 (播放器相關)
const MALICIOUS_DOMAINS = [
    // 主要廣告網路
    'exoclick', 'trafficjunky', 'juicyads', 'popads', 'magsrv',
    'propellerads', 'popcash', 'adcash', 'hilltopads', 'clickadu',
    // 成人廣告
    'stripchat', 'chaturbate', 'cam4', 'livejasmin', 'bongacams',
    'jerkmate', 'onlyfans',
    // 詐騙/惡意
    'slotjp668', 'trackingclick', 'casino', 'betting'
];

// 可疑覆蓋層 CSS 類名
const SUSPICIOUS_OVERLAY_CLASSES = [
    'overlay', 'cover', 'mask', 'clickjack', 'popup', 'modal',
    'interstitial', 'lightbox', 'backdrop', 'blocker', 'ad-overlay'
];

// ============================================================================
// Utility Functions
// ============================================================================
function isPlayerSite() {
    return IS_PLAYER_SITE;
}

function isCompatibilityModeSite() {
    const host = window.location.hostname.toLowerCase();
    return compatibilityModeSites.some((domain) => host === domain || host.endsWith('.' + domain));
}

function isAdvancedPlayerProtectionEnabled() {
    return isPlayerSite() && !isCompatibilityModeSite() && isLevelAtLeast(BLOCKING_LEVEL.STANDARD);
}

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasBlockedUrlToken(value, token) {
    const text = String(value || '').toLowerCase();
    const normalizedToken = String(token || '').trim().toLowerCase();
    if (!text || !normalizedToken) return false;

    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedToken)}([^a-z0-9]|$)`);
    return pattern.test(text);
}

function normalizeHostname(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
}

function normalizeDomainList(domains) {
    if (!Array.isArray(domains)) return [];

    return Array.from(new Set(
        domains
            .map((domain) => normalizeHostname(domain))
            .filter(Boolean)
    ));
}

function normalizeSelectorList(selectors) {
    if (!Array.isArray(selectors)) return [];

    return Array.from(new Set(
        selectors
            .map((selector) => String(selector || '').trim())
            .filter(Boolean)
    ));
}

function isBlockedUrl(url) {
    if (!url) return false;
    const urlStr = String(url).toLowerCase();
    let resolvedHost = '';
    
    // 允許擴充功能內部 URL
    if (urlStr.startsWith('chrome-extension://') || urlStr.startsWith('moz-extension://')) {
        return false;
    }
    
    try {
        resolvedHost = new URL(urlStr, window.location.origin).hostname.toLowerCase();
    } catch (e) {}

    if (MALICIOUS_DOMAINS.some((domain) => hasBlockedUrlToken(resolvedHost, domain) || hasBlockedUrlToken(urlStr, domain))) {
        return true;
    }
    if (aiDynamicBlockedDomains.size > 0) {
        for (const domain of aiDynamicBlockedDomains) {
            if (hasBlockedUrlToken(resolvedHost, domain) || hasBlockedUrlToken(urlStr, domain)) {
                return true;
            }
        }
    }
    return false;
}

function log(...args) {
    if (CONFIG.devMode) {
        console.log(CONFIG.logPrefix, ...args);
    }
}

function warn(...args) {
    if (!CONFIG.stealthMode || !isPlayerSite()) {
        console.warn(CONFIG.logPrefix, ...args);
    }
}

function normalizeBlockingLevel(level) {
    const numeric = Number(level);
    if (!Number.isFinite(numeric)) return BLOCKING_LEVEL.STANDARD;
    const rounded = Math.round(numeric);
    return Math.max(BLOCKING_LEVEL.OFF, Math.min(BLOCKING_LEVEL.HARDENED, rounded));
}

function clampSensitivityBoost(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(5, Math.round(numeric)));
}

function normalizeBlockedDomains(values) {
    if (!Array.isArray(values)) return [];

    return Array.from(new Set(
        values
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean)
    ));
}

function mergeAllowedActions(currentActions, nextActions) {
    return Array.from(new Set([
        ...(Array.isArray(currentActions) ? currentActions : []),
        ...(Array.isArray(nextActions) ? nextActions : [])
    ]));
}

function mergePolicyGate(nextGate) {
    const incomingGate = nextGate && typeof nextGate === 'object' ? nextGate : {};

    return {
        ...aiRuntimeState.policyGate,
        ...incomingGate,
        allowReversibleActions: aiRuntimeState.policyGate.allowReversibleActions === true || incomingGate.allowReversibleActions === true,
        allowedActions: mergeAllowedActions(aiRuntimeState.policyGate.allowedActions, incomingGate.allowedActions)
    };
}

function refreshAiBlockedDomains() {
    aiDynamicBlockedDomains.clear();
    aiRuntimeState.extraBlockedDomains.forEach((domain) => aiDynamicBlockedDomains.add(domain));
}

function setProtectionLevel(level) {
    protectionLevel = normalizeBlockingLevel(level);
    try {
        window.__shieldProtectionLevel = protectionLevel;
    } catch (e) {}
}

function isLevelAtLeast(level) {
    return protectionLevel >= level;
}

setProtectionLevel(protectionLevel);

function emitAiEvent(type, options = {}) {
    try {
        window.postMessage({
            type: '__SHIELD_AI_EVENT__',
            payload: {
                type,
                source: 'inject-blocker',
                severity: Number(options.severity || 1),
                confidence: Number(options.confidence || 0.8),
                detail: options.detail || {},
                ts: Date.now()
            }
        }, '*');
    } catch (e) {}
}

function applyAiPolicy(policy) {
    if (!policy || typeof policy !== 'object') return;
    aiRuntimeState.policyGate = mergePolicyGate(policy.policyGate);

    const allowedActions = Array.isArray(aiRuntimeState.policyGate.allowedActions)
        ? aiRuntimeState.policyGate.allowedActions
        : [];
    const allowReversibleActions = aiRuntimeState.policyGate.allowReversibleActions === true;
    const allowPopupStrict = allowReversibleActions && allowedActions.includes('tighten_popup_guard');
    const allowDomainExpansion = allowReversibleActions && allowedActions.includes('apply_extra_blocked_domains');
    const allowOverlayTuning = allowReversibleActions && allowedActions.includes('tune_overlay_scan');

    aiRuntimeState.popupStrictMode = aiRuntimeState.popupStrictMode || (allowPopupStrict && Boolean(policy.popupStrictMode));
    aiRuntimeState.sensitivityBoost = Math.max(
        aiRuntimeState.sensitivityBoost,
        allowOverlayTuning ? clampSensitivityBoost(policy.sensitivityBoost) : 0
    );
    aiRuntimeState.extraBlockedDomains = normalizeBlockedDomains([
        ...aiRuntimeState.extraBlockedDomains,
        ...(allowDomainExpansion ? normalizeBlockedDomains(policy.extraBlockedDomains) : [])
    ]);

    refreshAiBlockedDomains();

    CONFIG.sensitivity = Math.max(1, Math.min(10, BASE_SENSITIVITY + aiRuntimeState.sensitivityBoost));
}

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== '__SHIELD_AI_POLICY__') return;
    applyAiPolicy(data.policy || {});
});

window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== '__SHIELD_BLOCKING_LEVEL__') return;
    const nextLevel = normalizeBlockingLevel(data.level);
    if (nextLevel < protectionLevel) return;
    setProtectionLevel(nextLevel);
    recoverFromRedirectTrap();
});

// 偽裝函數：讓覆蓋的函數看起來像原生函數
function disguiseFunction(fn, originalFn) {
    try {
        const originalToString = originalFn.toString.bind(originalFn);
        Object.defineProperty(fn, 'toString', {
            value: function() { return originalToString(); },
            writable: false,
            configurable: false
        });
    } catch (e) {}
    try {
        Object.defineProperty(fn, 'name', {
            value: originalFn.name,
            configurable: true
        });
    } catch (e) {}
    // 注意：函數的 length 屬性通常是 non-configurable，跳過以避免錯誤
    return fn;
}

// 檢查是否為頁面主要容器 (絕對不能隱藏)
function isMainPageContainer(element) {
    if (!element || !element.nodeType) return false;
    
    try {
        // 檢查 ID 是否包含主要容器關鍵字
        const id = (element.id || '').toLowerCase();
        const mainIdPatterns = ['site', 'wrapper', 'container', 'content', 'main', 'page', 'app', 'root'];
        if (id && mainIdPatterns.some(p => id.includes(p))) {
            return true;
        }
        
        // 檢查是否包含大量連結 (主頁面通常有很多連結)
        const linkCount = element.querySelectorAll('a[href]').length;
        if (linkCount > 20) {
            return true;
        }
        
        // 檢查是否覆蓋大部分頁面 (主容器通常很大)
        const rect = element.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) {
            return true;
        }
        
        // 檢查 class 是否包含主要容器關鍵字
        const className = (element.className?.toString() || '').toLowerCase();
        if (mainIdPatterns.some(p => className.includes(p))) {
            return true;
        }
    } catch (e) {}
    
    return false;
}

function containsProtectedMedia(element) {
    if (!element) return false;

    try {
        if (element.tagName === 'VIDEO' || element.tagName === 'IFRAME') {
            return true;
        }

        if (element.closest && element.closest('video, iframe, .shield-detected-player, [data-shield-player-type], [data-shield-id]')) {
            return true;
        }

        if (element.querySelector) {
            if (element.querySelector('video, iframe, .shield-detected-player, [data-shield-player-type], [data-shield-id]')) {
                return true;
            }

            if (
                isPlayerSite() &&
                element.querySelector('iframe[src*="luluvdoo"], iframe[src*="myvidplay"], iframe[src*="upn.one"], iframe[src*="stream"]')
            ) {
                return true;
            }
        }
    } catch (e) {}

    return false;
}

// 檢查是否為擴充功能內部元素
function isInternalElement(element) {
    if (!element || !element.nodeType) return false;
    
    try {
        if (element.nodeType === 1) {
            const className = element.className?.toString() || '';
            const dataAttr = element.dataset?.shieldInternal;
            
            if (className.split(/\s+/).some(cls => cls.startsWith('shield-'))) {
                return true;
            }
            if (dataAttr === 'true') {
                return true;
            }
            
            // 檢查父元素
            let parent = element.parentElement;
            let depth = 0;
            while (parent && depth < 10) {
                const parentClass = parent.className?.toString() || '';
                if (parentClass.split(/\s+/).some(cls => cls.startsWith('shield-'))) {
                    return true;
                }
                if (parent.dataset?.shieldInternal === 'true') {
                    return true;
                }
                parent = parent.parentElement;
                depth++;
            }
        }
    } catch (e) {}
    
    return false;
}

// ============================================================================
// Statistics
// ============================================================================
let pageStats = {
    popupsBlocked: 0,
    overlaysRemoved: 0
};

function reportStats() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ action: 'popupBlocked' }).catch(() => {});
    }
}

function reportOverlayStats(removed = 1) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ action: 'updateOverlayStats', removed: Number(removed || 1) }).catch(() => {});
    }
}

// ============================================================================
// 🔵 DEFENSE #1: window.open 智慧攔截
// ============================================================================
const originalOpen = window.open;

let lastUserInteractionTime = 0;
const USER_INTERACTION_GRACE_PERIOD = 300;

['click', 'keydown', 'touchend', 'mousedown'].forEach(eventType => {
    document.addEventListener(eventType, (e) => {
        if (e.isTrusted) {
            lastUserInteractionTime = Date.now();
        }
    }, true);
});

function isUserTriggered() {
    return (Date.now() - lastUserInteractionTime) < USER_INTERACTION_GRACE_PERIOD;
}

function isSafeUrl(url) {
    if (!url) return false;
    try {
        const urlStr = String(url);
        if (urlStr.startsWith('chrome-extension://') || urlStr.startsWith('moz-extension://')) {
            return true;
        }
        const targetUrl = new URL(url, window.location.origin);
        if (targetUrl.origin === window.location.origin) return true;
        return !isBlockedUrl(url);
    } catch {
        return false;
    }
}

function isDangerousNavigationUrl(url) {
    if (!url) return false;
    const urlStr = String(url).trim().toLowerCase();
    if (!urlStr) return false;
    if (urlStr.startsWith('javascript:') || urlStr.startsWith('data:')) return true;
    if (isBlockedUrl(urlStr)) return true;
    if (!isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) return false;
    return !isSafeUrl(urlStr);
}

function isRedirectTrapHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (!host) return false;
    return L3_REDIRECT_TRAP_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isDomainOrSubdomain(hostname, domain) {
    const host = String(hostname || '').toLowerCase();
    const base = String(domain || '').toLowerCase();
    if (!host || !base) return false;
    return host === base || host.endsWith(`.${base}`);
}

function shouldRecoverFromRedirectTrap() {
    const currentHost = String(window.location.hostname || '').toLowerCase();
    if (!currentHost) return false;
    const hardened = isLevelAtLeast(BLOCKING_LEVEL.HARDENED);
    const knownTrapHost = isRedirectTrapHost(currentHost);

    if (!hardened && !knownTrapHost) return false;

    const referrer = String(document.referrer || '');
    if (!referrer) return false;

    let refHost = '';
    try {
        refHost = new URL(referrer).hostname.toLowerCase();
    } catch (e) {
        refHost = '';
    }

    if (isDomainOrSubdomain(refHost, 'javboys.com') && !isDomainOrSubdomain(currentHost, 'javboys.com')) {
        // Only recover from known redirect trap domains, not legitimate embed/partner sites
        if (!knownTrapHost) return false;
        return true;
    }

    if (!knownTrapHost) return false;
    return L3_REDIRECT_TRAP_DOMAINS.some((domain) => referrer.toLowerCase().includes(domain));
}

function recoverFromRedirectTrap() {
    if (!shouldRecoverFromRedirectTrap()) return;

    emitAiEvent('blocked_malicious_navigation', {
        severity: 1.6,
        confidence: 0.9,
        detail: {
            reason: 'redirect_trap_recover',
            host: window.location.hostname,
            referrer: String(document.referrer || '').slice(0, 300)
        }
    });

    try {
        window.stop();
    } catch (e) {}

    setTimeout(() => {
        try {
            history.back();
        } catch (e) {}
    }, 20);

    setTimeout(() => {
        if (!shouldRecoverFromRedirectTrap()) return;
        if (document.referrer && document.referrer.startsWith('http')) {
            try {
                window.location.replace(document.referrer);
            } catch (e) {}
        }
    }, 300);
}

recoverFromRedirectTrap();

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

const blockedOpen = function(url, target, features) {
    const urlStr = url ? String(url) : '';

    // 相容模式：保留站點原生開窗流程，避免播放器初始化失敗
    if (isCompatibilityModeSite()) {
        return originalOpen.call(window, url, target, features);
    }

    // L0/L1: 不做進階彈窗攔截，保留基礎播放器功能
    if (!isLevelAtLeast(BLOCKING_LEVEL.STANDARD)) {
        return originalOpen.call(window, url, target, features);
    }
    
    // 隱蔽模式：對播放器網站只攔截確定的惡意 URL
    if (CONFIG.stealthMode && isPlayerSite()) {
        if (isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) {
            const shouldBlockByL3 = isDangerousNavigationUrl(url) || !isUserTriggered();
            if (shouldBlockByL3) {
                warn('L3 已阻擋跨站彈窗導流:', urlStr.substring(0, 80));
                pageStats.popupsBlocked++;
                reportStats();
                emitAiEvent('blocked_popup', {
                    severity: 1.5,
                    confidence: 0.9,
                    detail: { reason: 'level3_popup_strict', url: urlStr.substring(0, 300) }
                });
                return createFakeWindow();
            }
        }

        if (isBlockedUrl(url) || (url && String(url).startsWith('blob:'))) {
            warn('已阻擋 Blob 彈窗:', urlStr.substring(0, 80));
            pageStats.popupsBlocked++;
            emitAiEvent('blocked_popup', {
                severity: 1.1,
                confidence: 0.9,
                detail: { reason: 'blob_or_malicious', url: urlStr.substring(0, 300) }
            });
            return createFakeWindow();
        }
        return originalOpen.call(window, url, target, features);
    }

    if (isLevelAtLeast(BLOCKING_LEVEL.HARDENED) && url && isDangerousNavigationUrl(url)) {
        warn('L3 已阻擋可疑彈窗導流:', urlStr.substring(0, 80));
        pageStats.popupsBlocked++;
        reportStats();
        emitAiEvent('blocked_popup', {
            severity: 1.5,
            confidence: 0.9,
            detail: { reason: 'level3_redirect_hardening', url: urlStr.substring(0, 300) }
        });
        return createFakeWindow();
    }
    
    // 策略 1: 已知惡意 URL 總是攔截
    if (isBlockedUrl(url)) {
        warn('已阻擋惡意彈窗:', urlStr.substring(0, 80));
        pageStats.popupsBlocked++;
        reportStats();
        emitAiEvent('blocked_popup', {
            severity: 1.25,
            confidence: 0.92,
            detail: { reason: 'known_malicious_url', url: urlStr.substring(0, 300) }
        });
        return createFakeWindow();
    }
    
    // 策略 2: 用戶主動觸發的操作允許通過（限安全 URL）
    if (isUserTriggered() && isSafeUrl(url)) {
        log('允許用戶觸發的彈窗:', urlStr.substring(0, 60));
        return originalOpen.call(window, url, target, features);
    }

    if (aiRuntimeState.popupStrictMode && url && !isSafeUrl(url)) {
        warn('AI 嚴格模式阻擋彈窗:', urlStr.substring(0, 80));
        pageStats.popupsBlocked++;
        reportStats();
        emitAiEvent('blocked_popup', {
            severity: 1.4,
            confidence: 0.88,
            detail: { reason: 'ai_popup_strict_mode', url: urlStr.substring(0, 300) }
        });
        return createFakeWindow();
    }
    
    // 策略 3: 空白頁面允許
    if (!url || url === 'about:blank' || url === '') {
        return originalOpen.call(window, url, target, features);
    }
    
    // 策略 4: 其他非用戶觸發的外部彈窗攔截
    warn('已阻擋自動彈窗:', urlStr.substring(0, 80));
    pageStats.popupsBlocked++;
    reportStats();
    emitAiEvent('blocked_popup', {
        severity: 1.1,
        confidence: 0.86,
        detail: { reason: 'auto_popup', url: urlStr.substring(0, 300) }
    });
    return createFakeWindow();
};

disguiseFunction(blockedOpen, originalOpen);

function lockWindowOpen() {
    if (CONFIG.stealthMode && isPlayerSite()) {
        window.open = blockedOpen;
        return;
    }
    
    try {
        Object.defineProperty(window, 'open', {
            value: blockedOpen,
            writable: false,
            configurable: false,
            enumerable: true
        });
    } catch (e) {
        window.open = blockedOpen;
    }
}

lockWindowOpen();

// 持續監控並恢復
setInterval(() => {
    if (window.open !== blockedOpen) {
        lockWindowOpen();
    }
}, 200);

// ============================================================================
// 🔵 DEFENSE #2: a 標籤 click() 攔截 (簡化版)
// ============================================================================
const originalAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function() {
    if (!isLevelAtLeast(BLOCKING_LEVEL.STANDARD)) {
        return originalAnchorClick.call(this);
    }

    const href = this.href || '';
    const target = this.target || '';
    
    if (isBlockedUrl(href)) {
        warn('已阻擋 a.click():', href.substring(0, 80));
        return;
    }

    if (isLevelAtLeast(BLOCKING_LEVEL.HARDENED) && isDangerousNavigationUrl(href)) {
        warn('L3 已阻擋可疑 a.click():', href.substring(0, 80));
        emitAiEvent('blocked_malicious_navigation', {
            severity: 1.35,
            confidence: 0.86,
            detail: { reason: 'level3_anchor_click', href: href.substring(0, 300) }
        });
        return;
    }
    
    // 非用戶觸發的 _blank 連結攔截
    if (target === '_blank' && !isUserTriggered()) {
        warn('已阻擋自動 a.click():', href.substring(0, 60));
        return;
    }
    
    return originalAnchorClick.call(this);
};

// ============================================================================
// 🔵 DEFENSE #4: Form 提交攔截 (簡化版)
// ============================================================================
const originalFormSubmit = HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit = function() {
    if (!isLevelAtLeast(BLOCKING_LEVEL.STANDARD)) {
        return originalFormSubmit.call(this);
    }

    const action = this.action || '';
    const target = this.target || '';
    
    if (isBlockedUrl(action)) {
        warn('已阻擋 form.submit():', action.substring(0, 80));
        return;
    }
    
    if (target === '_blank' && !isUserTriggered()) {
        warn('已阻擋自動 form.submit()');
        return;
    }

    if (isLevelAtLeast(BLOCKING_LEVEL.HARDENED) && isDangerousNavigationUrl(action)) {
        warn('L3 已阻擋可疑 form.submit():', action.substring(0, 80));
        emitAiEvent('blocked_malicious_navigation', {
            severity: 1.4,
            confidence: 0.88,
            detail: { reason: 'level3_form_submit', action: action.substring(0, 300) }
        });
        return;
    }
    
    return originalFormSubmit.call(this);
};

// ============================================================================
// 🔵 DEFENSE #5: location 重定向攔截 (簡化版)
// ============================================================================
function shouldBlockLocationNavigation(url, reason) {
    if (!isLevelAtLeast(BLOCKING_LEVEL.STANDARD)) return false;

    const normalizedUrl = String(url || '').trim().toLowerCase();
    // about:blank guard: only for top-level frames to avoid breaking iframe-based players
    let isTopFrame = false;
    try { isTopFrame = window.self === window.top; } catch (e) { /* cross-origin iframe */ }
    if (
        isTopFrame &&
        isLevelAtLeast(BLOCKING_LEVEL.HARDENED) &&
        isPlayerSite() &&
        !isUserTriggered() &&
        (normalizedUrl === 'about:blank' || normalizedUrl.startsWith('about:blank#') || normalizedUrl.startsWith('about:blank?'))
    ) {
        warn(`已阻擋 ${reason}:`, 'about:blank');
        emitAiEvent('blocked_malicious_navigation', {
            severity: 1.5,
            confidence: 0.92,
            detail: { reason: `${reason}_about_blank_guard`, url: 'about:blank' }
        });
        return true;
    }

    const blocked = isLevelAtLeast(BLOCKING_LEVEL.HARDENED)
        ? isDangerousNavigationUrl(url)
        : isBlockedUrl(url);

    if (!blocked) return false;

    const urlText = String(url || '').substring(0, 300);
    warn(`已阻擋 ${reason}:`, urlText.substring(0, 80));
    emitAiEvent('blocked_malicious_navigation', {
        severity: isLevelAtLeast(BLOCKING_LEVEL.HARDENED) ? 1.45 : 1.2,
        confidence: 0.9,
        detail: { reason, url: urlText }
    });
    return true;
}

function wrapLocationMethod(methodName) {
    try {
        const proto = Object.getPrototypeOf(window.location);
        const original = proto?.[methodName];
        if (typeof original !== 'function') return;
        if (original.__shieldWrapped) return;

        const wrapped = function(url) {
            if (shouldBlockLocationNavigation(url, `location_${methodName}_blocked`)) {
                return;
            }
            return original.call(this, url);
        };
        wrapped.__shieldWrapped = true;
        disguiseFunction(wrapped, original);
        proto[methodName] = wrapped;
    } catch (e) {}
}

function wrapLocationHrefSetter() {
    try {
        const proto = Object.getPrototypeOf(window.location);
        const desc = Object.getOwnPropertyDescriptor(proto, 'href');
        if (!desc || typeof desc.set !== 'function' || typeof desc.get !== 'function') return;
        if (desc.set.__shieldWrapped) return;

        const wrappedSetter = function(url) {
            if (shouldBlockLocationNavigation(url, 'location_href_setter_blocked')) {
                return;
            }
            return desc.set.call(this, url);
        };
        wrappedSetter.__shieldWrapped = true;

        Object.defineProperty(proto, 'href', {
            configurable: desc.configurable,
            enumerable: desc.enumerable,
            get: desc.get,
            set: wrappedSetter
        });
    } catch (e) {}
}

wrapLocationMethod('assign');
wrapLocationMethod('replace');
wrapLocationHrefSetter();

function parseMetaRefreshUrl(content) {
    const text = String(content || '');
    const matched = text.match(/url\s*=\s*([^;]+)/i);
    if (!matched || !matched[1]) return '';
    return matched[1].trim().replace(/^['"]|['"]$/g, '');
}

function neutralizeMetaRefresh() {
    if (!isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) return;
    document.querySelectorAll('meta[http-equiv]').forEach((meta) => {
        const key = String(meta.getAttribute('http-equiv') || '').toLowerCase();
        if (key !== 'refresh') return;
        const content = meta.getAttribute('content') || '';
        const targetUrl = parseMetaRefreshUrl(content);
        if (!targetUrl) return;
        if (!isDangerousNavigationUrl(targetUrl)) return;

        meta.removeAttribute('content');
        meta.setAttribute('data-shield-blocked-refresh', 'true');
        emitAiEvent('blocked_malicious_navigation', {
            severity: 1.45,
            confidence: 0.9,
            detail: { reason: 'meta_refresh_blocked', url: targetUrl.substring(0, 300) }
        });
        warn('L3 已阻擋 meta refresh 導流:', targetUrl.substring(0, 80));
    });
}

document.addEventListener('click', function(e) {
    if (!isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) return;
    const target = e.target;
    if (!target || !target.closest) return;
    if (isInternalElement(target)) return;
    const link = target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || link.href || '';
    if (!href || !isDangerousNavigationUrl(href)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    emitAiEvent('blocked_malicious_navigation', {
        severity: 1.4,
        confidence: 0.88,
        detail: { reason: 'level3_click_capture', href: href.substring(0, 300) }
    });
    warn('L3 已阻擋可疑連結導流:', href.substring(0, 80));
    return false;
}, true);

document.addEventListener('DOMContentLoaded', neutralizeMetaRefresh);
setInterval(neutralizeMetaRefresh, 1000);

function neutralizeLevel3FullscreenOverlays() {
    if (!isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) return;
    if (!isPlayerSite() || isCompatibilityModeSite()) return;

    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const selectors = 'div,section,span';
    document.querySelectorAll(selectors).forEach((el) => {
        if (!el || isInternalElement(el)) return;
        if (containsProtectedMedia(el)) return;
        if (isMainPageContainer(el)) return;

        const style = window.getComputedStyle(el);
        if (style.pointerEvents === 'none') return;
        if (!(style.position === 'fixed' || style.position === 'absolute')) return;

        const zIndex = parseInt(style.zIndex, 10);
        if (!Number.isFinite(zIndex) || zIndex < 1000) return;

        const opacity = parseFloat(style.opacity || '1');
        if (!Number.isFinite(opacity) || opacity <= 0.05) return;

        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        if ((rect.width * rect.height) < viewportArea * 0.35) return;

        // 只處理可疑全螢幕遮罩，避免影響含正文主內容的大區塊
        if (el.querySelector('article, main, [role="main"], video, iframe[src*="luluvdoo"], iframe[src*="upn.one"], iframe[src*="myvidplay"]')) {
            return;
        }

        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('display', 'none', 'important');
        pageStats.overlaysRemoved++;
    });
}

document.addEventListener('DOMContentLoaded', neutralizeLevel3FullscreenOverlays);
setInterval(neutralizeLevel3FullscreenOverlays, 700);

// ============================================================================
// 🔵 DEFENSE #11: 覆蓋層偵測與移除 (核心功能)
// ============================================================================
function isClickjackingLayer(element) {
    if (!element || element.tagName === 'VIDEO' || element.tagName === 'IFRAME') return false;

    // 🔴 關鍵保護：絕不標記主頁面容器為覆蓋層
    if (isMainPageContainer(element)) return false;
    if (containsProtectedMedia(element)) return false;

    // 白名單：播放器控制項
    if (element.closest('.video-js, .jwplayer, .plyr, .html5-video-player, #player, .art-video-player')) return false;
    
    const classNameCheck = element.className?.toString()?.toLowerCase() || '';
    if (classNameCheck.includes('vjs-') || 
        classNameCheck.includes('ytp-') || 
        classNameCheck.includes('jw-') ||
        classNameCheck.includes('art-') ||
        classNameCheck.includes('plyr')) {
        return false;
    }
    
    // 白名單：擴充功能內部元素
    if (isInternalElement(element)) {
        return false;
    }
    
    const style = window.getComputedStyle(element);
    const tagName = element.tagName?.toLowerCase() || '';
    
    // 允許正常的互動元素
    if (['a', 'button', 'input', 'select', 'textarea', 'label'].includes(tagName)) {
        return false;
    }
    
    // 計算特徵分數
    const threshold = 11 - CONFIG.sensitivity;
    let score = 0;
    
    const width = element.offsetWidth || 0;
    const height = element.offsetHeight || 0;
    const isLarge = width > window.innerWidth * 0.3 && height > window.innerHeight * 0.3;
    const isPositioned = style.position === 'fixed' || style.position === 'absolute';
    const zIndex = parseInt(style.zIndex) || 0;
    const opacity = parseFloat(style.opacity);
    const bgColor = style.backgroundColor;
    
    const isTransparent = opacity < 0.3 ||
        bgColor === 'transparent' ||
        bgColor === 'rgba(0, 0, 0, 0)' ||
        (bgColor.includes('rgba') && parseFloat(bgColor.split(',')[3]) < 0.3);
    
    if (isPositioned) score += 2;
    if (zIndex > 9999) score += 3;
    if (zIndex > 999) score += 1;
    if (isLarge) score += 2;
    if (isTransparent) score += 2;
    if (style.pointerEvents !== 'none') score += 1;
    
    const className = element.className?.toString()?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';
    for (const pattern of SUSPICIOUS_OVERLAY_CLASSES) {
        if (className.includes(pattern) || id.includes(pattern)) {
            score += 2;
            break;
        }
    }
    
    return score >= threshold;
}

function removeClickjackingLayer(element) {
    if (!element) return;
    
    // 🔴 關鍵保護：絕不移除主頁面容器
    if (isMainPageContainer(element)) {
        log('跳過主頁面容器:', element.id || element.className?.substring?.(0, 30));
        return;
    }
    if (containsProtectedMedia(element)) {
        log('跳過播放器容器:', element.id || element.className?.substring?.(0, 30));
        return;
    }
    
    try {
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.remove();
        pageStats.overlaysRemoved++;
        reportOverlayStats(1);
        emitAiEvent('overlay_removed', {
            severity: 1,
            confidence: 0.8,
            detail: {
                className: String(element.className || '').substring(0, 120),
                id: String(element.id || '').substring(0, 120)
            }
        });
        warn('已移除覆蓋層:', element.className?.substring?.(0, 50) || element.id || element.tagName);
    } catch (err) {}
}

// 點擊事件攔截
['click', 'touchstart', 'pointerdown', 'mousedown'].forEach(eventType => {
    document.addEventListener(eventType, function(e) {
        if (!isPlayerSite() || isCompatibilityModeSite()) return;

        const target = e.target;
        if (!target) return;
        
        if (isInternalElement(target)) return;
        
        // 保護正常連結和互動元素 - 不要阻擋
        if (target.closest('a, button, input, select, textarea, label, [role="button"], [onclick]')) {
            return; // 允許正常互動
        }
        
        if (isClickjackingLayer(target)) {
            warn('已阻擋覆蓋層點擊', eventType);
            emitAiEvent('clickjacking_detected', {
                severity: 1.3,
                confidence: 0.88,
                detail: { eventType }
            });
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

if (isAdvancedPlayerProtectionEnabled()) {
    setInterval(scanAndRemoveOverlays, 500);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanAndRemoveOverlays);
    } else {
        scanAndRemoveOverlays();
    }
}

// ============================================================================
// 🔵 DEFENSE #16: 特定覆蓋層移除 (播放器網站)
// ============================================================================
function removeKnownOverlays() {
    let removed = 0;
    knownOverlaySelectors.forEach(selector => {
        try {
            document.querySelectorAll(selector).forEach(el => {
                if (el && el.parentNode) {
                    if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') return;
                    
                    // 🔴 關鍵保護：絕不隱藏主頁面容器
                    if (isMainPageContainer(el)) {
                        log('跳過主頁面容器:', el.id || el.className?.substring?.(0, 30));
                        return;
                    }
                    if (containsProtectedMedia(el)) {
                        log('跳過播放器容器:', el.id || el.className?.substring?.(0, 30));
                        return;
                    }
                    
                    el.style.setProperty('display', 'none', 'important');
                    el.style.setProperty('visibility', 'hidden', 'important');
                    el.style.setProperty('pointer-events', 'none', 'important');
                    pageStats.overlaysRemoved++;
                    reportOverlayStats(1);
                    removed++;
                }
            });
        } catch (e) {}
    });
    if (removed > 0) {
        emitAiEvent('overlay_removed', {
            severity: Math.min(1.8, 0.8 + removed * 0.05),
            confidence: 0.78,
            detail: { removed, reason: 'known_overlay_selectors' }
        });
    }
}

if (isAdvancedPlayerProtectionEnabled()) {
    removeKnownOverlays();
    setInterval(removeKnownOverlays, 1000);
    document.addEventListener('DOMContentLoaded', removeKnownOverlays);
}

// ============================================================================
// 🔵 DEFENSE #17: 影片元素保護
// ============================================================================
function protectVideoElements() {
    const mediaElements = document.querySelectorAll(
        'video, iframe[src*="player"], iframe[src*="embed"], ' +
        'iframe[src*="video"], [class*="video-player"], [class*="player-container"]'
    );
    
    mediaElements.forEach(media => {
        if (!media) return;
        
        const rect = media.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return;
        
        const elementsAtMedia = document.elementsFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
        );
        
        elementsAtMedia.forEach(el => {
            if (el === media) return;
            if (el.tagName === 'HTML' || el.tagName === 'BODY') return;
            if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') return;
            
            // 白名單：正常互動元素，絕不設置 pointer-events: none
            if (el.tagName === 'A' || el.tagName === 'BUTTON' || 
                el.tagName === 'INPUT' || el.tagName === 'SELECT' ||
                el.tagName === 'LABEL' || el.tagName === 'TEXTAREA') return;
            if (el.closest('a, button, [role="button"], [onclick]')) return;
            if (el.hasAttribute('href') || el.hasAttribute('onclick')) return;
            
            // 白名單：播放器控制項
            if (el.closest('.video-js, .jwplayer, .plyr, .html5-video-player, #player, .art-video-player')) return;
            const classCheck = el.className?.toString()?.toLowerCase() || '';
            if (classCheck.includes('vjs-') || classCheck.includes('jw-') || 
                classCheck.includes('plyr') || classCheck.includes('control')) return;
            
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex) || 0;
            const opacity = parseFloat(style.opacity);
            const bgColor = style.backgroundColor;
            
            const isTransparent = opacity < 0.1 ||
                bgColor === 'transparent' ||
                bgColor === 'rgba(0, 0, 0, 0)';
            
            // 更嚴格的條件：必須是大面積 + 高 z-index + 完全透明
            const isLargeOverlay = el.offsetWidth > rect.width * 0.5 && 
                                   el.offsetHeight > rect.height * 0.5;
            const isOverlay = (style.position === 'absolute' || style.position === 'fixed') &&
                              zIndex > 100 && isTransparent && isLargeOverlay;
            
            if (isOverlay) {
                el.style.setProperty('pointer-events', 'none', 'important');
            }
        });
    });
}

if (isAdvancedPlayerProtectionEnabled()) {
    setInterval(protectVideoElements, 800);
}

// ============================================================================
// 🔵 DEFENSE #18: 反廣告偵測偽裝 (播放器專用)
// ============================================================================
function setupAntiAdblockBypass() {
    if (!isPlayerSite()) {
        return;
    }

    if (window.__antiAdblockBypassLoaded) return;
    window.__antiAdblockBypassLoaded = true;
    
    // 偽造廣告載入成功訊號
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.loaded = true;
    window.adsbygoogle.push = function() { return true; };
    
    // 偽造 ExoLoader (播放器網站專用)
    window.ExoLoader = window.ExoLoader || {
        addZone: () => {},
        serve: () => {},
        loaded: true
    };
    
    // 偽造 JuicyAds
    window.juicy_ads = window.juicy_ads || { push: () => {} };
    
    try {
        Object.defineProperty(window, 'canRunAds', {
            get: () => true,
            set: () => {},
            configurable: false
        });
        
        Object.defineProperty(window, 'adblock', {
            get: () => false,
            set: () => {},
            configurable: false
        });
    } catch (e) {}
    
    // 偽造 FuckAdBlock
    window.fuckAdBlock = {
        check: () => false,
        emitEvent: () => {},
        clearEvent: () => {},
        on: () => ({ onDetected: () => {}, onNotDetected: () => {} }),
        onDetected: () => {},
        onNotDetected: () => {}
    };
    window.blockAdBlock = window.fuckAdBlock;
    
    // 創建假的廣告元素
    function createDecoyAds() {
        const decoyClasses = ['ad', 'ads', 'adsbox', 'ad-banner'];
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
}

setupAntiAdblockBypass();

// ============================================================================
// 🔵 DEFENSE #19: 事件攔截 (簡化版)
// ============================================================================
const originalAddEventListener = EventTarget.prototype.addEventListener;

EventTarget.prototype.addEventListener = function(type, listener, options) {
    // Chrome Permissions Policy blocks the deprecated 'unload' event on many
    // pages.  Silently convert to 'pagehide' so third-party scripts that still
    // use it don't trigger a violation through our monkey-patch.
    if (type === 'unload') {
        return originalAddEventListener.call(this, 'pagehide', listener, options);
    }

    // Only enable this on known player sites. This avoids breaking general websites
    // and keeps the extension's scope aligned with "player protection".
    if (!isPlayerSite()) {
        return originalAddEventListener.call(this, type, listener, options);
    }

    // Defensive guard: some third-party libraries may invoke addEventListener with
    // an unexpected `this` during monkey-patching. Preserve native behavior.
    if (!this) {
        return originalAddEventListener.call(this, type, listener, options);
    }

    if (this.nodeType === 1 && isInternalElement(this)) {
        return originalAddEventListener.call(this, type, listener, options);
    }
    
    // 只監控 click 事件中的可疑處理器
    // L3 允許更嚴格攔截，包含常見導流語法
    if (type === 'click' && typeof listener === 'function') {
        if (!isLevelAtLeast(BLOCKING_LEVEL.STANDARD)) {
            return originalAddEventListener.call(this, type, listener, options);
        }

        const listenerStr = listener.toString().toLowerCase();
        
        // 只攔截明顯的彈窗行為；L3 追加常見導流語法
        const hasPopupBehavior = listenerStr.includes('window.open') ||
                                  listenerStr.includes("['open']");
        const hasRedirectBehavior = isLevelAtLeast(BLOCKING_LEVEL.HARDENED) && (
            listenerStr.includes('location.href') ||
            listenerStr.includes('window.location') ||
            listenerStr.includes('location.assign') ||
            listenerStr.includes('location.replace')
        );
        
        if (hasPopupBehavior || hasRedirectBehavior) {
            // 替換為安全版本，但仍允許用戶觸發時執行
            const originalListener = listener;
            const safeListener = function(e) {
                // 用戶觸發的正常點擊 -> 執行原函數
                if (e.isTrusted && isUserTriggered() && !isClickjackingLayer(e.target)) {
                    return originalListener.call(this, e);
                }
                // 非用戶觸發或覆蓋層 -> 阻擋
                log('已阻擋可疑 click listener');
            };
            
            return originalAddEventListener.call(this, type, safeListener, options);
        }
    }
    
    return originalAddEventListener.call(this, type, listener, options);
};

// ============================================================================
// 🔵 DEFENSE #21: Shadow DOM 覆蓋層移除
// ============================================================================
function removeShadowDOMOverlays() {
    let removed = 0;
    const shadowHostSelectors = [
        '#preact-border-shadow-host',
        '[id*="preact-border"]',
        '[id*="shadow-host"]',
        'div[style*="position: fixed"][style*="100vw"]'
    ];
    
    shadowHostSelectors.forEach(selector => {
        try {
            document.querySelectorAll(selector).forEach(host => {
                // 🔴 關鍵保護：絕不移除主頁面容器
                if (isMainPageContainer(host)) {
                    log('跳過主頁面容器:', host.id || host.className?.substring?.(0, 30));
                    return;
                }
                
                const rect = host.getBoundingClientRect();
                const isFullScreen = rect.width >= window.innerWidth * 0.9 ||
                                     rect.height >= window.innerHeight * 0.9;
                
                const style = window.getComputedStyle(host);
                const isFixed = style.position === 'fixed' || style.position === 'absolute';
                
                if (isFixed && isFullScreen) {
                    if (!host.querySelector('video') && !host.querySelector('iframe[src*="player"]')) {
                        host.style.setProperty('display', 'none', 'important');
                        host.remove();
                        pageStats.overlaysRemoved++;
                        reportOverlayStats(1);
                        removed++;
                    }
                }
            });
        } catch (e) {}
    });
    if (removed > 0) {
        emitAiEvent('overlay_removed', {
            severity: Math.min(2, 0.9 + removed * 0.06),
            confidence: 0.82,
            detail: { removed, reason: 'shadow_dom_overlay' }
        });
    }
}

if (isPlayerSite() && !isCompatibilityModeSite() && isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) {
    removeShadowDOMOverlays();
    setInterval(removeShadowDOMOverlays, 500);
    document.addEventListener('DOMContentLoaded', removeShadowDOMOverlays);
}

// ============================================================================
// 🔵 DEFENSE #22: 首次點擊保護
// ============================================================================
if (isPlayerSite() && !isCompatibilityModeSite() && isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) {
    let clickCount = 0;

    document.addEventListener('click', function(e) {
        if (!isLevelAtLeast(BLOCKING_LEVEL.HARDENED)) return;
        clickCount++;
        
        // 前 3 次點擊加強保護
        if (clickCount <= 3) {
            const target = e.target;
            
            // 絕對不阻擋正常的連結和互動元素
            if (target.closest('a, button, input, select, textarea, label, [role="button"], [onclick]')) {
                return; // 允許正常導航
            }
            
            if (target.tagName !== 'VIDEO' && 
                !target.closest('video') &&
                !target.classList.contains('vjs-big-play-button') &&
                !target.closest('.video-js') &&
                !target.closest('[class*="player"]')) {
                
                const style = window.getComputedStyle(target);
                const opacity = parseFloat(style.opacity);
                
                // 只有在非常可疑的情況下才阻擋（透明 + 不是正常互動元素）
                if (opacity < 0.3 && isClickjackingLayer(target)) {
                    warn('已阻擋首次點擊劫持 (點擊 #' + clickCount + ')');
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    target.style.setProperty('pointer-events', 'none', 'important');
                    target.style.setProperty('display', 'none', 'important');
                    
                    return false;
                }
            }
        }
    }, true);
}

// ============================================================================
// Message Handling
// ============================================================================
function setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'applyBlockingLevel') {
                setProtectionLevel(request.level);
                recoverFromRedirectTrap();
                sendResponse({ success: true, blockingLevel: protectionLevel });
                return true;
            }

            if (request.action === 'disableBlocking') {
                setProtectionLevel(BLOCKING_LEVEL.OFF);
                sendResponse({ success: true, blockingLevel: protectionLevel });
                return true;
            }

            if (request.action === 'getPageStats' || request.type === 'GET_PAGE_STATS') {
                sendResponse({
                    popupsBlocked: pageStats.popupsBlocked,
                    overlaysRemoved: pageStats.overlaysRemoved
                });
                return true;
            }
        });
    }
}

function requestBlockingLevel() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
        chrome.runtime.sendMessage({ action: 'getBlockingLevel' }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response?.success) {
                setProtectionLevel(response.blockingLevel);
                recoverFromRedirectTrap();
            }
        });
    } catch (e) {}
}

function requestSiteProfiles() {
    if (siteProfilesLoadPromise) return siteProfilesLoadPromise;
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        siteProfilesLoadPromise = Promise.resolve({
            compatibilityModeSites,
            knownOverlaySelectors
        });
        return siteProfilesLoadPromise;
    }

    siteProfilesLoadPromise = new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ action: 'getSiteRegistry' }, (response) => {
                const runtimeFailed = chrome.runtime.lastError || !response?.success;
                if (runtimeFailed) {
                    compatibilityModeSites = DEFAULT_COMPATIBILITY_MODE_SITES.slice();
                    knownOverlaySelectors = DEFAULT_KNOWN_OVERLAY_SELECTORS.slice();
                    resolve({
                        compatibilityModeSites,
                        knownOverlaySelectors
                    });
                    return;
                }

                const configuredDomains = normalizeDomainList(response?.profiles?.compatibilityModeSites);
                const configuredSelectors = normalizeSelectorList(response?.profiles?.injectBlocker?.knownOverlaySelectors);
                compatibilityModeSites = configuredDomains.length > 0
                    ? configuredDomains
                    : DEFAULT_COMPATIBILITY_MODE_SITES.slice();
                knownOverlaySelectors = configuredSelectors.length > 0
                    ? configuredSelectors
                    : DEFAULT_KNOWN_OVERLAY_SELECTORS.slice();
                resolve({
                    compatibilityModeSites,
                    knownOverlaySelectors
                });
            });
        } catch (_) {
            compatibilityModeSites = DEFAULT_COMPATIBILITY_MODE_SITES.slice();
            knownOverlaySelectors = DEFAULT_KNOWN_OVERLAY_SELECTORS.slice();
            resolve({
                compatibilityModeSites,
                knownOverlaySelectors
            });
        }
    });

    return siteProfilesLoadPromise;
}

function setupPostMessageBridge() {
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === '__SHIELD_PRO_GET_STATS__') {
            window.postMessage({
                type: '__SHIELD_PRO_PAGE_STATS__',
                stats: pageStats
            }, '*');
        }
    });
}

setupMessageListener();
setupPostMessageBridge();
requestSiteProfiles();
requestBlockingLevel();

// ============================================================================
// Initialization Complete
// ============================================================================
console.log(CONFIG.logPrefix, 'v6.0 播放器保護版已載入', `(L${protectionLevel})`);

})();
