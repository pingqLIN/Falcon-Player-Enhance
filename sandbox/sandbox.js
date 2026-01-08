// ============================================================================
// Shield Pro - Sandbox Page Controller
// ============================================================================
// 控制沙盒頁面的載入與互動
// ============================================================================

(function() {
  'use strict';

  // DOM 元素
  const urlDisplay = document.getElementById('url-display');
  const sandboxFrame = document.getElementById('sandbox-frame');
  const loadingOverlay = document.getElementById('loading');
  const btnCopy = document.getElementById('btn-copy');
  const btnReport = document.getElementById('btn-report');
  const btnClose = document.getElementById('btn-close');

  // 從 URL 參數取得目標網址
  function getTargetUrl() {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    
    if (url) {
      try {
        return decodeURIComponent(url);
      } catch (e) {
        return url;
      }
    }
    return null;
  }

  // 初始化
  function init() {
    const targetUrl = getTargetUrl();
    
    if (!targetUrl) {
      urlDisplay.textContent = '錯誤：未指定目標網址';
      loadingOverlay.querySelector('h3').textContent = '❌ 載入失敗';
      loadingOverlay.querySelector('p').textContent = '未提供有效的網址參數';
      return;
    }

    // 顯示目標 URL
    urlDisplay.textContent = targetUrl;
    urlDisplay.title = targetUrl;

    // 載入網頁到 sandbox iframe
    loadWebsite(targetUrl);
  }

  // 載入網站
  function loadWebsite(url) {
    // 設定 iframe src
    sandboxFrame.src = url;

    // 監聽載入完成
    sandboxFrame.addEventListener('load', () => {
      loadingOverlay.classList.add('hidden');
      console.log('🔒 Sandbox: Website loaded');
    });

    // 超時處理
    setTimeout(() => {
      if (!loadingOverlay.classList.contains('hidden')) {
        loadingOverlay.querySelector('h3').textContent = '⏳ 載入中';
        loadingOverlay.querySelector('p').textContent = '網頁載入時間較長，請耐心等候...';
      }
    }, 5000);

    // 最大超時
    setTimeout(() => {
      if (!loadingOverlay.classList.contains('hidden')) {
        loadingOverlay.classList.add('hidden');
      }
    }, 15000);
  }

  // 複製網址
  btnCopy.addEventListener('click', () => {
    const url = getTargetUrl();
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        btnCopy.textContent = '已複製！';
        setTimeout(() => {
          btnCopy.textContent = '複製網址';
        }, 2000);
      });
    }
  });

  // 回報問題
  btnReport.addEventListener('click', () => {
    const url = getTargetUrl();
    // 發送訊息給背景腳本
    if (chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'reportSandboxIssue',
        url: url
      });
    }
    alert('感謝回報！我們會盡快處理。');
  });

  // 關閉沙盒
  btnClose.addEventListener('click', () => {
    // 清空 iframe
    sandboxFrame.src = 'about:blank';
    
    // 關閉分頁或返回
    if (window.opener) {
      window.close();
    } else {
      history.back();
    }
  });

  // 監聽來自 iframe 的訊息（PostMessage）
  window.addEventListener('message', (event) => {
    // 安全檢查：只處理來自 sandbox iframe 的訊息
    if (event.source !== sandboxFrame.contentWindow) {
      return;
    }

    console.log('🔒 Sandbox received message:', event.data);
    
    // 處理特定訊息類型
    if (event.data.type === 'navigation') {
      // 更新顯示的 URL
      urlDisplay.textContent = event.data.url;
    }
  });

  // 初始化
  init();
})();
