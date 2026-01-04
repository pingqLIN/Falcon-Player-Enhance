// Cosmetic Filter Engine - CSS 隱藏規則引擎
// 載入並應用 CSS 規則來隱藏廣告元素

(function () {
    'use strict';

    // 內建廣告元素選擇器規則
    const BUILTIN_RULES = [
        // 常見廣告容器
        '[class*="ad-container"]',
        '[class*="ad-wrapper"]',
        '[class*="ad-banner"]',
        '[class*="advertisement"]',
        '[id*="ad-container"]',
        '[id*="ad-wrapper"]',
        '[id*="advertisement"]',
        
        // 彈出式廣告
        '[class*="popup-ad"]',
        '[class*="popunder"]',
        '[class*="overlay-ad"]',
        
        // 社交分享干擾
        '[class*="social-share-overlay"]',
        
        // 訂閱彈窗
        '[class*="newsletter-popup"]',
        '[class*="subscribe-modal"]',
        
        // 成人網站常見廣告
        '[class*="exoclick"]',
        '[class*="trafficjunky"]',
        '[class*="juicyads"]',
        '[id*="exoclick"]',
        '[id*="trafficjunky"]',
        'a[href*="exoclick.com"]',
        'a[href*="trafficjunky.com"]',
        'a[href*="juicyads.com"]',
        'iframe[src*="exoclick"]',
        'iframe[src*="trafficjunky"]',
        
        // 浮動廣告
        '[class*="floating-ad"]',
        '[class*="sticky-ad"]',
        '[class*="fixed-ad"]',
        
        // 影片播放器疊加廣告
        '[class*="video-ad-overlay"]',
        '[class*="player-ad"]',
        
        // 通用廣告屬性
        '[data-ad]',
        '[data-ad-unit]',
        '[data-adunit]',
        '[data-google-query-id]'
    ];

    // 網站特定規則
    const SITE_SPECIFIC_RULES = {
        'javboys.com': [
            '.ad-zone',
            '.banner-zone',
            '[class*="sponsor"]',
            'a[href*="agreerinfimum"]',
            'div[style*="position: fixed"][style*="z-index: 9999"]'
        ],
        'javboys.online': [
            '.ad-zone',
            '[class*="sponsor"]'
        ]
    };

    let styleElement = null;
    let customRules = [];

    // ========== 載入規則 ==========
    async function loadCustomRules() {
        try {
            const result = await chrome.storage.local.get(['hiddenElements']);
            if (result.hiddenElements) {
                customRules = result.hiddenElements;
            }
        } catch (e) {
            // 備用：從 localStorage 載入
            const stored = localStorage.getItem('__hidden_elements__');
            if (stored) {
                customRules = JSON.parse(stored);
            }
        }
    }

    // ========== 生成 CSS ==========
    function generateCSS() {
        const hostname = window.location.hostname;
        let selectors = [...BUILTIN_RULES];

        // 添加網站特定規則
        for (const [site, rules] of Object.entries(SITE_SPECIFIC_RULES)) {
            if (hostname.includes(site)) {
                selectors = selectors.concat(rules);
            }
        }

        // 添加用戶自訂規則
        for (const rule of customRules) {
            if (!rule.hostname || hostname.includes(rule.hostname)) {
                selectors.push(rule.selector);
            }
        }

        // 生成 CSS
        const css = selectors.map(sel => {
            return `${sel} { display: none !important; visibility: hidden !important; }`;
        }).join('\n');

        return css;
    }

    // ========== 注入樣式 ==========
    function injectStyles() {
        if (styleElement) {
            styleElement.remove();
        }

        styleElement = document.createElement('style');
        styleElement.id = '__cosmetic_filter_styles__';
        styleElement.textContent = generateCSS();

        // 儘早注入
        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(styleElement);
        }
    }

    // ========== 動態移除新增的廣告元素 ==========
    function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        checkAndHideElement(node);
                    }
                }
            }
        });

        // 等待 body 可用
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            });
        }
    }

    function checkAndHideElement(element) {
        const hostname = window.location.hostname;
        const allRules = [...BUILTIN_RULES];
        
        // 添加網站特定規則
        for (const [site, rules] of Object.entries(SITE_SPECIFIC_RULES)) {
            if (hostname.includes(site)) {
                allRules.push(...rules);
            }
        }

        // 檢查元素是否匹配規則
        for (const selector of allRules) {
            try {
                if (element.matches(selector)) {
                    element.style.display = 'none';
                    element.style.visibility = 'hidden';
                    console.log('🎨 [Cosmetic] 已隱藏:', selector);
                    return;
                }
            } catch (e) {
                // 無效的選擇器
            }
        }

        // 檢查特徵
        const className = element.className?.toString() || '';
        const id = element.id || '';
        
        // 偵測可疑的廣告特徵
        const suspiciousPatterns = ['ad', 'sponsor', 'banner', 'promo'];
        for (const pattern of suspiciousPatterns) {
            if (className.toLowerCase().includes(pattern) || 
                id.toLowerCase().includes(pattern)) {
                // 進一步驗證 - 檢查是否為小型元素或有廣告連結
                const links = element.querySelectorAll('a[href*="click"], a[href*="track"]');
                if (links.length > 0) {
                    element.style.display = 'none';
                    console.log('🎨 [Cosmetic] 疑似廣告已隱藏:', className || id);
                    return;
                }
            }
        }
    }

    // ========== 訊息處理 ==========
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'refreshCosmeticRules') {
            loadCustomRules().then(() => {
                injectStyles();
                sendResponse({ success: true });
            });
            return true;
        }
    });

    // ========== 初始化 ==========
    async function init() {
        console.log('🎨 Cosmetic Filter Engine 啟動中...');
        
        await loadCustomRules();
        injectStyles();
        setupMutationObserver();
        
        console.log('🎨 Cosmetic Filter Engine 已啟動');
    }

    // 立即執行
    init();
})();
