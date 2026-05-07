// ============================================================================
// Falcon-Player-Enhance - Embedded Player Anti-Detect Bootstrap
// ============================================================================
// Lightweight MAIN-world guard for redirected embed/player frames that are not
// yet part of the enhanced site registry. Keep this narrowly scoped: it should
// activate for player-like iframes, not ordinary top-level pages.
// ============================================================================

(function() {
'use strict';

if (window.__shieldEmbeddedPlayerAntiDetectLoaded) {
    return;
}

const PLAYER_PATH_PATTERN = /(?:^|\/)(?:e|embed|embeds|player|video|watch|v|stream)(?:[/?#._-]|$)|\.(?:m3u8|mp4)(?:[?#]|$)/i;
const DETECTION_ENDPOINT_PATTERN = /(?:adblock|ad-block|ad_block|adblocker|antiadblock|anti-adblock|blockadblock|fuckadblock|detectadblock|blocker|botd|bot-detect|bot_detect|fingerprint|fingerprintjs|fpjs|\/fp(?:[/?#._-]|$)|\/bots?(?:[/?#._-]|$))/i;
const POST_POPUP_NAVIGATION_GUARD_MS = 12000;
let lastExternalPopupOpen = {
    ts: 0,
    url: '',
    target: ''
};

function isHttpLikeUrl(value) {
    return /^https?:\/\//i.test(String(value || ''));
}

function safeUrl(value, base = window.location.href) {
    try {
        return new URL(value, base);
    } catch (error) {
        return null;
    }
}

function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === 'string') return input.url;
    return String(input || '');
}

function getHostname(value) {
    const url = safeUrl(value);
    return String(url?.hostname || '').toLowerCase();
}

function isSameHostOrInternalUrl(value) {
    const url = safeUrl(value);
    if (!url) return true;
    if (!/^https?:$/i.test(url.protocol)) return true;
    const currentHost = String(window.location.hostname || '').toLowerCase();
    const targetHost = String(url.hostname || '').toLowerCase();
    return !targetHost || targetHost === currentHost || targetHost.endsWith(`.${currentHost}`) || currentHost.endsWith(`.${targetHost}`);
}

function isEmbeddedFrame() {
    try {
        return window.top !== window;
    } catch (error) {
        return true;
    }
}

function isLikelyEmbeddedPlayerFrame() {
    if (!isEmbeddedFrame()) return false;

    const currentUrl = safeUrl(window.location.href);
    if (!currentUrl || !isHttpLikeUrl(currentUrl.href)) return false;

    const urlSurface = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    if (PLAYER_PATH_PATTERN.test(urlSurface)) return true;

    const referrerUrl = safeUrl(document.referrer || '');
    return Boolean(
        referrerUrl &&
        referrerUrl.hostname &&
        referrerUrl.hostname !== currentUrl.hostname &&
        /(?:player|video|embed|watch|stream)/i.test(urlSurface)
    );
}

if (!isLikelyEmbeddedPlayerFrame()) {
    return;
}

window.__shieldEmbeddedPlayerAntiDetectLoaded = true;

function defineReadOnlyFlag(name, value) {
    try {
        Object.defineProperty(window, name, {
            configurable: true,
            get: () => value,
            set: () => {}
        });
    } catch (error) {
        try {
            window[name] = value;
        } catch (assignmentError) {}
    }
}

function installAdblockFlags() {
    [
        'adblock',
        'adBlock',
        'AdBlock',
        'adBlocker',
        'adblocker',
        'adBlockDetected',
        'adblock_detected',
        'isAdBlockActive',
        'isAdblockActive',
        'adBlockEnabled',
        'hasAdblock',
        'detectAdblock',
        'adsBlocked'
    ].forEach((name) => defineReadOnlyFlag(name, false));

    [
        'canRunAds',
        'canShowAds',
        'adsLoaded',
        'ads_loaded',
        'adLoaded',
        'ad_loaded',
        'google_ads_loaded',
        'google_ad_loaded'
    ].forEach((name) => defineReadOnlyFlag(name, true));

    defineReadOnlyFlag('googleAd', { loaded: true });
    defineReadOnlyFlag('googleAdLoaded', true);
}

function createFakeDetector() {
    return {
        check: () => false,
        clearEvent: () => {},
        emitEvent: () => {},
        on: (_detected, notDetected) => {
            if (typeof notDetected === 'function') {
                setTimeout(notDetected, 0);
            }
        },
        onDetected: () => {},
        onNotDetected: (callback) => {
            if (typeof callback === 'function') {
                setTimeout(callback, 0);
            }
        },
        setOption: () => {}
    };
}

function createCleanDetectionResult() {
    return {
        detected: false,
        blocked: false,
        adblock: false,
        bot: false,
        success: true,
        ok: true
    };
}

function createCleanBotAgent() {
    const cleanResult = {
        bot: false,
        result: 'notDetected',
        type: 'notDetected',
        confidence: { score: 0 }
    };
    return {
        detect: () => cleanResult,
        get: () => ({
            visitorId: 'falcon-player',
            confidence: { score: 0 },
            components: {}
        })
    };
}

function installDetectorLibraries() {
    const detector = createFakeDetector();
    window.FuckAdBlock = window.FuckAdBlock || function() { return detector; };
    window.BlockAdBlock = window.BlockAdBlock || function() { return detector; };
    window.fuckAdBlock = window.fuckAdBlock || detector;
    window.blockAdBlock = window.blockAdBlock || detector;

    const botLoader = window.BotD || window.Botd || {
        load: () => Promise.resolve(createCleanBotAgent())
    };
    const fingerprintLoader = window.FingerprintJS || {
        load: () => Promise.resolve(createCleanBotAgent())
    };

    window.BotD = window.BotD || botLoader;
    window.Botd = window.Botd || botLoader;
    window.botd = window.botd || botLoader;
    window.FingerprintJS = window.FingerprintJS || fingerprintLoader;
    window.FingerprintJSPro = window.FingerprintJSPro || fingerprintLoader;
}

function isDetectionEndpoint(url) {
    return DETECTION_ENDPOINT_PATTERN.test(String(url || ''));
}

function createCleanResponse() {
    return JSON.stringify(createCleanDetectionResult());
}

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

function shouldTrackPopupOpen(url, target) {
    const normalizedTarget = String(target || '').toLowerCase();
    const sameTabTarget = normalizedTarget === '' || normalizedTarget === '_self' || normalizedTarget === '_top' || normalizedTarget === '_parent';
    if (sameTabTarget) return false;
    const targetUrl = safeUrl(url);
    if (!targetUrl || !/^https?:$/i.test(targetUrl.protocol)) return false;
    return !isSameHostOrInternalUrl(url);
}

function rememberExternalPopupOpen(url, target) {
    if (!shouldTrackPopupOpen(url, target)) return;
    lastExternalPopupOpen = {
        ts: Date.now(),
        url: String(url || '').slice(0, 500),
        target: String(target || '').slice(0, 64)
    };
}

function getRecentExternalPopupOpen() {
    if ((Date.now() - Number(lastExternalPopupOpen.ts || 0)) > POST_POPUP_NAVIGATION_GUARD_MS) {
        return null;
    }
    return lastExternalPopupOpen;
}

function shouldBlockPostPopupNavigation(url, reason) {
    const popup = getRecentExternalPopupOpen();
    if (!popup) return false;
    if (!url || isSameHostOrInternalUrl(url)) {
        return false;
    }
    window.__shieldLastPostPopupNavigationBlock = {
        reason,
        url: String(url || '').slice(0, 500),
        popupUrl: String(popup.url || '').slice(0, 500),
        ts: Date.now()
    };
    return true;
}

function installFetchGuard() {
    if (typeof window.fetch !== 'function' || typeof window.Response !== 'function') return;

    const originalFetch = window.fetch;
    window.fetch = function(input, ...rest) {
        const url = getRequestUrl(input);
        if (isDetectionEndpoint(url)) {
            return Promise.resolve(new Response(createCleanResponse(), {
                status: 200,
                statusText: 'OK',
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        return originalFetch.call(this, input, ...rest);
    };
}

function installXhrGuard() {
    if (typeof window.XMLHttpRequest !== 'function') return;

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__shieldAntiDetectUrl = url;
        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        if (!isDetectionEndpoint(this.__shieldAntiDetectUrl)) {
            return originalSend.apply(this, args);
        }

        const responseText = createCleanResponse();
        try {
            Object.defineProperty(this, 'readyState', { configurable: true, value: 4 });
            Object.defineProperty(this, 'status', { configurable: true, value: 200 });
            Object.defineProperty(this, 'statusText', { configurable: true, value: 'OK' });
            Object.defineProperty(this, 'responseText', { configurable: true, value: responseText });
            Object.defineProperty(this, 'response', { configurable: true, value: responseText });
        } catch (error) {}

        setTimeout(() => {
            this.onreadystatechange?.();
            this.onload?.();
            this.onloadend?.();
        }, 0);
    };
}

function installPostPopupNavigationGuard() {
    if (typeof window.open === 'function') {
        const originalOpen = window.open;
        window.open = function(url, target, features) {
            if (shouldTrackPopupOpen(url, target)) {
                rememberExternalPopupOpen(url, target);
                return createFakeWindow();
            }
            return originalOpen.call(this, url, target, features);
        };
    }

    try {
        const proto = Object.getPrototypeOf(window.location);
        ['assign', 'replace'].forEach((methodName) => {
            const original = proto?.[methodName];
            if (typeof original !== 'function') return;
            proto[methodName] = function(url) {
                if (shouldBlockPostPopupNavigation(url, `location_${methodName}`)) {
                    return;
                }
                return original.call(this, url);
            };
        });

        const desc = Object.getOwnPropertyDescriptor(proto, 'href');
        if (desc?.set && desc?.get) {
            Object.defineProperty(proto, 'href', {
                configurable: desc.configurable,
                enumerable: desc.enumerable,
                get: desc.get,
                set(url) {
                    if (shouldBlockPostPopupNavigation(url, 'location_href')) {
                        return;
                    }
                    return desc.set.call(this, url);
                }
            });
        }
    } catch (error) {}

    try {
        ['pushState', 'replaceState'].forEach((methodName) => {
            const original = History.prototype[methodName];
            if (typeof original !== 'function') return;
            History.prototype[methodName] = function(state, title, url) {
                if (url && shouldBlockPostPopupNavigation(url, `history_${methodName}`)) {
                    return;
                }
                return original.call(this, state, title, url);
            };
        });
    } catch (error) {}
}

function dispatchScriptLoad(script) {
    setTimeout(() => {
        const event = new Event('load');
        script.dispatchEvent(event);
        if (typeof script.onload === 'function') {
            script.onload(event);
        }
    }, 0);
}

function shouldShortCircuitScript(node) {
    if (!node || String(node.tagName || '').toUpperCase() !== 'SCRIPT') return false;
    const src = node.src || node.getAttribute?.('src') || '';
    return Boolean(src && isDetectionEndpoint(src));
}

function installScriptLoadGuard() {
    const originalAppendChild = Node.prototype.appendChild;
    const originalInsertBefore = Node.prototype.insertBefore;

    Node.prototype.appendChild = function(node) {
        if (shouldShortCircuitScript(node)) {
            installDetectorLibraries();
            dispatchScriptLoad(node);
            return node;
        }
        return originalAppendChild.call(this, node);
    };

    Node.prototype.insertBefore = function(node, child) {
        if (shouldShortCircuitScript(node)) {
            installDetectorLibraries();
            dispatchScriptLoad(node);
            return node;
        }
        return originalInsertBefore.call(this, node, child);
    };
}

installAdblockFlags();
installDetectorLibraries();
installFetchGuard();
installXhrGuard();
installPostPopupNavigationGuard();
installScriptLoadGuard();
window.__shieldEmbeddedPlayerAntiDetectReady = true;

})();
