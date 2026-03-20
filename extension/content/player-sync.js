// Player Sync v4.0 - 多視窗播放進度同步
// 跨視窗播放狀態同步、記憶播放位置

(function () {
    'use strict';

    const DEV_MODE = false;
    function log(...args) { if (DEV_MODE) console.log(...args); }

    const STORAGE_KEY = 'shieldPlayerSync';
    const SYNC_INTERVAL = 2000; // 同步間隔 (ms)
    const POSITION_SAVE_THRESHOLD = 5; // 至少播放 5 秒才儲存位置

    let currentVideoId = null;
    let lastSyncTime = 0;
    let syncEnabled = true;
    let contextValid = true; // Extension context 是否仍有效
    const activeIntervals = new Set(); // 追蹤所有計時器，以便失效時一併清除
    let activeObserver = null;  // 追蹤 MutationObserver，以便失效時停止

    /**
     * 檢查 extension context 是否仍有效
     */
    function isContextValid() {
        if (!contextValid) return false;
        try {
            // chrome.runtime.id 在 context 失效時會變為 undefined
            return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    /**
     * 標記 context 已失效，停止所有計時器
     */
    function invalidateContext() {
        if (!contextValid) return;
        contextValid = false;
        syncEnabled = false;
        log('[Sync] Extension context 已失效，停止同步');
        activeIntervals.forEach(id => clearInterval(id));
        activeIntervals.clear();
        if (activeObserver) {
            activeObserver.disconnect();
            activeObserver = null;
        }
    }

    /**
     * 判斷錯誤是否為 Context 失效導致
     */
    function isContextError(e) {
        if (!e) return false;
        // Chrome sometimes rejects with a plain string instead of an Error object
        const msg = (e.message ?? (typeof e === 'string' ? e : String(e))).toLowerCase();
        return msg.includes('extension context invalidated') ||
               msg.includes('context invalidated') ||
               msg.includes('receiving end does not exist');
    }

    /**
     * 生成影片識別碼
     * 基於影片來源和頁面 URL 產生唯一識別碼
     */
    function generateVideoId(video) {
        const src = video.src || video.querySelector?.('source')?.src || '';
        const pageUrl = window.location.href;
        
        // 使用來源 URL 的特徵部分
        let srcKey = '';
        try {
            const url = new URL(src, window.location.origin);
            srcKey = url.pathname + url.search;
        } catch (e) {
            srcKey = src.substring(0, 200);
        }
        
        // 簡單的 hash
        const str = pageUrl + '|' + srcKey;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return 'vid_' + Math.abs(hash).toString(36);
    }

    /**
     * 儲存播放位置
     */
    async function savePosition(video, videoId) {
        if (!video || !videoId || isNaN(video.currentTime)) return;
        if (video.currentTime < POSITION_SAVE_THRESHOLD) return;
        if (!isContextValid()) return;
        
        try {
            const result = await chrome.storage.local.get([STORAGE_KEY]);
            // Re-check: context may have become invalid during the above await
            if (!isContextValid()) { invalidateContext(); return; }
            const syncData = result[STORAGE_KEY] || {};
            
            syncData[videoId] = {
                position: video.currentTime,
                duration: video.duration || 0,
                timestamp: Date.now(),
                title: document.title,
                url: window.location.href
            };
            
            // 清理舊資料 (保留最近 50 個)
            const entries = Object.entries(syncData);
            if (entries.length > 50) {
                entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
                const keep = entries.slice(0, 50);
                const newData = Object.fromEntries(keep);
                await chrome.storage.local.set({ [STORAGE_KEY]: newData });
            } else {
                await chrome.storage.local.set({ [STORAGE_KEY]: syncData });
            }
            
            log(`📍 [Sync] 已儲存位置: ${formatTime(video.currentTime)} / ${formatTime(video.duration)}`);
        } catch (e) {
            if (isContextError(e) || !isContextValid()) {
                invalidateContext();
            } else {
                console.error('[Sync] 儲存位置失敗:', e);
            }
        }
    }

    /**
     * 讀取播放位置
     */
    async function loadPosition(videoId) {
        if (!isContextValid()) return null;
        try {
            const result = await chrome.storage.local.get([STORAGE_KEY]);
            const syncData = result[STORAGE_KEY] || {};
            return syncData[videoId] || null;
        } catch (e) {
            if (isContextError(e) || !isContextValid()) {
                invalidateContext();
            } else {
                console.error('[Sync] 讀取位置失敗:', e);
            }
            return null;
        }
    }

    /**
     * 恢復播放位置
     */
    async function restorePosition(video, videoId) {
        const saved = await loadPosition(videoId);
        
        if (!saved) return false;
        
        // 檢查是否為同一影片 (時長差異不超過 5 秒)
        if (video.duration && Math.abs(video.duration - saved.duration) > 5) {
            log('[Sync] 時長不符，跳過恢復');
            return false;
        }
        
        // 檢查位置是否有效
        if (saved.position <= 0 || saved.position >= (video.duration - 5)) {
            return false;
        }
        
        // 顯示恢復提示
        showResumePrompt(video, saved);
        return true;
    }

    /**
     * 顯示恢復播放提示
     */
    function showResumePrompt(video, saved) {
        // 移除現有提示
        const existing = document.querySelector('.shield-resume-prompt');
        if (existing) existing.remove();
        
        const prompt = document.createElement('div');
        prompt.className = 'shield-resume-prompt';
        prompt.setAttribute('data-shield-internal', 'true');
        prompt.innerHTML = `
            <div class="shield-resume-content">
                <span class="shield-resume-text">
                    繼續從 ${formatTime(saved.position)} 播放？
                </span>
                <div class="shield-resume-buttons">
                    <button class="shield-resume-btn resume">繼續</button>
                    <button class="shield-resume-btn restart">從頭開始</button>
                </div>
            </div>
        `;
        
        prompt.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            padding: 16px 24px;
            border-radius: 12px;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            animation: shieldPromptIn 0.3s ease;
        `;
        
        const contentStyle = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
        `;
        prompt.querySelector('.shield-resume-content').style.cssText = contentStyle;
        
        const buttonsStyle = `
            display: flex;
            gap: 12px;
        `;
        prompt.querySelector('.shield-resume-buttons').style.cssText = buttonsStyle;
        
        prompt.querySelectorAll('.shield-resume-btn').forEach(btn => {
            btn.style.cssText = `
                padding: 8px 20px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            
            if (btn.classList.contains('resume')) {
                btn.style.background = '#4285f4';
                btn.style.color = '#fff';
            } else {
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.color = '#fff';
            }
        });
        
        document.body.appendChild(prompt);
        
        // 繼續播放
        prompt.querySelector('.resume').addEventListener('click', () => {
            video.currentTime = saved.position;
            video.play().catch(() => {});
            prompt.remove();
        });
        
        // 從頭開始
        prompt.querySelector('.restart').addEventListener('click', () => {
            video.currentTime = 0;
            video.play().catch(() => {});
            prompt.remove();
        });
        
        // 自動隱藏
        setTimeout(() => {
            if (document.contains(prompt)) {
                prompt.style.animation = 'shieldPromptOut 0.3s ease forwards';
                setTimeout(() => prompt.remove(), 300);
            }
        }, 8000);
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

    /**
     * 設定影片同步監聽
     */
    function setupVideoSync(video) {
        if (video.dataset.shieldSyncSetup === 'true') return;
        video.dataset.shieldSyncSetup = 'true';
        
        const videoId = generateVideoId(video);
        currentVideoId = videoId;
        
        log(`🔗 [Sync] 影片識別碼: ${videoId}`);
        
        // 影片載入完成後嘗試恢復位置
        const tryRestore = async () => {
            if (!isNaN(video.duration) && video.duration > 0) {
                await restorePosition(video, videoId);
            }
        };
        
        if (video.readyState >= 1) {
            tryRestore();
        } else {
            video.addEventListener('loadedmetadata', tryRestore, { once: true });
        }
        
        // 定期儲存位置
        const saveInterval = setInterval(() => {
            // 影片已從 DOM 移除：僅清除此計時器，不觸發全域失效
            if (!document.contains(video)) {
                clearInterval(saveInterval);
                activeIntervals.delete(saveInterval);
                return;
            }
            // Extension context 已失效：觸發全域清理
            if (!isContextValid()) {
                invalidateContext();
                return;
            }
            
            if (!video.paused && syncEnabled) {
                savePosition(video, videoId);
            }
        }, SYNC_INTERVAL);
        activeIntervals.add(saveInterval);
        
        // 暫停時儲存
        video.addEventListener('pause', () => {
            if (!isContextValid()) { invalidateContext(); return; }
            if (syncEnabled) {
                savePosition(video, videoId);
            }
        });
        
        // 離開頁面時儲存
        window.addEventListener('pagehide', () => {
            if (syncEnabled && video.currentTime > POSITION_SAVE_THRESHOLD) {
                // 使用同步儲存 (不等待)
                const syncData = {};
                syncData[videoId] = {
                    position: video.currentTime,
                    duration: video.duration || 0,
                    timestamp: Date.now(),
                    title: document.title,
                    url: window.location.href
                };
                
                // navigator.sendBeacon 不支援 chrome.storage，用 localStorage 暫存
                try {
                    localStorage.setItem('shield_sync_pending', JSON.stringify({
                        videoId,
                        data: syncData[videoId]
                    }));
                } catch (e) {}
            }
        });
    }

    /**
     * 處理暫存的同步資料
     */
    async function processPendingSync() {
        if (!isContextValid()) return;
        try {
            const pending = localStorage.getItem('shield_sync_pending');
            if (pending) {
                const { videoId, data } = JSON.parse(pending);
                
                const result = await chrome.storage.local.get([STORAGE_KEY]);
                const syncData = result[STORAGE_KEY] || {};
                syncData[videoId] = data;
                
                await chrome.storage.local.set({ [STORAGE_KEY]: syncData });
                localStorage.removeItem('shield_sync_pending');
                
                log('[Sync] 已處理暫存同步資料');
            }
        } catch (e) {
            if (isContextError(e)) invalidateContext();
        }
    }

    /**
     * 注入樣式
     */
    function injectStyles() {
        if (document.querySelector('#shield-sync-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'shield-sync-styles';
        style.textContent = `
            @keyframes shieldPromptIn {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            @keyframes shieldPromptOut {
                from { opacity: 1; transform: translateX(-50%) translateY(0); }
                to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            }
            .shield-resume-btn:hover {
                filter: brightness(1.1);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 初始化
     */
    function init() {
        log('🚀 Player Sync v4.0 已載入');
        
        injectStyles();
        processPendingSync();
        
        // 監聽播放器偵測事件
        document.addEventListener('shieldPlayersDetected', (event) => {
            const players = event.detail.players || [];
            players.forEach(player => {
                const video = player.tagName === 'VIDEO' ? player : player.querySelector('video');
                if (video) {
                    setupVideoSync(video);
                }
            });
        });
        
        // 處理已存在的影片
        setTimeout(() => {
            document.querySelectorAll('video').forEach(video => {
                setupVideoSync(video);
            });
        }, 1500);
        
        // 監聽新增的影片
        activeObserver = new MutationObserver((mutations) => {
            if (!isContextValid()) { invalidateContext(); return; }
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'VIDEO') {
                            setupVideoSync(node);
                        } else if (node.querySelector) {
                            node.querySelectorAll('video').forEach(setupVideoSync);
                        }
                    }
                }
            }
        });
        
        if (document.body) {
            activeObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    init();

    // 暴露 API
    window.__ShieldPlayerSync = {
        savePosition: (video) => savePosition(video, generateVideoId(video)),
        loadPosition: (video) => loadPosition(generateVideoId(video)),
        setSyncEnabled: (enabled) => { syncEnabled = enabled; },
        generateVideoId,
        formatTime
    };
})();
