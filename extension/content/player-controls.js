// Player Controls v4.0 - 播放器增強控制
// 快捷鍵、播放速度控制、截圖功能

(function () {
    'use strict';

    let mediaAutomationReady = false;
    let mediaAutomationEnabled = false;
    let siteStateHelper = null;

    function shouldRunMediaAutomation() {
        if (!mediaAutomationReady) return false;
        if (siteStateHelper?.shouldRunMediaAutomation) {
            mediaAutomationEnabled = siteStateHelper.shouldRunMediaAutomation(window.location.hostname);
        }
        return mediaAutomationEnabled;
    }

    // ========== 快捷鍵設定 ==========
    const HOTKEYS = {
        // 播放控制
        'Space': { action: 'togglePlay', desc: '播放/暫停' },
        
        // 音量
        'ArrowUp': { action: 'volumeUp', desc: '音量 +10%' },
        'ArrowDown': { action: 'volumeDown', desc: '音量 -10%' },
        'm': { action: 'toggleMute', desc: '靜音切換' },
        'KeyM': { action: 'toggleMute', desc: '靜音切換' },
        
        // 跳轉
        'ArrowLeft': { action: 'seekBack', desc: '倒退 5 秒' },
        'ArrowRight': { action: 'seekForward', desc: '前進 5 秒' },
        'Home': { action: 'seekStart', desc: '跳到開頭' },
        'End': { action: 'seekEnd', desc: '跳到結尾' },
        
        // 播放速度
        '<': { action: 'speedDown', desc: '降低速度' },
        '>': { action: 'speedUp', desc: '提高速度' },
        'Shift+,': { action: 'speedDown', desc: '降低速度' },
        'Shift+.': { action: 'speedUp', desc: '提高速度' },
        
        // 全螢幕
        'f': { action: 'toggleFullscreen', desc: '全螢幕切換' },
        'KeyF': { action: 'toggleFullscreen', desc: '全螢幕切換' },
        
        // 截圖
        's': { action: 'screenshot', desc: '截圖' },
        'KeyS': { action: 'screenshot', desc: '截圖' },

        // 重複播放
        'l': { action: 'toggleLoop', desc: '重複播放' },
        'KeyL': { action: 'toggleLoop', desc: '重複播放' },

        // AB 重複播放
        '[': { action: 'setPointA', desc: '設定 A 點' },
        'BracketLeft': { action: 'setPointA', desc: '設定 A 點' },
        ']': { action: 'setPointB', desc: '設定 B 點' },
        'BracketRight': { action: 'setPointB', desc: '設定 B 點' },
        
        // 數字鍵跳轉由 handleDigitKey() 處理，支援雙位數精準跳轉
        // 單按: 0-9 = 0%-90%（如 YouTube）
        // 連按: 500ms 內按兩位數 = 0%-99%（如 42 = 42%）
    };

    const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

    let activeVideo = null;
    let speedControlUI = null;
    let toastTimeout = null;
    
    let pendingDigit = null;
    let digitTimeout = null;
    const DIGIT_COMBO_MS = 500;
    let pendingArrow = null;
    let arrowTimeout = null;
    const ARROW_COMBO_MS = 320;

    // AB 重複播放狀態
    let abPointA = null;
    let abPointB = null;
    let abLoopActive = false;
    let abLoopVideo = null;

    function waitForSiteStateHelper(attempt = 0) {
        const helper = window.__ShieldSiteStateHelper;
        if (helper?.load) {
            siteStateHelper = helper;
            return Promise.resolve(helper);
        }
        if (attempt >= 20) {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            window.setTimeout(() => {
                resolve(waitForSiteStateHelper(attempt + 1));
            }, 50);
        });
    }

    function applyMediaAutomationState() {
        if (siteStateHelper?.shouldRunMediaAutomation) {
            mediaAutomationEnabled = siteStateHelper.shouldRunMediaAutomation(window.location.hostname);
            mediaAutomationReady = true;
            return mediaAutomationEnabled;
        }
        mediaAutomationEnabled = false;
        mediaAutomationReady = true;
        return mediaAutomationEnabled;
    }

    function resolveMediaAutomationState() {
        return waitForSiteStateHelper().then((helper) => {
            if (!helper?.load) {
                return applyMediaAutomationState();
            }
            return helper.load()
                .catch(() => null)
                .then(() => applyMediaAutomationState());
        });
    }

    function removeSpeedControlUI() {
        if (!speedControlUI || !document.contains(speedControlUI)) {
            speedControlUI = null;
            return;
        }
        speedControlUI.remove();
        speedControlUI = null;
    }

    function resetManagedControlState() {
        removeSpeedControlUI();
        clearAbLoop();
        abPointA = null;
        abPointB = null;
        activeVideo = null;
    }

    function syncManagedVideos() {
        getManagedVideos().forEach((video) => {
            bindExclusivePlayback(video);
            createSpeedControlUI(video);
        });
    }

    function bindMediaAutomationUpdates() {
        if (!siteStateHelper?.subscribe) return;
        siteStateHelper.subscribe(() => {
            const previous = mediaAutomationEnabled;
            const next = applyMediaAutomationState();
            if (!next) {
                resetManagedControlState();
                return;
            }
            if (!previous) {
                syncManagedVideos();
            }
        });
    }

    function isManagedVideo(video) {
        if (!video || !document.contains(video)) return false;
        if (video.dataset.shieldFakeRemoved) return false;
        if (video.dataset.shieldId) return true;
        return Boolean(video.closest('.shield-detected-player, .shield-detected-container, [data-shield-id]'));
    }

    function getManagedVideos() {
        const allVideos = Array.from(document.querySelectorAll('video')).filter((video) => !video.dataset.shieldFakeRemoved);
        const shieldVideos = allVideos.filter((video) => isManagedVideo(video));
        if (shieldVideos.length > 0) {
            return shieldVideos;
        }
        return allVideos;
    }

    /**
     * 取得當前活躍的影片元素
     */
    function getActiveVideo() {
        // 優先使用已設定的活躍影片
        if (activeVideo && document.contains(activeVideo) && !activeVideo.dataset.shieldFakeRemoved) {
            return activeVideo;
        }
        
        // 尋找正在播放的影片
        const videos = getManagedVideos();
        for (const video of videos) {
            if (!video.paused) {
                activeVideo = video;
                return video;
            }
        }
        
        // 尋找可見的影片
        for (const video of videos) {
            const rect = video.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 50) {
                activeVideo = video;
                return video;
            }
        }
        
        // 返回第一個影片
        if (videos.length > 0) {
            activeVideo = videos[0];
            return videos[0];
        }
        
        return null;
    }

    function enforceSingleActiveVideo(currentVideo) {
        if (!currentVideo || !document.contains(currentVideo)) return;

        getManagedVideos().forEach((video) => {
            if (video === currentVideo) return;
            if (video.paused) return;
            video.pause();
        });

        activeVideo = currentVideo;
    }

    function bindExclusivePlayback(video) {
        if (!video || video.dataset.shieldExclusivePlaybackBound === 'true') return;

        video.dataset.shieldExclusivePlaybackBound = 'true';
        video.addEventListener('play', () => {
            enforceSingleActiveVideo(video);
        });
    }

    /**
     * 顯示提示訊息
     */
    function showToast(message, duration = 1500) {
        // 移除現有的 toast
        const existing = document.querySelector('.shield-toast');
        if (existing) existing.remove();
        
        clearTimeout(toastTimeout);
        
        const toast = document.createElement('div');
        toast.className = 'shield-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            z-index: 2147483647;
            pointer-events: none;
            animation: shieldToastIn 0.2s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        document.body.appendChild(toast);
        
        toastTimeout = setTimeout(() => {
            toast.style.animation = 'shieldToastOut 0.2s ease forwards';
            setTimeout(() => toast.remove(), 200);
        }, duration);
    }

    /**
     * 執行快捷鍵動作
     */
    function executeActionForVideo(video, action, value) {
        if (!video && action !== 'screenshot') {
            return false;
        }

        switch (action) {
            case 'togglePlay':
                if (video.paused) {
                    enforceSingleActiveVideo(video);
                    video.play();
                    showToast('▶ 播放');
                } else {
                    video.pause();
                    showToast('⏸ 暫停');
                }
                break;
            case 'toggleMute':
                video.muted = !video.muted;
                showToast(video.muted ? '🔇 靜音' : '🔊 取消靜音');
                break;
            case 'seekBack':
                video.currentTime = Math.max(0, video.currentTime - 5);
                showToast('⏪ -5 秒');
                break;
            case 'seekForward':
                video.currentTime = Math.min(video.duration, video.currentTime + 5);
                showToast('⏩ +5 秒');
                break;
            case 'toggleFullscreen':
                toggleFullscreen(video);
                break;
            case 'toggleLoop':
                video.loop = !video.loop;
                break;
            case 'setVolume': {
                const nextVolume = Math.max(0, Math.min(1, Number(value)));
                video.volume = Number.isFinite(nextVolume) ? nextVolume : video.volume;
                video.muted = video.volume === 0;
                showToast(`🔊 音量 ${Math.round(video.volume * 100)}%`);
                break;
            }
            case 'setSpeed': {
                const nextRate = Number(value);
                if (Number.isFinite(nextRate) && nextRate > 0) {
                    video.playbackRate = nextRate;
                    showToast(`⚡ ${video.playbackRate}x 速度`);
                    updateSpeedControlUI(video);
                }
                break;
            }
            case 'seekToRatio': {
                const ratio = Number(value);
                if (Number.isFinite(ratio) && !isNaN(video.duration) && video.duration > 0) {
                    video.currentTime = video.duration * Math.max(0, Math.min(1, ratio));
                    showToast(`⏩ ${Math.round(ratio * 100)}%`);
                }
                break;
            }
            default:
                return false;
        }
        return true;
    }

    function executeActionOnVideo(video, action, value) {
        if (executeActionForVideo(video, action, value)) {
            return true;
        }
        return executeAction(action, value);
    }

    function executeAction(action, value) {
        const video = getActiveVideo();
        if (executeActionForVideo(video, action, value)) return true;
        if (!video && action !== 'screenshot') return false;
        
        switch (action) {
            case 'volumeUp':
                video.volume = Math.min(1, video.volume + 0.1);
                showToast(`🔊 音量 ${Math.round(video.volume * 100)}%`);
                break;
                
            case 'volumeDown':
                video.volume = Math.max(0, video.volume - 0.1);
                showToast(`🔉 音量 ${Math.round(video.volume * 100)}%`);
                break;
                
            case 'seekBackLong':
                video.currentTime = Math.max(0, video.currentTime - 10);
                showToast('⏪ -10 秒');
                break;
                
            case 'seekForwardLong':
                video.currentTime = Math.min(video.duration, video.currentTime + 10);
                showToast('⏩ +10 秒');
                break;
                
            case 'seekStart':
                video.currentTime = 0;
                showToast('⏮ 開頭');
                break;
                
            case 'seekEnd':
                video.currentTime = video.duration - 1;
                showToast('⏭ 結尾');
                break;
                
            case 'seekPercent':
                if (!isNaN(video.duration)) {
                    video.currentTime = video.duration * (value / 100);
                    showToast(`⏩ ${value}%`);
                }
                break;
                
            case 'speedUp':
                changeSpeed(video, 1);
                break;
                
            case 'speedDown':
                changeSpeed(video, -1);
                break;
                
            case 'setPointA':
                abPointA = video.currentTime;
                abPointB = null;
                clearAbLoop();
                showToast(`🅰 A 點 ${formatTime(abPointA)}`);
                break;

            case 'setPointB':
                if (abPointA === null) {
                    showToast('⚠ 請先設定 A 點');
                    break;
                }
                abPointB = video.currentTime;
                if (abPointB <= abPointA) {
                    showToast('⚠ B 點必須在 A 點之後');
                    abPointB = null;
                    break;
                }
                startAbLoop(video);
                showToast(`🅱 A-B 循環 ${formatTime(abPointA)} → ${formatTime(abPointB)}`);
                break;

            case 'clearAbLoop':
                clearAbLoop();
                abPointA = null;
                abPointB = null;
                showToast('🅰🅱 A-B 循環已清除');
                break;

            case 'screenshot':
                captureScreenshot(video);
                break;

            default:
                return false;
        }

        return true;
    }

    function resolveMessageTargetVideo(message) {
        const hasExplicitTarget = Boolean(message?.playerId) || typeof message?.playerIndex === 'number';
        let video = null;

        if (message?.playerId) {
            const target = document.querySelector(`[data-shield-id="${message.playerId}"]`);
            video = target?.tagName === 'VIDEO' ? target : target?.querySelector('video') || null;
            if (!video) {
                return { hasExplicitTarget, video: null, missing: true };
            }
        } else if (typeof message?.playerIndex === 'number') {
            const videos = getManagedVideos();
            video = videos[message.playerIndex] || null;
            if (!video) {
                return { hasExplicitTarget, video: null, missing: true };
            }
        } else if (window !== window.top) {
            return { hasExplicitTarget, video: null, missing: true };
        }

        return { hasExplicitTarget, video, missing: false };
    }

    function buildVideoState(video) {
        return {
            found: Boolean(video),
            paused: video ? video.paused : null,
            muted: video ? video.muted : null,
            loop: video ? video.loop : null,
            currentTime: video && Number.isFinite(video.currentTime) ? video.currentTime : null,
            duration: video && Number.isFinite(video.duration) ? video.duration : null,
            volume: video ? video.volume : null,
            playbackRate: video ? video.playbackRate : null,
            ended: video ? video.ended : null,
            resolution: video ? {
                width: Number(video.videoWidth || 0),
                height: Number(video.videoHeight || 0)
            } : null,
            abLoop: abLoopActive,
            abPointA: abPointA,
            abPointB: abPointB
        };
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function abLoopHandler() {
        if (!abLoopActive || !abLoopVideo || abPointA === null || abPointB === null) return;
        if (abLoopVideo.currentTime >= abPointB) {
            abLoopVideo.currentTime = abPointA;
        }
    }

    function startAbLoop(video) {
        clearAbLoop();
        abLoopVideo = video;
        abLoopActive = true;
        video.currentTime = abPointA;
        video.addEventListener('timeupdate', abLoopHandler);
    }

    function clearAbLoop() {
        if (abLoopVideo) {
            abLoopVideo.removeEventListener('timeupdate', abLoopHandler);
        }
        abLoopActive = false;
        abLoopVideo = null;
    }

    /**
     * 改變播放速度
     */
    function changeSpeed(video, direction) {
        const currentIndex = SPEED_STEPS.findIndex(s => Math.abs(s - video.playbackRate) < 0.01);
        let newIndex;
        
        if (currentIndex === -1) {
            // 找到最接近的
            newIndex = SPEED_STEPS.findIndex(s => s >= video.playbackRate);
            if (newIndex === -1) newIndex = SPEED_STEPS.length - 1;
        } else {
            newIndex = currentIndex + direction;
        }
        
        newIndex = Math.max(0, Math.min(SPEED_STEPS.length - 1, newIndex));
        video.playbackRate = SPEED_STEPS[newIndex];
        showToast(`⚡ ${video.playbackRate}x 速度`);
        
        updateSpeedControlUI(video);
    }

    /**
     * 切換全螢幕
     */
    function toggleFullscreen(video) {
        const container = video.closest('.shield-detected-container, .player-enhanced-active') || video;
        
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
            showToast('退出全螢幕');
        } else {
            (container.requestFullscreen || container.webkitRequestFullscreen || container.mozRequestFullScreen)
                ?.call(container)
                ?.catch(() => {
                    video.requestFullscreen?.().catch(() => {});
                });
            showToast('全螢幕');
        }
    }

    /**
     * 截圖功能
     */
    function captureScreenshot(video) {
        if (!video) {
            video = getActiveVideo();
            if (!video) {
                showToast('❌ 找不到影片');
                return;
            }
        }
        
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || video.clientWidth;
            canvas.height = video.videoHeight || video.clientHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // 轉換為 blob 並下載
            canvas.toBlob((blob) => {
                if (!blob) {
                    showToast('❌ 截圖失敗 (跨域限制)');
                    return;
                }
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `screenshot_${Date.now()}.png`;
                a.click();
                URL.revokeObjectURL(url);
                
                showToast('📸 截圖已儲存');
            }, 'image/png');
        } catch (e) {
            showToast('❌ 截圖失敗 (跨域限制)');
            console.error('[Controls] 截圖失敗:', e);
        }
    }

    /**
     * 建立速度控制 UI
     */
    function createSpeedControlUI(video) {
        if (speedControlUI && document.contains(speedControlUI)) return;
        
        const container = video.closest('.shield-detected-container, .player-enhanced-active') || video.parentElement;
        if (!container) return;
        
        speedControlUI = document.createElement('div');
        speedControlUI.className = 'shield-speed-control';
        speedControlUI.setAttribute('data-shield-internal', 'true');
        speedControlUI.innerHTML = `
            <button class="shield-speed-btn" data-speed="0.5">0.5x</button>
            <button class="shield-speed-btn active" data-speed="1">1x</button>
            <button class="shield-speed-btn" data-speed="1.5">1.5x</button>
            <button class="shield-speed-btn" data-speed="2">2x</button>
        `;
        
        speedControlUI.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 2147483646;
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: auto;
        `;
        
        speedControlUI.querySelectorAll('.shield-speed-btn').forEach(btn => {
            btn.style.cssText = `
                padding: 4px 8px;
                background: rgba(0,0,0,0.7);
                border: none;
                border-radius: 4px;
                color: #fff;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.2s;
            `;
            
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const speed = parseFloat(btn.dataset.speed);
                video.playbackRate = speed;
                showToast(`⚡ ${speed}x 速度`);
                updateSpeedControlUI(video);
            });
        });
        
        container.style.position = container.style.position || 'relative';
        container.appendChild(speedControlUI);
        
        // 懸浮顯示
        container.addEventListener('mouseenter', () => {
            if (speedControlUI) speedControlUI.style.opacity = '1';
        });
        container.addEventListener('mouseleave', () => {
            if (speedControlUI) speedControlUI.style.opacity = '0';
        });
        
        updateSpeedControlUI(video);
    }

    /**
     * 更新速度控制 UI
     */
    function updateSpeedControlUI(video) {
        if (!speedControlUI) return;
        
        const currentSpeed = video.playbackRate;
        speedControlUI.querySelectorAll('.shield-speed-btn').forEach(btn => {
            const speed = parseFloat(btn.dataset.speed);
            if (Math.abs(speed - currentSpeed) < 0.01) {
                btn.style.background = 'rgba(66, 133, 244, 0.9)';
            } else {
                btn.style.background = 'rgba(0,0,0,0.7)';
            }
        });
    }

    /**
     * 數字鍵跳轉：單鍵 0%-90%，500ms 內雙鍵 00%-99%
     * @returns {boolean} 是否已處理
     */
    function handleDigitKey(digit) {
        if (pendingDigit !== null) {
            clearTimeout(digitTimeout);
            const percent = pendingDigit * 10 + digit;
            pendingDigit = null;
            executeAction('seekPercent', percent);
            return true;
        }
        
        pendingDigit = digit;
        digitTimeout = setTimeout(() => {
            const d = pendingDigit;
            pendingDigit = null;
            executeAction('seekPercent', d * 10);
        }, DIGIT_COMBO_MS);
        return true;
    }

    /**
     * 方向鍵雙擊跳轉：
     * - 單擊 ←/→：±5 秒
     * - 320ms 內同方向雙擊：±10 秒
     */
    function handleArrowCombo(arrowCode) {
        const isLeft = arrowCode === 'ArrowLeft';
        const shortAction = isLeft ? 'seekBack' : 'seekForward';
        const longAction = isLeft ? 'seekBackLong' : 'seekForwardLong';

        if (pendingArrow) {
            clearTimeout(arrowTimeout);

            if (pendingArrow === arrowCode) {
                pendingArrow = null;
                executeAction(longAction);
                return true;
            }

            executeAction(pendingArrow === 'ArrowLeft' ? 'seekBack' : 'seekForward');
        }

        pendingArrow = arrowCode;
        arrowTimeout = setTimeout(() => {
            const queued = pendingArrow;
            pendingArrow = null;
            if (queued) {
                executeAction(queued === 'ArrowLeft' ? 'seekBack' : 'seekForward');
            }
        }, ARROW_COMBO_MS);

        return true;
    }

    /**
     * 鍵盤事件處理
     */
    function handleKeydown(e) {
        if (!shouldRunMediaAutomation()) {
            return;
        }

        // 忽略輸入框
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }
        
        // 數字鍵走雙位數跳轉邏輯
        const digit = parseInt(e.key, 10);
        if (!isNaN(digit) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            if (handleDigitKey(digit)) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        
        // 建構快捷鍵識別碼
        let key = e.key;
        if (e.shiftKey && !['Shift'].includes(key)) {
            key = `Shift+${key}`;
        }

        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (handleArrowCombo(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        
        // 也嘗試用 code
        const code = e.code;
        
        const hotkey = HOTKEYS[key] || HOTKEYS[code];
        if (hotkey) {
            const handled = executeAction(hotkey.action, hotkey.value);
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }

    /**
     * 注入樣式
     */
    function injectStyles() {
        if (document.querySelector('#shield-controls-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'shield-controls-styles';
        style.textContent = `
            @keyframes shieldToastIn {
                from { opacity: 0; transform: translateX(-50%) translateY(10px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            @keyframes shieldToastOut {
                from { opacity: 1; transform: translateX(-50%) translateY(0); }
                to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            }
            .shield-speed-btn:hover {
                background: rgba(50, 50, 50, 0.9) !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 初始化
     */
    function init() {
        console.log('🚀 Player Controls v4.0 已載入');
        
        injectStyles();
        
        // 鍵盤快捷鍵
        document.addEventListener('keydown', handleKeydown, true);
        
        // 監聽播放器偵測事件
        document.addEventListener('shieldPlayersDetected', (event) => {
            if (!shouldRunMediaAutomation()) return;
            const players = event.detail.eligiblePlayers || event.detail.players || [];
            players.forEach(player => {
                const video = player.tagName === 'VIDEO' ? player : player.querySelector('video');
                if (video) {
                    bindExclusivePlayback(video);
                    createSpeedControlUI(video);
                }
            });
        });
        
        // 點擊影片時設為活躍
        document.addEventListener('click', (e) => {
            const video = e.target.closest('video') || e.target.closest('.shield-detected-container')?.querySelector('video');
            if (video && isManagedVideo(video)) {
                activeVideo = video;
            }
        }, true);

        document.addEventListener('play', (e) => {
            if (!(e.target instanceof HTMLVideoElement)) return;
            enforceSingleActiveVideo(e.target);
        }, true);

        resolveMediaAutomationState().then((enabled) => {
            bindMediaAutomationUpdates();
            if (!enabled) {
                console.log('⚪ Player Controls: media automation disabled, keyboard shortcuts and speed UI remain inactive');
                return;
            }
            syncManagedVideos();
            setTimeout(() => {
                if (!shouldRunMediaAutomation()) return;
                syncManagedVideos();
            }, 1000);
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getPlayerState') {
            const resolved = resolveMessageTargetVideo(message);
            if (resolved.missing) {
                return false;
            }

            const currentVideo = resolved.video || getActiveVideo();
            sendResponse({
                handled: true,
                ...buildVideoState(currentVideo)
            });
            return true;
        }

        if (message.action !== 'playerControl' || !message.command) {
            return false;
        }

        const resolved = resolveMessageTargetVideo(message);
        if (resolved.missing) {
            return false;
        }
        const hasExplicitTarget = resolved.hasExplicitTarget;
        let video = resolved.video;

        if (video) {
            executeAction(message.command, message.value);
        } else if (!hasExplicitTarget) {
            executeAction(message.command, message.value);
            video = getActiveVideo();
        }

        const currentVideo = video || getActiveVideo();
        sendResponse({
            handled: true,
            ...buildVideoState(currentVideo)
        });

        return true;
    });

    init();

    // 暴露 API
    window.__ShieldPlayerControls = {
        executeAction,
        getActiveVideo,
        showToast,
        captureScreenshot,
        HOTKEYS
    };
})();
