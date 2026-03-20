# Shield Pro 替代架構提案：Probe-First + 最小權限模型

> 這份提案從**不同角度**補充先前的三層式架構提案，聚焦於：探測優先注入、權限最小化、CSS 安全防線、以及業界模式參照。

## 目錄

1. [核心哲學差異](#1-核心哲學差異)
2. [Probe-First 架構：探測優先注入模式](#2-probe-first-架構探測優先注入模式)
3. [Background-Driven 動態注入（webNavigation + scripting API）](#3-background-driven-動態注入webnavigation--scripting-api)
4. [declarativeContent API 整合](#4-declarativecontent-api-整合)
5. [權限模型重構](#5-權限模型重構)
6. [CSS 安全防線架構](#6-css-安全防線架構)
7. [未來防線：架構護欄與測試策略](#7-未來防線架構護欄與測試策略)
8. [業界模式參照：uBlock Origin Lite / AdGuard MV3 / Ghostery](#8-業界模式參照ublock-origin-lite--adguard-mv3--ghostery)
9. [完整架構圖](#9-完整架構圖)
10. [與三層式提案的比較與互補](#10-與三層式提案的比較與互補)

---

## 1. 核心哲學差異

| 面向 | 三層式提案 | 本提案（Probe-First） |
|---|---|---|
| 注入判斷時機 | **Build-time**：manifest 定義 matches → 瀏覽器決定注入 | **Run-time**：background 偵測 URL → 動態決定注入什麼 |
| 決策權 | 瀏覽器 content_scripts matching engine | Service Worker 的程式邏輯 |
| 新增站點 | 需要呼叫 `registerContentScripts` 更新 match patterns | URL pattern 檢查 + `executeScript` 即時注入 |
| 失敗模式 | 不注入 = 安全，但可能遺漏新站點 | 探測失敗 = 不注入重型腳本，頁面依然完整 |
| CSS 策略 | 站點限定注入（依然可能誤殺） | **Zero-global CSS**：CSS 完全由 JS 動態生成 + site-scoped |

**關鍵洞察**：三層式提案解決了「在哪裡注入」的問題，但本提案更進一步解決「注入什麼、以及何時升級注入強度」的問題。兩者可以組合。

---

## 2. Probe-First 架構：探測優先注入模式

### 2.1 概念

不要一次注入所有腳本。先注入一個**極輕量的探測腳本**（<2KB），它只做：
1. 檢測頁面是否有 `<video>`、`<iframe>[src*=player]`、廣告 SDK 特徵
2. 回報結果給 background
3. Background 依據結果決定注入哪些重型腳本

```
┌──────────────┐     webNavigation.onCompleted      ┌───────────────────┐
│              │ ──────────────────────────────────▶ │                   │
│   Browser    │     URL matches player site?       │  Service Worker   │
│   Tab        │                                    │  (background.js)  │
│              │ ◀────── executeScript(probe.js) ── │                   │
│              │                                    │                   │
│              │ ──── probe result message ────────▶ │  Decision Engine  │
│              │                                    │       │           │
│              │ ◀── executeScript(heavy-scripts) ─ │       ▼           │
│              │     (only if probe says "yes")     │  Script Selector  │
└──────────────┘                                    └───────────────────┘
```

### 2.2 探測腳本實作

```javascript
// content/probe.js — 極輕量，<2KB
// 注入到潛在的播放器站點，快速判斷頁面特徵
(function() {
  'use strict';
  
  const signals = {
    hasVideo: false,
    hasPlayerIframe: false,
    hasAdSDK: false,
    hasOverlay: false,
    hostname: location.hostname,
    pathname: location.pathname
  };

  // Signal 1: 原生 video 元素
  signals.hasVideo = document.querySelectorAll('video').length > 0;

  // Signal 2: 播放器 iframe
  const iframes = document.querySelectorAll('iframe');
  signals.hasPlayerIframe = Array.from(iframes).some(f => {
    const src = (f.src || '').toLowerCase();
    return /player|embed|video|myvidplay|luluvdoo/.test(src);
  });

  // Signal 3: 廣告 SDK 標記（不修改，只偵測）
  signals.hasAdSDK = !!(
    window.adsbygoogle ||
    window.googletag ||
    window.ExoLoader ||
    document.querySelector('script[src*="exoclick"]') ||
    document.querySelector('script[src*="juicyads"]') ||
    document.querySelector('script[src*="trafficjunky"]')
  );

  // Signal 4: 可疑覆蓋層
  const overlays = document.querySelectorAll(
    '[class*="overlay-ad"], [class*="click-overlay"], [class*="popup-overlay"]'
  );
  signals.hasOverlay = overlays.length > 0;

  // 回報給 background
  chrome.runtime.sendMessage({
    type: 'PROBE_RESULT',
    signals
  });
})();
```

### 2.3 Background 決策引擎

```javascript
// background.js — Decision Engine
const INJECTION_PROFILES = {
  // 有 video + 有廣告 SDK → 全套注入
  FULL_PROTECTION: [
    { files: ['content/anti-antiblock.js'], world: 'MAIN', runAt: 'document_start' },
    { files: ['content/inject-blocker.js'], world: 'MAIN', runAt: 'document_start' },
    { files: ['content/cosmetic-filter.js', 'content/anti-popup.js'] },
    { files: ['content/player-detector.js', 'content/player-enhancer.js',
              'content/player-controls.js', 'content/player-sync.js',
              'content/overlay-remover.js', 'content/fake-video-remover.js'] }
  ],
  // 有 video 但沒有廣告 → 只注入播放器增強
  PLAYER_ONLY: [
    { files: ['content/player-detector.js', 'content/player-enhancer.js',
              'content/player-controls.js', 'content/player-sync.js'] }
  ],
  // 有廣告但沒有 video → 只注入廣告攔截
  AD_BLOCK_ONLY: [
    { files: ['content/anti-antiblock.js'], world: 'MAIN', runAt: 'document_start' },
    { files: ['content/cosmetic-filter.js', 'content/anti-popup.js'] },
    { files: ['content/overlay-remover.js'] }
  ],
  // 啥都沒有 → 不注入
  NONE: []
};

function selectProfile(signals) {
  const hasMedia = signals.hasVideo || signals.hasPlayerIframe;
  const hasAds = signals.hasAdSDK || signals.hasOverlay;
  
  if (hasMedia && hasAds) return 'FULL_PROTECTION';
  if (hasMedia) return 'PLAYER_ONLY';
  if (hasAds) return 'AD_BLOCK_ONLY';
  return 'NONE';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROBE_RESULT' && sender.tab) {
    const profile = selectProfile(message.signals);
    const scripts = INJECTION_PROFILES[profile];
    
    // 動態注入選定的腳本
    for (const group of scripts) {
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, allFrames: group.allFrames ?? false },
        files: group.files,
        world: group.world || 'ISOLATED',
        injectImmediately: group.runAt === 'document_start'
      }).catch(err => console.warn('Injection failed:', err));
    }
    
    // 動態注入站點專用 CSS（而非靜態 CSS 檔案）
    if (profile !== 'NONE') {
      injectSiteScopedCSS(sender.tab.id, message.signals.hostname);
    }
  }
});
```

### 2.4 Probe-First 的限制與解法

| 限制 | 問題 | 解法 |
|---|---|---|
| **時序問題** | `document_idle` 探測太晚，`document_start` 時 DOM 還沒有 `<video>` | 對已知站點直接注入 `document_start` 腳本（不走 probe），新站點才走 probe |
| **MAIN world 注入** | `executeScript` 的 `world: 'MAIN'` 在 `document_idle` 太遲 | 已知站點的 MAIN world 腳本用 `registerContentScripts` 預註冊 |
| **race condition** | 探測和注入之間的時間窗口內廣告可能已載入 | 已知站點走 fast path，probe 只用於使用者自訂站點或不確定的站點 |

**結論**：Probe-First 最適合用於 **Tier X（使用者自訂站點）** 和 **未知站點的自動偵測**，而非取代已知站點的靜態注入。

---

## 3. Background-Driven 動態注入（webNavigation + scripting API）

### 3.1 用 webNavigation 取代 content_scripts 宣告

這是本提案的**核心差異**：完全不在 manifest 裡宣告 `content_scripts`，改用 `webNavigation` 事件 + `chrome.scripting` API 程式化注入。

```javascript
// background.js — webNavigation-driven injection

// 集中式站點註冊表（與三層式提案共享）
import { SITE_REGISTRY } from './site-registry.js'; // 或用 const

// 為已知播放器站點建立 URL filter
const PLAYER_URL_FILTERS = SITE_REGISTRY.getAllDomains().flatMap(domain => [
  { hostSuffix: domain },
  { hostEquals: domain }
]);

// document_start 等效：用 onCommitted（在 DOM 開始解析前觸發）
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // 過濾掉 about:blank、chrome:// 等
  if (!details.url.startsWith('http')) return;
  
  const url = new URL(details.url);
  const hostname = url.hostname;
  
  // 檢查：是否為已知播放器站點？
  if (!SITE_REGISTRY.isPlayerSite(hostname)) return;
  
  const isCompatMode = SITE_REGISTRY.isCompatibilityModeSite(hostname);
  
  try {
    // MAIN world 腳本 — 必須在 document_start 注入
    if (!isCompatMode) {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        files: ['content/inject-blocker.js'],
        world: 'MAIN',
        injectImmediately: true  // ⬅ 關鍵：等同 document_start
      });
      
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        files: ['content/anti-antiblock.js'],
        world: 'MAIN',
        injectImmediately: true
      });
    }
    
    // ISOLATED world 腳本 — document_start
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      files: ['content/cosmetic-filter.js', 'content/anti-popup.js'],
      injectImmediately: true
    });
    
    // 動態 CSS 注入（site-scoped，見第 6 節）
    await injectSiteScopedCSS(details.tabId, details.frameId, hostname);
    
  } catch (err) {
    console.warn(`[Shield Pro] Injection failed for ${hostname}:`, err);
  }
}, { url: PLAYER_URL_FILTERS });

// document_idle 等效：用 onCompleted
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!details.url.startsWith('http')) return;
  
  const url = new URL(details.url);
  const hostname = url.hostname;
  
  if (!SITE_REGISTRY.isPlayerSite(hostname)) return;
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      files: [
        'content/player-detector.js',
        'content/player-enhancer.js',
        'content/player-controls.js',
        'content/player-sync.js',
        'content/overlay-remover.js',
        'content/fake-video-remover.js'
      ]
    });
    
    // AI runtime（如果啟用）
    const { aiMonitorEnabled } = await chrome.storage.local.get('aiMonitorEnabled');
    if (aiMonitorEnabled) {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        files: ['content/ai-runtime.js']
      });
    }
  } catch (err) {
    console.warn(`[Shield Pro] Idle injection failed for ${hostname}:`, err);
  }
}, { url: PLAYER_URL_FILTERS });
```

### 3.2 webNavigation vs registerContentScripts 比較

| 面向 | `registerContentScripts` | `webNavigation` + `executeScript` |
|---|---|---|
| 時序保證 | ✅ `document_start` 由瀏覽器保證 | ⚠️ `injectImmediately: true` 近似但不完全等同 |
| 條件邏輯 | ❌ 只能用 URL patterns | ✅ 可加入任意 JS 邏輯（blocking level、AI state 等） |
| 效能 | ✅ 原生 matching，零開銷 | ⚠️ 每次導航都要過 JS callback |
| allFrames | ✅ 原生支援 | ✅ 支援，但要手動指定 frameIds |
| 動態更新 | 需要 `updateContentScripts` | ✅ 改程式碼邏輯即可 |
| 持久化 | ✅ `persistAcrossSessions: true` | ❌ Service Worker 關閉時不執行 |

**建議**：對 MAIN world 的 `document_start` 腳本（inject-blocker、anti-antiblock），使用 `registerContentScripts` 保證時序。其他腳本用 `webNavigation` + `executeScript` 獲得更大彈性。

### 3.3 混合模式：最佳組合

```javascript
// background.js — 混合注入策略

// 策略 1：已知站點的 MAIN world 腳本 → registerContentScripts（保證時序）
async function registerMainWorldScripts() {
  const matches = SITE_REGISTRY.toMatchPatterns();
  
  await chrome.scripting.registerContentScripts([{
    id: 'shield-main-world',
    matches,
    js: ['content/inject-blocker.js', 'content/anti-antiblock.js'],
    world: 'MAIN',
    runAt: 'document_start',
    persistAcrossSessions: true
  }]);
}

// 策略 2：其他腳本 → webNavigation 驅動（可加入條件邏輯）
chrome.webNavigation.onCompleted.addListener(async (details) => {
  const hostname = new URL(details.url).hostname;
  if (!SITE_REGISTRY.isPlayerSite(hostname)) return;
  
  // 根據 blocking level 決定注入範圍
  const { blockingLevel } = await chrome.storage.local.get('blockingLevel');
  
  const scripts = ['content/player-detector.js', 'content/player-enhancer.js'];
  
  if (blockingLevel >= 2) {
    scripts.push('content/overlay-remover.js', 'content/fake-video-remover.js');
  }
  if (blockingLevel >= 3) {
    scripts.push('content/player-controls.js', 'content/player-sync.js');
  }
  
  await chrome.scripting.executeScript({
    target: { tabId: details.tabId, frameIds: [details.frameId] },
    files: scripts
  });
}, { url: PLAYER_URL_FILTERS });

// 策略 3：使用者自訂站點 → probe-first
chrome.webNavigation.onCompleted.addListener(async (details) => {
  const hostname = new URL(details.url).hostname;
  
  // 已知站點跳過（已由上面的 listener 處理）
  if (SITE_REGISTRY.isPlayerSite(hostname)) return;
  
  // 檢查使用者自訂清單
  const { customSites } = await chrome.storage.local.get('customSites');
  if (!customSites?.includes(hostname)) return;
  
  // 注入探測腳本
  await chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    files: ['content/probe.js']
  });
});
```

---

## 4. declarativeContent API 整合

### 4.1 使用 `declarativeContent` 控制擴充功能 Action

`chrome.declarativeContent` 不能用來控制腳本注入，但可以用來：
- 只在播放器站點上顯示彩色 icon + badge
- 在非播放器站點上 disable popup 中的某些功能

```javascript
// background.js — declarativeContent 配置

chrome.runtime.onInstalled.addListener(() => {
  // 清除舊規則
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    // 在播放器站點上啟用完整 action
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: SITE_REGISTRY.getAllDomains().map(domain =>
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostSuffix: domain }
          })
        ),
        actions: [
          new chrome.declarativeContent.ShowAction(),
          // 可選：改變 icon
          // new chrome.declarativeContent.SetIcon({ imageData: activeIconData })
        ]
      }
    ]);
  });
  
  // 預設隱藏 action（可選，若希望只在播放器站點顯示 icon）
  // chrome.action.disable();  // 全域禁用，由 declarativeContent 按需啟用
});
```

### 4.2 PageStateMatcher 的 CSS 條件

`declarativeContent` 的一個進階功能是可以用 CSS selector 作為頁面匹配條件：

```javascript
// 只有當頁面含有 video 元素時才啟用
new chrome.declarativeContent.PageStateMatcher({
  css: ['video', 'iframe[src*="player"]', 'iframe[src*="embed"]']
})
```

這可以用來實現「有 video 的頁面才亮 icon」：

```javascript
chrome.declarativeContent.onPageChanged.addRules([{
  conditions: [
    // 條件 1：已知播放器站點
    ...SITE_REGISTRY.getAllDomains().map(domain =>
      new chrome.declarativeContent.PageStateMatcher({
        pageUrl: { hostSuffix: domain }
      })
    ),
    // 條件 2：任何含 <video> 的頁面
    new chrome.declarativeContent.PageStateMatcher({
      css: ['video']
    })
  ],
  actions: [new chrome.declarativeContent.ShowAction()]
}]);
```

**注意**：`declarativeContent` 的 CSS matching 是由瀏覽器原生執行的，效能極好，但功能有限——它只能控制 Action 的可見性，不能控制腳本注入。

---

## 5. 權限模型重構

### 5.1 當前問題

```json
// 當前 manifest.json
"host_permissions": ["<all_urls>"]  // ← 過度授權
```

這賦予擴充功能對**所有網站**的讀寫權限，而實際上只需要約 20 個站點。

### 5.2 方案比較

#### 方案 A：明確列舉 host_permissions

```json
{
  "host_permissions": [
    "*://*.javboys.com/*",
    "*://*.javboys.online/*",
    "*://*.luluvdoo.com/*",
    "*://*.myvidplay.com/*",
    "*://*.upn.one/*",
    "*://*.zenithstrategylabs.com/*",
    "*://*.missav.com/*",
    "*://*.missav.ws/*",
    "*://*.supjav.com/*",
    "*://*.thisav.com/*",
    "*://*.jable.tv/*",
    "*://*.avgle.com/*",
    "*://*.netflav.com/*",
    "*://*.pornhub.com/*",
    "*://*.xvideos.com/*",
    "*://*.xhamster.com/*",
    "*://*.redtube.com/*",
    "*://*.youporn.com/*",
    "*://*.spankbang.com/*",
    "*://*.eporner.com/*",
    "*://*.txxx.com/*",
    "*://*.hqporner.com/*"
  ]
}
```

| 優點 | 缺點 |
|---|---|
| Chrome Web Store 審核更容易通過 | 新增站點需要更新 manifest → 重新發布 |
| 使用者更信任（可看到確切權限範圍） | host_permissions 清單會很長 |
| 不觸發「此擴充功能可以讀取所有網站」警告 | — |

#### 方案 B：activeTab + optional_host_permissions

```json
{
  "permissions": ["activeTab", "scripting", "storage", "declarativeNetRequest"],
  "host_permissions": [],
  "optional_host_permissions": [
    "*://*.javboys.com/*",
    "*://*.missav.com/*",
    // ... 所有已知站點
    "<all_urls>"  // ← 作為「進階模式」的後門
  ]
}
```

```javascript
// 首次使用時請求權限
async function requestPlayerSitePermissions() {
  const patterns = SITE_REGISTRY.toMatchPatterns();
  
  const granted = await chrome.permissions.request({
    origins: patterns
  });
  
  if (granted) {
    // 註冊 content scripts
    await registerMainWorldScripts();
    console.log('Player site permissions granted');
  }
  
  return granted;
}

// 使用者新增自訂站點時
async function addCustomSite(domain) {
  const pattern = `*://*.${domain}/*`;
  
  const granted = await chrome.permissions.request({
    origins: [pattern]
  });
  
  if (granted) {
    // 動態更新 content script registration
    await updateContentScriptMatches();
  }
  
  return granted;
}
```

| 優點 | 缺點 |
|---|---|
| 安裝時零權限警告 | 使用者體驗多一步「允許」操作 |
| 使用者明確授權每個站點 | `activeTab` 無法用於 `registerContentScripts` |
| 最小權限原則 | `onCommitted` 只在有 host permission 時觸發 |

#### 方案 C（推薦）：明確 host_permissions + optional_host_permissions 混合

```json
{
  "permissions": [
    "declarativeNetRequest",
    "declarativeNetRequestWithHostAccess",
    "declarativeNetRequestFeedback",
    "scripting",
    "storage",
    "tabs",
    "webNavigation"  // ← 需要明確聲明
  ],
  "host_permissions": [
    // 核心站點：安裝時就授權
    "*://*.javboys.com/*",
    "*://*.javboys.online/*",
    "*://*.missav.com/*",
    "*://*.missav.ws/*",
    "*://*.supjav.com/*",
    "*://*.jable.tv/*",
    "*://*.pornhub.com/*",
    "*://*.xvideos.com/*"
    // ... 最常用的 10-15 個站點
  ],
  "optional_host_permissions": [
    // 較少用的站點 + 通配符給進階使用者
    "*://*.thisav.com/*",
    "*://*.avgle.com/*",
    "*://*.netflav.com/*",
    "*://*.xhamster.com/*",
    "*://*.redtube.com/*",
    "*://*.spankbang.com/*",
    "*://*.eporner.com/*",
    "<all_urls>"  // 進階使用者可展開到全部
  ],
  "optional_permissions": [
    "activeTab"  // element picker 用
  ]
}
```

### 5.3 activeTab 的正確使用場景

`activeTab` 的授權是**暫時的**（只在使用者點擊擴充功能 action 時，對當前 tab 生效）。適合用於：

```javascript
// popup.js — Element Picker 啟動
document.getElementById('element-picker-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // activeTab 授權已由使用者點擊 popup 觸發
  // 即使沒有該站點的 host_permission，也可以注入
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/element-picker.js']
  });
  
  window.close();
});
```

**重要**：`activeTab` 不適用於：
- `webNavigation` 事件監聽（需要 host_permissions）
- `registerContentScripts`（需要 host_permissions）
- 背景自動注入（沒有使用者 gesture 觸發）

### 5.4 web_accessible_resources 的權限限縮

```json
{
  "web_accessible_resources": [{
    "resources": [
      "content/inject-blocker.js",
      "rules/noop.js",
      "sandbox/sandbox.html",
      "sandbox/sandbox.js",
      "popup-player/popup-player.html",
      "popup-player/popup-player.js"
    ],
    "matches": [
      "*://*.javboys.com/*",
      "*://*.missav.com/*"
      // 只對需要的站點開放，而非 <all_urls>
    ]
  }]
}
```

---

## 6. CSS 安全防線架構

### 6.1 問題根源分析

當前 [player-overlay-fix.css](extension/content/player-overlay-fix.css) 第 67-78 行：

```css
/* 🔴 危險：全域 attribute selector */
[class*="overlay-ad"],
[class*="popup-overlay"],
[class*="interstitial"],
[class*="adblock"],
[class*="lightbox-overlay"] {
  display: none !important;
}
```

這些選擇器在以下場景會誤殺：
- Gemini：`[class*="overlay"]` 命中 model selector dropdown 的 overlay
- Google Cloud Console：使用 `overlay` class 的合法 modal
- 任何使用 Tailwind/Material UI 的應用

### 6.2 新架構：Zero-Global CSS

**原則**：`player-overlay-fix.css` 靜態檔案中不允許任何 `[class*="..."]` 或 `[id*="..."]` 選擇器。所有 cosmetic hiding 完全由 JS 動態生成。

#### 層級 1：站點專用 CSS 模組

```javascript
// content/css-modules.js — 站點專用 CSS 定義

const CSS_MODULES = {
  'javboys.com': `
    /* javboys 專用：具體 class/id 選擇器 */
    .cvpboxOverlay,
    .cvpcolorbox,
    #cvpboxOverlay,
    #cvpcolorbox,
    .colorbox,
    #colorbox,
    .cbox-overlay,
    #cbox-overlay,
    .ad-zone,
    .banner-zone,
    #preact-border-shadow-host {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `,
  
  'missav.com': `
    /* missav 專用 */
    .popup-overlay.missav-ad,
    .ad-banner-container,
    div[data-ad-slot] {
      display: none !important;
    }
  `,
  
  'pornhub.com': `
    .video-ad-overlay,
    #pb_template,
    .mgbox,
    .inPlayerAd {
      display: none !important;
    }
  `,
  
  'xvideos.com': `
    .video-ad-overlay,
    #ad-footer,
    #content-ad,
    .ad-overlay-container {
      display: none !important;
    }
  `,
  
  // ... 每個站點獨立定義
};

// 通用播放器保護 CSS（極度保守，只用精確選擇器）
const PLAYER_PROTECTION_CSS = `
  /* 只針對 iframe 內嵌的已知廣告 */
  iframe[src*="exoclick.com"],
  iframe[src*="juicyads.com"],
  iframe[src*="trafficjunky.net"],
  iframe[src*="trafficstars.com"],
  iframe[src*="popads.net"] {
    display: none !important;
  }
  
  /* Shield Pro 自身的 UI 元素 */
  .player-enhanced-badge {
    /* ... badge styles ... */
  }
`;
```

#### 層級 2：Background 注入站點專用 CSS

```javascript
// background.js — CSS 注入

async function injectSiteScopedCSS(tabId, frameId, hostname) {
  // 取得站點專用 CSS
  let css = PLAYER_PROTECTION_CSS; // 基礎（保守）
  
  for (const [site, siteCSS] of Object.entries(CSS_MODULES)) {
    if (hostname.includes(site)) {
      css += '\n' + siteCSS;
      break; // 一個站點只匹配一個模組
    }
  }
  
  // 注入
  await chrome.scripting.insertCSS({
    target: { tabId, frameIds: [frameId] },
    css,
    origin: 'USER' // 高優先級
  });
}
```

#### 層級 3：JS-based 動態元素隱藏（取代危險 CSS）

```javascript
// content/dynamic-hider.js — 取代 [class*="..."] 選擇器
(function() {
  'use strict';
  
  const HOSTNAME = location.hostname.toLowerCase();
  
  // 這些 pattern 原本在 CSS 中用 [class*="..."]，現在改用 JS
  // JS 版本的優勢：可以加入更多上下文判斷，降低誤殺
  const SUSPICIOUS_PATTERNS = [
    { pattern: 'overlay-ad', minSize: 100, mustBeFixed: true },
    { pattern: 'popup-overlay', minSize: 200, mustBeFixed: true },
    { pattern: 'click-overlay', minSize: 100, mustBeFixed: true },
    { pattern: 'interstitial', minSize: 300, mustBeFixed: true },
    { pattern: 'clickjack', minSize: 50, mustBeFixed: false }
  ];
  
  // 白名單：這些元素即使匹配 pattern 也不隱藏
  const SAFE_ELEMENTS = new Set();
  
  function shouldHide(element) {
    const className = (element.className?.toString?.() || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const combined = className + ' ' + id;
    
    for (const rule of SUSPICIOUS_PATTERNS) {
      if (!combined.includes(rule.pattern)) continue;
      
      // 上下文判斷 1：尺寸檢查
      const rect = element.getBoundingClientRect();
      if (rule.minSize && rect.width < rule.minSize && rect.height < rule.minSize) {
        continue; // 太小，可能是 UI 元件而非廣告覆蓋
      }
      
      // 上下文判斷 2：是否為 fixed/absolute 定位
      if (rule.mustBeFixed) {
        const style = getComputedStyle(element);
        if (style.position !== 'fixed' && style.position !== 'absolute') {
          continue;
        }
      }
      
      // 上下文判斷 3：是否包含播放器
      if (element.querySelector('video, iframe[src*="player"]')) {
        continue; // 包含播放器的覆蓋層不隱藏
      }
      
      // 上下文判斷 4：是否為已知安全元素
      if (SAFE_ELEMENTS.has(element)) continue;
      
      return true;
    }
    
    return false;
  }
  
  function scanAndHide() {
    // 只掃描 fixed/absolute 元素，而非所有 DOM
    const candidates = document.querySelectorAll(
      'div[style*="position: fixed"], div[style*="position: absolute"], ' +
      'div[class*="overlay"], div[class*="popup"], div[class*="modal"]'
    );
    
    for (const el of candidates) {
      if (shouldHide(el)) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        el.setAttribute('data-shield-hidden', 'dynamic');
      }
    }
  }
  
  // MutationObserver：只監控 body 的直接子元素變化
  // 廣告覆蓋層幾乎都是直接附加到 body
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && shouldHide(node)) {
          node.style.display = 'none';
          node.style.pointerEvents = 'none';
          node.setAttribute('data-shield-hidden', 'dynamic');
        }
      }
    }
  });
  
  if (document.body) {
    observer.observe(document.body, { childList: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true });
    });
  }
  
  // 初始掃描
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndHide);
  } else {
    scanAndHide();
  }
})();
```

### 6.3 CSS 安全規則清單

| 規則 | 說明 |
|---|---|
| ❌ 禁止 `[class*="..."]` 在全域 CSS | 改用站點模組或 JS 動態隱藏 |
| ❌ 禁止 `[id*="..."]` 在全域 CSS | 同上 |
| ✅ 站點模組中允許 `[class*="..."]` | 因為已限定在特定站點注入 |
| ✅ 全域 CSS 只允許**精確選擇器** | `.cvpboxOverlay`、`#preact-border-shadow-host` |
| ✅ `iframe[src*="exoclick.com"]` 可全域 | src 屬性匹配廣告域名基本不會誤殺 |
| ✅ JS 動態隱藏需附帶**上下文判斷** | 尺寸、position、包含播放器與否 |

