// Fake Video Remover v1.0 - 移除虛假影片元素
// 偵測並移除: 時長過短 (<2秒)、尺寸過小 (<240p) 的假影片

(function () {
    'use strict';

    // ========== 設定 ==========
    const CONFIG = {
        // 最小時長閾值 (秒) - 低於此值視為假影片
        minDuration: 2,
        // 最小高度閾值 (像素) - 低於 240p (426x240) 視為假影片
        minHeight: 240,
        minWidth: 320,
        // 是否移除 (false = 只隱藏)
        removeElement: false,
        // 檢測延遲 (等待 metadata 載入)
        checkDelay: 500,
        // 預覽友善站點: 僅針對明確預覽縮圖保守處理
        previewFriendlyDomains: [
            'youtube.com',
            'youtu.be',
            'vimeo.com',
            'twitch.tv'
        ],
        // 白名單選擇器: 符合這些選擇器的影片不處理
        whitelistSelectors: [
            '.preview-video',
            '.thumbnail-video',
            '.hover-preview',
            '[data-preview]',
            '.gif-video' // GIF 轉 video 的情況
        ]
    };
    const FAKE_VIDEO_FEATURE_KEY = 'fakeVideoRemovalEnabled';
    let blockingEnabled = false;

    function normalizeHostname(hostname) {
        return String(hostname || '').toLowerCase().replace(/^www\./, '');
    }

    function isDomainOrSubdomain(hostname, domain) {
        return hostname === domain || hostname.endsWith('.' + domain);
    }

    function resolveBlockingMode() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly', FAKE_VIDEO_FEATURE_KEY], (result) => {
                const hostname = normalizeHostname(window.location.hostname);
                const whitelist = Array.isArray(result.whitelist) ? result.whitelist.map(normalizeHostname) : [];
                const onWhitelist = whitelist.some((domain) => isDomainOrSubdomain(hostname, domain));
                const whitelistEnhanceOnly = result.whitelistEnhanceOnly !== false;
                const featureEnabled = result[FAKE_VIDEO_FEATURE_KEY] !== false;
                blockingEnabled = featureEnabled && !(onWhitelist && whitelistEnhanceOnly);
                resolve(blockingEnabled);
            });
        });
    }

    function applyFeatureToggle(enabled) {
        blockingEnabled = enabled === true;
        if (blockingEnabled) {
            setTimeout(scanAllVideos, 120);
        }
    }

    // 統計
    const stats = {
        checked: 0,
        removedByDuration: 0,
        removedBySize: 0,
        skipped: 0
    };

    // 已處理的影片
    const processedVideos = new WeakSet();

    /**
     * 檢查是否在白名單網域
     */
    function isPreviewFriendlyDomain() {
        const hostname = window.location.hostname;
        return CONFIG.previewFriendlyDomains.some(domain => hostname.includes(domain));
    }

    /**
     * 檢查影片是否匹配白名單選擇器
     */
    function isWhitelistedVideo(video) {
        // 預覽友善站點上的預覽播放器保守略過
        if (isPreviewFriendlyDomain() && (video.muted || video.loop || video.autoplay)) {
            return true;
        }

        // 檢查自身
        for (const selector of CONFIG.whitelistSelectors) {
            if (video.matches(selector)) return true;
        }
        
        // 檢查父元素 (最多往上 3 層)
        let parent = video.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            for (const selector of CONFIG.whitelistSelectors) {
                try {
                    if (parent.matches(selector)) return true;
                } catch (e) {}
            }
            parent = parent.parentElement;
        }
        
        return false;
    }

    /**
     * 檢查影片是否為主要播放器
     * 主要播放器不應被移除,即使尺寸小
     */
    function isMainPlayer(video) {
        // 已被 Falcon-Player-Enhance 偵測為播放器
        if (video.classList.contains('shield-detected-player')) return true;
        if (video.dataset.shieldPlayerType) return true;
        
        // 佔據大部分視窗
        const rect = video.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (rect.width > viewportWidth * 0.5 && rect.height > viewportHeight * 0.3) {
            return true;
        }
        
        // 有播放控制
        if (video.controls) return true;
        
        // 父元素看起來像播放器容器
        const parent = video.parentElement;
        if (parent) {
            const parentClass = parent.className?.toLowerCase() || '';
            const parentId = parent.id?.toLowerCase() || '';
            if (/player|video-container|main-video|primary/i.test(parentClass + parentId)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 檢查影片是否為廣告/假影片的特徵
     */
    function hasAdIndicators(video) {
        const src = `${video.src || ''} ${video.currentSrc || ''} ${video.poster || ''}`;
        const parent = video.parentElement;
        
        // 常見廣告來源模式
        const adPatterns = [
            /ad[sv]?[0-9]*\./i,
            /banner/i,
            /pop(up|under)/i,
            /click.*track/i,
            /pixel\./i,
            /beacon/i,
            /track(ing|er)?/i,
            /exoclick/i,
            /juicyads/i,
            /trafficjunky/i,
            /adnxs/i
        ];
        
        for (const pattern of adPatterns) {
            if (pattern.test(src)) return true;
        }
        
        // 本身或祖先帶有廣告相關 class/id/data attribute
        let cursor = video;
        for (let depth = 0; depth < 4 && cursor; depth += 1) {
            const parentStr = `${cursor.className || ''} ${cursor.id || ''} ${cursor.getAttribute?.('data-role') || ''} ${cursor.getAttribute?.('data-slot') || ''}`;
            if (/ad[sv]?[-_]|sponsor|promo|banner|vast|preroll|midroll|instream|overlay/i.test(parentStr)) {
                return true;
            }
            cursor = cursor.parentElement;
        }
        
        return false;
    }

    function isLikelyAdTrapVideo(video) {
        const rect = video.getBoundingClientRect();
        const renderedSmall = rect.width > 0 && rect.height > 0 && rect.width < 360 && rect.height < 240;
        const hiddenOrOffscreen =
            rect.width <= 2 ||
            rect.height <= 2 ||
            rect.bottom < 0 ||
            rect.right < 0 ||
            rect.left > window.innerWidth + 40 ||
            rect.top > window.innerHeight + 40;
        const autoplayTrap = video.autoplay && video.muted && !video.controls;
        const loopingPromo = video.loop && !video.controls;
        const sparseMetadata = (!video.duration || video.duration < CONFIG.minDuration) && !video.controls;
        return hiddenOrOffscreen || (renderedSmall && (autoplayTrap || loopingPromo || sparseMetadata));
    }

    /**
     * 移除或隱藏假影片
     */
    function removeFakeVideo(video, reason) {
        if (CONFIG.removeElement) {
            video.remove();
            console.log(`🗑️ [FakeVideoRemover] 已移除假影片 (${reason}):`, video.src?.substring(0, 60) || video);
        } else {
            video.style.setProperty('display', 'none', 'important');
            video.style.setProperty('visibility', 'hidden', 'important');
            video.style.setProperty('opacity', '0', 'important');
            video.style.setProperty('pointer-events', 'none', 'important');
            video.dataset.shieldFakeRemoved = reason;
            console.log(`👁️ [FakeVideoRemover] 已隱藏假影片 (${reason}):`, video.src?.substring(0, 60) || video);
        }
        
        // 停止播放,釋放資源
        try {
            video.pause();
            video.src = '';
            video.load();
        } catch (e) {}

        // 更新統計
        updateStats();
    }

    /**
     * 更新 chrome.storage 統計
     */
    function updateStats() {
        chrome.storage.local.get(['stats'], (result) => {
            const currentStats = result.stats || {};
            currentStats.fakeVideosRemoved = (currentStats.fakeVideosRemoved || 0) + 1;
            chrome.storage.local.set({ stats: currentStats });
        });
    }

    /**
     * 檢查單個影片元素
     */
    function checkVideo(video) {
        if (!blockingEnabled) return;
        // 已處理過
        if (processedVideos.has(video)) return;
        
        // 白名單影片
        if (isWhitelistedVideo(video)) {
            stats.skipped++;
            processedVideos.add(video);
            return;
        }
        
        // 主要播放器不處理
        if (isMainPlayer(video)) {
            stats.skipped++;
            processedVideos.add(video);
            return;
        }

        stats.checked++;

        // 有明確廣告特徵或陷阱播放器樣式,立即移除
        if (hasAdIndicators(video) || isLikelyAdTrapVideo(video)) {
            removeFakeVideo(video, 'ad-indicator');
            stats.removedBySize++;
            processedVideos.add(video);
            return;
        }

        // 檢查尺寸 (如果 metadata 已載入)
        const checkDimensions = () => {
            const width = video.videoWidth || video.clientWidth || 0;
            const height = video.videoHeight || video.clientHeight || 0;
            
            if (width > 0 && height > 0) {
                if ((width < CONFIG.minWidth && height < CONFIG.minHeight) || isLikelyAdTrapVideo(video)) {
                    removeFakeVideo(video, `size:${width}x${height}`);
                    stats.removedBySize++;
                    processedVideos.add(video);
                    return true;
                }
            }
            return false;
        };

        // 檢查時長
        const checkDuration = () => {
            const duration = video.duration;
            
            if (duration && isFinite(duration) && duration > 0) {
                if (duration < CONFIG.minDuration) {
                    removeFakeVideo(video, `duration:${duration.toFixed(1)}s`);
                    stats.removedByDuration++;
                    processedVideos.add(video);
                    return true;
                }
            }
            return false;
        };

        // 如果 metadata 已載入,立即檢查
        if (video.readyState >= 1) { // HAVE_METADATA
            if (checkDimensions() || checkDuration()) return;
            processedVideos.add(video);
            return;
        }

        // 等待 metadata 載入
        const onMetadata = () => {
            video.removeEventListener('loadedmetadata', onMetadata);
            video.removeEventListener('error', onError);
            clearTimeout(timeoutId);
            
            if (checkDimensions() || checkDuration()) return;
            processedVideos.add(video);
        };

        const onError = () => {
            video.removeEventListener('loadedmetadata', onMetadata);
            video.removeEventListener('error', onError);
            clearTimeout(timeoutId);
            processedVideos.add(video);
        };

        // 超時處理
        const timeoutId = setTimeout(() => {
            video.removeEventListener('loadedmetadata', onMetadata);
            video.removeEventListener('error', onError);
            
            // 超時後嘗試檢查 (可能 metadata 已部分載入)
            if (!checkDimensions() && !checkDuration()) {
                processedVideos.add(video);
            }
        }, CONFIG.checkDelay * 2);

        video.addEventListener('loadedmetadata', onMetadata, { once: true });
        video.addEventListener('error', onError, { once: true });
    }

    /**
     * 掃描頁面上所有影片
     */
    function scanAllVideos() {
        if (!blockingEnabled) return;
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            // 延遲處理,讓 player-detector 先標記主要播放器
            setTimeout(() => checkVideo(video), CONFIG.checkDelay);
        });
    }

    /**
     * 使用 MutationObserver 監聽新增的影片
     */
    function observeNewVideos() {
        const observer = new MutationObserver((mutations) => {
            if (!blockingEnabled) return;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue; // 只處理 Element
                    
                    // 直接是 video
                    if (node.tagName === 'VIDEO') {
                        setTimeout(() => checkVideo(node), CONFIG.checkDelay);
                    }
                    
                    // 包含 video 的容器
                    if (node.querySelectorAll) {
                        const videos = node.querySelectorAll('video');
                        videos.forEach(video => {
                            setTimeout(() => checkVideo(video), CONFIG.checkDelay);
                        });
                    }
                }
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    /**
     * 初始化
     */
    async function init() {
        await resolveBlockingMode();
        if (!blockingEnabled) {
            console.log('⚪ Fake Video Remover: 白名單增強模式，已停用基礎假影片清理');
            return;
        }

        console.log('🔍 Fake Video Remover v1.0 已載入');

        // 初始掃描
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(scanAllVideos, 500); // 等待 player-detector 先執行
            });
        } else {
            setTimeout(scanAllVideos, 500);
        }

        // 延遲再掃描一次 (處理動態載入)
        setTimeout(scanAllVideos, 2000);
        setTimeout(scanAllVideos, 5000);

        // 監聽新增的影片
        if (document.body) {
            observeNewVideos();
        } else {
            document.addEventListener('DOMContentLoaded', observeNewVideos);
        }
    }

    init();

    // 監聽來自 popup 的訊息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'disableBlocking') {
            blockingEnabled = false;
            sendResponse({ success: true, disabled: true });
            return true;
        }
        if (request.action === 'getFakeVideoStats') {
            sendResponse({ stats });
            return true;
        }
        if (request.action === 'scanFakeVideos') {
            scanAllVideos();
            sendResponse({ success: true, stats });
            return true;
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes[FAKE_VIDEO_FEATURE_KEY]) return;
        applyFeatureToggle(changes[FAKE_VIDEO_FEATURE_KEY].newValue !== false);
    });

    // 暴露 API
    window.__ShieldFakeVideoRemover = {
        getStats: () => ({ ...stats }),
        scan: scanAllVideos,
        checkVideo,
        CONFIG
    };
})();
