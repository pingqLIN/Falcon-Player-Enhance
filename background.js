// ============================================================================
// Shield Pro - Background Service Worker v3.0
// ============================================================================
// 管理 declarativeNetRequest 規則、統計資料、白/黑名單與訂閱
// ============================================================================

// 初始化統計資料
let stats = {
  adsBlocked: 0,
  trackersBlocked: 0,
  malwareBlocked: 0,
  popupsBlocked: 0,
  totalBlocked: 0
};

// 封鎖強度等級對應的規則集
const STRENGTH_RULESETS = {
  minimal: ['ads_and_trackers'],
  basic: ['ads_and_trackers', 'easylist'],
  standard: ['ads_and_trackers', 'easylist', 'easyprivacy'],
  strict: ['ads_and_trackers', 'easylist', 'easyprivacy'],
  aggressive: ['ads_and_trackers', 'easylist', 'easyprivacy']
};

// ============================================================================
// 安裝與啟動
// ============================================================================
chrome.runtime.onInstalled.addListener((details) => {
  console.log('🛡️ Shield Pro v3.0 已安裝');
  
  // 初始化儲存
  chrome.storage.local.set({ 
    stats: stats,
    filterStrength: 'standard',
    whitelist: [],
    blacklist: [],
    sandboxEnabled: true,
    adNotification: true,
    privacyProtection: true,
    removeOverlays: true,
    bypassAntiBlock: true 
  });
  
  // 啟用標準強度規則集
  updateRulesets(['ads_and_trackers', 'easylist', 'easyprivacy']);
  
  // 註冊 MAIN world 腳本
  registerMainWorldScript();
});

// 啟動時也嘗試註冊
chrome.runtime.onStartup?.addListener(() => {
  registerMainWorldScript();
  loadStats();
});

// 載入已存的統計資料
async function loadStats() {
  const result = await chrome.storage.local.get(['stats']);
  if (result.stats) {
    stats = result.stats;
  }
}

// ============================================================================
// 規則集管理
// ============================================================================
async function updateRulesets(enableRulesetIds) {
  const allRulesets = ['ads_and_trackers', 'easylist', 'easyprivacy'];
  const disableRulesetIds = allRulesets.filter(r => !enableRulesetIds.includes(r));
  
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enableRulesetIds,
      disableRulesetIds: disableRulesetIds
    });
    console.log('✓ 規則集已更新:', enableRulesetIds);
  } catch (error) {
    console.error('✗ 規則集更新失敗:', error);
  }
}

// 註冊 MAIN world 攔截腳本
async function registerMainWorldScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['main-world-blocker'] }).catch(() => {});
    
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

// ============================================================================
// 白/黑名單檢查
// ============================================================================
async function isWhitelisted(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const result = await chrome.storage.local.get(['whitelist']);
    const whitelist = result.whitelist || [];
    
    return whitelist.some(domain => {
      domain = domain.toLowerCase();
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch (e) {
    return false;
  }
}

async function isBlacklisted(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const result = await chrome.storage.local.get(['blacklist']);
    const blacklist = result.blacklist || [];
    
    return blacklist.some(domain => {
      domain = domain.toLowerCase();
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch (e) {
    return false;
  }
}

// ============================================================================
// 訂閱清單更新
// ============================================================================
async function updateAllSubscriptions() {
  const result = await chrome.storage.local.get(['subscriptions']);
  const subscriptions = result.subscriptions || [];
  const enabled = subscriptions.filter(s => s.enabled);
  
  console.log(`📥 更新 ${enabled.length} 個訂閱...`);
  
  for (const sub of enabled) {
    if (sub.url) {
      try {
        const response = await fetch(sub.url);
        if (response.ok) {
          const text = await response.text();
          const parseResult = parseAdblockRules(text);
          
          const now = Date.now();
          sub.lastSynced = now; // 本地端最後同步日期
          sub.remoteLastUpdated = parseResult.remoteLastUpdated; // 清單遠端最後更新日期
          sub.rulesCount = parseResult.rules.length;
          // Keep lastUpdated for backward compatibility
          sub.lastUpdated = now;
          
          await chrome.storage.local.set({
            [`rules_${sub.id}`]: parseResult.rules
          });
          
          console.log(`✓ 已更新: ${sub.name} (${parseResult.rules.length} 條規則)`);
        }
      } catch (error) {
        console.error(`✗ 更新失敗: ${sub.name}`, error);
      }
    }
  }
  
  await chrome.storage.local.set({ subscriptions });
}

// 簡化版 AdBlock 規則解析
function parseAdblockRules(text) {
  const lines = text.split('\n');
  const rules = [];
  let remoteLastUpdated = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 提取元資料：Last modified 日期
    if (trimmed.startsWith('! Last modified:') || trimmed.startsWith('! Last Modified:')) {
      const dateStr = trimmed.replace(/^! Last [mM]odified:\s*/, '').trim();
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          remoteLastUpdated = date.getTime();
        }
      } catch (e) {
        console.warn('Failed to parse filter list date:', dateStr);
      }
    }
    
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) continue;
    
    if (trimmed.startsWith('||')) {
      const domain = trimmed.slice(2).split('^')[0].split('$')[0];
      if (domain && domain.length > 3) {
        rules.push({ type: 'block', pattern: domain });
      }
    } else if (trimmed.includes('##')) {
      const [domains, selector] = trimmed.split('##');
      if (selector) {
        rules.push({
          type: 'cosmetic',
          domains: domains ? domains.split(',') : ['*'],
          selector: selector
        });
      }
    }
  }
  
  return {
    rules: rules,
    remoteLastUpdated: remoteLastUpdated
  };
}