### 6.4 player-overlay-fix.css 改造對照

```
改造前 (全域注入 + 危險選擇器):
┌─────────────────────────────────────┐
│ player-overlay-fix.css              │
│   [class*="overlay-ad"]     { ... } │ ← 🔴 誤殺
│   [class*="popup-overlay"]  { ... } │ ← 🔴 誤殺
│   [class*="interstitial"]   { ... } │ ← 🔴 誤殺
│   [class*="adblock"]        { ... } │ ← 🔴 誤殺
│   [class*="lightbox-overlay"]{ ... }│ ← 🔴 誤殺
│   .cvpboxOverlay            { ... } │ ← ✅ 精確
│   #preact-border-shadow-host{ ... } │ ← ✅ 精確
└─────────────────────────────────────┘

改造後 (分離):
┌──────────────────────────────────┐
│ player-base.css (靜態，安全)      │
│   .cvpboxOverlay           { ... }│ ← ✅ 精確
│   #preact-border-shadow-host{...} │ ← ✅ 精確
│   iframe[src*="exoclick"]  { ... }│ ← ✅ src 精確
└──────────────────────────────────┘
           +
┌──────────────────────────────────┐
│ css-modules.js (動態，分站點)     │
│   javboys: .ad-zone { ... }      │ ← ✅ 站點限定
│   missav:  .popup-overlay { ... } │ ← ✅ 站點限定
│   pornhub: .video-ad-overlay{...} │ ← ✅ 站點限定
└──────────────────────────────────┘
           +
┌──────────────────────────────────┐
│ dynamic-hider.js (JS fallback)   │
│   if class.includes('overlay')   │
│     && isFixed                   │
│     && size > 200px              │ ← ✅ 有上下文
│     && !containsPlayer           │
│     → hide                       │
└──────────────────────────────────┘
```

