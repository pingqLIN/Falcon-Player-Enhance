// Player Detector v4.0 - Enhanced Player Detection
// 支援 HTML5 video, iframe 嵌入播放器, 自訂播放器框架

(function () {
    'use strict';

    function shouldRunMediaAutomation() {
        const helper = window.__ShieldSiteStateHelper;
        if (helper?.shouldRunMediaAutomation) {
            return helper.shouldRunMediaAutomation(window.location.hostname);
        }
        return true;
    }

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
    const MIN_VIDEO_WIDTH = 120;
    const MIN_VIDEO_HEIGHT = 80;
    const MIN_GENERIC_IFRAME_WIDTH = 320;
    const MIN_GENERIC_IFRAME_HEIGHT = 180;
    const MIN_GENERIC_IFRAME_AREA = 70000;

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

    function buildElementSignature(element, source = '') {
        if (!element) return '';
        return [
            element.className || '',
            element.id || '',
            element.getAttribute?.('aria-label') || '',
            element.getAttribute?.('title') || '',
            element.getAttribute?.('data-testid') || '',
            source || ''
        ].join(' ').toLowerCase();
    }

    function hasPreviewIndicators(signature) {
        return /preview|thumbnail|hover-preview|hoverpreview|placeholder|cover|teaser/.test(signature);
    }

    function hasAdIndicators(signature, element = null) {
        if (/(^|[\W_])(ad|ads|advert|banner|sponsor|promo|vast|preroll|midroll|instream|zoneid)([\W_]|$)/.test(signature)) {
            return true;
        }
        if (/exoclick|juicyads|trafficjunky|doubleclick|googlesyndication|adservice|adsystem|magsrv|popads/i.test(signature)) {
            return true;
        }
        if (!element?.closest) return false;
        return Boolean(element.closest('[data-ad], [data-ads], [class*="sponsor"], [class*="banner"], [id*="sponsor"], [id*="banner"], [class*="ad-"], [id*="ad-"]'));
    }

    function isElementEffectivelyVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function normalizeMediaUrl(url) {
        const normalized = String(url || '').trim();
        if (!normalized) return '';
        if (/^(about:blank|data:|javascript:|blob:|mediastream:)/i.test(normalized)) {
            return '';
        }
        return normalized;
    }

    function getVideoPlayableSource(video) {
        if (!video) return '';
        const sourceCandidates = Array.from(video.querySelectorAll?.('source[src]') || [])
            .map((source) => source.src || source.getAttribute('src') || '');
        for (const candidate of [
            video.currentSrc || '',
            video.src || '',
            ...sourceCandidates,
            video.getAttribute?.('src') || '',
            video.dataset?.src || ''
        ]) {
            const normalized = normalizeMediaUrl(candidate);
            if (normalized) return normalized;
        }
        return '';
    }

    function isXFeedVideoCandidate(video, rect = video?.getBoundingClientRect?.()) {
        if (!video?.closest) return false;
        const platform = identifyPlatformFromContext(video);
        if (platform !== 'x') {
            return false;
        }

        const area = Math.round((rect?.width || 0) * (rect?.height || 0));
        if ((rect?.width || 0) < 220 || (rect?.height || 0) < 120 || area < 50000) {
            return false;
        }

        return Boolean(
            video.closest('[data-testid="tweet"] [data-testid="videoPlayer"], [data-testid="tweet"] [data-testid="videoComponent"], article[data-testid="tweet"] [data-testid="videoPlayer"], article[data-testid="tweet"] [data-testid="videoComponent"]')
        );
    }

    function buildAncestorSignature(element, depth = 5) {
        const segments = [];
        let cursor = element?.parentElement || null;

        for (let index = 0; index < depth && cursor; index += 1) {
            segments.push([
                cursor.tagName || '',
                cursor.id || '',
                cursor.className || '',
                cursor.getAttribute?.('data-testid') || '',
                cursor.getAttribute?.('role') || ''
            ].join(' '));
            cursor = cursor.parentElement;
        }

        return segments.join(' ').toLowerCase();
    }

    function isLinkedNavigationPreview(video, rect, signature) {
        if (!video?.closest) return false;
        if (video.controls) return false;
        if (isXFeedVideoCandidate(video, rect)) return false;

        const navigationAnchor = video.closest('a[href], [role="link"]');
        if (!navigationAnchor) return false;

        const navigationSignature = [
            signature,
            buildAncestorSignature(video, 6),
            navigationAnchor.id || '',
            navigationAnchor.className || '',
            navigationAnchor.getAttribute?.('aria-label') || ''
        ].join(' ').toLowerCase();

        if (!/thumbnail|preview|card|tile|grid|renderer|reel|shorts|shelf/.test(navigationSignature)) {
            return false;
        }

        const area = Math.round((rect?.width || 0) * (rect?.height || 0));
        if ((rect?.width || 0) < 220 || (rect?.height || 0) < 120 || area < 50000) {
            return false;
        }

        return true;
    }

    function evaluateVideoEligibility(video) {
        const rect = video.getBoundingClientRect();
        const style = window.getComputedStyle(video);
        const signature = buildElementSignature(video, [
            video.currentSrc || '',
            video.src || '',
            video.poster || ''
        ].join(' '));
        const isXFeedCandidate = isXFeedVideoCandidate(video, rect);
        const isHidden = style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
        if (isHidden || rect.width <= 0 || rect.height <= 0) {
            return { eligible: false, reason: 'hidden', isSuspectedAd: false, signalScore: -1000 };
        }

        if (rect.width < MIN_VIDEO_WIDTH || rect.height < MIN_VIDEO_HEIGHT) {
            return { eligible: false, reason: 'tiny', isSuspectedAd: false, signalScore: -800 };
        }

        if (hasPreviewIndicators(signature)) {
            return { eligible: false, reason: 'preview', isSuspectedAd: false, signalScore: -1200 };
        }

        if (hasAdIndicators(signature, video)) {
            return { eligible: false, reason: 'ad-indicator', isSuspectedAd: true, signalScore: -5000 };
        }

        if (isLinkedNavigationPreview(video, rect, signature)) {
            return { eligible: false, reason: 'linked-preview-card', isSuspectedAd: false, signalScore: -1700 };
        }

        const duration = Number(video.duration || 0);
        const autoplayTrap = video.autoplay && video.muted && !video.controls &&
            (video.loop || (duration > 0 && duration < 2) || (!isXFeedCandidate && (rect.width < 360 || rect.height < 240)));
        if (autoplayTrap) {
            return { eligible: false, reason: 'trap-profile', isSuspectedAd: true, signalScore: -4500 };
        }

        const playableSource = getVideoPlayableSource(video);
        const area = rect.width * rect.height;
        if (!playableSource && video.readyState < 1 && video.paused && duration <= 0 && !isXFeedCandidate) {
            return { eligible: false, reason: 'placeholder', isSuspectedAd: false, signalScore: -1500 };
        }
        if (!video.controls && video.paused && video.muted && duration <= 0 && area < 220000 && !isXFeedCandidate) {
            return { eligible: false, reason: 'weak-signal-muted', isSuspectedAd: false, signalScore: -1600 };
        }
        if (!video.controls && duration > 0 && duration < 2) {
            return { eligible: false, reason: 'short-loop', isSuspectedAd: true, signalScore: -3000 };
        }

        const signalScore = Math.round(
            area * 0.001 +
            (video.controls ? 300 : 0) +
            (!video.muted ? 500 : 0) +
            (!video.paused ? 1200 : 0) +
            (playableSource ? 400 : 0)
        );

        return { eligible: true, reason: 'eligible', isSuspectedAd: false, signalScore };
    }

    function evaluateIframeEligibility(iframe, effectiveSrc, platform) {
        const rect = iframe.getBoundingClientRect();
        if (!isElementEffectivelyVisible(iframe)) {
            return { eligible: false, reason: 'hidden', isSuspectedAd: false, signalScore: -1000 };
        }

        const normalizedSrc = normalizeMediaUrl(effectiveSrc);
        if (!normalizedSrc) {
            return { eligible: false, reason: 'missing-src', isSuspectedAd: false, signalScore: -1200 };
        }

        const signature = buildElementSignature(iframe, normalizedSrc);
        if (hasPreviewIndicators(signature)) {
            return { eligible: false, reason: 'preview', isSuspectedAd: false, signalScore: -1200 };
        }

        if (isLikelyAdIframe(iframe, normalizedSrc) || hasAdIndicators(signature, iframe)) {
            return { eligible: false, reason: 'ad-indicator', isSuspectedAd: true, signalScore: -6000 };
        }

        const hasIframeIntent = /player|embed|video|watch|stream|media|play/i.test(normalizedSrc);
        const hasClassIntent = /player|video/i.test(`${iframe.className || ''} ${iframe.id || ''}`);
        const allow = String(iframe.getAttribute('allow') || '').toLowerCase();
        const hasFeatureIntent = /autoplay|fullscreen|picture-in-picture/.test(allow);
        const hasStrongSignal = platform !== 'generic' || hasIframeIntent || hasClassIntent || hasFeatureIntent;
        if (!hasStrongSignal) {
            return { eligible: false, reason: 'weak-signal', isSuspectedAd: false, signalScore: -1500 };
        }

        const area = rect.width * rect.height;
        if (platform === 'generic') {
            const tooSmall = rect.width < MIN_GENERIC_IFRAME_WIDTH || rect.height < MIN_GENERIC_IFRAME_HEIGHT || area < MIN_GENERIC_IFRAME_AREA;
            if (tooSmall) {
                return { eligible: false, reason: 'generic-too-small', isSuspectedAd: false, signalScore: -2000 };
            }
        }

        if (rect.width < MIN_VIDEO_WIDTH || rect.height < MIN_VIDEO_HEIGHT) {
            return { eligible: false, reason: 'tiny', isSuspectedAd: false, signalScore: -900 };
        }

        const signalScore = Math.round(
            area * 0.001 +
            (platform !== 'generic' ? 700 : 0) +
            (hasIframeIntent ? 600 : 0) +
            (hasFeatureIntent ? 180 : 0)
        );

        return { eligible: true, reason: 'eligible', isSuspectedAd: false, signalScore };
    }

    function evaluateCustomContainerEligibility(element, platform, boyfriendTvPayload) {
        const rect = element.getBoundingClientRect();
        if (!isElementEffectivelyVisible(element)) {
            return { eligible: false, reason: 'hidden', isSuspectedAd: false, signalScore: -900 };
        }

        const signature = buildElementSignature(element);
        if (hasPreviewIndicators(signature)) {
            return { eligible: false, reason: 'preview', isSuspectedAd: false, signalScore: -1200 };
        }
        if (hasAdIndicators(signature, element)) {
            return { eligible: false, reason: 'ad-indicator', isSuspectedAd: true, signalScore: -5500 };
        }

        if (boyfriendTvPayload?.iframeSrc) {
            if (hasAdIndicators(buildElementSignature(element, boyfriendTvPayload.iframeSrc), element)) {
                return { eligible: false, reason: 'ad-indicator', isSuspectedAd: true, signalScore: -5500 };
            }
            const boostedScore = Math.round(
                rect.width * rect.height * 0.001 +
                (boyfriendTvPayload?.quality?.height || 0) * 3 +
                5000
            );
            return { eligible: true, reason: 'eligible', isSuspectedAd: false, signalScore: boostedScore };
        }

        const descendants = Array.from(element.querySelectorAll('video, iframe'))
            .filter((child) => isElementEffectivelyVisible(child));
        if (descendants.length === 0) {
            return { eligible: false, reason: 'no-playable-child', isSuspectedAd: false, signalScore: -1300 };
        }

        const validDescendants = descendants.filter((child) => detectedPlayers.has(child));

        if (validDescendants.length === 0) {
            return { eligible: false, reason: 'child-rejected', isSuspectedAd: false, signalScore: -1700 };
        }

        if (platform === 'unknown' && validDescendants.length > 2) {
            return { eligible: false, reason: 'ambiguous-container', isSuspectedAd: false, signalScore: -1800 };
        }

        const signalScore = Math.round(
            rect.width * rect.height * 0.001 +
            validDescendants.length * 1000
        );
        return { eligible: true, reason: 'eligible', isSuspectedAd: false, signalScore };
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

            const eligibility = evaluateVideoEligibility(video);
            if (!eligibility.eligible) {
                return;
            }

            const { type, platform } = identifyPlayerType(video);
            const quality = detectPlaybackQuality(video);

            const stableId = generateStableId(video);
            detectedPlayers.set(video, {
                type,
                platform,
                quality,
                enhanced: false,
                stableId,
                score: Number(eligibility.signalScore || 0),
                signalScore: Number(eligibility.signalScore || 0),
                eligible: true,
                eligibilityReason: eligibility.reason || 'eligible',
                isSuspectedAd: eligibility.isSuspectedAd === true,
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
            const eligibility = evaluateIframeEligibility(iframe, effectiveSrc, platform);
            if (!eligibility.eligible) return;

            const iframeRect = iframe.getBoundingClientRect();
            const stableId = generateStableId(iframe);
            detectedPlayers.set(iframe, {
                type,
                platform,
                quality: null,
                enhanced: false,
                stableId,
                score: Number(eligibility.signalScore || Math.round(iframeRect.width * iframeRect.height * 0.001)),
                signalScore: Number(eligibility.signalScore || 0),
                eligible: true,
                eligibilityReason: eligibility.reason || 'eligible',
                isSuspectedAd: eligibility.isSuspectedAd === true,
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

                    const { type, platform } = identifyPlayerType(element);
                    const eligibility = evaluateCustomContainerEligibility(element, platform, boyfriendTvPayload);
                    if (!eligibility.eligible) return;

                    // If the direct child video/iframe is already detected as a standalone entry,
                    // still register the CONTAINER but link it — skip only if the container itself is already registered
                    // (already handled by seen.has(element) check above)

                    const stableId = generateStableId(element);
                    const score = Number(eligibility.signalScore || 0);
                    
                    detectedPlayers.set(element, {
                        type,
                        platform: boyfriendTvPayload ? 'boyfriendtv' : platform,
                        quality: boyfriendTvPayload?.quality || null,
                        enhanced: false,
                        stableId,
                        score,
                        signalScore: score,
                        eligible: true,
                        eligibilityReason: eligibility.reason || 'eligible',
                        isSuspectedAd: eligibility.isSuspectedAd === true,
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
        if (!shouldRunMediaAutomation()) {
            playerCount = 0;
            return 0;
        }

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
                    eligiblePlayers: Array.from(detectedPlayers.keys()),
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
                isSuspectedAd: data.isSuspectedAd === true,
                eligible: data.eligible !== false,
                eligibilityReason: data.eligibilityReason || 'eligible',
                signalScore: Number(data.signalScore || data.score || 0)
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

    function isMediaMutationTarget(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.tagName === 'VIDEO' || node.tagName === 'IFRAME') return true;
        if (node.matches?.('.shield-detected-container, [data-testid="videoPlayer"], [data-testid="videoComponent"]')) {
            return true;
        }
        return Boolean(node.querySelector?.('video, iframe'));
    }

    function createDetectionScheduler(delay = 300) {
        let debounceTimer = null;
        return () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                detectAllPlayers();
            }, delay);
        };
    }

    /**
     * 使用 MutationObserver 監聽 DOM 變化
     */
    function observeDOMChanges() {
        const scheduleDetect = createDetectionScheduler(300);
        const observer = new MutationObserver((mutations) => {
            let shouldRedetect = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (isMediaMutationTarget(node)) {
                            shouldRedetect = true;
                            break;
                        }
                    }
                }

                if (!shouldRedetect && mutation.type === 'attributes') {
                    if (isMediaMutationTarget(mutation.target)) {
                        shouldRedetect = true;
                    }
                }

                if (shouldRedetect) break;
            }

            if (shouldRedetect) {
                scheduleDetect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'src',
                'poster',
                'class',
                'style',
                'width',
                'height',
                'controls',
                'muted',
                'autoplay',
                'loop',
                'hidden',
                'data-src',
                'data-lazy-src',
                'data-original'
            ]
        });

        document.addEventListener('loadedmetadata', (event) => {
            if (event.target?.tagName === 'VIDEO') {
                scheduleDetect();
            }
        }, true);

        document.addEventListener('load', (event) => {
            if (event.target?.tagName === 'IFRAME') {
                scheduleDetect();
            }
        }, true);

        console.log('👀 [Detector] MutationObserver 已啟動');
    }

    /**
     * 初始化
     */
    function init() {
        console.log('🚀 Player Detector v4.0 已載入');

        const helper = window.__ShieldSiteStateHelper;
        if (helper?.subscribe) {
            helper.subscribe(() => {
                if (!shouldRunMediaAutomation()) return;
                detectAllPlayers();
                applyBlockedPlayers();
            });
        }

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
