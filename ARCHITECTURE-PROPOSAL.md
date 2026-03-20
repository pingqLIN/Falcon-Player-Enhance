# Shield Pro 架構重構提案：從負面清單到正面清單

## 目錄

1. [問題分析](#1-問題分析)
2. [架構設計：三層式腳本分級](#2-架構設計三層式腳本分級)
3. [集中化站點清單](#3-集中化站點清單)
4. [CSS 問題解決方案](#4-css-問題解決方案)
5. [declarativeNetRequest 範圍限縮](#5-declarativenetrequest-範圍限縮)
6. [使用者白名單互動](#6-使用者白名單互動)
7. [manifest.json 變更](#7-manifestjson-變更)
8. [background.js 改造方案](#8-backgroundjs-改造方案)
9. [方案比較與取捨](#9-方案比較與取捨)
10. [遷移路徑](#10-遷移路徑)

---

## 1. 問題分析

### 當前架構的根本缺陷

```
當前模式：<all_urls> - excludeMatches[120+ 條]
         ↓
「我不知道有什麼網站會壞，所以壞一個排除一個」
```

核心問題量化：

| 指標 | 當前狀態 | 風險等級 |
|---|---|---|
| EXCLUDED_MATCHES 條目數 | ~120 條（且持續增長） | 🔴 不可持續 |
| PLAYER_SITES 重複定義 | 4 個檔案各有一份 | 🟡 維護負擔 |
| `[class*="popup-overlay"]` 等 CSS | 全域注入 | 🔴 高誤殺率 |
| `window.open` monkey-patch | 全域注入 (MAIN world) | 🔴 破壞任何使用 `window.open` 的網站 |
| `addEventListener` 攔截 | 全域注入 (MAIN world) | 🔴 破壞任何監聽 click 的 SPA |
| 覆蓋層掃描 (overlay-remover) | 全域掃描 | 🟡 誤移除合法 modal |

**關鍵洞察**：anti-antiblock.js 已經有 `if (!isPlayerSite()) { return; }` 的 early exit，證明開發者_已經知道_這些腳本不該在所有網站執行。但問題是腳本仍然被注入、被執行到第一行才退出——浪費資源且增加出錯面。

---

## 2. 架構設計：三層式腳本分級

### Tier 概覽

```
┌─────────────────────────────────────────────────────────────┐
│                    Tier 0: 無腳本                            │
│           （使用者白名單網站 / 預設安全網站）                    │
│              不注入任何內容腳本                                │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Tier 1: 通用輕量（Passive）                      │
│                   chrome.activeTab 觸發                      │
│                                                             │
│  ✅ element-picker.js  — 使用者手動啟動                       │
│  ✅ i18n.js            — 國際化                              │
│                                                             │
│  注入方式：chrome.scripting.executeScript() on-demand         │
│  觸發時機：使用者在 popup 中按下 Element Picker               │
│  matches: 不需要 — 由 activeTab 授權                         │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Tier 2: 播放器站點專用（Aggressive）                │
│            registerContentScripts() 正面清單                  │
│                                                             │
│  📦 Group A (document_start, MAIN world):                    │
│     anti-antiblock.js, inject-blocker.js                     │
│                                                             │
│  📦 Group B (document_start, ISOLATED):                      │
│     cosmetic-filter.js, anti-popup.js                        │
│                                                             │
│  📦 Group C (document_idle, ISOLATED):                       │
│     styles.css, player-overlay-fix.css,                      │
│     player-detector.js, player-enhancer.js,                  │
│     player-controls.js, player-sync.js,                      │
│     overlay-remover.js, fake-video-remover.js                │
│                                                             │
│  📦 Group D (document_start, ISOLATED):                      │
│     ai-runtime.js                                            │
│                                                             │
│  matches: 從集中 PLAYER_SITE_REGISTRY 動態生成               │
│  範例：*://*.javboys.com/*, *://*.missav.com/* ...            │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Tier X: 使用者自訂站點（Dynamic）                   │
│            使用者透過 Dashboard 新增的自訂網站                  │
│                                                             │
│  使用者可將任意網站加入「啟用攔截」清單                          │
│  → 動態追加到 registerContentScripts 的 matches              │
│  → 或透過 executeScript 按需注入                              │
└─────────────────────────────────────────────────────────────┘
```

### 各腳本分類邏輯

| 腳本 | Tier | 理由 |
|---|---|---|
| `element-picker.js` | 1 (on-demand) | 使用者明確觸發，需要在任意網站工作。只在使用者點擊按鈕時注入、無副作用。 |
| `i18n.js` | 1 (on-demand) | 純 UI 輔助 |
| `anti-antiblock.js` | 2 (player-only) | 偽造 adsbygoogle、googletag 等 API — 在一般網站執行會破壞正常廣告 SDK |
| `inject-blocker.js` | 2 (player-only) | monkey-patch window.open、addEventListener — 這是破壞性最強的腳本 |
| `cosmetic-filter.js` | 2 (player-only) | 含 `[class*="exoclick"]` 等選擇器，雖然相對安全但沒必要全域執行 |
| `anti-popup.js` | 2 (player-only) | DOM 覆蓋層移除，`inset-0 fixed` 幾乎會誤殺所有用 Tailwind modal 的網站 |
| `overlay-remover.js` | 2 (player-only) | 全螢幕覆蓋偵測、高 z-index 掃描 — 非常侵入 |
| `player-detector.js` | 2 (player-only) | 播放器偵測，只有在播放器站點才有意義 |
| `player-enhancer.js` | 2 (player-only) | 播放器增強 UI |
| `player-controls.js` | 2 (player-only) | 播放器控制 |
| `player-sync.js` | 2 (player-only) | 播放器同步 |
| `fake-video-remover.js` | 2 (player-only) | 假影片移除 |
| `ai-runtime.js` | 2 (player-only) | AI 風險監控 — 之前全域注入是為了收集資料，但目標站點外的風險資料沒有價值 |
| `styles.css` | 2 (player-only) | 播放器增強樣式 |
| `player-overlay-fix.css` | 2 (player-only) | 包含 `[class*="popup-overlay"]` 等危險選擇器 |

---

## 3. 集中化站點清單

### 新增 `content/site-registry.js`

```javascript
// ============================================================================
// Shield Pro - Centralized Site Registry (Single Source of Truth)
// ============================================================================
// 所有站點清單的唯一定義。其他模組一律引用此處。
// ============================================================================

const SHIELD_SITE_REGISTRY = {
  // --- 主要播放器站點 ---
  playerSites: [
    // 亞洲影片
    { domain: 'javboys.com',   aliases: ['javboys.online'] },
    { domain: 'luluvdoo.com',  aliases: [] },
    { domain: 'myvidplay.com', aliases: [] },
    { domain: 'upn.one',       aliases: [] },
    { domain: 'zenithstrategylabs.com', aliases: [] },
    { domain: 'missav.com',    aliases: ['missav.ws'] },
    { domain: 'supjav.com',    aliases: [] },
    { domain: 'thisav.com',    aliases: [] },
    { domain: 'jable.tv',      aliases: [] },
    { domain: 'avgle.com',     aliases: [] },
    { domain: 'netflav.com',   aliases: [] },
    // 國際站點
    { domain: 'pornhub.com',   aliases: ['pornhub.org'] },
    { domain: 'xvideos.com',   aliases: [] },
    { domain: 'xhamster.com',  aliases: ['xhamster.desi'] },
    { domain: 'redtube.com',   aliases: [] },
    { domain: 'youporn.com',   aliases: [] },
    { domain: 'spankbang.com', aliases: [] },
    { domain: 'eporner.com',   aliases: [] },
    { domain: 'txxx.com',      aliases: [] },
    { domain: 'hqporner.com',  aliases: [] },
  ],

  // --- 相容模式（放寬攔截強度） ---
  compatibilityModeSites: [
    'boyfriendtv.com'
  ],

  // --- 使用者白名單預設（這些站點_永不_注入） ---
  defaultWhitelist: [
    'youtube.com',
    'netflix.com',
    'disneyplus.com',
    'hulu.com',
    'primevideo.com',
    'max.com',
    'tv.apple.com',
  ]
};

// 工具函數
SHIELD_SITE_REGISTRY.getAllDomains = function() {
  const domains = [];
  for (const site of this.playerSites) {
    domains.push(site.domain);
    domains.push(...site.aliases);
  }
  return domains;
};

SHIELD_SITE_REGISTRY.toMatchPatterns = function() {
  const patterns = [];
  for (const domain of this.getAllDomains()) {
    patterns.push(`*://*.${domain}/*`);
    // 有些站點不帶 www，需要同時匹配根域名
    patterns.push(`*://${domain}/*`);
  }
  return [...new Set(patterns)];
};

SHIELD_SITE_REGISTRY.isPlayerSite = function(hostname) {
  const host = (hostname || '').toLowerCase();
  return this.getAllDomains().some(domain => host === domain || host.endsWith('.' + domain));
};

SHIELD_SITE_REGISTRY.isCompatibilityModeSite = function(hostname) {
  const host = (hostname || '').toLowerCase();
  return this.compatibilityModeSites.some(domain => host === domain || host.endsWith('.' + domain));
};

// 凍結防止意外修改
Object.freeze(SHIELD_SITE_REGISTRY.playerSites);
Object.freeze(SHIELD_SITE_REGISTRY.compatibilityModeSites);
Object.freeze(SHIELD_SITE_REGISTRY.defaultWhitelist);
```

### 共享方式

由於 Chrome MV3 的限制，content scripts 和 background service worker 之間不能直接共享模組。有三種策略：

| 策略 | 做法 | 適用 |
|---|---|---|
| **A. Build-time injection** | 用 Rollup/esbuild 在建置時將 `site-registry.js` 打入每個 content script | 最乾淨，推薦 |
| **B. chrome.storage 下發** | background 啟動時從 registry 推送到 storage，content scripts 從 storage 讀取 | 不需要 bundler |
| **C. importScripts fallback** | 對 MAIN world 腳本用 `<script>` 注入 registry | 最後手段 |

**推薦方案 A**，但如果專案不想引入 bundler，方案 B 立刻可行：

```javascript
// background.js (啟動時)
chrome.storage.local.set({
  __siteRegistry: SHIELD_SITE_REGISTRY.getAllDomains()
});

// content script (初始化時)
const result = await chrome.storage.local.get(['__siteRegistry']);
const PLAYER_DOMAINS = result.__siteRegistry || [];
```

---

## 4. CSS 問題解決方案

### 問題

`player-overlay-fix.css` 包含以下選擇器，當全域注入時會誤殺合法 UI：

```css
/* 危險！會隱藏任何含 "popup-overlay" class 的元素 */
[class*="popup-overlay"],
[class*="interstitial"],
[class*="overlay-ad"],
[class*="adblock"],
[class*="lightbox-overlay"] {
  display: none !important;
}
```

### 解決方案：CSS 跟隨 Tier 2 限縮

**一旦 Tier 2 只 match 播放器站點，CSS 就自然不會影響其他網站。** 這是最簡單、最有效的修復。

但為了_雙重保護_，還建議做以下改進：

#### 4a. 將寬泛 CSS 從靜態檔案移到 JS 動態注入

```javascript
// cosmetic-filter.js 內 — 只在 isPlayerSite() 時注入這些規則
function getAggressiveSelectors() {
  return [
    '[class*="popup-overlay"]',
    '[class*="interstitial"]',
    '[class*="overlay-ad"]',
    // ...
  ];
}

function generateCSS() {
  const hostname = window.location.hostname.toLowerCase();
  let selectors = [];

  // 只在播放器站點才啟用寬泛選擇器
  if (isPlayerSite(hostname)) {
    selectors.push(...getAggressiveSelectors());
  }

  // 站點特定規則（無論如何都安全）
  for (const [site, rules] of Object.entries(PLAYER_SITE_RULES)) {
    if (hostname.includes(site)) {
      selectors.push(...rules);
    }
  }

  // 使用者自訂規則（element-picker 產生的）
  selectors.push(...customRules
    .filter(r => !r.hostname || hostname.includes(r.hostname))
    .map(r => r.selector)
  );

  return [...new Set(selectors)]
    .map(sel => `${sel} { display: none !important; visibility: hidden !important; }`)
    .join('\n');
}
```

#### 4b. `player-overlay-fix.css` 精簡化

將 `player-overlay-fix.css` 只保留以下安全選擇器（針對已知 ID/class 而非 `[class*=""]`）：

```css
/* 安全：命名高度具體，只會匹配目標站點的元素 */
#preact-border-shadow-host,
.cvpboxOverlay,
.cvpcolorbox,
#cvpboxOverlay,
#cvpcolorbox { ... }

/* 移除所有 [class*="..."] 選擇器到 JS 動態注入 */
```

#### 4c. Element Picker 的 CSS 永遠本地範圍

Element Picker 產生的自訂規則已經_帶有 hostname_，所以只會在對應站點生效：

```javascript
// 現有邏輯已正確：
{ selector: '.annoying-popup', hostname: 'example.com' }
```

---

## 5. declarativeNetRequest 範圍限縮

### 當前問題

`filter-rules.json` 包含 ~1469 條規則，其中許多是通用廣告域名封鎖（如 `doubleclick.net`、`googlesyndication.com`），**沒有 `initiatorDomains` 限制**，意味著在所有網站生效。

### 建議

根據規則類型分為兩類：

#### 5a. 通用廣告域名封鎖（保持全域）

```json
{
  "id": 1001,
  "action": { "type": "block" },
  "condition": {
    "urlFilter": "||exoclick.com^",
    "resourceTypes": ["script", "xmlhttprequest", "image", "sub_frame"]
  }
}
```

這些規則封鎖的是**明確的廣告/追蹤域名**（exoclick、trafficjunky、juicyads），全域封鎖是安全的，因為正常網站不會載入這些域名的資源。

#### 5b. 路徑式規則（限縮到播放器站點）

```json
{
  "id": 1006,
  "action": { "type": "block" },
  "condition": {
    "urlFilter": "/ads/*",
    "resourceTypes": ["script", "image", "sub_frame"],
    "initiatorDomains": ["javboys.com", "missav.com", "pornhub.com", "..."]
  }
}
```

`/ads/*`、`/banner/*` 這類路徑模式太寬泛，可能匹配到合法路由（如 `/ads/create` 是廣告管理平台的合法頁面）。**加上 `initiatorDomains` 後只在播放器站點生效。**

#### 規則分檔

```
rules/
  core-ad-domains.json     ← 廣告域名封鎖（全域安全）
  player-site-rules.json   ← 路徑模式封鎖（限 initiatorDomains）
```

```json
// manifest.json
"declarative_net_request": {
  "rule_resources": [
    { "id": "core_ad_domains", "enabled": true, "path": "rules/core-ad-domains.json" },
    { "id": "player_site_rules", "enabled": true, "path": "rules/player-site-rules.json" }
  ]
}
```

---

## 6. 使用者白名單互動

### 當前行為

使用者在 Dashboard 中可將網站加入「白名單」，白名單網站被排除在外。但目前機制是_排除_，與 `<all_urls>` 配合使用。

### 新架構下的白名單語意轉變

```
舊模式：「這些網站不要擋」 → excludeMatches
新模式：兩層                        
  Layer 1：「這些播放器站點要擋」 → matches（正面清單）
  Layer 2：「使用者臨時排除某個播放器站點」 → 動態移除 match
```

### 實作

```javascript
async function rebuildContentScriptMatches() {
  const registry = SHIELD_SITE_REGISTRY;
  const { whitelist = [] } = await chrome.storage.local.get(['whitelist']);
  const { userAddedSites = [] } = await chrome.storage.local.get(['userAddedSites']);

  // 播放器站點 - 白名單 + 使用者自訂站點
  const allPlayerDomains = registry.getAllDomains();
  const allDomains = [...new Set([...allPlayerDomains, ...userAddedSites])];
  
  const whitelistSet = new Set(whitelist.map(d => d.toLowerCase()));
  const activeDomains = allDomains.filter(d => !whitelistSet.has(d.toLowerCase()));
  
  const matchPatterns = [];
  for (const domain of activeDomains) {
    matchPatterns.push(`*://*.${domain}/*`);
    matchPatterns.push(`*://${domain}/*`);
  }

  return matchPatterns;
}

// 白名單更新時重新註冊
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.whitelist || changes.userAddedSites) {
    await registerContentScripts(); // 使用新的 matches
  }
});
```

### Dashboard UI 變更

```
白名單 → 改名為「排除網站」
新增面板：「自訂攔截站點」— 讓使用者新增不在預設清單中的站點
```

---

## 7. manifest.json 變更

```jsonc
{
  "manifest_version": 3,
  "permissions": [
    "declarativeNetRequest",
    "declarativeNetRequestWithHostAccess",
    "declarativeNetRequestFeedback",
    "sidePanel",
    "scripting",
    "storage",
    "tabs",
    "activeTab"  // ← 保留：Element Picker 需要
  ],
  // 關鍵改動：host_permissions 從 <all_urls> 改為播放器站點清單
  // 但由於 element-picker 需要在任意站點工作（透過 activeTab），
  // 加上 declarativeNetRequest 需要攔截任意站點的廣告請求，
  // <all_urls> 在 host_permissions 中仍需保留。
  // 改動點在 content_scripts 的 matches，不在 host_permissions。
  "host_permissions": ["<all_urls>"],
  
  // 不再宣告靜態 content_scripts —— 完全透過 registerContentScripts 動態管理
  // (目前已經是這樣做了，所以 manifest 不需改動此處)

  "declarative_net_request": {
    "rule_resources": [
      { "id": "core_ad_domains", "enabled": true, "path": "rules/core-ad-domains.json" },
      { "id": "player_site_rules", "enabled": true, "path": "rules/player-site-rules.json" }
    ]
  },

  "web_accessible_resources": [
    {
      "resources": [
        "content/inject-blocker.js",
        "rules/noop.js",
        "sandbox/sandbox.html",
        "popup-player/popup-player.html",
        "popup-player/popup-player.js"
      ],
      // 也可以限縮，但由於 popup-player 可能被任意站點呼叫，保持 <all_urls>
      "matches": ["<all_urls>"]
    }
  ]
}
```

---

## 8. background.js 改造方案

### 刪除項目

```diff
- const EXCLUDED_MATCHES = [
-   '*://mail.google.com/*',
-   '*://accounts.google.com/*',
-   ... (120+ 行)
- ];
```

### 新增項目

```javascript
// ============================================================================
// 集中化站點清單 (Single Source of Truth)
// ============================================================================
const PLAYER_SITE_DOMAINS = [
  'javboys.com', 'javboys.online',
  'luluvdoo.com',
  'myvidplay.com',
  'upn.one',
  'zenithstrategylabs.com',
  'missav.com', 'missav.ws',
  'supjav.com',
  'thisav.com',
  'jable.tv',
  'avgle.com',
  'netflav.com',
  'pornhub.com', 'pornhub.org',
  'xvideos.com',
  'xhamster.com', 'xhamster.desi',
  'redtube.com',
  'youporn.com',
  'spankbang.com',
  'eporner.com',
  'txxx.com',
  'hqporner.com',
  'boyfriendtv.com',
];

function buildPlayerSiteMatchPatterns(domains) {
  const patterns = [];
  for (const domain of domains) {
    patterns.push(`*://*.${domain}/*`);
    patterns.push(`*://${domain}/*`);
  }
  return [...new Set(patterns)];
}

async function getActiveMatchPatterns() {
  const { whitelist = [], userAddedSites = [] } = await chrome.storage.local.get([
    'whitelist', 'userAddedSites'
  ]);
  const whitelistSet = new Set(whitelist.map(d => d.toLowerCase()));
  const allDomains = [...new Set([...PLAYER_SITE_DOMAINS, ...userAddedSites])];
  const activeDomains = allDomains.filter(d => !whitelistSet.has(d.toLowerCase()));
  return buildPlayerSiteMatchPatterns(activeDomains);
}
```

### CONTENT_SCRIPT_DEFINITIONS 改造

```javascript
async function buildContentScriptDefinitions() {
  const matches = await getActiveMatchPatterns();
  
  if (matches.length === 0) {
    return []; // 所有站點都被白名單排除
  }

  return [
    {
      id: 'shield-main-world',
      matches,
      js: ['content/anti-antiblock.js', 'content/inject-blocker.js'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      persistAcrossSessions: true
    },
    {
      id: 'shield-docstart-isolated',
      matches,
      js: ['content/cosmetic-filter.js', 'content/anti-popup.js'],
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: true
    },
    {
      id: 'shield-docidle-isolated',
      matches,
      css: ['content/styles.css', 'content/player-overlay-fix.css'],
      js: [
        'content/player-detector.js',
        'content/fake-video-remover.js',
        'content/overlay-remover.js',
        'content/player-enhancer.js',
        'content/player-controls.js',
        'content/player-sync.js'
      ],
      runAt: 'document_idle',
      allFrames: true,
      persistAcrossSessions: true
    },
    {
      id: 'shield-ai-runtime',
      matches,
      js: ['content/ai-runtime.js'],
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: true
    }
  ];
}
```

### Element Picker 改為 on-demand 注入

```javascript
// 當 popup.js 發送 'activateElementPicker' 時
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'activateElementPicker') {
    const tabId = request.tabId || sender.tab?.id;
    if (!tabId) return;

    // 使用 activeTab 權限動態注入 element-picker
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/element-picker.js']
    }).then(() => {
      // 注入後啟動 picker
      chrome.tabs.sendMessage(tabId, { action: 'activatePicker' });
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });

    return true; // async response
  }
});
```

---

## 9. 方案比較與取捨

### 方案 A：純正面清單（推薦 ✅）

| 面向 | 效果 |
|---|---|
| **安全性** | 🟢 不會影響任何非目標站點 |
| **維護成本** | 🟢 新增站點 = 新增一個域名到 registry |
| **效能** | 🟢 Chrome 只在匹配站點注入腳本，大幅減少記憶體用量 |
| **功能完整性** | 🟡 使用者新增的自訂站點需要手動加入 |
| **Element Picker** | 🟢 透過 `activeTab` + `executeScript` 在任意站點工作 |
| **Chrome Web Store 審核** | 🟢 不再是 `<all_urls>` 內容腳本，審核更容易通過 |

### 方案 B：混合式（Tier 1 全域 + Tier 2 限縮）

保留 `ai-runtime.js` 全域注入以收集風險遙測。

| 面向 | 效果 |
|---|---|
| **安全性** | 🟡 ai-runtime.js 是唯讀觀察者，風險低但不為零 |
| **AI 資料品質** | 🟢 可在所有站點學習風險模式 |
| **效能** | 🟡 仍然在所有頁面注入 1 個腳本 |
| **CWS 審核** | 🟡 仍有「為何需要在所有頁面執行腳本？」的疑問 |

**取捨結論**：ai-runtime.js 收集的通用風險資料_對播放器站點外的場景沒有價值_。擴充的目的是保護播放器體驗，不是做通用安全監控。**推薦方案 A。**

### 方案 C：保持 `<all_urls>` 但各腳本內部 early-exit

類似 `anti-antiblock.js` 現在的做法。

| 面向 | 效果 |
|---|---|
| **安全性** | 🟡 腳本仍被載入、解析、執行到 early return — 可能有 race condition |
| **效能** | 🔴 每個頁面載入 4 組腳本，即使馬上退出也有開銷 |
| **CWS 審核** | 🔴 `<all_urls>` + MAIN world 仍然會被標記 |

**不推薦。**

---

## 10. 遷移路徑

### Phase 1：集中化站點清單（1-2 天）

1. 建立 `content/site-registry.js`
2. 修改 `background.js`：
   - 刪除 `EXCLUDED_MATCHES` (120+ 行)
   - 新增 `PLAYER_SITE_DOMAINS` 和 `buildPlayerSiteMatchPatterns()`
   - 將 `CONTENT_SCRIPT_DEFINITIONS` 改為 async 函數 `buildContentScriptDefinitions()`
3. 各 content script 中的 `PLAYER_SITES` 陣列**暫時保留**（作為安全網）
4. 測試：確認所有播放器站點仍正常攔截

### Phase 2：CSS 整理（1 天）

1. 將 `player-overlay-fix.css` 中的 `[class*="..."]` 選擇器移到 `cosmetic-filter.js` 的動態注入
2. `player-overlay-fix.css` 只保留具體的 ID/class 選擇器
3. 測試：確認在 javboys、missav 等站點覆蓋層仍被正確隱藏

### Phase 3：Element Picker 抽離（0.5 天）

1. 從 `shield-docidle-isolated` 移除 `element-picker.js`
2. 在 `background.js` 新增 on-demand 注入邏輯
3. 修改 `popup.js` 的 Element Picker 按鈕，改為先請求 background 注入再啟動
4. 測試：在 google.com 上測試 Element Picker 仍然可用

### Phase 4：declarativeNetRequest 分檔（0.5 天）

1. 將 `filter-rules.json` 拆分為 `core-ad-domains.json` 和 `player-site-rules.json`
2. 為路徑模式規則加上 `initiatorDomains`
3. 更新 `manifest.json`

### Phase 5：移除各 content script 中的冗餘清單（0.5 天）

1. 移除 `inject-blocker.js`、`anti-popup.js`、`anti-antiblock.js`、`cosmetic-filter.js` 中的 `PLAYER_SITES` 陣列
2. 各腳本改為無條件執行（因為只有在播放器站點才會被注入）
3. 保留 `isPlayerSite()` 函數作為防衛性檢查，但改從 storage 或環境讀取

### Phase 6：Dashboard UI 更新（1 天）

1. 將「白名單」改名為「排除網站」
2. 新增「自訂攔截站點」區塊
3. 新增站點清單管理介面

### 驗證清單

- [ ] 所有播放器站點的廣告攔截正常
- [ ] google.com、github.com、chatgpt.com 等無任何影響
- [ ] Element Picker 可在任意站點啟動
- [ ] 使用者自訂隱藏規則在對應站點生效
- [ ] 新增自訂站點後，該站點的攔截正常運作
- [ ] 白名單排除某個播放器站點後，該站點不再被注入腳本
- [ ] 停用/啟用擴充功能的開關正常
- [ ] AI Runtime 在播放器站點正常收集遙測
- [ ] blocking level 切換正常

---

## 附錄：Match Patterns 參考

以目前 20 個站點+別名，產生的 match patterns 約 50 條。Chrome 的 `registerContentScripts` match patterns 上限為每條規則最多數千條，完全足夠。

```javascript
// 產出範例
[
  "*://*.javboys.com/*",
  "*://javboys.com/*",
  "*://*.javboys.online/*",
  "*://javboys.online/*",
  "*://*.missav.com/*",
  "*://missav.com/*",
  // ... (~50 條)
]
```

若未來站點增長到 100+，可考慮改用 `chrome.scripting.executeScript()` + `chrome.webNavigation.onCommitted` 的事件驅動模式，但目前規模遠不需要。