---

## 7. 未來防線：架構護欄與測試策略

### 7.1 架構護欄：Lint Rules

建立一個自訂 lint 腳本，在 CI/CD 或 pre-commit 階段阻止危險模式：

```javascript
// scripts/lint-css-safety.js
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const DANGEROUS_PATTERNS = [
  /\[class\*=/,        // attribute substring selector
  /\[id\*=/,           // attribute substring selector
  /\[class\^=/,        // attribute prefix selector (也有風險)
  /\[class\$=/,        // attribute suffix selector
];

const ALLOWED_FILES = [
  'css-modules.js',    // 站點專用模組允許
];

let hasError = false;

// 檢查所有 CSS 檔案
const cssFiles = glob.sync('extension/**/*.css');
for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(lines[i])) {
        const basename = path.basename(file);
        if (ALLOWED_FILES.includes(basename)) continue;
        
        console.error(
          `🔴 UNSAFE CSS at ${file}:${i + 1}: ${lines[i].trim()}\n` +
          `   Attribute substring selectors are banned in global CSS.\n` +
          `   Move to css-modules.js (site-scoped) or dynamic-hider.js.`
        );
        hasError = true;
      }
    }
  }
}

// 檢查 JS 檔案中的 CSS 字串
const jsFiles = glob.sync('extension/content/*.js');
for (const file of jsFiles) {
  const basename = path.basename(file);
  if (ALLOWED_FILES.includes(basename)) continue;
  
  const content = fs.readFileSync(file, 'utf-8');
  // 找字串中的 [class*= 模式
  const matches = content.match(/['"`][^'"`]*\[class\*=[^'"`]*['"`]/g);
  if (matches) {
    for (const match of matches) {
      console.error(
        `🟡 REVIEW CSS-in-JS in ${file}: ${match}\n` +
        `   Ensure this is inside a site-scoped condition.`
      );
    }
  }
}

if (hasError) {
  process.exit(1);
}

console.log('✅ CSS safety check passed');
```

### 7.2 False Positive 測試策略

#### 方案 A：Headless Smoke Test

```javascript
// tests/false-positive-check.js
// 用 Puppeteer 開啟已知易被誤殺的站點，檢查關鍵 UI 元素是否正常

const puppeteer = require('puppeteer');

const TEST_CASES = [
  {
    name: 'Gemini model selector',
    url: 'https://gemini.google.com',
    check: async (page) => {
      // 檢查 model selector dropdown 是否被隱藏
      const dropdown = await page.$('[class*="model-selector"], [class*="dropdown"]');
      if (dropdown) {
        const visible = await dropdown.evaluate(
          el => getComputedStyle(el).display !== 'none'
        );
        return { pass: visible, detail: 'Model selector should be visible' };
      }
      return { pass: true, detail: 'No dropdown found (may not be logged in)' };
    }
  },
  {
    name: 'Google Cloud Console menu',
    url: 'https://console.cloud.google.com',
    check: async (page) => {
      const menu = await page.$('[class*="nav"], [class*="sidebar"]');
      if (menu) {
        const visible = await menu.evaluate(
          el => getComputedStyle(el).display !== 'none'
        );
        return { pass: visible, detail: 'Navigation should be visible' };
      }
      return { pass: true, detail: 'Not logged in' };
    }
  },
  {
    name: 'GitHub modal dialogs',
    url: 'https://github.com',
    check: async (page) => {
      // 確保沒有 false positive hiding
      const overlays = await page.$$('[data-shield-hidden]');
      return {
        pass: overlays.length === 0,
        detail: `${overlays.length} elements unexpectedly hidden`
      };
    }
  }
];

async function runFalsePositiveTests(extensionPath) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  
  const results = [];
  
  for (const test of TEST_CASES) {
    const page = await browser.newPage();
    try {
      await page.goto(test.url, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.waitForTimeout(3000); // 等待擴充功能注入完成
      
      const result = await test.check(page);
      results.push({ name: test.name, ...result });
      
      console.log(
        result.pass ? '✅' : '❌',
        test.name, '-', result.detail
      );
    } catch (err) {
      results.push({
        name: test.name,
        pass: false,
        detail: `Error: ${err.message}`
      });
    } finally {
      await page.close();
    }
  }
  
  await browser.close();
  return results;
}
```

#### 方案 B：Content Script Self-Check

```javascript
// content/self-check.js — 在開發模式下自動偵測誤殺
(function() {
  'use strict';
  
  // 只在開發模式下執行
  if (!chrome.runtime.getManifest().version.includes('dev')) return;
  
  const KNOWN_SAFE_SELECTORS = [
    // Material UI
    '.MuiModal-root', '.MuiPopover-root', '.MuiDialog-root',
    // Tailwind
    '[class*="fixed inset-0"]', // 合法 modal backdrop
    // Bootstrap
    '.modal-backdrop', '.modal-dialog',
    // 自訂
    '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]'
  ];
  
  // 監控被隱藏的元素
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const el = mutation.target;
        if (el.style.display === 'none' || el.style.visibility === 'hidden') {
          // 檢查是否為已知安全元素
          for (const sel of KNOWN_SAFE_SELECTORS) {
            if (el.matches?.(sel)) {
              console.warn(
                `⚠️ [Shield Pro Self-Check] Potentially false positive:`,
                `Element matching "${sel}" was hidden.`,
                el
              );
            }
          }
        }
      }
    }
  });
  
  observer.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style', 'class']
  });
})();
```

### 7.3 使用者自訂站點的動態管理

```javascript
// background.js — 動態站點管理

// 使用者透過 dashboard 新增自訂站點
async function addCustomSite(domain) {
  // 1. 儲存到 storage
  const { customSites = [] } = await chrome.storage.local.get('customSites');
  if (!customSites.includes(domain)) {
    customSites.push(domain);
    await chrome.storage.local.set({ customSites });
  }
  
  // 2. 請求 optional host permission
  const pattern = `*://*.${domain}/*`;
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    console.warn('Permission denied for', domain);
    return false;
  }
  
  // 3. 更新 content script registration
  await updateDynamicContentScripts();
  
  return true;
}

