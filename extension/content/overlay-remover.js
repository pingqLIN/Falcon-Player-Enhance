// Overlay Remover v4.0 - 專用覆蓋層精準移除
// 針對播放器上方的廣告覆蓋層進行偵測與移除

(function () {
    'use strict';

    const MAX_Z_INDEX = 2147483647;
    const BASE_PROCESS_INTERVAL_MS = 3000;
    let processIntervalMs = BASE_PROCESS_INTERVAL_MS;
    let processLoopTimer = null;
    let blockingEnabled = false;
    let aiPolicy = {
        riskTier: 'low',
        overlayScanMs: BASE_PROCESS_INTERVAL_MS,
        sensitivityBoost: 0,
        policyGate: {
            tier: 'T1',
            mode: 'advisory-only',
            allowReversibleActions: false,
            allowedActions: []
        }
    };

    function normalizeHostname(hostname) {
        return String(hostname || '').toLowerCase().replace(/^www\./, '');
    }

    function isDomainOrSubdomain(hostname, domain) {
        return hostname === domain || hostname.endsWith('.' + domain);
    }

    function resolveBlockingMode() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly'], (result) => {
                const hostname = normalizeHostname(window.location.hostname);
                const whitelist = Array.isArray(result.whitelist) ? result.whitelist.map(normalizeHostname) : [];
                const onWhitelist = whitelist.some((domain) => isDomainOrSubdomain(hostname, domain));
                const whitelistEnhanceOnly = result.whitelistEnhanceOnly !== false;
                blockingEnabled = !(onWhitelist && whitelistEnhanceOnly);
                resolve(blockingEnabled);
            });
        });
    }

    // ========== 覆蓋層特徵識別 ==========
    const OVERLAY_SIGNATURES = {
        // 透明點擊劫持層
        transparentClick: {
            check: (style) => {
                const opacity = parseFloat(style.opacity);
                const bg = style.backgroundColor;
                return (opacity < 0.3 || opacity === 0) ||
                       bg === 'transparent' ||
                       bg === 'rgba(0, 0, 0, 0)' ||
                       bg.startsWith('rgba(') && parseFloat(bg.split(',')[3]) < 0.1;
            }
        },
        // 全螢幕覆蓋
        fullscreen: {
            check: (style, rect, viewport) => {
                const isFullWidth = rect.width >= viewport.width * 0.9;
                const isFullHeight = rect.height >= viewport.height * 0.9;
                const isFixed = style.position === 'fixed';
                return isFixed && (isFullWidth || isFullHeight);
            }
        },
        // inset-0 樣式 (Tailwind 常用)
        insetZero: {
            check: (style) => {
                return style.inset === '0px' ||
                       (style.top === '0px' && style.right === '0px' && 
                        style.bottom === '0px' && style.left === '0px');
            }
        },
        // 高 z-index 定位元素
        highZIndex: {
            check: (style) => {
                const zIndex = parseInt(style.zIndex) || 0;
                const isPositioned = style.position === 'absolute' || style.position === 'fixed';
                return isPositioned && zIndex > 100;
            }
        }
    };

    // 廣告內容關鍵字
    const AD_KEYWORDS = [
        'casino', 'bet', 'betting', 'gambl', 'slot', 'poker',
        'cam', 'chat', 'live', 'meet', 'dating', 'single',
        'crypto', 'bitcoin', 'forex', 'trade',
        'click here', 'download now', 'install', 'play now',
        'advertisement', 'advertiser', 'sponsored', 'promo',
        'skip ad', 'close ad', 'continue', 'continue to site',
        'allow notifications', 'watch now', 'unlock', 'hot',
        'sexy', 'xxx', 'adult', 'porn'
    ];

    // 廣告網絡特徵
    const AD_NETWORK_PATTERNS = [
        'exoclick', 'juicyads', 'trafficjunky', 'trafficstars',
        'plugrush', 'popads', 'popcash', 'propellerads',
        'adsterra', 'clickadu', 'revcontent', 'outbrain',
        'taboola', 'mgid', 'adskeeper', 'hilltopads'
    ];

    const SAFE_MEDIA_HOST_PATTERNS = [
        'javboys.com',
        'javboys.online',
        'luluvdoo.com',
        'myvidplay.com',
        'upn.one'
    ];

    // 播放器控制項白名單
    const PLAYER_CONTROLS_WHITELIST = [
        // Video.js
        '.vjs-control-bar', '.vjs-control', '.vjs-button', '.vjs-slider',
        '.vjs-progress-holder', '.vjs-play-progress', '.vjs-load-progress',
        '.vjs-volume-panel', '.vjs-menu', '.vjs-time-control',
        // JW Player
        '.jw-controlbar', '.jw-button-container', '.jw-slider-time',
        '.jw-icon', '.jw-display', '.jw-preview',
        // Plyr
        '.plyr__controls', '.plyr__control', '.plyr__progress',
        '.plyr__volume', '.plyr__menu',
        // YouTube
        '.ytp-chrome-bottom', '.ytp-chrome-controls', '.ytp-progress-bar',
        '.ytp-button', '.ytp-time-display',
        // 通用
        '[class*="control"]', '[class*="progress"]', '[class*="volume"]',
        '[class*="play-button"]', '[class*="pause-button"]', '[class*="fullscreen"]',
        '[class*="timeline"]', '[class*="scrubber"]', '[class*="seek"]',
        // Falcon-Player-Enhance 內部元素
        '[data-shield-internal]', '.shield-popup-player-btn', '.shield-video-tooltip'
    ];

    // ========== 年齡驗證守衛 ==========
    const AGE_GATE_KEYWORDS = [
        'age verification', 'verify your age', 'confirm your age',
        'must be 18', 'must be over', 'are you 18', 'i am 18',
        'enter your age', 'years of age', 'i confirm', 'i am over',
        'leave this site', 'by entering', 'legal age',
        '18 years', '18+', 'you must be at least', 'enter site',
        'confirm i am', 'adults only', 'enter now'
    ];

    const AGE_GATE_CLASS_SIGNALS = [
        'age-gate', 'agegate', 'age-check', 'agecheck',
        'age-verify', 'ageverif', 'age-wall', 'agewall',
        'age-modal', 'age-overlay', 'age-confirm'
    ];

    /**
     * 判斷元素是否為年齡驗證對話框（應保留，不得移除）
     */
    function isAgeVerificationOverlay(element) {
        if (!element) return false;

        // 檢查 class / id 是否含有年齡驗證語意
        const className = (element.className || '').toString().toLowerCase();
        const id = (element.id || '').toLowerCase();
        const combined = className + ' ' + id;
        if (AGE_GATE_CLASS_SIGNALS.some(s => combined.includes(s))) return true;

        // 檢查文字內容是否包含年齡驗證關鍵字
        const text = (element.innerText || element.textContent || '').toLowerCase().substring(0, 1000);
        const keywordMatches = AGE_GATE_KEYWORDS.filter(kw => text.includes(kw)).length;
        if (keywordMatches >= 1) {
            // 同時含有互動元件（按鈕/連結/表單）才確認為年齡驗證
            const hasInteraction = !!(element.querySelector(
                'button, a[href], input[type="submit"], input[type="button"], form, ' +
                'select[name*="age"], input[name*="age"], input[name*="birth"]'
            ));
            if (hasInteraction) return true;
        }

        // 檢查祖先是否已標記為年齡驗證
        let ancestor = element.parentElement;
        let depth = 0;
        while (ancestor && depth < 5) {
            const aClass = (ancestor.className || '').toString().toLowerCase();
            const aId = (ancestor.id || '').toLowerCase();
            if (AGE_GATE_CLASS_SIGNALS.some(s => (aClass + ' ' + aId).includes(s))) return true;
            ancestor = ancestor.parentElement;
            depth++;
        }

        return false;
    }

    let removedCount = 0;
    let processedElements = new WeakSet();

    function isSafeMediaHost() {
        const host = (window.location.hostname || '').toLowerCase();
        return SAFE_MEDIA_HOST_PATTERNS.some(pattern => host.includes(pattern));
    }

    function containsProtectedMedia(element) {
        if (!element || !element.querySelector) return false;
        return Boolean(
            element.querySelector(
                'video, iframe, .shield-detected-player, [data-shield-player-type], [data-shield-id]'
            )
        );
    }

    function getOverlapRatio(rect, targetRect) {
        if (!rect || !targetRect) return 0;
        const left = Math.max(rect.left, targetRect.left);
        const top = Math.max(rect.top, targetRect.top);
        const right = Math.min(rect.right, targetRect.right);
        const bottom = Math.min(rect.bottom, targetRect.bottom);
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        const overlapArea = width * height;
        const targetArea = Math.max(1, targetRect.width * targetRect.height);
        return overlapArea / targetArea;
    }

    function hasInteractiveTrapContent(element) {
        if (!element) return false;
        if (element.matches?.('a[href], button, [role="button"]')) return true;
        const clickableChildren = element.querySelectorAll?.('a[href], button, [role="button"], input[type="button"], input[type="submit"]') || [];
        return clickableChildren.length > 0;
    }

    function hasAggressiveOverlaySignals(element, style, rect, playerRect) {
        const zIndex = parseInt(style.zIndex) || 0;
        const overlapRatio = playerRect ? getOverlapRatio(rect, playerRect) : 0;
        const viewportCoverage =
            (Math.max(0, rect.width) * Math.max(0, rect.height)) /
            Math.max(1, window.innerWidth * window.innerHeight);
        const backdropLike =
            style.position === 'fixed' &&
            (style.backgroundColor || '').startsWith('rgba(') &&
            !containsProtectedMedia(element);

        return (
            (overlapRatio >= 0.4 && hasInteractiveTrapContent(element)) ||
            (zIndex > 1500 && overlapRatio >= 0.25) ||
            (viewportCoverage >= 0.18 && backdropLike) ||
            (style.position === 'fixed' && rect.height >= 48 && rect.height <= 260 && rect.width >= window.innerWidth * 0.35)
        );
    }

    function isPlayerStructureElement(element, player) {
        if (!element || !player) return false;
        if (element === player) return true;
        if (player.contains && player.contains(element)) return true;
        if (element.contains && element.contains(player)) return true;
        if (containsProtectedMedia(element)) return true;
        return false;
    }

    function reportAiTelemetry(type, options = {}) {
        try {
            chrome.runtime.sendMessage({
                action: 'aiTelemetry',
                events: [
                    {
                        type,
                        source: 'overlay-remover',
                        severity: Number(options.severity || 1),
                        confidence: Number(options.confidence || 0.8),
                        detail: options.detail || {},
                        ts: Date.now()
                    }
                ],
                context: {
                    source: 'overlay-remover',
                    hostname: window.location.hostname,
                    url: window.location.href
                }
            });
        } catch (e) {}
    }

    function applyAiPolicy(policy) {
        if (!policy || typeof policy !== 'object') return;
        aiPolicy = {
            ...aiPolicy,
            ...policy,
            policyGate: {
                ...aiPolicy.policyGate,
                ...(policy.policyGate || {})
            }
        };

        const allowedActions = Array.isArray(aiPolicy.policyGate?.allowedActions)
            ? aiPolicy.policyGate.allowedActions
            : [];
        const allowOverlayTuning =
            aiPolicy.policyGate?.allowReversibleActions === true &&
            allowedActions.includes('tune_overlay_scan');
        const nextMs = allowOverlayTuning
            ? Number(aiPolicy.overlayScanMs || BASE_PROCESS_INTERVAL_MS)
            : BASE_PROCESS_INTERVAL_MS;
        processIntervalMs = Math.max(600, Math.min(5000, nextMs));
        scheduleProcessLoop();
    }

    function scheduleProcessLoop() {
        if (!blockingEnabled) return;
        if (processLoopTimer) {
            clearInterval(processLoopTimer);
        }
        processLoopTimer = setInterval(processAllPlayers, processIntervalMs);
    }

    /**
     * 檢查元素是否為播放器控制項
     */
    function isPlayerControl(element) {
        // 檢查選擇器白名單
        for (const selector of PLAYER_CONTROLS_WHITELIST) {
            try {
                if (element.matches(selector)) return true;
                if (element.closest(selector)) return true;
            } catch (e) {}
        }
        
        // 檢查 class/id 名稱
        const className = (element.className || '').toString().toLowerCase();
        const id = (element.id || '').toLowerCase();
        const combined = className + ' ' + id;
        
        const controlKeywords = [
            'control', 'bar', 'timeline', 'progress', 'scrubber', 'rail',
            'icon', 'button', 'play', 'pause', 'volume', 'fullscreen',
            'ui', 'layer', 'menu', 'tooltip', 'time', 'duration', 'seek'
        ];
        
        return controlKeywords.some(keyword => combined.includes(keyword));
    }

    /**
     * 檢查元素是否為主要頁面容器（不應被隱藏）
     */
    function isMainPageContainer(element) {
        // 檢查 ID
        const id = (element.id || '').toLowerCase();
        const mainIdPatterns = ['site', 'wrapper', 'container', 'content', 'main', 'page', 'app', 'root'];
        if (id && mainIdPatterns.some(p => id.includes(p))) {
            return true;
        }
        
        // 檢查是否包含大量連結（主容器特徵）
        const linkCount = element.querySelectorAll('a[href]').length;
        if (linkCount > 20) {
            return true;
        }
        
        // 檢查是否佔據大部分視窗
        const rect = element.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) {
            return true;
        }
        
        return false;
    }

    /**
     * 檢查元素是否包含廣告內容
     */
    function hasAdContent(element) {
        const text = `${element.innerText || ''} ${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('title') || ''}`.toLowerCase().substring(0, 500);
        const className = (element.className || '').toString().toLowerCase();
        const id = (element.id || '').toLowerCase();
        const href = element.href || '';
        
        // 檢查廣告關鍵字
        if (AD_KEYWORDS.some(keyword => text.includes(keyword))) {
            return true;
        }
        
        // 檢查 class/id
        const classIdCombined = `${className} ${id}`;
        const adClassRegexes = [
            /(^|[\s_-])ads?($|[\s_-])/i,
            /(banner|popup|overlay|interstitial|modal|sponsor|promo|preroll|midroll|adslot|ads?-container)/i
        ];
        if (adClassRegexes.some(regex => regex.test(classIdCombined))) {
            return true;
        }
        
        // 檢查廣告網絡連結
        const allLinks = element.querySelectorAll ? 
            Array.from(element.querySelectorAll('a')).map(a => a.href).join(' ') : '';
        const combinedLinks = `${href} ${allLinks} ${(element.getAttribute?.('data-href') || '')}`;
        
        if (AD_NETWORK_PATTERNS.some(pattern => combinedLinks.includes(pattern))) {
            return true;
        }
        
        return false;
    }

    /**
     * 檢查元素是否為覆蓋層
     */
    function isOverlay(element, playerRect) {
        if (processedElements.has(element)) return false;
        
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // 檢查是否與播放器重疊
        if (playerRect) {
            const isOverlapping = !(
                rect.right < playerRect.left ||
                rect.left > playerRect.right ||
                rect.bottom < playerRect.top ||
                rect.top > playerRect.bottom
            );
            if (!isOverlapping) return false;
        }
        
        // 檢查各種覆蓋層特徵
        let matchedSignatures = 0;
        
        for (const [name, signature] of Object.entries(OVERLAY_SIGNATURES)) {
            if (signature.check(style, rect, viewport)) {
                matchedSignatures++;
            }
        }
        
        // 兩個以上特徵才判定為覆蓋層，降低誤殺播放器容器
        if (matchedSignatures >= 2) return true;

        if (hasAggressiveOverlaySignals(element, style, rect, playerRect)) {
            return true;
        }

        // 單一特徵時僅接受高風險情境（極高 z-index + fixed）
        const zIndex = parseInt(style.zIndex) || 0;
        return matchedSignatures === 1 && style.position === 'fixed' && zIndex > 3000;
    }

    /**
     * 移除播放器上的覆蓋層
     */
    function removePlayerOverlays(player) {
        const playerRect = player.getBoundingClientRect();
        
        // 只處理可見的播放器
        if (playerRect.width < 50 || playerRect.height < 50) return 0;
        
        let localRemoved = 0;

        // 方法 1: elementsFromPoint 精確偵測
        const points = [
            { x: playerRect.left + playerRect.width / 2, y: playerRect.top + playerRect.height / 2 },
            { x: playerRect.left + playerRect.width * 0.25, y: playerRect.top + playerRect.height * 0.25 },
            { x: playerRect.left + playerRect.width * 0.75, y: playerRect.top + playerRect.height * 0.75 }
        ];
        
        const checkedAtPoint = new Set();
        
        points.forEach(point => {
            try {
                const elements = document.elementsFromPoint(point.x, point.y);
                
                elements.forEach(element => {
                    if (checkedAtPoint.has(element)) return;
                    checkedAtPoint.add(element);
                    
                    // 跳過合法元素
                    if (isPlayerStructureElement(element, player)) return;
                    if (element.tagName === 'HTML' || element.tagName === 'BODY') return;
                    if (element.tagName === 'VIDEO' || element.tagName === 'IFRAME') return;
                    if (isPlayerControl(element)) return;
                    if (processedElements.has(element)) return;
                    if (isSafeMediaHost() && containsProtectedMedia(element)) return;
                    
                    const style = window.getComputedStyle(element);
                    
                    // 檢測透明覆蓋層
                    if (OVERLAY_SIGNATURES.transparentClick.check(style)) {
                        // 重要：不要對包含連結或重要內容的容器禁用點擊
                        const hasLinks = element.querySelector('a[href]');
                        const hasButtons = element.querySelector('button, input, select');
                        const isMainContainer = element.id && (
                            element.id.includes('site') || 
                            element.id.includes('content') || 
                            element.id.includes('main') ||
                            element.id.includes('wrapper') ||
                            element.id.includes('container')
                        );
                        const isLargeContainer = element.offsetWidth > window.innerWidth * 0.5 &&
                                                  element.offsetHeight > window.innerHeight * 0.3;
                        
                        const overlapRatio = getOverlapRatio(element.getBoundingClientRect(), playerRect);
                        const looksLikeTrap =
                            hasAdContent(element) ||
                            hasInteractiveTrapContent(element) ||
                            overlapRatio >= 0.45;

                        // 小型透明層或高重疊陷阱層禁用點擊
                        if ((!hasLinks && !hasButtons && !isMainContainer && !isLargeContainer) || (looksLikeTrap && !isMainContainer)) {
                            // 保護年齡驗證對話框
                            if (isAgeVerificationOverlay(element)) return;

                            processedElements.add(element);
                            element.style.setProperty('pointer-events', 'none', 'important');
                            element.dataset.shieldHidden = 'pointer-events-none';
                            localRemoved++;
                            console.log('🎯 [Overlay] 禁用透明層:', element.className || element.tagName);
                        }
                    }
                    
                    // 檢測廣告覆蓋層
                    if (hasAdContent(element) && isOverlay(element, playerRect)) {
                        // 保護主容器
                        if (isMainPageContainer(element)) return;
                        // 保護年齡驗證對話框
                        if (isAgeVerificationOverlay(element)) return;
                        
                        processedElements.add(element);
                        element.style.setProperty('display', 'none', 'important');
                        element.dataset.shieldHidden = 'display-none';
                        localRemoved++;
                        console.log('🗑️ [Overlay] 移除廣告層:', element.className || element.tagName);
                    }
                });
            } catch (e) {}
        });

        // 方法 2: 遍歷可疑元素
        const suspiciousElements = document.querySelectorAll(
            'div[style*="position"], div[class*="overlay"], div[class*="modal"], div[class*="banner"], div[class*="ads"], aside, section[style*="z-index"], a[style*="position"], iframe[style*="position"]'
        );
        
        suspiciousElements.forEach(element => {
            if (isPlayerStructureElement(element, player)) return;
            if (isPlayerControl(element)) return;
            if (processedElements.has(element)) return;
            if (isSafeMediaHost() && containsProtectedMedia(element)) return;
            
            if (isOverlay(element, playerRect) && hasAdContent(element)) {
                // 保護主容器
                if (isMainPageContainer(element)) return;
                if (containsProtectedMedia(element)) return;
                // 保護年齡驗證對話框
                if (isAgeVerificationOverlay(element)) return;
                
                processedElements.add(element);
                element.style.setProperty('display', 'none', 'important');
                element.dataset.shieldRemoved = 'true';
                element.dataset.shieldHidden = 'display-none';
                localRemoved++;
                console.log('🗑️ [Overlay] 移除覆蓋元素:', element.className || element.id);
            }
        });

        return localRemoved;
    }

    /**
     * 移除全域覆蓋層 (不限於播放器上方)
     */
    function removeGlobalOverlays() {
        let localRemoved = 0;
        
        // inset-0 覆蓋層
        const insetOverlays = document.querySelectorAll('[class*="inset-0"], [style*="inset: 0"]');
        insetOverlays.forEach(element => {
            if (isPlayerControl(element)) return;
            if (processedElements.has(element)) return;
            if (element.querySelector('video, iframe')) return; // 包含播放器的容器
            if (isSafeMediaHost() && containsProtectedMedia(element)) return;
            
            const style = window.getComputedStyle(element);
            if (OVERLAY_SIGNATURES.insetZero.check(style)) {
                // 檢查是否是純覆蓋層（無有意義內容）
                const hasSignificantContent = element.querySelector('video, iframe, form, input, img');
                if (!hasSignificantContent && hasAdContent(element)) {
                    // 保護主容器
                    if (isMainPageContainer(element)) return;
                    // 保護年齡驗證對話框
                    if (isAgeVerificationOverlay(element)) return;
                    
                    processedElements.add(element);
                    element.style.setProperty('display', 'none', 'important');
                    element.dataset.shieldHidden = 'display-none';
                    localRemoved++;
                    console.log('🗑️ [Overlay] 移除 inset-0 覆蓋:', element.className);
                }
            }
        });
        
        // 高 z-index 覆蓋層
        const highZElements = document.querySelectorAll('[style*="z-index"]');
        highZElements.forEach(element => {
            if (isPlayerControl(element)) return;
            if (processedElements.has(element)) return;
            if (containsProtectedMedia(element)) return;
            
            const style = window.getComputedStyle(element);
            const zIndex = parseInt(style.zIndex) || 0;
            
            if (zIndex > 9000 && OVERLAY_SIGNATURES.fullscreen.check(style, element.getBoundingClientRect(), {
                width: window.innerWidth,
                height: window.innerHeight
            })) {
                if (hasAdContent(element)) {
                    // 保護主容器
                    if (isMainPageContainer(element)) return;
                    // 保護年齡驗證對話框
                    if (isAgeVerificationOverlay(element)) return;
                    
                    processedElements.add(element);
                    element.style.setProperty('display', 'none', 'important');
                    element.dataset.shieldHidden = 'display-none';
                    localRemoved++;
                    console.log('🗑️ [Overlay] 移除高 z-index 覆蓋:', element.className);
                }
            }
        });
        
        return localRemoved;
    }

    /**
     * 處理所有播放器的覆蓋層
     */
    function processAllPlayers() {
        if (!blockingEnabled) return;
        const players = document.querySelectorAll(
            '.shield-detected-player, .shield-detected-container, .player-enhanced-active, video, iframe[src*="player"], iframe[src*="embed"]'
        );
        
        let totalRemoved = 0;
        
        players.forEach(player => {
            totalRemoved += removePlayerOverlays(player);
        });
        
        totalRemoved += removeGlobalOverlays();
        
        if (totalRemoved > 0) {
            removedCount += totalRemoved;
            console.log(`✓ [Overlay] 本次移除 ${totalRemoved} 個覆蓋層 (總計: ${removedCount})`);
            
            // 通知統計
            try {
                chrome.runtime.sendMessage({
                    action: 'updateOverlayStats',
                    removed: totalRemoved,
                    total: removedCount
                });
            } catch (e) {}

            reportAiTelemetry('overlay_removed', {
                severity: Math.min(1.9, 0.8 + totalRemoved * 0.04),
                confidence: 0.84,
                detail: {
                    totalRemoved,
                    cumulativeRemoved: removedCount,
                    processIntervalMs
                }
            });
        }
    }

    /**
     * 初始化
     */
    async function init() {
        await resolveBlockingMode();
        if (!blockingEnabled) {
            console.log('⚪ Overlay Remover: 白名單增強模式，已停用基礎覆蓋層清理');
            return;
        }

        console.log('🚀 Overlay Remover v4.0 已載入');

        // 監聽播放器偵測事件
        document.addEventListener('shieldPlayersDetected', (event) => {
            console.log(`📡 [Overlay] 收到播放器偵測事件`);
            setTimeout(processAllPlayers, 100);
        });

        // 初始處理
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(processAllPlayers, 500));
        } else {
            setTimeout(processAllPlayers, 500);
        }

        // 定期檢查（可由 AI 策略動態調整）
        scheduleProcessLoop();

        // DOM 變化監控
        const observer = new MutationObserver((mutations) => {
            if (!blockingEnabled) return;
            let shouldProcess = false;
            
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && !processedElements.has(node)) {
                            const style = node.style;
                            if (style && (style.position || style.zIndex)) {
                                shouldProcess = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldProcess) break;
            }
            
            if (shouldProcess) {
                setTimeout(processAllPlayers, 200);
            }
        });
        
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'disableBlocking') {
            blockingEnabled = false;
            if (processLoopTimer) {
                clearInterval(processLoopTimer);
                processLoopTimer = null;
            }
            sendResponse({ success: true, disabled: true });
            return true;
        }

        if (request.action === 'applyAiPolicy') {
            applyAiPolicy(request.policy || {});
            sendResponse({ success: true, interval: processIntervalMs });
            return true;
        }

        if (request.action === 'clearAIPolicy' || request.action === 'disableAiMonitor') {
            applyAiPolicy({
                riskTier: 'low',
                overlayScanMs: BASE_PROCESS_INTERVAL_MS,
                sensitivityBoost: 0
            });
            sendResponse({ success: true, reset: true });
            return true;
        }

        return false;
    });

    init();

    // 暴露 API
    window.__ShieldOverlayRemover = {
        processAllPlayers,
        removePlayerOverlays,
        getStats: () => ({ removed: removedCount }),
        OVERLAY_SIGNATURES,
        AD_KEYWORDS
    };
})();
