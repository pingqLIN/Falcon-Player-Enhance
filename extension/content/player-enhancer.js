// Player Enhancer - 播放器視覺增強與障礙移除
// 為偵測到的播放器添加標示並移除覆蓋元素

(function () {
    'use strict';

    const MAX_Z_INDEX = 2147483647; // JavaScript 最大安全整數 z-index
    const OVERLAY_CHECK_INTERVAL = 3000; // 每 3 秒檢查一次覆蓋元素
    const FRAME_SOURCE_MESSAGE_TYPE = 'shield:frame-source';
    const IS_TOP_FRAME = window === window.top;
    let cleanupEnabled = false;
    let compatibilityModeSites = [];
    let siteProfilesLoadPromise = null;
    let shouldRunAggressiveOverlayCleanup = true;
    let popupDirectIframeHosts = [];
    let overlayMonitoringStarted = false;

    function normalizeHostname(hostname) {
        return String(hostname || '').toLowerCase().replace(/^www\./, '');
    }

    function isDomainOrSubdomain(hostname, domain) {
        return hostname === domain || hostname.endsWith('.' + domain);
    }

    function normalizeDomainList(domains = []) {
        return [...new Set(
            (Array.isArray(domains) ? domains : [])
                .map((domain) => normalizeHostname(domain))
                .filter(Boolean)
        )];
    }

    function applyCleanupModeFromState(state = null) {
        const helper = window.__ShieldSiteStateHelper;
        if (helper?.shouldRunMediaAutomation) {
            cleanupEnabled = helper.shouldRunMediaAutomation(window.location.hostname);
            return cleanupEnabled;
        }

        const hostname = normalizeHostname(window.location.hostname);
        const whitelist = Array.isArray(state?.whitelistDomains) ? state.whitelistDomains : [];
        const onWhitelist = whitelist.some((domain) => isDomainOrSubdomain(hostname, domain));
        const whitelistEnhanceOnly = state?.whitelistEnhanceOnly !== false;
        cleanupEnabled = !(onWhitelist && whitelistEnhanceOnly);
        return cleanupEnabled;
    }

    function resolveCleanupMode() {
        const helper = window.__ShieldSiteStateHelper;
        if (helper?.load) {
            return helper.load().then((state) => applyCleanupModeFromState(state));
        }

        return new Promise((resolve) => {
            chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly'], (result) => {
                resolve(applyCleanupModeFromState({
                    whitelistDomains: Array.isArray(result.whitelist) ? result.whitelist.map(normalizeHostname) : [],
                    whitelistEnhanceOnly: result.whitelistEnhanceOnly
                }));
            });
        });
    }

    function bindCleanupModeUpdates() {
        const helper = window.__ShieldSiteStateHelper;
        if (!helper?.subscribe) return;
        helper.subscribe((state) => {
            const previous = cleanupEnabled;
            const next = applyCleanupModeFromState(state);
            if (previous || !next) return;
            processExistingDetectedPlayers();
            startOverlayMonitoring();
            if (shouldRunAggressiveOverlayCleanup) {
                removeParentPageOverlays();
            }
        });
    }

    function isCompatibilityModeSite() {
        const host = window.location.hostname.toLowerCase();
        return compatibilityModeSites.some((domain) => host === domain || host.endsWith('.' + domain));
    }

    function loadSiteProfiles() {
        if (siteProfilesLoadPromise) return siteProfilesLoadPromise;

        siteProfilesLoadPromise = new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ action: 'getSiteRegistry' }, (response) => {
                    const runtimeFailed = chrome.runtime.lastError || !response?.success;
                    if (runtimeFailed) {
                        compatibilityModeSites = [];
                        popupDirectIframeHosts = [];
                        shouldRunAggressiveOverlayCleanup = true;
                        resolve({
                            compatibilityModeSites,
                            popupDirectIframeHosts
                        });
                        return;
                    }

                    compatibilityModeSites = normalizeDomainList(response?.profiles?.compatibilityModeSites);
                    popupDirectIframeHosts = normalizeDomainList(response?.profiles?.popupDirectIframeHosts);
                    shouldRunAggressiveOverlayCleanup = !isCompatibilityModeSite();
                    resolve({
                        compatibilityModeSites,
                        popupDirectIframeHosts
                    });
                });
            } catch (_) {
                compatibilityModeSites = [];
                popupDirectIframeHosts = [];
                shouldRunAggressiveOverlayCleanup = true;
                resolve({
                    compatibilityModeSites,
                    popupDirectIframeHosts
                });
            }
        });

        return siteProfilesLoadPromise;
    }

    function getDetectorEntries() {
        const entries = window.__ShieldPlayerDetector?.getPlayers?.();
        if (entries instanceof Map) return entries;
        return null;
    }

    function buildInfoIndex(infoList) {
        const index = new Map();
        if (!Array.isArray(infoList)) return index;
        infoList.forEach((entry) => {
            const key = String(entry?.id || '').trim();
            if (!key) return;
            index.set(key, entry);
        });
        return index;
    }

    function resolvePlayerMeta(player, infoIndex = null) {
        if (!player) return null;
        const playerId = resolvePlayerControlId(player);
        if (infoIndex instanceof Map && playerId && infoIndex.has(playerId)) {
            return infoIndex.get(playerId);
        }

        const detectorEntries = getDetectorEntries();
        if (!(detectorEntries instanceof Map)) {
            return null;
        }

        if (detectorEntries.has(player)) {
            return detectorEntries.get(player);
        }

        if (!playerId) return null;
        for (const [, meta] of detectorEntries.entries()) {
            if (String(meta?.stableId || '') === playerId) {
                return meta;
            }
        }
        return null;
    }

    function isEligiblePlayer(player, infoIndex = null) {
        const meta = resolvePlayerMeta(player, infoIndex);
        if (!meta) {
            if (player?.dataset?.shieldId) return false;
            return true;
        }
        if (meta.eligible === false) return false;
        if (meta.isSuspectedAd === true) return false;
        return true;
    }

    /**
     * 為播放器添加視覺標示（精簡版 - 無視覺干擾）
     */
    function enhancePlayer(player) {
        if (player.dataset.enhanced === 'true') return;

        // 標記為已處理（不調整 z-index 避免干擾播放器行為）
        player.dataset.enhanced = 'true';

        // 添加標記 class（僅供程式識別，無視覺效果）
        player.classList.add('player-enhanced-active');

        // 新增彈窗播放按鈕
        addPopupButton(player);

        console.log('✅ 播放器已標記:', player.tagName);
    }

    function getDirectPlayableDescendants(player) {
        if (!player?.querySelectorAll) return [];
        return Array.from(player.querySelectorAll('video, iframe')).filter((element) => {
            if (!element || !document.contains(element)) return false;
            if (!isEffectivelyVisible(element)) return false;
            return true;
        });
    }

    function shouldSkipPopupButton(player) {
        if (!player) return true;
        if (player.tagName === 'VIDEO' || player.tagName === 'IFRAME') {
            return false;
        }

        const descendants = getDirectPlayableDescendants(player);
        const distinctTargets = new Set(
            descendants.map((element) => resolvePlayerControlId(element) || getVideoSource(element) || getIframeSource(element))
        );
        if (distinctTargets.size > 0) {
            return true;
        }

        const hasResolvedSelfSource = Boolean(
            player.dataset?.shieldResolvedVideoSrc || player.dataset?.shieldResolvedIframeSrc
        );
        if (hasResolvedSelfSource) {
            return false;
        }
        return false;
    }

    function getPopupAnchorMetrics(player) {
        if (!player) return null;
        const rect = player.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
            top: Math.max(8, rect.top + 10),
            right: Math.max(8, window.innerWidth - rect.right + 10)
        };
    }

    function applyFloatingPopupAnchorPosition(player, btn, tooltip) {
        const metrics = getPopupAnchorMetrics(player);
        if (!metrics) {
            btn.style.opacity = '0';
            tooltip.style.opacity = '0';
            return false;
        }

        btn.style.top = `${metrics.top}px`;
        btn.style.right = `${metrics.right}px`;
        tooltip.style.top = `${metrics.top + 40}px`;
        tooltip.style.right = `${metrics.right}px`;
        return true;
    }

    /**
     * 新增彈窗播放按鈕
     * 在播放器右上角顯示一個按鈕，點擊後開啟無干擾播放視窗
     */
    function addPopupButton(player) {
        if (!IS_TOP_FRAME) return;
        if (!isEligiblePlayer(player)) {
            player.dataset.popupButtonAttached = 'skipped';
            return;
        }
        if (player.dataset.popupButtonAttached === 'true') return;
        if (shouldSkipPopupButton(player)) {
            player.dataset.popupButtonAttached = 'skipped';
            console.log('⏭️ 跳過多目標容器的無干擾按鈕:', player.tagName, player.className || player.id || '');
            return;
        }
        player.dataset.popupButtonAttached = 'true';

        const btn = document.createElement('button');
        btn.className = 'shield-popup-player-btn';
        btn.setAttribute('data-shield-internal', 'true');
        btn.innerHTML = '🎬';
        btn.title = '在新視窗無干擾播放';

        Object.assign(btn.style, {
            position: 'fixed',
            zIndex: String(MAX_Z_INDEX),
            width: '36px',
            height: '36px',
            border: 'none',
            borderRadius: '8px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            opacity: '0',
            transition: 'opacity 0.2s, transform 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'none'
        });

        const tooltip = document.createElement('div');
        tooltip.className = 'shield-video-tooltip';
        tooltip.setAttribute('data-shield-internal', 'true');
        Object.assign(tooltip.style, {
            position: 'fixed',
            zIndex: String(MAX_Z_INDEX),
            background: 'rgba(0, 0, 0, 0.85)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            opacity: '0',
            transition: 'opacity 0.2s',
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
        });
        tooltip.textContent = '00:00 / 00:00';

        let hoverPinned = false;
        let hoverTimeout = null;

        function setOverlayVisibility(visible) {
            btn.style.opacity = visible ? '1' : '0';
            btn.style.pointerEvents = visible ? 'auto' : 'none';
            tooltip.style.opacity = visible ? '1' : '0';
        }

        function syncPopupButtonMetadata() {
            btn.dataset.shieldPopupTargetId = resolvePlayerControlId(player) || '';
            btn.dataset.shieldPopupVideoSrc =
                player.dataset?.shieldResolvedVideoSrc ||
                (player.tagName === 'VIDEO' ? getVideoSource(player) : '') ||
                '';
            btn.dataset.shieldPopupIframeSrc =
                player.dataset?.shieldResolvedIframeSrc ||
                (player.tagName === 'IFRAME' ? getIframePayloadSource(player) : '') ||
                '';
        }

        function showOverlay() {
            clearTimeout(hoverTimeout);
            syncPopupButtonMetadata();
            if (!applyFloatingPopupAnchorPosition(player, btn, tooltip)) {
                setOverlayVisibility(false);
                return;
            }
            setOverlayVisibility(true);
            updateVideoTooltip(player, tooltip);
        }

        function hideOverlaySoon() {
            clearTimeout(hoverTimeout);
            hoverTimeout = window.setTimeout(() => {
                if (hoverPinned) return;
                setOverlayVisibility(false);
            }, 80);
        }

        player.addEventListener('mouseenter', () => {
            hoverPinned = true;
            showOverlay();
        });
        player.addEventListener('mouseleave', () => {
            hoverPinned = false;
            hideOverlaySoon();
        });

        btn.addEventListener('mouseenter', () => {
            hoverPinned = true;
            showOverlay();
            btn.style.transform = 'scale(1.1)';
            btn.style.background = 'rgba(50, 50, 50, 0.9)';
        });
        btn.addEventListener('mouseleave', () => {
            hoverPinned = false;
            hideOverlaySoon();
            btn.style.transform = 'scale(1)';
            btn.style.background = 'rgba(0, 0, 0, 0.7)';
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopupPlayer(player);
        });

        tooltip.addEventListener('mouseenter', () => {
            hoverPinned = true;
            showOverlay();
        });
        tooltip.addEventListener('mouseleave', () => {
            hoverPinned = false;
            hideOverlaySoon();
        });

        document.body.appendChild(btn);
        document.body.appendChild(tooltip);
        syncPopupButtonMetadata();

        const refreshOverlayPosition = () => {
            if (btn.style.opacity === '1' || tooltip.style.opacity === '1') {
                syncPopupButtonMetadata();
                applyFloatingPopupAnchorPosition(player, btn, tooltip);
            }
        };

        window.addEventListener('scroll', refreshOverlayPosition, true);
        window.addEventListener('resize', refreshOverlayPosition, true);
        setInterval(() => {
            refreshOverlayPosition();
            updateVideoTooltip(player, tooltip);
        }, 1000);
    }

    /**
     * 更新影片位置提示
     */
    function updateVideoTooltip(player, tooltip) {
        const video = player.tagName === 'VIDEO' ? player : player.querySelector('video');
        if (video && !isNaN(video.duration)) {
            const current = formatTime(video.currentTime);
            const duration = formatTime(video.duration);
            tooltip.textContent = `${current} / ${duration}`;
        }
    }

    /**
     * 格式化時間
     */
    function formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function normalizeResolvedFrameUrl(url) {
        const normalized = String(url || '').trim();
        if (!normalized) return '';
        if (/^(about:blank|data:|javascript:)/i.test(normalized)) {
            return '';
        }
        return normalized;
    }

    function extractConfiguredMediaSourceFromScripts() {
        const mediaPattern = /\b(?:file|src)\s*:\s*["']([^"']+\.(?:m3u8|mp4|m4v|webm|mpd)(?:\?[^"']*)?)["']/gi;
        const posterPattern = /\b(?:image|poster)\s*:\s*["']([^"']+)["']/i;

        for (const script of Array.from(document.scripts)) {
            const text = String(script?.textContent || '').trim();
            if (!text) continue;

            const posterMatch = text.match(posterPattern);
            let mediaMatch = mediaPattern.exec(text);
            while (mediaMatch) {
                const mediaSrc = normalizeCandidateUrl(mediaMatch[1] || '');
                if (
                    mediaSrc &&
                    !isEphemeralMediaUrl(mediaSrc) &&
                    !hasPreviewIndicators(null, mediaSrc) &&
                    !hasAdIndicators(null, mediaSrc)
                ) {
                    return {
                        src: mediaSrc,
                        poster: normalizeCandidateUrl(posterMatch?.[1] || '')
                    };
                }
                mediaMatch = mediaPattern.exec(text);
            }
        }

        return null;
    }

    function extractRuntimeMediaSource() {
        if (typeof window.jwplayer !== 'function') return null;

        let item = null;
        try {
            item = window.jwplayer()?.getPlaylistItem?.() || null;
        } catch (_) {
            item = null;
        }

        if (!item) return null;

        const candidates = [
            ...(Array.isArray(item.allSources) ? item.allSources : []),
            ...(Array.isArray(item.sources) ? item.sources : []),
            item
        ];
        const source = candidates.reduce((picked, candidate) => {
            if (picked) return picked;
            const mediaSrc = normalizeCandidateUrl(candidate?.file || candidate?.src || '');
            if (!mediaSrc) return null;
            if (isEphemeralMediaUrl(mediaSrc)) return null;
            if (hasPreviewIndicators(null, mediaSrc)) return null;
            if (hasAdIndicators(null, mediaSrc)) return null;
            return mediaSrc;
        }, null);

        if (!source) return null;

        return {
            src: source,
            poster: normalizeCandidateUrl(item.image || item.poster || '')
        };
    }

    function extractResourceMediaSource() {
        if (!window.performance?.getEntriesByType) return null;

        const entries = window.performance.getEntriesByType('resource');
        if (!Array.isArray(entries) || entries.length === 0) return null;

        const mediaEntries = entries
            .map((entry) => normalizeCandidateUrl(entry?.name || ''))
            .filter((url) => {
                if (!url) return false;
                if (!isStreamLikeMediaUrl(url) && !/urlset\/master\.m3u8/i.test(url)) {
                    return false;
                }
                if (isEphemeralMediaUrl(url)) return false;
                if (hasPreviewIndicators(null, url)) return false;
                if (hasAdIndicators(null, url)) return false;
                return true;
            });

        if (mediaEntries.length === 0) return null;

        return {
            src: mediaEntries[mediaEntries.length - 1],
            poster: ''
        };
    }

    function announceResolvedFrameSource() {
        if (window === window.top) return;

        const send = () => {
            const resolvedHref = normalizeResolvedFrameUrl(window.location.href);
            if (!resolvedHref) return;
            const resolvedVideoFromDom = Array.from(document.querySelectorAll('video')).reduce((picked, video) => {
                if (picked) return picked;
                const videoSrc = getVideoSource(video);
                if (!videoSrc) return null;
                if (isEphemeralMediaUrl(videoSrc)) return null;
                if (hasPreviewIndicators(video, videoSrc)) return null;
                if (hasAdIndicators(video, videoSrc)) return null;
                return {
                    src: videoSrc,
                    poster: video.poster || ''
                };
            }, null);
            const resolvedVideo =
                resolvedVideoFromDom ||
                extractRuntimeMediaSource() ||
                extractResourceMediaSource() ||
                extractConfiguredMediaSourceFromScripts();

            try {
                window.parent.postMessage({
                    type: FRAME_SOURCE_MESSAGE_TYPE,
                    href: resolvedHref,
                    videoSrc: resolvedVideo?.src || '',
                    poster: resolvedVideo?.poster || '',
                    title: document.title || '',
                    origin: window.location.origin || ''
                }, '*');
            } catch (_) {
                // Ignore cross-origin parent failures.
            }
        };

        send();
        window.addEventListener('load', send, { once: true });
        window.addEventListener('hashchange', send);
        document.addEventListener('play', send, true);
        document.addEventListener('loadedmetadata', send, true);
        setTimeout(send, 500);
        setTimeout(send, 1500);
        setTimeout(send, 4000);

        const observer = new MutationObserver((mutations) => {
            const shouldSync = mutations.some((mutation) => {
                if (mutation.type === 'childList') {
                    return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
                }
                if (mutation.type !== 'attributes') return false;
                return mutation.target?.tagName === 'VIDEO' || mutation.target?.tagName === 'SOURCE';
            });

            if (!shouldSync) return;
            window.setTimeout(send, 50);
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });
        }
    }

    function bindResolvedFrameSourceListener() {
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || data.type !== FRAME_SOURCE_MESSAGE_TYPE) return;
            if (!event.source || event.source === window) return;

            const resolvedHref = normalizeResolvedFrameUrl(data.href);
            if (!resolvedHref) return;
            const resolvedVideoSrc = normalizeCandidateUrl(data.videoSrc || '');

            const matchedIframe = Array.from(document.querySelectorAll('iframe')).find((iframe) => {
                try {
                    return iframe.contentWindow === event.source;
                } catch (_) {
                    return false;
                }
            });

            if (!matchedIframe) return;

            matchedIframe.dataset.shieldResolvedSrc = resolvedHref;
            if (resolvedVideoSrc) {
                matchedIframe.dataset.shieldResolvedVideoSrc = resolvedVideoSrc;
            }
            if (data.poster) {
                matchedIframe.dataset.shieldResolvedPoster = String(data.poster);
            }
            if (data.title) {
                matchedIframe.dataset.shieldResolvedTitle = String(data.title);
            }
            matchedIframe.dataset.shieldResolvedAt = String(Date.now());
            console.log('🔗 iframe 最終來源已同步:', {
                href: resolvedHref,
                videoSrc: resolvedVideoSrc || ''
            });
        });
    }

    function getVideoSource(video) {
        if (!video) return '';

        const sourceCandidates = video.querySelectorAll?.('source[src]')
            ? Array.from(video.querySelectorAll('source[src]')).map((source) => source.src || source.getAttribute('src') || '')
            : [];

        return pickPlayableMediaSource([
            video.dataset?.shieldResolvedVideoSrc || '',
            ...sourceCandidates,
            video.currentSrc || '',
            video.src || '',
            video.getAttribute?.('src') || '',
            video.dataset?.src || '',
            video.dataset?.videoSrc || ''
        ]);
    }

    function normalizeCandidateUrl(url) {
        const normalized = String(url || '').trim();
        if (!normalized) return '';
        if (/^(about:blank|data:|javascript:)/i.test(normalized)) {
            return '';
        }

        try {
            return new URL(normalized, window.location.href).href;
        } catch (_) {
            return normalized;
        }
    }

    function isStreamLikeMediaUrl(url) {
        const normalized = String(url || '').trim().toLowerCase();
        if (!normalized) return false;
        if (/\.(?:m3u8|mp4|m4v|webm|mpd)(?:$|\?)/i.test(normalized)) return true;
        if (/(?:^|\/)(?:cf-)?master(?:[.-][^/?#]+)*\.txt(?:$|\?)/i.test(normalized)) return true;
        return false;
    }

    function isManifestMediaUrl(url) {
        const normalized = String(url || '').trim().toLowerCase();
        if (!normalized) return false;
        if (/\.(?:m3u8|mpd)(?:$|\?)/i.test(normalized)) return true;
        if (/urlset\/master\.m3u8(?:$|\?)/i.test(normalized)) return true;
        if (/(?:^|\/)(?:cf-)?master(?:[.-][^/?#]+)*\.txt(?:$|\?)/i.test(normalized)) return true;
        return false;
    }

    function pickPlayableMediaSource(candidates) {
        const normalizedCandidates = candidates
            .map((candidate) => normalizeCandidateUrl(candidate))
            .filter(Boolean);

        const stableCandidate = normalizedCandidates.find((candidate) => !isEphemeralMediaUrl(candidate));
        if (!stableCandidate) {
            return normalizedCandidates[0] || '';
        }

        const streamCandidate = normalizedCandidates.find((candidate) => {
            if (isEphemeralMediaUrl(candidate)) return false;
            if (hasPreviewIndicators(null, candidate)) return false;
            if (hasAdIndicators(null, candidate)) return false;
            return isStreamLikeMediaUrl(candidate);
        });
        if (streamCandidate) {
            return streamCandidate;
        }

        const safeCandidate = normalizedCandidates.find((candidate) => {
            if (isEphemeralMediaUrl(candidate)) return false;
            if (hasPreviewIndicators(null, candidate)) return false;
            if (hasAdIndicators(null, candidate)) return false;
            return true;
        });
        if (safeCandidate) {
            return safeCandidate;
        }

        return stableCandidate;
    }

    function getResolvedIframeSource(iframe) {
        if (!iframe) return '';
        return normalizeResolvedFrameUrl(
            iframe.dataset.shieldResolvedIframeSrc ||
            iframe.dataset.shieldResolvedSrc ||
            ''
        );
    }

    function getDeclaredIframeSource(iframe) {
        if (!iframe) return '';
        return normalizeCandidateUrl(
            iframe.getAttribute('src') ||
            iframe.dataset.src ||
            iframe.dataset.lazySrc ||
            iframe.getAttribute('data-original') ||
            iframe.src ||
            ''
        );
    }

    function shouldPreferResolvedIframeSource(declaredSrc, resolvedSrc) {
        if (!resolvedSrc) return false;
        if (!declaredSrc) return true;
        if (declaredSrc === resolvedSrc) return true;

        try {
            const declaredUrl = new URL(declaredSrc, window.location.href);
            const resolvedUrl = new URL(resolvedSrc, window.location.href);
            const pageHost = normalizeHostname(window.location.hostname);
            const declaredHost = normalizeHostname(declaredUrl.hostname);
            const resolvedHost = normalizeHostname(resolvedUrl.hostname);

            if (declaredHost === pageHost && resolvedHost !== pageHost) {
                return true;
            }

            if (declaredUrl.origin !== resolvedUrl.origin && resolvedHost !== pageHost) {
                return true;
            }

            if (/(?:embed|player|watch|stream|video|load|redirect|reproductor)/i.test(declaredUrl.pathname)) {
                return true;
            }
        } catch (_) {
            return false;
        }

        return false;
    }

    function getIframeSource(iframe, options = {}) {
        if (!iframe) return '';
        const preferDeclared = options.preferDeclared !== false;
        const declaredSrc = getDeclaredIframeSource(iframe);
        const resolvedSrc = getResolvedIframeSource(iframe);
        if (shouldPreferResolvedIframeSource(declaredSrc, resolvedSrc)) {
            return resolvedSrc;
        }
        if (preferDeclared) {
            return declaredSrc || resolvedSrc;
        }
        return resolvedSrc || declaredSrc;
    }

    function getIframePayloadSource(iframe) {
        if (!iframe) return '';
        if (iframe.tagName === 'IFRAME') {
            return getIframeSource(iframe, { preferDeclared: true });
        }

        const nestedIframe = iframe.querySelector?.('iframe');
        if (nestedIframe) {
            return getIframeSource(nestedIframe, { preferDeclared: true });
        }

        return (
            getDeclaredIframeSource(iframe) ||
            getResolvedIframeSource(iframe) ||
            ''
        );
    }

    function buildElementSignature(element, src = '') {
        if (!element) return '';
        return [
            element.className || '',
            element.id || '',
            element.getAttribute?.('aria-label') || '',
            element.getAttribute?.('title') || '',
            element.getAttribute?.('data-testid') || '',
            src || ''
        ].join(' ').toLowerCase();
    }

    function isEffectivelyVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function hasPreviewIndicators(element, src = '') {
        const signature = buildElementSignature(element, src);
        return /preview|thumbnail|poster|hover-preview|hoverpreview|placeholder|cover|teaser|sample/.test(signature);
    }

    function isBlockedInterstitialUrl(url) {
        const normalized = String(url || '').trim().toLowerCase();
        if (!normalized) return false;
        return /chrome-extension:\/\/[^/]+\/(?:strictblock|document-blocked)\.html(?:[?#]|$)/i.test(normalized);
    }

    function hasAdIndicators(element, src = '') {
        if (isBlockedInterstitialUrl(src)) {
            return true;
        }

        const signature = buildElementSignature(element, src);
        if (/(^|[\W_])(ad|ads|advert|banner|sponsor|promo|vast|preroll)([\W_]|$)/.test(signature)) {
            return true;
        }

        const adContainer = element?.closest?.('[data-ad], [data-ads], [class*="sponsor"], [class*="banner"], [id*="sponsor"], [id*="banner"]');
        if (adContainer) {
            return true;
        }

        return /exoclick|juicyads|trafficjunky|doubleclick|googlesyndication|adservice|adsystem/i.test(src);
    }

    function isEphemeralMediaUrl(url) {
        const normalized = String(url || '').trim().toLowerCase();
        return normalized.startsWith('blob:') || normalized.startsWith('mediastream:');
    }

    function shouldOpenPopupDirectly(url) {
        const normalized = String(url || '').trim();
        if (!normalized) return false;

        try {
            const hostname = normalizeHostname(new URL(normalized).hostname);
            return popupDirectIframeHosts.some((domain) => isDomainOrSubdomain(hostname, domain));
        } catch (_) {
            return false;
        }
    }

    function hasSignedMediaQuery(url) {
        const normalized = String(url || '').trim();
        if (!normalized) return false;
        return /[?&](?:token|sig|signature|expires|expiry|auth|session|policy|jwt|hdnts|hdntl|md5|key)=/i.test(normalized);
    }

    function hasOpaqueMediaPath(pathname) {
        const segments = String(pathname || '')
            .split('/')
            .filter(Boolean);

        return segments.some((segment) => /^[a-z0-9_-]{24,}$/i.test(segment));
    }

    function shouldPreferIframePopup(videoSrc, iframeSrc) {
        if (!videoSrc || !iframeSrc) return false;

        if (isManifestMediaUrl(videoSrc)) {
            return true;
        }

        try {
            const pageHost = normalizeHostname(window.location.hostname);
            const videoUrl = new URL(videoSrc, window.location.href);
            const iframeUrl = new URL(iframeSrc, window.location.href);
            const videoHost = normalizeHostname(videoUrl.hostname);
            const iframeHost = normalizeHostname(iframeUrl.hostname);
            const crossOriginVideo = videoHost !== pageHost;
            const crossOriginIframe = iframeHost !== pageHost;
            const signedVideo = hasSignedMediaQuery(videoUrl.href);
            const opaqueVideoPath = hasOpaqueMediaPath(videoUrl.pathname);
            const standardMediaPath = /\.(?:m3u8|mp4|m4v|webm|mpd)(?:$|\?)/i.test(videoUrl.pathname + videoUrl.search);
            const looksLikeProtectedDirectStream =
                signedVideo && (opaqueVideoPath || !standardMediaPath || crossOriginVideo);

            if (looksLikeProtectedDirectStream && crossOriginIframe) {
                return true;
            }

            if (crossOriginVideo && signedVideo && iframeUrl.href !== videoUrl.href) {
                return true;
            }

            return false;
        } catch (_) {
            return false;
        }
    }

    function resolvePlayerControlId(player) {
        if (!player) return '';
        if (player.dataset?.shieldId) return String(player.dataset.shieldId);
        const nestedTarget = player.querySelector?.('[data-shield-id]');
        if (nestedTarget?.dataset?.shieldId) return String(nestedTarget.dataset.shieldId);
        const closestTarget = player.closest?.('[data-shield-id]');
        if (closestTarget?.dataset?.shieldId) return String(closestTarget.dataset.shieldId);
        return '';
    }

    function resolveFallbackPayloadFromElement(element, detectorEntries) {
        if (!element) return null;

        const containers = [
            element.closest?.('[data-shield-primary-candidate="true"]'),
            element.closest?.('#videoplayer-v3'),
            element.closest?.('.shield-detected-container'),
            element.closest?.('#mediaplayer_wrapper')
        ].filter(Boolean);

        if (detectorEntries instanceof Map) {
            detectorEntries.forEach((meta, entryElement) => {
                if (!entryElement || !document.contains(entryElement)) return;
                if (entryElement === element || entryElement.contains?.(element)) {
                    containers.push(entryElement);
                }
            });
        }

        for (const container of containers) {
            const iframeSrc = getIframePayloadSource(container);
            const videoSrc = getVideoSource(container);
            const poster = container.dataset?.shieldResolvedPoster || '';

            if (videoSrc && !isEphemeralMediaUrl(videoSrc) && !hasAdIndicators(container, videoSrc)) {
                return { videoSrc, iframeSrc: '', poster };
            }

            if (iframeSrc && !hasAdIndicators(container, iframeSrc)) {
                return { videoSrc: '', iframeSrc, poster };
            }
        }

        return null;
    }

    function resolvePlayablePayloadFromElement(element, fallbackPoster = '') {
        if (!element) return null;

        const poster = element.dataset?.shieldResolvedPoster || fallbackPoster || '';
        const resolvedVideoSrc = normalizeCandidateUrl(element.dataset?.shieldResolvedVideoSrc || '');
        if (
            resolvedVideoSrc &&
            !isEphemeralMediaUrl(resolvedVideoSrc) &&
            !hasPreviewIndicators(element, resolvedVideoSrc) &&
            !hasAdIndicators(element, resolvedVideoSrc)
        ) {
            return { videoSrc: resolvedVideoSrc, iframeSrc: '', poster };
        }

        if (element.tagName === 'VIDEO') {
            const videoSrc = getVideoSource(element);
            if (
                videoSrc &&
                !isEphemeralMediaUrl(videoSrc) &&
                !hasPreviewIndicators(element, videoSrc) &&
                !hasAdIndicators(element, videoSrc)
            ) {
                return { videoSrc, iframeSrc: '', poster: element.poster || poster };
            }
        }

        const iframeSrc = getIframePayloadSource(element);
        if (
            iframeSrc &&
            !hasPreviewIndicators(element, iframeSrc) &&
            !hasAdIndicators(element, iframeSrc)
        ) {
            return { videoSrc: '', iframeSrc, poster };
        }

        return null;
    }

    function resolveDirectPayload(player) {
        if (!player) return null;

        const ownPoster = player.dataset?.shieldResolvedPoster || player.poster || '';
        const ownResolvedVideoSrc = getVideoSource(player);
        const ownResolvedIframeSrc = getIframePayloadSource(player);
        const runtimeMedia = extractRuntimeMediaSource();
        const resourceMedia = extractResourceMediaSource();
        const configuredMedia = extractConfiguredMediaSourceFromScripts();

        if (
            player.tagName === 'VIDEO' &&
            ownResolvedVideoSrc &&
            !isEphemeralMediaUrl(ownResolvedVideoSrc) &&
            !hasPreviewIndicators(player, ownResolvedVideoSrc) &&
            !hasAdIndicators(player, ownResolvedVideoSrc)
        ) {
            return { videoSrc: ownResolvedVideoSrc, iframeSrc: '', poster: ownPoster };
        }

        if (
            player.dataset?.shieldResolvedVideoSrc &&
            !isEphemeralMediaUrl(player.dataset.shieldResolvedVideoSrc) &&
            !hasPreviewIndicators(player, player.dataset.shieldResolvedVideoSrc) &&
            !hasAdIndicators(player, player.dataset.shieldResolvedVideoSrc)
        ) {
            return { videoSrc: player.dataset.shieldResolvedVideoSrc, iframeSrc: '', poster: ownPoster };
        }

        if (runtimeMedia?.src) {
            return {
                videoSrc: runtimeMedia.src,
                iframeSrc: '',
                poster: runtimeMedia.poster || ownPoster
            };
        }

        if (resourceMedia?.src) {
            return {
                videoSrc: resourceMedia.src,
                iframeSrc: '',
                poster: resourceMedia.poster || ownPoster
            };
        }

        if (configuredMedia?.src) {
            return {
                videoSrc: configuredMedia.src,
                iframeSrc: '',
                poster: configuredMedia.poster || ownPoster
            };
        }

        if (
            player.tagName === 'IFRAME' &&
            ownResolvedIframeSrc &&
            !hasPreviewIndicators(player, ownResolvedIframeSrc) &&
            !hasAdIndicators(player, ownResolvedIframeSrc)
        ) {
            return { videoSrc: '', iframeSrc: ownResolvedIframeSrc, poster: ownPoster };
        }

        if (player.dataset?.shieldResolvedIframeSrc) {
            const preferredIframeSrc = getIframePayloadSource(player);
            if (preferredIframeSrc && !hasAdIndicators(player, preferredIframeSrc)) {
                return { videoSrc: '', iframeSrc: preferredIframeSrc, poster: ownPoster };
            }
        }

        const descendants = getDirectPlayableDescendants(player);
        if (descendants.length === 1) {
            const onlyElement = descendants[0];
            const onlyElementPayload = resolvePlayablePayloadFromElement(onlyElement, ownPoster);
            if (onlyElementPayload) {
                return onlyElementPayload;
            }
        }

        return null;
    }

    function scorePopupCandidate(candidate, playerRect) {
        const { element, kind, src, detectedScore } = candidate;
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        let score = Math.min(area / 600, 8000);

        if (isEffectivelyVisible(element)) {
            score += 1500;
        } else {
            score -= 4000;
        }

        if (playerRect.width > 0 && playerRect.height > 0) {
            if (rect.width >= playerRect.width * 0.6) score += 900;
            if (rect.height >= playerRect.height * 0.6) score += 900;
        }

        if (candidate.isDirect) score += 1200;
        if (candidate.isDetected) score += 900;
        if (candidate.isPrimaryCandidate) score += 4000;
        if (Number.isFinite(detectedScore)) score += Math.min(detectedScore, 6000);

        if (!src) score -= 8000;

        if (kind === 'video') {
            if (element.paused === false) score += 2500;
            if ((element.currentTime || 0) > 0) score += 1000;
            if (element.readyState >= 2) score += 500;
            if (element.controls) score += 200;

            const duration = Number(element.duration || 0);
            if (Number.isFinite(duration) && duration > 0 && duration < 2) score -= 5000;

            const mediaWidth = Number(element.videoWidth || rect.width || 0);
            const mediaHeight = Number(element.videoHeight || rect.height || 0);
            if ((mediaWidth > 0 && mediaWidth < 320) || (mediaHeight > 0 && mediaHeight < 180)) {
                score -= 3500;
            }
        }

        if (kind === 'iframe' && /embed|player|watch|stream|media/i.test(src)) {
            score += 700;
        }

        if (element.dataset.shieldFakeRemoved) score -= 10000;
        if (hasPreviewIndicators(element, src)) score -= 4500;
        if (hasAdIndicators(element, src)) score -= 7000;

        return score;
    }

    function getScopedActiveVideo(player) {
        if (!player) return null;

        const activeCandidates = [];
        const currentActiveVideo = window.__ShieldPlayerControls?.getActiveVideo?.();
        if (currentActiveVideo) {
            activeCandidates.push(currentActiveVideo);
        }

        document.querySelectorAll('video').forEach((video) => {
            if (
                video &&
                document.contains(video) &&
                video.paused === false &&
                !video.dataset.shieldFakeRemoved &&
                isEffectivelyVisible(video)
            ) {
                activeCandidates.push(video);
            }
        });

        const seen = new Set();
        for (const video of activeCandidates) {
            if (!video || seen.has(video)) continue;
            seen.add(video);

            if (video === player || player.contains?.(video)) {
                return video;
            }

            const videoContainer = video.closest?.('.shield-detected-container, .shield-detected-player, [data-shield-id]');
            if (videoContainer && (videoContainer === player || player.contains?.(videoContainer))) {
                return video;
            }
        }

        return null;
    }

    function resolvePopupPayload(player) {
        const detectorEntries = window.__ShieldPlayerDetector?.getPlayers?.();
        const directPayload = resolveDirectPayload(player);
        if (directPayload) {
            console.log('🎯 直接綁定目前點選播放器來源:', (directPayload.videoSrc || directPayload.iframeSrc).substring(0, 120));
            return directPayload;
        }
        const scopedActiveVideo = getScopedActiveVideo(player);

        if (scopedActiveVideo && document.contains(scopedActiveVideo)) {
            const activeVideoSrc = getVideoSource(scopedActiveVideo);
            if (activeVideoSrc && !isEphemeralMediaUrl(activeVideoSrc) && !hasPreviewIndicators(scopedActiveVideo, activeVideoSrc) && !hasAdIndicators(scopedActiveVideo, activeVideoSrc)) {
                console.log('▶ 直接使用目前點選播放器範圍內的播放中影片作為彈窗目標:', activeVideoSrc.substring(0, 120));
                return {
                    videoSrc: activeVideoSrc,
                    iframeSrc: '',
                    poster: scopedActiveVideo.poster || player?.dataset?.shieldResolvedPoster || ''
                };
            }

            const fallbackPayload = resolveFallbackPayloadFromElement(scopedActiveVideo, detectorEntries);
            if (fallbackPayload) {
                console.log('▶ 點選播放器範圍內的播放中影片使用可重開來源作為彈窗目標:', (fallbackPayload.videoSrc || fallbackPayload.iframeSrc).substring(0, 120));
                return fallbackPayload;
            }
        }

        const playerRect = player.getBoundingClientRect();
        const candidates = [];
        const seen = new Set();

        function pushCandidate(element, kind, meta = {}) {
            if (!element || seen.has(element)) return;

            const src = kind === 'video' ? getVideoSource(element) : getIframePayloadSource(element);
            if (!src) return;
            if (isBlockedInterstitialUrl(src)) return;

            seen.add(element);
            candidates.push({
                element,
                kind,
                src,
                poster: meta.poster || (kind === 'video' ? (element.poster || '') : ''),
                isDirect: element === player,
                isDetected: Boolean(meta.detected),
                detectedScore: Number(meta.score || 0),
                isPrimaryCandidate: meta.primary === true
            });
        }

        function pushResolvedPayloadCandidate(element, meta = {}) {
            if (!element?.dataset) return;
            const poster = element.dataset.shieldResolvedPoster || '';

            if (element.dataset.shieldResolvedVideoSrc) {
                pushCandidate(element, 'video', {
                    ...meta,
                    score: Number(meta.score || 0) + 2500,
                    poster
                });
            }

            if (element.dataset.shieldResolvedIframeSrc) {
                pushCandidate(element, 'iframe', {
                    ...meta,
                    score: Number(meta.score || 0) + 3500,
                    poster
                });
            }
        }

        pushResolvedPayloadCandidate(player, {
            detected: true,
            primary: player.dataset.shieldPrimaryCandidate === 'true',
            score: 4000
        });

        if (player.tagName === 'VIDEO') {
            pushCandidate(player, 'video', { detected: true });
        } else if (player.tagName === 'IFRAME') {
            pushCandidate(player, 'iframe', { detected: true });
        }

        if (detectorEntries instanceof Map) {
            detectorEntries.forEach((meta, element) => {
                if (element === player || player.contains(element)) {
                    pushResolvedPayloadCandidate(element, {
                        detected: true,
                        score: meta?.score,
                        primary: meta?.isPrimaryCandidate === true
                    });
                    if (element.tagName === 'VIDEO') {
                        pushCandidate(element, 'video', { detected: true, score: meta?.score });
                    } else if (element.tagName === 'IFRAME') {
                        pushCandidate(element, 'iframe', { detected: true, score: meta?.score });
                    }
                }
            });
        }

        pushResolvedPayloadCandidate(player.closest?.('#videoplayer-v3'), {
            detected: true,
            primary: true,
            score: 5000
        });

        player.querySelectorAll('video, iframe').forEach((element) => {
            pushCandidate(element, element.tagName === 'VIDEO' ? 'video' : 'iframe');
        });

        if (candidates.length === 0) return null;

        candidates.forEach((candidate) => {
            candidate.score = scorePopupCandidate(candidate, playerRect);
        });
        candidates.sort((a, b) => b.score - a.score);

        const selected = candidates[0];
        console.log('🎯 彈窗來源候選排序:', candidates.map((candidate) => ({
            kind: candidate.kind,
            score: candidate.score,
            src: candidate.src.substring(0, 120)
        })));

        return {
            videoSrc: selected.kind === 'video' ? selected.src : '',
            iframeSrc: selected.kind === 'iframe' ? selected.src : '',
            poster: selected.poster || ''
        };
    }

    function getPlayerResolvedIframeTimestamp(player) {
        if (!player) return 0;

        const nestedIframe = player.tagName === 'IFRAME'
            ? player
            : player.querySelector?.('iframe');

        if (!nestedIframe?.dataset?.shieldResolvedAt) return 0;
        const resolvedAt = Number(nestedIframe.dataset.shieldResolvedAt || 0);
        return Number.isFinite(resolvedAt) ? resolvedAt : 0;
    }

    function shouldWaitForBetterPopupPayload(player, payload) {
        if (!player || payload?.videoSrc) return false;

        const iframeSrc = payload?.iframeSrc || getIframePayloadSource(player) || '';
        if (!iframeSrc) return false;
        if (isBlockedInterstitialUrl(iframeSrc)) return true;

        const resolvedAt = getPlayerResolvedIframeTimestamp(player);
        if (!resolvedAt) return true;

        return Date.now() - resolvedAt > 1200;
    }

    function wait(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function resolvePopupPayloadWithWait(player) {
        let payload = resolvePopupPayload(player);
        if (!shouldWaitForBetterPopupPayload(player, payload)) {
            return payload;
        }

        const initialKey = JSON.stringify({
            videoSrc: payload?.videoSrc || '',
            iframeSrc: payload?.iframeSrc || ''
        });

        for (const delay of [250, 500, 900, 1400]) {
            await wait(delay);
            const nextPayload = resolvePopupPayload(player);
            const nextKey = JSON.stringify({
                videoSrc: nextPayload?.videoSrc || '',
                iframeSrc: nextPayload?.iframeSrc || ''
            });

            if (!nextPayload) continue;

            if (nextPayload.videoSrc) {
                console.log('⏳ 等到更佳影片來源後再開 popup:', nextPayload.videoSrc.substring(0, 120));
                return nextPayload;
            }

            if (isBlockedInterstitialUrl(nextPayload.iframeSrc || '')) {
                payload = nextPayload;
                continue;
            }

            if (nextKey !== initialKey) {
                console.log('⏳ iframe 來源更新後再開 popup:', (nextPayload.iframeSrc || '').substring(0, 120));
                return nextPayload;
            }

            payload = nextPayload;
        }

        return payload;
    }

    /**
     * 開啟彈窗播放器視窗
     */
    async function openPopupPlayer(player) {
        const payload = await resolvePopupPayloadWithWait(player);
        const resolvedVideoSrc = payload?.videoSrc || '';
        const resolvedIframeSrc =
            payload?.iframeSrc ||
            getIframePayloadSource(player) ||
            '';
        const preferIframePopup = shouldPreferIframePopup(resolvedVideoSrc, resolvedIframeSrc);
        const videoSrc = preferIframePopup ? '' : resolvedVideoSrc;
        const iframeSrc = preferIframePopup ? resolvedIframeSrc : (payload?.iframeSrc || '');
        const poster = payload?.poster || '';
        const playerId = resolvePlayerControlId(player);
        const remoteControlPreferred =
            (!videoSrc && !iframeSrc) ||
            (iframeSrc && shouldOpenPopupDirectly(iframeSrc));

        if (preferIframePopup) {
            console.log('🛡️ 受保護串流改用 iframe popup 模式:', {
                videoSrc: resolvedVideoSrc.substring(0, 120),
                iframeSrc: iframeSrc.substring(0, 120)
            });
        }

        // 確保至少有可開來源或可遙控的目標
        if (!videoSrc && !iframeSrc && !playerId) {
            console.warn('⚠️ 無法取得影片來源');
            return;
        }

        // 生成唯一視窗識別碼
        const windowId = 'popup-player-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);

        // 透過 chrome.runtime.sendMessage 請求 background script 開啟視窗
        try {
            chrome.runtime.sendMessage({
                action: 'openPopupPlayer',
                windowId: windowId,
                videoSrc: videoSrc,
                iframeSrc: iframeSrc,
                poster: poster,
                playerId: playerId,
                remoteControlPreferred: remoteControlPreferred,
                title: document.title
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('⚠️ Message passing 失敗，嘗試直接開啟:', chrome.runtime.lastError.message);
                    fallbackOpenPopup(videoSrc, iframeSrc, poster);
                } else if (response && response.success) {
                    console.log('🎬 彈窗播放器已開啟 (視窗 ID:', windowId, ')');
                } else {
                    console.warn('⚠️ Background 無回應，嘗試直接開啟');
                    fallbackOpenPopup(videoSrc, iframeSrc, poster);
                }
            });
        } catch (e) {
            console.warn('⚠️ 無法傳送訊息，嘗試直接開啟:', e);
            fallbackOpenPopup(videoSrc, iframeSrc, poster);
        }
    }

    /**
     * Fallback: 直接使用 window.open 開啟
     * 當 message passing 失敗時使用
     */
    function fallbackOpenPopup(videoSrc, iframeSrc, poster) {
        if (iframeSrc && shouldOpenPopupDirectly(iframeSrc)) {
            window.open(iframeSrc, '_blank', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
            console.log('🎬 Fallback: 直接開啟外站 iframe 頁面:', iframeSrc);
            return;
        }

        try {
            const extensionUrl = chrome.runtime?.getURL?.('popup-player/popup-player.html');
            if (extensionUrl) {
                const params = new URLSearchParams();
                if (videoSrc) params.set('videoSrc', videoSrc);
                if (iframeSrc) params.set('iframeSrc', iframeSrc);
                if (poster) params.set('poster', poster);
                
                const popupUrl = `${extensionUrl}?${params.toString()}`;
                window.open(popupUrl, '_blank', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
                console.log('🎬 Fallback: 開啟彈窗播放器:', popupUrl);
                return;
            }
        } catch (e) {
            console.log('⚠️ Fallback 也失敗了');
        }

        // 最後手段：直接開啟影片來源
        const targetUrl = videoSrc || iframeSrc;
        if (targetUrl) {
            window.open(targetUrl, '_blank', 'width=1280,height=720');
            console.log('🎬 直接開啟影片:', targetUrl);
        }
    }


    /**
     * 檢查元素是否覆蓋在播放器上方
     */
    function isOverlayingPlayer(element, playerRect) {
        const elemRect = element.getBoundingClientRect();

        // 檢查是否有重疊
        const isOverlapping = !(
            elemRect.right < playerRect.left ||
            elemRect.left > playerRect.right ||
            elemRect.bottom < playerRect.top ||
            elemRect.top > playerRect.bottom
        );

        if (!isOverlapping) return false;

        // 檢查 z-index
        const style = window.getComputedStyle(element);
        const position = style.position;
        const zIndex = parseInt(style.zIndex) || 0;

        // absolute 或 fixed 定位,且有 z-index 的元素
        return (position === 'absolute' || position === 'fixed') && zIndex > 0;
    }

    /**
     * 移除播放器上的覆蓋元素 (增強版)
     */
    function removeOverlays(player) {
        const playerRect = player.getBoundingClientRect();

        // 只檢查可見的播放器
        if (playerRect.width === 0 || playerRect.height === 0) return;

        let removedCount = 0;
        
        // 方法 1: 使用 elementsFromPoint 精確偵測播放器中心的覆蓋層
        const centerX = playerRect.left + playerRect.width / 2;
        const centerY = playerRect.top + playerRect.height / 2;
        
        try {
            const elementsAtCenter = document.elementsFromPoint(centerX, centerY);
            
            elementsAtCenter.forEach(element => {
                // 跳過播放器本身和合法元素
                if (element === player || player.contains(element)) return;
                if (element.tagName === 'HTML' || element.tagName === 'BODY') return;
                if (element.tagName === 'VIDEO' || element.tagName === 'IFRAME') return;
                if (element.classList.contains('player-enhanced-badge')) return;
                
                // 檢查是否為播放控制項 (白名單)
                const elemClass = (element.className || '').toString().toLowerCase();
                const elemId = (element.id || '').toLowerCase();
                if (/control|bar|timeline|progress|scrubber|rail|icon|button|play|pause|volume|fullscreen|ui|layer/.test(elemClass + elemId)) return;
                
                const style = window.getComputedStyle(element);
                const opacity = parseFloat(style.opacity);
                const bgColor = style.backgroundColor;
                
                // 檢測透明覆蓋 (用於點擊劫持)
                const isTransparent = opacity < 0.3 ||
                    bgColor === 'transparent' ||
                    bgColor === 'rgba(0, 0, 0, 0)';
                
                const isPositioned = style.position === 'absolute' || style.position === 'fixed';
                const zIndex = parseInt(style.zIndex) || 0;
                
                // 透明或高 z-index 的覆蓋層
                if (isPositioned && (isTransparent || zIndex > 100)) {
                    element.style.setProperty('pointer-events', 'none', 'important');
                    console.log('🎯 已禁用播放器中心覆蓋層互動:', element.className || element.tagName);
                    removedCount++;
                }
            });
        } catch (e) {}

        // 方法 2: 一般性覆蓋層偵測
        const allElements = document.querySelectorAll('div, aside, section, span, a');

        allElements.forEach(element => {
            // 跳過播放器本身及其子元素
            if (player.contains(element) || element === player) return;

            // 跳過我們自己的標籤
            if (element.classList.contains('player-enhanced-badge')) return;
            
            // 檢查是否為播放控制項 (白名單)
            const classNameStr = (element.className || '').toString().toLowerCase();
            const idStr = (element.id || '').toLowerCase();
            if (/control|bar|timeline|progress|scrubber|rail|icon|button|play|pause|volume|fullscreen|ui|layer/.test(classNameStr + idStr)) return;

            if (isOverlayingPlayer(element, playerRect)) {
                // 檢查元素是否像廣告 (透過常見 class/id)
                const className = (element.className || '').toString().toLowerCase();
                const elementId = (element.id || '').toLowerCase();
                
                const adPatterns = ['ad', 'overlay', 'popup', 'banner', 'sponsor', 'promo', 'click', 'notification', 'permission', 'push', 'modal', 'subscription'];
                const isLikelyAd = adPatterns.some(p => className.includes(p) || elementId.includes(p));
                
                // 檢查是否有廣告連結
                const hasAdLink = element.querySelector && (
                    element.querySelector('a[href*="exoclick"]') ||
                    element.querySelector('a[href*="juicyads"]') ||
                    element.querySelector('a[href*="trafficjunky"]')
                );

                if (isLikelyAd || hasAdLink) {
                    element.style.setProperty('display', 'none', 'important');
                    element.style.setProperty('pointer-events', 'none', 'important');
                    element.dataset.removedByEnhancer = 'true';
                    removedCount++;
                    console.log('🗑️ 已移除覆蓋元素:', element.className || element.id);
                }
            }
        });

        if (removedCount > 0) {
            console.log(`✓ 共處理 ${removedCount} 個覆蓋元素`);
        }
    }

    /**
     * 處理所有偵測到的播放器
     */
    function processPlayers(players, infoList = null) {
        if (!cleanupEnabled) return;
        const infoIndex = buildInfoIndex(infoList);
        players.forEach(player => {
            if (!isEligiblePlayer(player, infoIndex)) {
                return;
            }
            enhancePlayer(player);
            if (cleanupEnabled && shouldRunAggressiveOverlayCleanup) {
                removeOverlays(player);
            }
        });
    }

    function processExistingDetectedPlayers() {
        const detectorEntries = getDetectorEntries();
        if (!(detectorEntries instanceof Map) || detectorEntries.size === 0) return;
        const players = Array.from(detectorEntries.keys()).filter((player) => document.contains(player));
        if (players.length === 0) return;
        const info = window.__ShieldPlayerDetector?.getPlayersInfo?.() || null;
        processPlayers(players, info);
    }

    /**
     * 定期檢查並移除覆蓋元素
     */
    function startOverlayMonitoring() {
        if (!shouldRunAggressiveOverlayCleanup) return;
        if (overlayMonitoringStarted) return;
        overlayMonitoringStarted = true;

        setInterval(() => {
            if (!cleanupEnabled) return;
            const enhancedPlayers = document.querySelectorAll('.player-enhanced-active');
            enhancedPlayers.forEach(player => {
                removeOverlays(player);
            });
        }, OVERLAY_CHECK_INTERVAL);
    }

    /**
     * 處理 iframe 播放器 (最小干預版)
     * 
     * 重要: 跨域 iframe 的內部 DOM 無法被 JavaScript 存取。
     * 我們只能處理父頁面的覆蓋層,不能干擾 iframe 內部。
     */
    function enhanceIframes() {
        if (!cleanupEnabled) return;
        const iframes = document.querySelectorAll('iframe[src*="player"], iframe[src*="embed"], iframe[src*="myvidplay"], iframe[src*="javboys.online"]');
        
        iframes.forEach(iframe => {
            if (iframe.dataset.iframeEnhanced === 'true') return;
            
            // 標記已處理
            iframe.dataset.iframeEnhanced = 'true';
            
            // 確保 iframe 可見且可互動 (不過度調整)
            iframe.style.setProperty('pointer-events', 'auto', 'important');
            
            console.log('✅ iframe 已設定為可互動:', iframe.src.substring(0, 50));
        });
    }

    /**
     * 移除父頁面的廣告覆蓋層 (僅處理父頁面,不觸及 iframe 內部)
     */
    function removeParentPageOverlays() {
        if (!cleanupEnabled) return;
        const allElements = document.querySelectorAll('div, aside, section, span');
        let removedCount = 0;
        
        allElements.forEach(element => {
            // 不處理 iframe 內部元素 (實際上也無法存取)
            if (element.tagName === 'IFRAME') return;
            
            const className = (element.className || '').toString().toLowerCase();
            const id = (element.id || '').toLowerCase();
            const text = (element.innerText || '').substring(0, 100).toLowerCase();
            
            const style = window.getComputedStyle(element);
            const zIndex = parseInt(style.zIndex) || 0;
            const position = style.position;
            
            // 只移除明顯的廣告元素
            const suspiciousPatterns = [
                'notification', 'permission', 'allow', 'block', 'subscribe',
                'modal', 'overlay', 'popup', 'ad-container', 'banner'
            ];
            
            const isSuspicious = suspiciousPatterns.some(p => 
                className.includes(p) || id.includes(p) || text.includes(p)
            );
            
            // 高 z-index + 定位 + 可疑內容 = 移除
            if ((position === 'absolute' || position === 'fixed') && zIndex > 100 && isSuspicious) {
                element.style.setProperty('display', 'none', 'important');
                element.remove();
                removedCount++;
                console.log('🗑️ 已移除父頁面廣告元素:', className || id || element.tagName);
            }
        });
        
        if (removedCount > 0) {
            console.log(`✅ 父頁面清理: 移除了 ${removedCount} 個廣告元素`);
        }
    }

    /**
     * 初始化
     */
    function init() {
        console.log('🚀 Player Enhancer 已載入 [最小干預模式]');
        console.log('⚠️  注意: 由於瀏覽器安全限制,無法處理跨域 iframe 內部的覆蓋層');
        console.log('📌 建議: 使用 uBlock Origin 或其他擴充功能配合使用');

        if (IS_TOP_FRAME) {
            bindResolvedFrameSourceListener();
        } else {
            announceResolvedFrameSource();
        }
        bindCleanupModeUpdates();

        loadSiteProfiles().then(() => {
            if (!shouldRunAggressiveOverlayCleanup) {
                console.log('🧩 相容模式啟用：已停用侵入式覆蓋層清理');
            }
        }).catch(() => {});

        // 監聽播放器偵測事件
        document.addEventListener('shieldPlayersDetected', (event) => {
            const players = event.detail.eligiblePlayers || event.detail.players || [];
            const info = event.detail.info || [];
            console.log(`📡 收到播放器偵測事件: ${players.length} 個播放器`);
            processPlayers(players, info);
        });

        // 處理 iframes (最小干預)
        enhanceIframes();
        setInterval(() => {
            enhanceIframes();
            if (cleanupEnabled && shouldRunAggressiveOverlayCleanup) {
                removeParentPageOverlays();
            }
        }, 5000); // 5秒一次

        const observer = new MutationObserver(() => {
            enhanceIframes();
            if (cleanupEnabled && shouldRunAggressiveOverlayCleanup) {
                removeParentPageOverlays();
            }
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: false }); // subtree: false 避免過度監控
        }

        resolveCleanupMode().then((enabled) => {
            cleanupEnabled = enabled;
            if (!cleanupEnabled) {
                console.log('⚪ Player Enhancer: 白名單增強模式，已停用覆蓋層清理');
                return;
            }

            startOverlayMonitoring();
            if (shouldRunAggressiveOverlayCleanup) {
                removeParentPageOverlays();
            }
        });

        // 處理已存在的播放器
        setTimeout(() => {
            processExistingDetectedPlayers();
        }, 1000);
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'disableBlocking') {
            cleanupEnabled = false;
            sendResponse({ success: true, disabled: true });
            return true;
        }
        return false;
    });

    init();
})();
