// ============================================================================
// Shield Pro - Popup Player Controller
// ============================================================================
// 控制無干擾播放視窗的載入與播放邏輯
// ============================================================================

(function() {
  'use strict';

  // DOM 元素
  const sourceDisplay = document.getElementById('source-display');
  const playerContainer = document.getElementById('player-container');
  const btnPip = document.getElementById('btn-pip');
  const btnClose = document.getElementById('btn-close');

  // 視窗實例識別碼
  let windowInstanceId = null;

  // 從 URL 參數取得影片資訊
  function getVideoParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      videoSrc: params.get('videoSrc'),
      iframeSrc: params.get('iframeSrc'),
      poster: params.get('poster'),
      title: params.get('title'),
      windowId: params.get('windowId')
    };
  }

  // 建立 HTML5 video 播放器
  function createVideoPlayer(src, poster) {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.autoplay = true;
    video.style.width = '100%';
    video.style.height = '100%';
    
    if (poster) {
      video.poster = poster;
    }
    
    // 嘗試自動播放
    video.play().catch(err => {
      console.log('自動播放被擋，需使用者互動:', err);
    });
    
    return video;
  }

  // 建立 iframe 播放器
  function createIframePlayer(src) {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    
    return iframe;
  }

  // 顯示錯誤訊息
  function showError(message) {
    playerContainer.innerHTML = `
      <div class="error-message">
        <h2>❌ 無法載入影片</h2>
        <p>${message}</p>
      </div>
    `;
  }

  // 初始化
  function init() {
    const params = getVideoParams();
    
    // 儲存視窗實例識別碼
    windowInstanceId = params.windowId;
    console.log('🎬 Popup Player Instance ID:', windowInstanceId);
    
    // 顯示來源
    const displaySrc = params.videoSrc || params.iframeSrc || '';
    sourceDisplay.textContent = displaySrc.substring(0, 80) + (displaySrc.length > 80 ? '...' : '');
    sourceDisplay.title = displaySrc;
    
    // 設定視窗標題
    if (params.title) {
      document.title = params.title + ' - Shield Pro';
    }
    
    // 根據類型建立播放器
    if (params.videoSrc) {
      const video = createVideoPlayer(params.videoSrc, params.poster);
      playerContainer.appendChild(video);
      console.log('🎬 Popup Player: 載入 video src:', params.videoSrc);
    } else if (params.iframeSrc) {
      const iframe = createIframePlayer(params.iframeSrc);
      playerContainer.appendChild(iframe);
      console.log('🎬 Popup Player: 載入 iframe src:', params.iframeSrc);
    } else {
      showError('未提供有效的影片來源參數');
      return;
    }
  }

  // 格式化時間
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // 子母畫面 (Picture-in-Picture)
  btnPip.addEventListener('click', async () => {
    const video = playerContainer.querySelector('video');
    if (video) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          btnPip.textContent = '子母畫面';
        } else {
          await video.requestPictureInPicture();
          btnPip.textContent = '退出子母畫面';
        }
      } catch (err) {
        console.error('PiP 錯誤:', err);
        alert('子母畫面功能無法使用');
      }
    } else {
      alert('iframe 播放器不支援子母畫面');
    }
  });

  // 關閉視窗
  btnClose.addEventListener('click', () => {
    cleanupAndClose();
  });

  // 視窗關閉時清理資源
  function cleanupAndClose() {
    console.log('🎬 清理視窗資源 (Instance:', windowInstanceId, ')');
    
    // 停止所有播放
    const video = playerContainer.querySelector('video');
    if (video) {
      video.pause();
      video.src = '';
    }
    
    // 關閉視窗
    window.close();
  }

  // 監聽 beforeunload 進行清理
  window.addEventListener('beforeunload', () => {
    console.log('🎬 視窗即將關閉，清理資源 (Instance:', windowInstanceId, ')');
    const video = playerContainer.querySelector('video');
    if (video) {
      video.pause();
    }
  });

  // 鍵盤快捷鍵
  document.addEventListener('keydown', (e) => {
    // ESC 關閉視窗
    if (e.key === 'Escape') {
      window.close();
    }
    
    const video = playerContainer.querySelector('video');
    if (!video) return;
    
    // 空白鍵暫停/播放
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      video.paused ? video.play() : video.pause();
    }
    
    // 左右箭頭快轉
    if (e.key === 'ArrowLeft') {
      video.currentTime -= 5;
    }
    if (e.key === 'ArrowRight') {
      video.currentTime += 5;
    }
    
    // F 全螢幕
    if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        playerContainer.requestFullscreen();
      }
    }
  });

  // 初始化
  init();
})();