async function updateDynamicContentScripts() {
  const { customSites = [] } = await chrome.storage.local.get('customSites');
  
  // 合併內建站點和自訂站點
  const allMatches = [
    ...SITE_REGISTRY.toMatchPatterns(),
    ...customSites.map(d => `*://*.${d}/*`)
  ];
  
  // 更新或註冊
  try {
    await chrome.scripting.updateContentScripts([{
      id: 'shield-main-world',
      matches: allMatches
    }]);
  } catch {
    // 如果腳本不存在，則註冊
    await chrome.scripting.registerContentScripts([{
      id: 'shield-main-world',
      matches: allMatches,
      js: ['content/inject-blocker.js', 'content/anti-antiblock.js'],
      world: 'MAIN',
      runAt: 'document_start',
      persistAcrossSessions: true
    }]);
  }
}

async function removeCustomSite(domain) {
  const { customSites = [] } = await chrome.storage.local.get('customSites');
  const updated = customSites.filter(d => d !== domain);
  await chrome.storage.local.set({ customSites: updated });
  
  // 移除 optional permission
  await chrome.permissions.remove({ origins: [`*://*.${domain}/*`] });
  
  // 更新 content scripts
  await updateDynamicContentScripts();
}
```

### 7.4 防止復發的架構守則

```
📋 Shield Pro 架構守則（Team Agreement）

