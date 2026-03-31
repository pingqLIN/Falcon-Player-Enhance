// ============================================================================
// Falcon-Player-Enhance - Cosmetic Filter v4 (Player Sites Edition)
// ============================================================================
// 簡化版 - 僅保留播放器網站相關規則
// 通用廣告隱藏已委託 uBlock Origin Lite
// ============================================================================

(function () {
    'use strict';

    let cosmeticFilterConfig = {
        globalSelectors: [],
        siteSelectorGroups: []
    };
    let cosmeticFilterConfigLoadPromise = null;
    let styleElement = null;
    let customRules = [];

    function normalizeDomainList(domains = []) {
        return [...new Set(
            (Array.isArray(domains) ? domains : [])
                .map((domain) => String(domain || '').trim().toLowerCase())
                .filter(Boolean)
        )];
    }

    function normalizeSelectorList(selectors = []) {
        return [...new Set(
            (Array.isArray(selectors) ? selectors : [])
                .map((selector) => String(selector || '').trim())
                .filter(Boolean)
        )];
    }

    function normalizeCosmeticFilterConfig(payload = {}) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const groups = Array.isArray(source.siteSelectorGroups) ? source.siteSelectorGroups : [];
        return {
            globalSelectors: normalizeSelectorList(source.globalSelectors),
            siteSelectorGroups: groups
                .map((group) => {
                    const item = group && typeof group === 'object' ? group : {};
                    return {
                        domains: normalizeDomainList(item.domains),
                        selectors: normalizeSelectorList(item.selectors)
                    };
                })
                .filter((group) => group.domains.length > 0 && group.selectors.length > 0)
        };
    }

    function isDomainOrSubdomain(hostname, domain) {
        return hostname === domain || hostname.endsWith(`.${domain}`);
    }

    function loadCosmeticFilterConfig(force = false) {
        if (force) {
            cosmeticFilterConfigLoadPromise = null;
        }

        if (cosmeticFilterConfigLoadPromise) {
            return cosmeticFilterConfigLoadPromise;
        }

        cosmeticFilterConfigLoadPromise = new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getSiteRegistry' }, (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                    cosmeticFilterConfig = normalizeCosmeticFilterConfig();
                    resolve(cosmeticFilterConfig);
                    return;
                }

                cosmeticFilterConfig = normalizeCosmeticFilterConfig(response?.profiles?.cosmeticFilter);
                resolve(cosmeticFilterConfig);
            });
        });

        return cosmeticFilterConfigLoadPromise;
    }

    async function loadCustomRules() {
        try {
            const result = await chrome.storage.local.get(['hiddenElements']);
            if (result.hiddenElements) {
                customRules = result.hiddenElements;
            }
        } catch (e) {
            const stored = localStorage.getItem('__hidden_elements__');
            if (stored) {
                customRules = JSON.parse(stored);
            }
        }
    }

    function scheduleRuleRefresh(force = false) {
        Promise.all([loadCustomRules(), loadCosmeticFilterConfig(force)]).then(() => {
            injectStyles();
        });
    }

    function generateCSS() {
        const hostname = window.location.hostname.toLowerCase();
        let selectors = [...cosmeticFilterConfig.globalSelectors];

        for (const group of cosmeticFilterConfig.siteSelectorGroups) {
            if (group.domains.some((domain) => isDomainOrSubdomain(hostname, domain))) {
                selectors = selectors.concat(group.selectors);
            }
        }

        for (const rule of customRules) {
            if (!rule.hostname || hostname.includes(rule.hostname)) {
                selectors.push(rule.selector);
            }
        }

        selectors = [...new Set(selectors)];

        return selectors.map((sel) => {
            return `${sel} { display: none !important; visibility: hidden !important; }`;
        }).join('\n');
    }

    function injectStyles() {
        if (styleElement) {
            styleElement.remove();
        }

        styleElement = document.createElement('style');
        styleElement.id = '__shield_pro_cosmetic__';
        styleElement.textContent = generateCSS();

        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(styleElement);
        }
    }

    let pageStats = { popupsBlocked: 0, overlaysRemoved: 0 };
    let statsCallbacks = [];

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === '__SHIELD_PRO_PAGE_STATS__') {
            pageStats = event.data.stats || pageStats;
            while (statsCallbacks.length > 0) {
                const callback = statsCallbacks.shift();
                callback(pageStats);
            }
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (!changes.hiddenElements) return;
        scheduleRuleRefresh();
    });

    function requestPageStats() {
        window.postMessage({ type: '__SHIELD_PRO_GET_STATS__' }, '*');
    }

    function requestPageStatsAsync(timeout = 100) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve(pageStats);
            }, timeout);

            statsCallbacks.push((stats) => {
                clearTimeout(timer);
                resolve(stats);
            });

            requestPageStats();
        });
    }

    setInterval(requestPageStats, 500);
    requestPageStats();
    setTimeout(requestPageStats, 50);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'refreshCosmeticRules') {
            scheduleRuleRefresh(true);
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'getPageStats') {
            requestPageStatsAsync(150).then((stats) => {
                sendResponse(stats);
            });
            return true;
        }

        if (request.action === 'activateElementPicker' || request.action === 'activatePicker') {
            window.dispatchEvent(new CustomEvent('__shield_pro_activate_picker__'));
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'deactivateElementPicker' || request.action === 'deactivatePicker') {
            window.dispatchEvent(new CustomEvent('__shield_pro_deactivate_picker__'));
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'disableBlocking') {
            if (styleElement) {
                styleElement.remove();
                styleElement = null;
            }
            window.dispatchEvent(new CustomEvent('__shield_pro_deactivate_picker__'));
            sendResponse({ success: true });
            return true;
        }
    });

    async function init() {
        await Promise.all([loadCustomRules(), loadCosmeticFilterConfig(true)]);
        injectStyles();
        console.log('🎨 [Falcon-Player-Enhance] Cosmetic Filter (播放器版) 已啟動');
    }

    init();
})();
