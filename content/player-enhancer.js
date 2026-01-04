// Player Enhancer - 播放器視覺增強與障礙移除
// 為偵測到的播放器添加標示並移除覆蓋元素

(function () {
    'use strict';

    const MAX_Z_INDEX = 2147483647; // JavaScript 最大安全整數 z-index
    const OVERLAY_CHECK_INTERVAL = 3000; // 每 3 秒檢查一次覆蓋元素

    /**
     * 為播放器添加視覺標示
     */
    function enhancePlayer(player) {
        if (player.dataset.enhanced === 'true') return;

        // 調整 z-index 至最高
        const originalZIndex = window.getComputedStyle(player).zIndex;
        player.style.zIndex = MAX_Z_INDEX;
        player.dataset.originalZIndex = originalZIndex;
        player.dataset.enhanced = 'true';

        // 確保 position 不是 static (z-index 才會生效)
        const position = window.getComputedStyle(player).position;
        if (position === 'static') {
            player.style.position = 'relative';
        }

        // 添加視覺標記 class
        player.classList.add('player-enhanced-active');

        // 添加角落標籤
        addEnhancedBadge(player);

        console.log('✨ 播放器已優化:', player);
    }

    /**
     * 添加「已優化」標籤
     */
    function addEnhancedBadge(player) {
        // 檢查父元素是否適合放置標籤 (relative/absolute/fixed)
        const parent = player.parentElement;
        if (!parent) return;

        // 避免重複添加
        if (parent.querySelector('.player-enhanced-badge')) return;
        // 如果父元素有多個播放器，需要更精確的檢查，這裡假設一個 wrapper 一個播放器
        
        // 確保父元素有定位 context
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }

        const badge = document.createElement('div');
        badge.className = 'player-enhanced-badge';
        badge.textContent = '🛡️ 已優化';
        
        // 插入到播放器之後 (同層級)
        if (player.nextSibling) {
            parent.insertBefore(badge, player.nextSibling);
        } else {
            parent.appendChild(badge);
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
    function processPlayers(players) {
        players.forEach(player => {
            enhancePlayer(player);
            removeOverlays(player);
        });
    }

    /**
     * 定期檢查並移除覆蓋元素
     */
    function startOverlayMonitoring() {
        setInterval(() => {
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
        console.log('⚠️  注意: 由於瀏功器安全限制,無法處理跨域 iframe 內部的覆蓋層');
        console.log('📌 建議: 使用 uBlock Origin 或其他擴充功能配合使用');

        // 監聽播放器偵測事件
        document.addEventListener('playersDetected', (event) => {
            const players = event.detail.players;
            console.log(`📡 收到播放器偵測事件: ${players.length} 個播放器`);
            processPlayers(players);
        });

        // 啟動覆蓋元素監控
        startOverlayMonitoring();

        // 處理 iframes (最小干預)
        enhanceIframes();
        removeParentPageOverlays();

        // 定期檢查 (降低頻率避免干擾)
        setInterval(() => {
            enhanceIframes();
            removeParentPageOverlays();
        }, 5000); // 5秒一次

        // 處理已存在的播放器
        setTimeout(() => {
            const existingPlayers = document.querySelectorAll('.enhanced-player, .enhanced-player-container');
            if (existingPlayers.length > 0) {
                processPlayers(Array.from(existingPlayers));
            }
        }, 1000);
        
        // DOM 變化監控 (僅監控父頁面)
        const observer = new MutationObserver(() => {
            enhanceIframes();
            removeParentPageOverlays();
        });
        
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: false }); // subtree: false 避免過度監控
        }
    }

    init();
})();