1. 【正面清單原則】
   content_scripts 的 matches 欄位永遠使用正面清單
   ❌ <all_urls> - excludeMatches[...]
   ✅ *://*.specificsite.com/*

2. 【CSS 無全域模糊選擇器】
   全域注入的 CSS 中禁止使用 [class*=], [id*=], [class^=] 等
   ↳ 用 scripts/lint-css-safety.js 在 pre-commit 檢查

3. 【MAIN world 腳本最小化】
   inject-blocker.js 和 anti-antiblock.js 必須在第 1 行做站點檢查
   即使注入到錯誤站點，也要立刻 return（防禦性編程）

4. 【單一來源定義站點】
   所有站點清單在 site-registry.js 中定義
   其他檔案不得硬編碼 PLAYER_SITES 陣列
   ↳ 用 scripts/lint-site-list.js 在 pre-commit 檢查

5. 【新站點必須附帶測試】
   新增站點時必須在 tests/site-tests/ 下新增對應測試
   測試內容：注入成功、播放器偵測成功、無誤殺
```

---

## 8. 業界模式參照：uBlock Origin Lite / AdGuard MV3 / Ghostery

### 8.1 uBlock Origin Lite (uBOL)

uBOL 在 MV3 下的策略：

```
┌─────────────────────────────────────────────────┐
│ uBlock Origin Lite (MV3 Architecture)           │
│                                                 │
│ 1. declarativeNetRequest (DNR)                  │
│    → 靜態規則集（從 filter lists 編譯）           │
│    → 不需要 <all_urls> host permission           │
│                                                 │
│ 2. Cosmetic Filtering                           │
│    → 使用 "specific cosmetic filters"            │
│    → 每個 filter 綁定到特定域名                    │
│    → 格式: example.com##.ad-banner              │
│    → 不使用全域 ## 規則                           │
│                                                 │
│ 3. Scriptlet Injection                          │
│    → 從 filter lists 中提取 +js() 規則            │
│    → 透過 registerContentScripts 注入              │
│    → 每個 scriptlet 綁定到特定域名                 │
│                                                 │
│ 4. 權限模型                                      │
│    → 預設：無 host permission（純 DNR 模式）       │
│    → 使用者可選擇授予特定站點的 host permission    │
│    → Optimal / Complete 模式需要更多權限            │
└─────────────────────────────────────────────────┘
```

**Shield Pro 可借鑑的模式**：
- **Domain-scoped cosmetic filters**：每條 CSS 規則都綁到具體域名
- **Filtering mode 分級**：Basic（純 DNR）→ Optimal（+ cosmetic）→ Complete（+ scriptlets）
- **無 `<all_urls>` 也能運作**的純 DNR 模式

### 8.2 AdGuard MV3

```
┌─────────────────────────────────────────────────┐
│ AdGuard MV3 Architecture                        │
│                                                 │
│ 1. Declarative Rules                            │
│    → 將 AdGuard filter syntax 編譯為 DNR rules  │
│    → 支援 $domain modifier 限定作用域             │
│                                                 │
│ 2. CSS Injection Strategy                       │
│    → 用 chrome.scripting.insertCSS()             │
│    → 動態生成，按域名分發                          │
│    → 不使用靜態 CSS 檔案                          │
│                                                 │
│ 3. Extended CSS (:-abp-has, :matches-css)       │
│    → 用 JS 模擬瀏覽器不支援的進階選擇器           │
│    → 只在匹配站點上執行                           │
│                                                 │
│ 4. Scriptlets                                   │
│    → 預編譯的 scriptlet 庫                        │
│    → 每個 scriptlet 有明確的 trigger 條件         │
│    → 例: abort-on-property-read googletag         │
└─────────────────────────────────────────────────┘
```

**Shield Pro 可借鑑的模式**：
- **`chrome.scripting.insertCSS()` 動態注入**：比靜態 CSS 檔案更安全
- **Scriptlet 庫模式**：將 `inject-blocker.js` 中的各項功能拆成獨立 scriptlets，按需注入
- **$domain modifier 概念**：每條規則明確標記適用域名

### 8.3 Ghostery MV3

```
┌─────────────────────────────────────────────────┐
│ Ghostery MV3 Architecture                       │
│                                                 │
│ 1. Tracker Database                             │
│    → 維護已知 tracker 資料庫                      │
│    → 每個 tracker 有分類（ad, analytics, etc）    │
│                                                 │
│ 2. Smart Blocking                               │
│    → 根據頁面上下文決定是否阻擋                    │
│    → 同一個 tracker 在不同站點可能不同處理          │
│                                                 │
│ 3. Page-level Decisions                         │
│    → 使用 DNR 但搭配 tabId condition             │
│    → 可以按 tab 動態切換規則                       │
│                                                 │
│ 4. Never-Consent                                │
│    → Cosmetic filter 專門處理 cookie consent     │
│    → 域名精確匹配                                 │
└─────────────────────────────────────────────────┘
```

**Shield Pro 可借鑑的模式**：
- **Per-tab 規則切換**：用 `chrome.declarativeNetRequest.updateSessionRules` + `tabIds` 條件
- **上下文感知阻擋**：`overlay-remover.js` 應該要有更多頁面上下文判斷

### 8.4 業界共識總結

| 模式 | uBOL | AdGuard | Ghostery | Shield Pro 應採用 |
|---|---|---|---|---|
| 全域 CSS | ❌ 不用 | ❌ 不用 | ❌ 不用 | ❌ 應淘汰 |
| Domain-scoped CSS | ✅ | ✅ | ✅ | ✅ 改用此模式 |
| 動態 CSS 注入 | ❌ 用靜態 | ✅ insertCSS | ❌ 用靜態 | ✅ 建議採用 |
| `<all_urls>` | 可選 | 需要 | 需要 | ❌ 應淘汰 |
| Scriptlet 拆分 | ✅ 單一功能 | ✅ 單一功能 | N/A | ✅ 應拆分 inject-blocker |
| 分級保護 | ✅ 三級 | ✅ 設定 | ✅ 分類 | ✅ 已有 blocking level |

---

## 9. 完整架構圖

```
                        ┌─────────────────────────┐
                        │    Chrome Extensions     │
                        │       Runtime            │
                        └────────┬────────────────┘
                                 │
                    ┌────────────┼────────────────┐
                    ▼            ▼                ▼
            ┌──────────┐  ┌──────────┐   ┌───────────────┐
            │ manifest │  │ DNR      │   │ Service       │
            │ .json    │  │ Rules    │   │ Worker        │
            │          │  │ (static) │   │ (background)  │
            │ • perms  │  └──────────┘   │               │
            │ • DNR    │                 │ ┌───────────┐ │
            │ • NO     │                 │ │ Site      │ │
            │   content│                 │ │ Registry  │ │
            │   scripts│                 │ └─────┬─────┘ │
            └──────────┘                 │       │       │
                                         │  ┌────┴────┐  │
                                         │  │Decision │  │
                                         │  │Engine   │  │
                                         │  └────┬────┘  │
                                         └───────┼───────┘
                                                 │
                    ┌────────────────────────────┤
                    │                            │
            ┌───────┴───────┐           ┌───────┴───────────┐
            │ Known Sites   │           │ Custom/Probe Sites│
            │ (fast path)   │           │ (probe path)      │
            │               │           │                   │
            │ onCommitted   │           │ onCompleted       │
            │  ↓            │           │  ↓                │
            │ registerCS    │           │ executeScript     │
            │ (MAIN world)  │           │ (probe.js)        │
            │  +            │           │  ↓                │
            │ executeScript │           │ PROBE_RESULT      │
            │ (ISOLATED)    │           │  ↓                │
            │  +            │           │ executeScript     │
            │ insertCSS     │           │ (selected scripts)│
            │ (site-scoped) │           │  +                │
            │               │           │ insertCSS         │
            └───────────────┘           └───────────────────┘
                    │                            │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────┴────────────────┐
                    │        Content Scripts       │
                    │                              │
                    │ ┌──────────────────────────┐ │
                    │ │ MAIN World               │ │
                    │ │  inject-blocker.js        │ │
                    │ │  anti-antiblock.js        │ │
                    │ │  (always guard w/         │ │
                    │ │   isPlayerSite check)     │ │
                    │ └──────────────────────────┘ │
                    │                              │
                    │ ┌──────────────────────────┐ │
                    │ │ ISOLATED World           │ │
                    │ │  cosmetic-filter.js       │ │
                    │ │  anti-popup.js            │ │
                    │ │  dynamic-hider.js  (new)  │ │
                    │ │  player-detector.js       │ │
                    │ │  player-enhancer.js       │ │
                    │ │  player-controls.js       │ │
                    │ │  player-sync.js           │ │
                    │ │  overlay-remover.js       │ │
                    │ │  fake-video-remover.js    │ │
                    │ │  ai-runtime.js            │ │
                    │ └──────────────────────────┘ │
                    │                              │
                    │ ┌──────────────────────────┐ │
                    │ │ CSS (dynamic, site-scoped)│ │
                    │ │  player-base.css (safe)   │ │
                    │ │  css-modules[site] (gen'd)│ │
                    │ │  NO player-overlay-fix.css│ │
                    │ └──────────────────────────┘ │
                    └──────────────────────────────┘
```

---

## 10. 與三層式提案的比較與互補

| 面向 | 三層式提案 | 本提案 | 互補建議 |
|---|---|---|---|
| 站點清單 | ✅ 集中 `SITE_REGISTRY` | ✅ 同意，共用 | 採用三層式的 `site-registry.js` |
| 注入控制 | `registerContentScripts` | `webNavigation` + `executeScript` 混合 | MAIN world → register，其他 → webNavigation |
| CSS | 站點限定注入靜態 CSS | 動態生成 + JS fallback | 採用本提案的 zero-global CSS |
| 權限 | 未詳細討論 | 明確列舉 + optional | 採用本提案的方案 C |
| Probe 機制 | 未提及 | ✅ 用於自訂站點 | 採用 probe-first 作為 Tier X 的實作 |
| 測試 | 未詳細討論 | Lint + Smoke Test | 兩者互補 |
| 業界參照 | 未提及 | ✅ uBOL/AdGuard 模式 | — |

### 建議的最終架構

將兩份提案的優點合併：

1. **站點清單**：三層式的 `SITE_REGISTRY`（單一來源）
2. **Tier 0**（不注入）：由 `SITE_REGISTRY.isPlayerSite()` 反面判斷自動達成
3. **Tier 1**（on-demand）：本提案的 `activeTab` + `executeScript` 模式
4. **Tier 2**（已知站點）：
   - MAIN world 腳本 → `registerContentScripts`（保證時序）
   - ISOLATED 腳本 → `webNavigation.onCommitted` + `executeScript`（可加條件邏輯）
   - CSS → `chrome.scripting.insertCSS`（動態，站點專用）
5. **Tier X**（自訂站點）：本提案的 Probe-First 模式
6. **CSS 安全防線**：本提案的 zero-global CSS 架構
7. **權限**：本提案的方案 C（明確 + optional 混合）
8. **護欄**：本提案的 lint rules + smoke tests

---

## 附錄 A：遷移檢查清單

- [ ] 建立 `content/site-registry.js`，合併所有散落的 `PLAYER_SITES` 陣列
- [ ] 將 `player-overlay-fix.css` 中的 `[class*="..."]` 選擇器移到 `css-modules.js`
- [ ] 建立 `content/dynamic-hider.js` 取代全域 CSS hiding
- [ ] 建立 `content/probe.js` 探測腳本
- [ ] 修改 `manifest.json`：移除 `<all_urls>`，改用明確 host_permissions
- [ ] 修改 `manifest.json`：移除 `content_scripts` 宣告
- [ ] 修改 `background.js`：加入 `webNavigation` 注入邏輯
- [ ] 修改 `background.js`：使用 `registerContentScripts` 註冊 MAIN world 腳本
- [ ] 刪除 `EXCLUDED_MATCHES` 排除清單（不再需要）
- [ ] 限縮 `web_accessible_resources` 的 `matches`
- [ ] 建立 `scripts/lint-css-safety.js` lint 腳本
- [ ] 建立 false positive smoke tests
- [ ] 更新文件

---

## 附錄 B：快速驗證命令

```powershell
# 檢查 CSS 是否有危險選擇器
Select-String -Path "extension/**/*.css" -Pattern '\[class\*=' -Recurse

# 檢查硬編碼的站點清單
Select-String -Path "extension/content/*.js" -Pattern 'PLAYER_SITES\s*=' -Recurse

# 統計 EXCLUDED_MATCHES 長度（應趨向 0）
Select-String -Path "extension/background.js" -Pattern "EXCLUDED_MATCHES" | Measure-Object
```
