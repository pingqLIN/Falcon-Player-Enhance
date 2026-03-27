// ============================================================================
// Falcon-Player-Enhance - Cosmetic Filter v4 (Player Sites Edition)
// ============================================================================
// 簡化版 - 僅保留播放器網站相關規則
// 通用廣告隱藏已委託 uBlock Origin Lite
// ============================================================================

(function () {
    'use strict';

    const PLAYER_SITE_RULES = {
        'javboys': [
            '.ad-zone',
            '.banner-zone',
            '[class*="sponsor"]',
            'div[style*="position: fixed"][style*="z-index: 9999"]',
            '.cvpboxOverlay', '.cvpcolorbox'
        ],
        'missav': [
            '[class*="ad-"]',
            '.popup-overlay'
        ],
        'supjav': [
            '[class*="ad-"]'
        ],
        'jable': [
            '.ad-container',
            '[class*="banner"]'
        ],
        'avgle': [
            '[class*="ads-"]'
        ],
        'netflav': [
            '[class*="ad-"]'
        ],
        'pornhub': [
            '.video-ad-overlay'
        ],
        'xvideos': [
            '.video-ad-overlay'
        ]
    };

    const PLAYER_AD_SELECTORS = [
        '[class*="player-overlay-ad"]',
        '[class*="video-ad-overlay"]',
        '[class*="preroll"]',
        '[class*="midroll"]',
        '[class*="exoclick"]',
        '[class*="trafficjunky"]',
        '[class*="juicyads"]',
        'iframe[src*="exoclick"]',
        'iframe[src*="trafficjunky"]'
    ];

    let styleElement = null;
    let customRules = [];

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

    function scheduleRuleRefresh() {
        loadCustomRules().then(() => {
            injectStyles();
        });
    }

    function generateCSS() {
        const hostname = window.location.hostname.toLowerCase();
        let selectors = [...PLAYER_AD_SELECTORS];

        for (const [site, rules] of Object.entries(PLAYER_SITE_RULES)) {
            if (hostname.includes(site)) {
                selectors = selectors.concat(rules);
            }
        }

        for (const rule of customRules) {
            if (!rule.hostname || hostname.includes(rule.hostname)) {
                const ruleSelectors = Array.isArray(rule.selectors) && rule.selectors.length > 0
                    ? rule.selectors
                    : [rule.selector];
                selectors = selectors.concat(ruleSelectors.filter(Boolean));
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
            scheduleRuleRefresh();
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
        await loadCustomRules();
        injectStyles();
        console.log('🎨 [Falcon-Player-Enhance] Cosmetic Filter (播放器版) 已啟動');
    }

    init();
})();
