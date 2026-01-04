// Player Detector - 自動偵測頁面中的媒體播放器
// 支援 HTML5 video, iframe 嵌入播放器 (YouTube, Vimeo 等)

(function () {
    'use strict';

    // 儲存已偵測到的播放器
    const detectedPlayers = new Set();
    let playerCount = 0;

    /**
     * 偵測 HTML5 <video> 元素
     */
    function detectHTML5Players() {
        const videoElements = document.querySelectorAll('video');
        let newPlayers = 0;

        videoElements.forEach(video => {
            if (!detectedPlayers.has(video)) {
                detectedPlayers.add(video);
                video.classList.add('enhanced-player');
                video.dataset.playerType = 'html5';
                newPlayers++;
                console.log('🎬 偵測到 HTML5 播放器:', video);
            }
        });

        return newPlayers;
    }

    /**
     * 偵測 iframe 嵌入播放器 (YouTube, Vimeo, Dailymotion 等)
     */
    function detectIframePlayers() {
        const iframes = document.querySelectorAll('iframe');
        let newPlayers = 0;

        iframes.forEach(iframe => {
            const src = iframe.src || '';
            const isPlayer =
                src.includes('youtube.com/embed') ||
                src.includes('youtube-nocookie.com/embed') ||
                src.includes('player.vimeo.com') ||
                src.includes('dailymotion.com/embed') ||
                src.includes('twitch.tv') ||
                src.includes('facebook.com/plugins/video') ||
                src.includes('bitchute.com/embed');

            if (isPlayer && !detectedPlayers.has(iframe)) {
                detectedPlayers.add(iframe);
                iframe.classList.add('enhanced-player');
                iframe.dataset.playerType = 'iframe';
                newPlayers++;

                // 識別具體平台
                if (src.includes('youtube')) {
                    iframe.dataset.platform = 'youtube';
                } else if (src.includes('vimeo')) {
                    iframe.dataset.platform = 'vimeo';
                } else if (src.includes('dailymotion')) {
                    iframe.dataset.platform = 'dailymotion';
                }

                console.log('🎬 偵測到嵌入播放器:', iframe.dataset.platform || 'unknown', iframe);
            }
        });

        return newPlayers;
    }

    /**
     * 偵測自訂播放器容器 (透過常見 class/id 模式)
     */
    function detectCustomPlayers() {
        const commonPatterns = [
            '.video-player',
            '.player-container',
            '.video-container',
            '[id*="player"]',
            '[class*="player"]',
            '[class*="video-wrapper"]'
        ];

        let newPlayers = 0;

        commonPatterns.forEach(pattern => {
            const elements = document.querySelectorAll(pattern);
            elements.forEach(element => {
                // 確保這個容器包含 video 或 iframe
                const hasVideoChild = element.querySelector('video, iframe');
                if (hasVideoChild && !detectedPlayers.has(element)) {
                    detectedPlayers.add(element);
                    element.classList.add('enhanced-player-container');
                    element.dataset.playerType = 'custom';
                    newPlayers++;
                    console.log('🎬 偵測到自訂播放器容器:', element);
                }
            });
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
            console.log(`✓ 本次偵測到 ${totalNew} 個新播放器 (總計: ${playerCount})`);

            // 通知 background script
            chrome.runtime.sendMessage({
                action: 'updatePlayerCount',
                count: playerCount
            });

            // 觸發自訂事件,供 player-enhancer.js 使用
            document.dispatchEvent(new CustomEvent('playersDetected', {
                detail: { players: Array.from(detectedPlayers) }
            }));
        }
    }

    /**
     * 使用 MutationObserver 監聽 DOM 變化
     */
    function observeDOMChanges() {
        const observer = new MutationObserver((mutations) => {
            let shouldRedetect = false;

            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldRedetect = true;
                    break;
                }
            }

            if (shouldRedetect) {
                // 延遲偵測,避免頻繁執行
                setTimeout(detectAllPlayers, 500);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('👀 MutationObserver 已啟動,監聽 DOM 變化');
    }

    /**
     * 初始化
     */
    function init() {
        console.log('🚀 Player Detector 已載入');

        // 頁面載入時立即偵測
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', detectAllPlayers);
        } else {
            detectAllPlayers();
        }

        // 額外延遲偵測 (處理動態載入的播放器)
        setTimeout(detectAllPlayers, 2000);
        setTimeout(detectAllPlayers, 5000);

        // 啟動 DOM 監聽
        if (document.body) {
            observeDOMChanges();
        } else {
            document.addEventListener('DOMContentLoaded', observeDOMChanges);
        }
    }

    init();

    // 監聽來自 popup 的訊息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getPlayerCount') {
            sendResponse({ count: playerCount });
            return true;
        }
    });
})();
