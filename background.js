// Shield Pro - Background Service Worker
// 管理 declarativeNetRequest 規則與統計資料

// 初始化統計資料
let stats = {
  adsBlocked: 0,
  trackersBlocked: 0,
  malwareBlocked: 0,
  popupsBlocked: 0,
  totalBlocked: 0
};

// 擴充功能安裝時初始化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('🛡️ Shield Pro 已安裝');
  
  // 初始化儲存
  chrome.storage.local.set({ 
    stats: stats,
    adNotification: true,
    privacyProtection: true,
    removeOverlays: true,
    bypassAntiBlock: true 
  });
  
  // 啟用所有 declarativeNetRequest 規則集
  chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: ['ads_and_trackers', 'easylist', 'easyprivacy']
  }).then(() => {
    console.log('✓ 攔截規則已啟用');
  }).catch((error) => {
    console.error('✗ 規則啟用失敗:', error);
  });
  
  // 註冊 MAIN world 腳本 - 確保在所有頁面腳本之前執行
  registerMainWorldScript();
});

// 啟動時也嘗試註冊
chrome.runtime.onStartup?.addListener(() => {
  registerMainWorldScript();
});

// 註冊 MAIN world 攔截腳本
async function registerMainWorldScript() {
  try {
    // 先嘗試取消註冊舊腳本
    await chrome.scripting.unregisterContentScripts({ ids: ['main-world-blocker'] }).catch(() => {});
    
    // 註冊新腳本到 MAIN world
    await chrome.scripting.registerContentScripts([{
      id: 'main-world-blocker',
      matches: ['<all_urls>'],
      js: ['content/inject-blocker.js'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true
    }]);
    console.log('✓ MAIN world 攔截腳本已註冊');
  } catch (error) {
    console.error('✗ MAIN world 腳本註冊失敗:', error);
  }
}

// 監聽網路請求攔截事件 (需要 declarativeNetRequestFeedback 權限)
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((details) => {
    // 根據攔截的請求類型更新統計
    const rule = details.rule;
    
    if (rule.ruleId >= 1000 && rule.ruleId < 2000) {
      stats.adsBlocked++;
    } else if (rule.ruleId >= 2000 && rule.ruleId < 10000) {
      stats.trackersBlocked++;
    } else if (rule.ruleId >= 10000 && rule.ruleId < 100000) {
      // EasyList range
      stats.adsBlocked++;
    } else if (rule.ruleId >= 100000) {
      // EasyPrivacy range
      stats.trackersBlocked++;
    }
    
    stats.totalBlocked++;
    
    // 儲存更新後的統計
    chrome.storage.local.set({ stats: stats });
  });
}

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 統計資料請求
  if (request.action === 'getStats') {
    chrome.storage.local.get(['stats'], (result) => {
      sendResponse(result.stats || stats);
    });
    return true;
  }
  
  // Content Script 更新統計
  if (request.type === 'UPDATE_STATS') {
    stats.totalBlocked += request.count || 0;
    chrome.storage.local.set({ stats: stats });
    return;
  }
  
  // 播放器偵測數量
  if (request.action === 'updatePlayerCount') {
    console.log(`偵測到 ${request.count} 個播放器`);
    return;
  }
  
  // 彈出視窗被攔截
  if (request.action === 'popupBlocked') {
    stats.popupsBlocked++;
    stats.totalBlocked++;
    chrome.storage.local.set({ stats: stats });
    return;
  }

  // ========== 元素隱藏相關 ==========
  
  if (request.action === 'hideElement') {
    chrome.storage.local.get(['hiddenElements'], (result) => {
      const rules = result.hiddenElements || [];
      rules.push({
        selector: request.selector,
        hostname: request.hostname,
        timestamp: Date.now()
      });
      chrome.storage.local.set({ hiddenElements: rules }, () => {
        console.log('🎯 已儲存隱藏規則:', request.selector);
        // 通知所有分頁刷新規則
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.url && !tab.url.startsWith('chrome://')) {
              chrome.tabs.sendMessage(tab.id, { action: 'refreshCosmeticRules' }).catch(() => {});
            }
          });
        });
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (request.action === 'getCustomRules') {
    chrome.storage.local.get(['hiddenElements'], (result) => {
      sendResponse(result.hiddenElements || []);
    });
    return true;
  }

  if (request.action === 'activatePicker') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'activatePicker' }, (response) => {
          sendResponse(response);
        });
      }
    });
    return true;
  }

  if (request.action === 'clearHiddenRules') {
    chrome.storage.local.set({ hiddenElements: [] }, () => {
      console.log('🗑️ 已清除所有隱藏規則');
      sendResponse({ success: true });
    });
    return true;
  }
});

// 監聯 tab 更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('頁面載入完成:', tab.url);
  }
});

// 定期保存統計資料 (每 5 分鐘)
setInterval(() => {
  chrome.storage.local.set({ stats: stats });
  console.log('📊 統計資料已保存:', stats);
}, 5 * 60 * 1000);
