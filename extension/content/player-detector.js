// Player Detector v4.0 - Enhanced Player Detection
// 支援 HTML5 video, iframe 嵌入播放器, 自訂播放器框架

(function () {
    'use strict';

    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 為元素產生穩定 ID（不依賴陣列索引）
     */
    function generateStableId(element) {
        if (element.tagName === 'VIDEO' && element.src) {
            return 'v_' + hashString(element.src);
        }
        if (element.tagName === 'IFRAME' && element.src) {
            return 'i_' + hashString(element.src);
        }
        // Fallback: 用 DOM 路徑 hash（穩定，不依賴 Map 迭代順序）
        const path = getDOMPath(element);
        return 'p_' + hashString(path);
    }

    /**
     * 取得元素的 DOM 路徑（用於穩定 ID）
     */
    function getDOMPath(element) {
        const parts = [];
        let el = element;
        while (el && el !== document.body) {
            let selector = el.tagName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                parts.unshift(selector);
                break;
            }
            const parent = el.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                if (siblings.length > 1) {
                    selector += ':nth(' + siblings.indexOf(el) + ')';
                }
            }
            parts.unshift(selector);
            el = el.parentElement;
        }
        return parts.join('>');
    }

    // ========== 播放器模式識別 ==========
    const PLAYER_PATTERNS = {
        // 主流影片平台
        youtube: {
            iframeSrc: ['youtube.com/embed', 'youtube-nocookie.com/embed'],
            selectors: ['.html5-video-player', '#movie_player']
        },
        vimeo: {
            iframeSrc: ['player.vimeo.com'],
            selectors: ['.vp-video-wrapper']
        },
        dailymotion: {
            iframeSrc: ['dailymotion.com/embed'],
            selectors: ['.dmp_Player']
        },
        twitch: {
            iframeSrc: ['twitch.tv', 'player.twitch.tv'],
            selectors: ['.video-player']
        },
        // 成人影片平台 (主要使用場景)
        javboys: {
            iframeSrc: ['javboys.online', 'myvidplay', 'luluvdoo', 'streamtape', 'dood'],
            hostnames: ['javboys.online', 'javboys.com', 'poapan.xyz']
        },
        missav: {
            iframeSrc: ['missav.com', 'surrit.com'],
            hostnames: ['missav.com', 'missav.ws']
        },
        supjav: {
            iframeSrc: ['supjav.com', 'emturbovid'],
            hostnames: ['supjav.com']
        },
        jable: {
            iframeSrc: ['jable.tv'],
            hostnames: ['jable.tv']
        },
        avgle: {
            iframeSrc: ['avgle.com', 'qooqlevideo'],
            hostnames: ['avgle.com']
        },
        netflav: {
            iframeSrc: ['netflav.com'],
            hostnames: ['netflav.com']
        },
        pornhub: {
            iframeSrc: ['pornhub.com/embed'],
            hostnames: ['pornhub.com', 'pornhubpremium.com']
        },
        xvideos: {
            iframeSrc: ['xvideos.com/embedframe'],
            hostnames: ['xvideos.com']
        },
        boyfriendtv: {
            selectors: ['#videoplayer-v3'],
            hostnames: ['boyfriendtv.com']
        },
        // 自訂播放器框架
        videojs: {
            selectors: ['.video-js', '#video-js', '[class*="vjs-"]'],
            className: 'video-js'
        },
        jwplayer: {
            selectors: ['.jwplayer', '#jwplayer', '[class*="jw-"]'],
            className: 'jwplayer'
        },
        plyr: {
            selectors: ['.plyr', '.plyr__video-wrapper'],
            className: 'plyr'
        },
        flowplayer: {
            selectors: ['.flowplayer', '.fp-player'],
            className: 'flowplayer'
        },
        clappr: {
            selectors: ['.clappr-player', '[data-clappr]'],
            className: 'clappr'
        },
        // DPlayer — 開源 HTML5 播放器，gimyai.tw 等站點使用
        dplayer: {
            selectors: ['.dplayer', '#dplayer', '[class*="dplayer"]'],
            className: 'dplayer',
            hostnames: ['gimyai.tw'],
            iframeSrc: ['gimyai.tw/gimyplayer', 'gimyai.tw/static/player']
        },
        // Streameast — 體育直播聚合站，播放器由 embedsports.top 提供
        streameast: {
            iframeSrc: ['embedsports.top/embed', 'embedsports.me/embed'],
            hostnames: ['istreameast.is', 'streameast.is', 'streameast.live']
        },
        // GoGoAnime — 動漫串流站，播放器由 9animetv.be 提供
        gogoanime: {
            iframeSrc: ['9animetv.be/wp-content/plugins/video-player', 'gogoanime.'],
            hostnames: ['gogoanime.by', 'gogoanime.gg', 'gogoanime.io']
        },
        // Yahoo News — 原生 HTML5 播放器
        yahoo: {
            selectors: ['.YPlayer', '.videoPlayer', '[data-ylk*="player"]', '#player-container'],
            hostnames: ['yahoo.com', 'tw.news.yahoo.com', 'news.yahoo.com']
        },
        // bilibili - 原生 HTML5 + bpx 自訂播放器容器
        bilibili: {
            selectors: [
                '#bilibili-player',
                '.player-wrap',
                '.bpx-player-container',
                '.bpx-player-video-area',
                '.bpx-player-video-wrap'
            ],
            className: 'bpx-player',
            hostnames: ['bilibili.com'],
            iframeSrc: ['player.bilibili.com']
        },
        // X / Twitter — 推文影片常包在 data-testid 容器內
        x: {
            selectors: [
                '[data-testid="videoPlayer"]',
                '[data-testid="videoComponent"]',
                '[data-testid="tweetPhoto"] video',
                'article [aria-label*="Embedded video"]',
                'article [aria-label*="影片"]'
            ],
            hostnames: ['x.com', 'twitter.com']
        }
    };

    // 儲存已偵測到的播放器
    const detectedPlayers = new Map(); // element -> { type, platform, quality, enhanced }
    let playerCount = 0;
    let boyfriendTvInlinePlayerData = undefined;

    function parseQualityLabel(label) {
        const normalized = String(label || '').trim().toLowerCase();
        const match = normalized.match(/(\d{3,4})p/);
        const height = match ? Number(match[1]) : 0;
        return {
            resolution: height > 0 ? `${height}p` : (normalized || 'unknown'),
            width: 0,
            height
        };
    }

    function parseBoyfriendTvInlinePlayerData() {
        const hostname = window.location.hostname.toLowerCase();
        if (!hostname.includes('boyfriendtv.com')) {
            return null;
        }
        if (boyfriendTvInlinePlayerData !== undefined) {
            return boyfriendTvInlinePlayerData;
        }

        boyfriendTvInlinePlayerData = null;
        const scripts = document.querySelectorAll('script:not([src])');
        for (const script of scripts) {
            const text = script.textContent || '';
            if (!text.includes('var sources =') && !text.includes('copyEmbedUrl')) {
                continue;
            }

            const sourcesMatch = text.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
            const posterMatch = text.match(/poster:\s*'([^']+)'/);
            const embedMatch = text.match(/copyEmbedUrl:\s*'<iframe src="([^"]+)"/);

            let sources = [];
            if (sourcesMatch) {
                try {
                    sources = JSON.parse(sourcesMatch[1]);
                } catch (_) {
                    sources = [];
                }
            }

            const sortedSources = sources
                .map((source) => ({
                    ...source,
                    quality: parseQualityLabel(source?.desc || '')
                }))
                .sort((a, b) => {
                    const left = Number(a.quality?.height || 0);
                    const right = Number(b.quality?.height || 0);
                    if (right !== left) return right - left;
                    return String(b.active || '') === 'true' ? 1 : -1;
                });

            const primarySource = sortedSources[0] || null;
            const iframeSrc = embedMatch?.[1] || '';
            const poster = posterMatch?.[1] || '';

            if (!primarySource && !iframeSrc) {
                continue;
            }

            boyfriendTvInlinePlayerData = {
                iframeSrc,
                poster,
                quality: primarySource?.quality || null,
                sourceCount: sortedSources.length
            };
            break;
        }

        return boyfriendTvInlinePlayerData;
    }

    function isBoyfriendTvPrimaryContainer(element) {
        if (!element) return false;
        if (element.id === 'videoplayer-v3') return true;
        return false;
    }

    function isLikelyAdIframe(iframe, effectiveSrc) {
        const rect = iframe.getBoundingClientRect();
        const width = rect.width || parseInt(iframe.getAttribute('width') || iframe.width || '0', 10) || 0;
        const height = rect.height || parseInt(iframe.getAttribute('height') || iframe.height || '0', 10) || 0;
        const signature = [
            iframe.id || '',
            iframe.className || '',
            iframe.getAttribute('data-cklt') || '',
            effectiveSrc || ''
        ].join(' ').toLowerCase();

        if (/iframevid\d+|banner|sponsor|advert|ads?-|zoneid=|bftv-ntv|zn-square/.test(signature)) {
            return true;
        }

        return width <= 340 && height <= 300 && /zoneid=|banner|advert|bftv-ntv/.test(signature);
    }

    function hasMeaningfulIframeSource(url) {
        const normalized = String(url || '').trim();
        if (!normalized) return false;
        return !/^(about:blank|data:|javascript:)/i.test(normalized);
    }

    function shouldDetectIframePlayerCandidate(iframe, effectiveSrc) {
        if (!iframe) return false;

        const style = window.getComputedStyle(iframe);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }

        const rect = iframe.getBoundingClientRect();
        const width = rect.width || parseInt(iframe.getAttribute('width') || iframe.width || '0', 10) || 0;
        const height = rect.height || parseInt(iframe.getAttribute('height') || iframe.height || '0', 10) || 0;
        if (width <= 0 || height <= 0) {
            return false;
        }

        const className = String(iframe.className || '').toLowerCase();
        const elementId = String(iframe.id || '').toLowerCase();
        const hasPlayerContext = Boolean(
            iframe.closest?.(
                '.shield-detected-container, [class*="player"], [id*="player"], [class*="video"], [id*="video"], [data-testid="videoPlayer"], [data-testid="videoComponent"]'
            )
        );
        const hasMeaningfulSource = hasMeaningfulIframeSource(effectiveSrc);
        if (!hasMeaningfulSource && !hasPlayerContext) {
            return false;
        }

        return /player|embed|video|watch|stream|media/i.test(effectiveSrc) ||
            /player|video/i.test(className) ||
            /player|video/i.test(elementId) ||
            hasPlayerContext ||
            width > 300 ||
            height > 200;
    }

    /**
     * 識別播放器類型
     */
    function identifyPlayerType(element) {
        const tagName = element.tagName.toUpperCase();
        
        if (tagName === 'VIDEO') {
            return { type: 'html5', platform: identifyPlatformFromContext(element) };
        }
        
        if (tagName === 'IFRAME') {
            const src = element.src || '';
            for (const [platform, config] of Object.entries(PLAYER_PATTERNS)) {
                if (config.iframeSrc && config.iframeSrc.some(pattern => src.includes(pattern))) {
                    return { type: 'iframe', platform };
                }
            }
            // 通用 iframe 播放器
            if (/player|embed|video/i.test(src)) {
                return { type: 'iframe', platform: 'generic' };
            }
        }
        
        // 自訂播放器容器
        const classList = element.className?.toString() || '';
        const id = element.id || '';
        
        for (const [platform, config] of Object.entries(PLAYER_PATTERNS)) {
            if (config.className && (classList.includes(config.className) || id.includes(config.className))) {
                return { type: 'custom', platform };
            }
        }

        for (const [platform, config] of Object.entries(PLAYER_PATTERNS)) {
            if (!config.selectors) continue;
            for (const selector of config.selectors) {
                try {
                    if (element.matches && element.matches(selector)) {
                        return { type: 'custom', platform };
                    }
                } catch (e) {}
            }
        }
        
        return { type: 'custom', platform: 'unknown' };
    }

    /**
     * 從上下文識別平台
     */
    function identifyPlatformFromContext(video) {
        const hostname = window.location.hostname;
        
        for (const [platform, config] of Object.entries(PLAYER_PATTERNS)) {
            if (config.hostnames && config.hostnames.some(h => hostname.includes(h))) {
                return platform;
            }
        }
        
        // 檢查父元素的 class
        let parent = video.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            const classList = parent.className?.toString() || '';
            for (const [platform, config] of Object.entries(PLAYER_PATTERNS)) {
                if (config.selectors) {
                    for (const selector of config.selectors) {
                        if (parent.matches && parent.matches(selector)) {
                            return platform;
                        }
                    }
                }
            }
            parent = parent.parentElement;
        }
        
        return 'native';
    }

    /**
     * 偵測播放品質
     */
    function detectPlaybackQuality(video) {
        if (!video || video.tagName !== 'VIDEO') return null;
        
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        
        if (height >= 2160) return { resolution: '4K', width, height };
        if (height >= 1440) return { resolution: '1440p', width, height };
        if (height >= 1080) return { resolution: '1080p', width, height };
        if (height >= 720) return { resolution: '720p', width, height };
        if (height >= 480) return { resolution: '480p', width, height };
        if (height >= 360) return { resolution: '360p', width, height };
        if (height > 0) return { resolution: `${height}p`, width, height };
        
        return { resolution: 'unknown', width: 0, height: 0 };
    }

    /**
     * 偵測 HTML5 <video> 元素
     */
    function detectHTML5Players() {
        const videoElements = document.querySelectorAll('video');
        let newPlayers = 0;

        videoElements.forEach(video => {
            if (detectedPlayers.has(video)) return;

            // Skip videos that are clearly not main content (tiny, hidden, or zero-size)
            const rect = video.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            const isTiny = rect.width < 120 || rect.height < 80;

            // Videos with display:none or visibility:hidden or very small
            const style = window.getComputedStyle(video);
            const isHidden = style.display === 'none' || style.visibility === 'hidden';

            // Allow off-viewport videos but skip truly hidden/tiny ones
            if (isHidden || (isVisible && isTiny)) return;

            // Score the video to help rank it later
            const area = rect.width * rect.height;
            const hasAudio = !video.muted;
            const isPlaying = !video.paused;
            const score = area * 0.001 + (hasAudio ? 500 : 0) + (isPlaying ? 300 : 0) + (video.src ? 100 : 0);

            const { type, platform } = identifyPlayerType(video);
            const quality = detectPlaybackQuality(video);

            const stableId = generateStableId(video);
            detectedPlayers.set(video, {
                type,
                platform,
                quality,
                enhanced: false,
                stableId,
                score: Math.round(score),
                detectedAt: Date.now()
            });
            
            video.classList.add('shield-detected-player');
            video.dataset.shieldId = stableId;
            video.dataset.shieldPlayerType = type;
            video.dataset.shieldPlatform = platform;
            
            newPlayers++;
            console.log(`🎬 [Detector] HTML5 播放器: ${platform} [${stableId}]`, quality?.resolution || '', video);
            
            // 監聽品質變化
            video.addEventListener('loadedmetadata', () => {
                const newQuality = detectPlaybackQuality(video);
                const info = detectedPlayers.get(video);
                if (info) {
                    info.quality = newQuality;
                    console.log(`🎬 [Detector] 品質更新: ${newQuality?.resolution}`, video);
                }
            }, { once: true });
        });

        return newPlayers;
    }

    /**
     * 偵測 iframe 嵌入播放器
     */
    function detectIframePlayers() {
        const iframes = document.querySelectorAll('iframe');
        let newPlayers = 0;

        iframes.forEach(iframe => {
            if (detectedPlayers.has(iframe)) return;

            const src = iframe.src || '';
            // Also check data-src, data-lazy-src for lazy-loaded iframes
            const lazySrc = iframe.dataset.src || iframe.dataset.lazySrc || iframe.getAttribute('data-original') || '';
            const effectiveSrc = src || lazySrc;

            const { type, platform } = identifyPlayerType(iframe);
            if (isLikelyAdIframe(iframe, effectiveSrc)) return;
            if (!shouldDetectIframePlayerCandidate(iframe, effectiveSrc)) return;

            const iframeRect = iframe.getBoundingClientRect();
            const iframeArea = iframeRect.width * iframeRect.height;
            const stableId = generateStableId(iframe);
            detectedPlayers.set(iframe, {
                type,
                platform,
                quality: null,
                enhanced: false,
                stableId,
                score: Math.round(iframeArea * 0.001 + (platform !== 'generic' ? 400 : 0)),
                detectedAt: Date.now()
            });

            iframe.classList.add('shield-detected-player');
            iframe.dataset.shieldId = stableId;
            iframe.dataset.shieldPlayerType = type;
            iframe.dataset.shieldPlatform = platform;

            newPlayers++;
            console.log(`🎬 [Detector] iframe 播放器: ${platform} [${stableId}]`, effectiveSrc.substring(0, 60));
        });

        return newPlayers;
    }

    /**
     * 偵測自訂播放器容器
     */
    function detectCustomPlayers() {
        let newPlayers = 0;

        // 收集所有可能的選擇器
        const allSelectors = [];
        for (const config of Object.values(PLAYER_PATTERNS)) {
            if (config.selectors) {
                allSelectors.push(...config.selectors);
            }
        }
        
        // 添加通用模式
        allSelectors.push(
            '.video-player', '.player-container', '.video-container',
            '[id*="player"]:not(input)', '[class*="player"]:not(input)',
            '[class*="video-wrapper"]',
            '[data-testid="videoPlayer"]',
            '[data-testid="videoComponent"]'
        );

        const seen = new Set();
        
        allSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (seen.has(element) || detectedPlayers.has(element)) return;
                    seen.add(element);
                    
                    // 確保這個容器包含 video/iframe，或屬於已知的延遲主播放器容器
                    const hasVideoChild = element.querySelector('video, iframe');
                    const boyfriendTvPayload = isBoyfriendTvPrimaryContainer(element)
                        ? parseBoyfriendTvInlinePlayerData()
                        : null;
                    if (!hasVideoChild && !boyfriendTvPayload) return;

                    // If the direct child video/iframe is already detected as a standalone entry,
                    // still register the CONTAINER but link it — skip only if the container itself is already registered
                    // (already handled by seen.has(element) check above)

                    const { type, platform } = identifyPlayerType(element);
                    const stableId = generateStableId(element);
                    const rect = element.getBoundingClientRect();
                    const area = rect.width * rect.height;
                    const score = Math.round(
                        area * 0.001 +
                        (boyfriendTvPayload?.quality?.height || 0) * 3 +
                        (boyfriendTvPayload?.iframeSrc ? 5000 : 0)
                    );
                    
                    detectedPlayers.set(element, {
                        type,
                        platform: boyfriendTvPayload ? 'boyfriendtv' : platform,
                        quality: boyfriendTvPayload?.quality || null,
                        enhanced: false,
                        stableId,
                        score,
                        sourcePayload: boyfriendTvPayload ? {
                            iframeSrc: boyfriendTvPayload.iframeSrc,
                            poster: boyfriendTvPayload.poster,
                            quality: boyfriendTvPayload.quality
                        } : null,
                        isPrimaryCandidate: Boolean(boyfriendTvPayload?.iframeSrc),
                        detectedAt: Date.now()
                    });
                    
                    element.classList.add('shield-detected-container');
                    element.dataset.shieldId = stableId;
                    element.dataset.shieldPlayerType = type;
                    element.dataset.shieldPlatform = boyfriendTvPayload ? 'boyfriendtv' : platform;
                    if (boyfriendTvPayload?.iframeSrc) {
                        element.dataset.shieldResolvedIframeSrc = boyfriendTvPayload.iframeSrc;
                        element.dataset.shieldResolvedPoster = boyfriendTvPayload.poster || '';
                        element.dataset.shieldPrimaryCandidate = 'true';
                    }
                    
                    newPlayers++;
                    console.log(`🎬 [Detector] 自訂容器: ${boyfriendTvPayload ? 'boyfriendtv' : platform} [${stableId}]`, element.className || element.id);
                });
            } catch (e) {}
        });

        return newPlayers;
    }

    /**
     * 執行完整的播放器偵測
     */
    function detectAllPlayers() {
        const html5Count = detectHTML5Players();
        const iframeCount = detectIframePlayers();
        const customCount = detectCustomPlayers();

        const totalNew = html5Count + iframeCount + customCount;

        if (totalNew > 0) {
            playerCount += totalNew;
            console.log(`✓ [Detector] 新偵測 ${totalNew} 個播放器 (總計: ${playerCount})`);

            // 通知 background script
            try {
                chrome.runtime.sendMessage({
                    action: 'updatePlayerCount',
                    count: playerCount,
                    players: getPlayersInfo()
                });
            } catch (e) {}

            // 觸發自訂事件,供 player-enhancer.js 使用
            document.dispatchEvent(new CustomEvent('shieldPlayersDetected', {
                detail: {
                    players: Array.from(detectedPlayers.keys()),
                    info: getPlayersInfo()
                }
            }));
        }
        
        return totalNew;
    }

    /**
     * 取得所有播放器資訊
     */
    function getPlayersInfo() {
        const info = [];
        detectedPlayers.forEach((data, element) => {
            const stableId = data.stableId;

            let isSuspectedAd = false;
            if (element.tagName === 'VIDEO') {
                const videoWidth = element.videoWidth || 0;
                const videoHeight = element.videoHeight || 0;
                if ((videoWidth > 0 || videoHeight > 0) && (videoWidth < 320 || videoHeight < 240)) {
                    isSuspectedAd = true;
                }
                const duration = element.duration;
                if (!Number.isNaN(duration) && duration < 2) {
                    isSuspectedAd = true;
                }
            }
            if (element.closest && element.closest('[class*="ad"], [id*="ad"], [class*="sponsor"], [data-ad]')) {
                isSuspectedAd = true;
            }
            info.push({
                id: stableId,
                index: info.length,
                type: data.type,
                platform: data.platform,
                quality: data.quality,
                enhanced: data.enhanced,
                tagName: element.tagName,
                paused: element.tagName === 'VIDEO' ? element.paused : null,
                score: Number(data.score || 0),
                isPrimaryCandidate: data.isPrimaryCandidate === true,
                hasDirectSource: Boolean(data.sourcePayload?.iframeSrc || data.sourcePayload?.videoSrc || element.dataset?.shieldResolvedIframeSrc || element.dataset?.shieldResolvedVideoSrc),
                isSuspectedAd
            });
        });
        info.sort((left, right) => (Number(right.score || 0) - Number(left.score || 0)));
        return info;
    }

    /**
     * 標記播放器為已增強
     */
    function markAsEnhanced(element) {
        const info = detectedPlayers.get(element);
        if (info) {
            info.enhanced = true;
        }
    }

    /**
     * 使用 MutationObserver 監聽 DOM 變化
     */
    function observeDOMChanges() {
        let debounceTimer = null;
        
        const observer = new MutationObserver((mutations) => {
            let shouldRedetect = false;

            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) { // Element
                            if (node.tagName === 'VIDEO' || node.tagName === 'IFRAME' ||
                                node.querySelector?.('video, iframe')) {
                                shouldRedetect = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldRedetect) break;
            }

            if (shouldRedetect) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(detectAllPlayers, 300);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('👀 [Detector] MutationObserver 已啟動');
    }

    /**
     * 初始化
     */
    function init() {
        console.log('🚀 Player Detector v4.0 已載入');

        // 頁面載入時立即偵測
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                detectAllPlayers();
                applyBlockedPlayers();
            });
        } else {
            detectAllPlayers();
            applyBlockedPlayers();
        }

        // 額外延遲偵測 (處理動態載入的播放器)
        setTimeout(() => {
            detectAllPlayers();
            applyBlockedPlayers();
        }, 500);
        setTimeout(() => {
            detectAllPlayers();
            applyBlockedPlayers();
        }, 1000);

        // 啟動 DOM 監聽
        if (document.body) {
            observeDOMChanges();
        } else {
            document.addEventListener('DOMContentLoaded', observeDOMChanges);
        }
    }

    init();

    // 監聽來自 popup/background 的訊息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getPlayerCount') {
            sendResponse({ count: playerCount, players: getPlayersInfo() });
            return true;
        }
        if (request.action === 'getPlayersInfo') {
            sendResponse({ players: getPlayersInfo() });
            return true;
        }
        if (request.action === 'forceDetect') {
            const newCount = detectAllPlayers();
            sendResponse({ count: playerCount, newDetected: newCount });
            return true;
        }
        if (request.action === 'blockPlayer') {
            blockPlayerByIndex(request.index, request.playerId);
            sendResponse({ success: true });
            return true;
        }
        if (request.action === 'restorePlayer') {
            restorePlayerByIndex(request.index, request.playerId);
            sendResponse({ success: true });
            return true;
        }
    });

    function getPlayerById(playerId) {
        for (const [element, data] of detectedPlayers) {
            if (data.stableId === playerId) return element;
        }
        return document.querySelector(`[data-shield-id="${playerId}"]`) || null;
    }

    function blockPlayerByIndex(index, playerId) {
        const element = playerId ? getPlayerById(playerId) : Array.from(detectedPlayers.keys())[index];
        if (element) {
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.dataset.shieldBlocked = 'true';
            element.dataset.shieldBlockedId = playerId || '';
            console.log(`🚫 [Detector] 已封鎖播放器:`, playerId || `#${index}`);
        }
    }

    function restorePlayerByIndex(index, playerId) {
        const element = playerId ? getPlayerById(playerId) : Array.from(detectedPlayers.keys())[index];
        if (element) {
            element.style.removeProperty('display');
            element.style.removeProperty('visibility');
            delete element.dataset.shieldBlocked;
            delete element.dataset.shieldBlockedId;
            console.log(`✅ [Detector] 已恢復播放器:`, playerId || `#${index}`);
        }
    }

    /**
     * 初始化時檢查已封鎖的播放器
     */
    async function applyBlockedPlayers() {
        try {
            const hostname = window.location.hostname.replace(/^www\./, '');
            const result = await chrome.storage.local.get(['blockedPlayers']);
            const allBlocked = result.blockedPlayers || {};
            const blockedList = allBlocked[hostname] || [];
            
            if (blockedList.length === 0) return;
            
            const playersInfo = getPlayersInfo();
            
            playersInfo.forEach((player) => {
                if (blockedList.includes(player.id)) {
                    blockPlayerByIndex(-1, player.id);
                }
            });
        } catch (e) {
            console.error('[Detector] Failed to apply blocked players:', e);
        }
    }

    // 暴露 API 供其他腳本使用
    window.__ShieldPlayerDetector = {
        getPlayers: () => detectedPlayers,
        getPlayersInfo,
        getPlayerById,
        markAsEnhanced,
        detectAll: detectAllPlayers,
        blockPlayer: blockPlayerByIndex,
        restorePlayer: restorePlayerByIndex,
        PLAYER_PATTERNS
    };
})();