// ============================================================================
// 統計與規則匹配
// ============================================================================
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((details) => {
    const rule = details.rule;
    
    if (rule.ruleId >= 1000 && rule.ruleId < 2000) {
      stats.adsBlocked++;
    } else if (rule.ruleId >= 2000 && rule.ruleId < 10000) {
      stats.trackersBlocked++;
    } else if (rule.ruleId >= 10000 && rule.ruleId < 100000) {
      stats.adsBlocked++;
    } else if (rule.ruleId >= 100000) {
      stats.trackersBlocked++;
    }
    
    stats.totalBlocked++;
    chrome.storage.local.set({ stats: stats });
  });
}

// ============================================================================
// 訊息處理
// ============================================================================
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
  
  // 彈出視窗被攔截
  if (request.action === 'popupBlocked') {
    stats.popupsBlocked++;
    stats.totalBlocked++;
    chrome.storage.local.set({ stats: stats });
    return;
  }
  
  // 播放器偵測
  if (request.action === 'updatePlayerCount') {
    console.log(`偵測到 ${request.count} 個播放器`);
    return;
  }
  
  // ========== 封鎖強度控制 ==========
  if (request.action === 'setFilterStrength') {
    const level = request.level;
    const rulesets = STRENGTH_RULESETS[level] || STRENGTH_RULESETS.standard;
    updateRulesets(rulesets);
    console.log(`🛡️ 封鎖強度設定為: ${level}`);
    return;
  }
  
  // ========== 規則集開關 ==========
  if (request.action === 'toggleRuleset') {
    const { rulesetId, enabled } = request;
    if (enabled) {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [rulesetId]
      });
    } else {
      chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: [rulesetId]
      });
    }
    console.log(`📋 規則集 ${rulesetId}: ${enabled ? '啟用' : '停用'}`);
    return;
  }
  
  // ========== 訂閱更新 ==========
  if (request.action === 'updateAllSubscriptions') {
    updateAllSubscriptions();
    return;
  }
  
  // ========== 白名單檢查 ==========
  if (request.action === 'checkWhitelist') {
    isWhitelisted(request.url).then(result => {
      sendResponse({ whitelisted: result });
    });
    return true;
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
  
  // ========== 沙盒相關 ==========
  if (request.action === 'openInSandbox') {
    const sandboxUrl = chrome.runtime.getURL('sandbox/sandbox.html') + 
                       '?url=' + encodeURIComponent(request.url);
    chrome.tabs.create({ url: sandboxUrl });
    return;
  }
  
  if (request.action === 'reportSandboxIssue') {
    console.log('📝 沙盒問題回報:', request.url);
    return;
  }
});

// ============================================================================
// Tab 監聽與白名單處理
// ============================================================================
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const whitelisted = await isWhitelisted(tab.url);
    
    if (whitelisted) {
      // 白名單網站：通知 content script 停用封鎖
      chrome.tabs.sendMessage(tabId, { action: 'disableBlocking' }).catch(() => {});
      console.log('⚪ 白名單網站:', tab.url);
    }
  }
});

// ============================================================================
// 定期任務
// ============================================================================
// 每 5 分鐘保存統計資料
setInterval(() => {
  chrome.storage.local.set({ stats: stats });
  console.log('📊 統計資料已保存:', stats);
}, 5 * 60 * 1000);

// 每 24 小時更新訂閱
setInterval(() => {
  updateAllSubscriptions();
}, 24 * 60 * 60 * 1000);
