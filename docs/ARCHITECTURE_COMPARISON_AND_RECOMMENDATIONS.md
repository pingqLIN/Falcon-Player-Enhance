# Falcon-Player-Enhance 架構比較與開發建議

> **審查日期**：2026-03-24  
> **專案版本**：v4.4.0 (Chrome MV3)  
> **比較對象**：uBlock Origin (SNFE)、AdGuard (MV3)  
> **目的**：根據業界頂尖廣告攔截程式的底層架構，提出 Falcon 的具體改進方向

---

## 一、架構總覽比較

### 1.1 資料處理管線對照

```
┌─────────────────────────────────────────────────────────────────────┐
│                        uBlock Origin (MV2)                         │
│                                                                     │
│  EasyList 文字規則                                                  │
│    → AST 解析 → Int32Array 二進位編譯                               │
│    → BidiTrieContainer + HNTrieContainer (O(1) 查找)               │
│    → Selfie 快照 (IndexedDB) → 毫秒級熱啟動                        │
│                                                                     │
│  請求進入 → Token 提取 → Hash 跳轉 → Filter Bucket (5-20 條)       │
│    → 匹配 → block/allow                                            │
│                                                                     │
│  DOM 過濾：MutationObserver → 批次處理 → requestIdleCallback       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     Falcon-Player-Enhance (現況)                    │
│                                                                     │
│  filter-rules.json (~100 條)                                        │
│    → Chrome DNR API (瀏覽器原生處理)                                │
│                                                                     │
│  請求進入 → 瀏覽器 DNR 匹配 → block/allow                          │
│                                                                     │
│  JS 層：MALICIOUS_DOMAINS[] → String.includes() 線性掃描           │
│                                                                     │
│  DOM 過濾：13+ setInterval polling (500ms~5000ms)                   │
│                                                                     │
│  AI 層：事件收集 → 風險評分 → 外部 API → Policy 生成               │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 各維度評分

| 維度 | Falcon | uBlock Origin | AdGuard | 說明 |
|------|--------|---------------|---------|------|
| 網路規則覆蓋 | ⭐ (100 條) | ⭐⭐⭐⭐⭐ (300K+) | ⭐⭐⭐⭐⭐ | Falcon 定位為搭配 uBOL 使用 |
| 外觀過濾 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 缺 MutationObserver、程序性過濾 |
| 腳本注入 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | MAIN world 有效但過度攔截風險 |
| 架構品質 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 分層清晰但單檔過大 |
| 效能 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | polling vs 事件驅動差距明顯 |
| AI 自適應 | ⭐⭐⭐⭐ | ❌ 無 | ❌ 無 | **Falcon 獨有優勢** |
| MV3 準備度 | ⭐⭐⭐⭐⭐ | ⭐⭐ (需重構) | ⭐⭐⭐⭐ | 原生 MV3 設計 |
| **總評** | **6/10** | **9.5/10** | **8.5/10** | |

---

## 二、uBO 核心技術解析（可借鏡之處）

### 2.1 快速啟動：Selfie 快照機制

```
首次啟動 (冷啟動 ~2-3s)：
  文字規則 → AST 解析 → 編譯成 Int32Array → 存入 IndexedDB (Selfie)

後續啟動 (熱啟動 ~毫秒)：
  IndexedDB → 反序列化 filterData + filterRefs → 跳過編譯 → 即刻啟用
```

**核心元件**：
- `filterData` (`Int32Array`)：規則編譯成連續 32-bit 整數，cache-friendly
- `filterRefs` (`Array`)：正則表達式等物件參考
- 規則清單未更新 → 直接還原快照；有更新 → 重新編譯 + 存新快照

### 2.2 快速檢索：Token Bucket 雜湊跳轉

```
每個網路請求：

1. URL → 提取 7 字元 Token
   https://ads.example.com/banner.js → token = "example"

2. Token → Hash → 跳轉到 Filter Bucket
   tokenHash("example") → bucket[0x3A7F] (僅含 5-20 條規則)

3. 只在 bucket 內逐條比對 → block/allow

效果：每次僅檢查 5-20 條，非全量 30 萬條
```

### 2.3 高效資料結構

| 資料結構 | 用途 | 複雜度 |
|---------|------|--------|
| **BidiTrieContainer** | URL 路徑雙向匹配 | O(pattern 長度) |
| **HNTrieContainer** | hostname 匹配 | O(hostname 長度) |
| **Int32Array** | 規則二進位儲存 | O(1) 直接索引 |
| **Token Bucket** | 規則分桶檢索 | O(1) hash + O(k) 桶內比對 |

### 2.4 DOM 過濾：事件驅動模型

```javascript
// uBO 做法：只在 DOM 變化時觸發
const observer = new MutationObserver((mutations) => {
  const nodes = mutations.flatMap(m => [...m.addedNodes]);
  if (nodes.length) processNodes(nodes); // 批次處理
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// 頁面不可見時自動暫停
document.addEventListener('visibilitychange', () => {
  document.hidden ? observer.disconnect() : observer.observe(...);
});
```

---

## 三、發現的問題與開發建議

### 🔴 P0 — 嚴重問題（影響核心功能與效能）

#### 3.1 過度 Polling — 改為事件驅動

**問題**：13+ 個獨立 `setInterval` 持續掃描，靜態頁面仍每 500ms 執行

**涉及檔案**：
| 檔案 | 計時器數 | 最短間隔 |
|------|---------|---------|
| `inject-blocker.js` | 6 | 500ms |
| `anti-antiblock.js` | 3 | 500ms |
| `ai-runtime.js` | 2 | 1200ms |
| `overlay-remover.js` | 1 | 3000ms |
| `cosmetic-filter.js` | 1 | 500ms |
| **合計** | **13+** | **~15-20 次掃描/秒** |

**建議改法**：

```javascript
// ✅ 推薦：統一調度器 + MutationObserver
class ScanScheduler {
  constructor() {
    this.observer = new MutationObserver(this.onMutation.bind(this));
    this.handlers = [];        // 註冊的掃描函式
    this.pending = false;
    this.started = false;
  }

  register(handler) {
    this.handlers.push(handler);
  }

  start() {
    if (this.started) return;
    this.observer.observe(document.documentElement, {
      childList: true, subtree: true
    });
    document.addEventListener('visibilitychange', () => {
      document.hidden ? this.pause() : this.resume();
    });
    this.started = true;
  }

  onMutation(mutations) {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      const addedNodes = [];
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) addedNodes.push(node);
        }
      }
      if (addedNodes.length > 0) {
        for (const handler of this.handlers) {
          handler(addedNodes);
        }
      }
      this.pending = false;
    });
  }

  pause()  { this.observer.disconnect(); }
  resume() { this.observer.observe(document.documentElement, {
    childList: true, subtree: true
  }); }
}

// 使用方式
const scheduler = new ScanScheduler();
scheduler.register(removeOverlays);
scheduler.register(protectVideos);
scheduler.register(applyCosmeticRules);
scheduler.start();
```

**預期效果**：
- CPU 負載降低 70-80%（靜態頁面近乎零消耗）
- 電池裝置續航明顯改善
- 反應更即時（DOM 變化時立刻觸發，而非等待下一個 interval）

---

#### 3.2 域名模糊比對 — 改為精確匹配

**問題**：`MALICIOUS_DOMAINS` 使用 `String.includes()` 比對，通用詞彙如 `'casino'`、`'betting'` 會誤殺合法網站

**涉及檔案**：`extension/content/inject-blocker.js`

**現況**：
```javascript
// ❌ 問題：模糊比對 + O(n) 線性掃描
const MALICIOUS_DOMAINS = ['exoclick', 'casino', 'betting', ...];
function isBlockedUrl(url) {
  const urlStr = String(url).toLowerCase();
  return MALICIOUS_DOMAINS.some(d => urlStr.includes(d));
}
```

**建議改法**：
```javascript
// ✅ 推薦：精確域名匹配 + O(1) Set 查找
const BLOCKED_DOMAINS = new Set([
  'exoclick.com', 'trafficjunky.com', 'juicyads.com',
  'popads.net', 'magsrv.com', 'propellerads.com',
  'popcash.net', 'adcash.com', 'hilltopads.com', 'clickadu.com'
]);

function isBlockedUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    // 檢查完整域名及其父域名
    const parts = hostname.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      if (BLOCKED_DOMAINS.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  } catch {
    return false;
  }
}
```

**預期效果**：
- 消除誤殺風險（`casino-analytics.com` 不再被攔截）
- 查找效率從 O(n) 提升至 O(1)
- 域名清單可外部化維護

---

#### 3.3 README 補充 uBOL 依賴聲明

**問題**：專案僅 100 條 DNR 規則（覆蓋率 0.03%），但未明確告知使用者需搭配 uBOL

**建議**：在 `README.md` 顯眼位置加入：

```markdown
> ⚠️ **重要提示**：本擴充功能專注於播放器保護，**不提供通用廣告攔截**。
> 請搭配 [uBlock Origin Lite](https://chrome.google.com/webstore/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) 使用以獲得完整防護。
```

---

### 🟡 P1 — 中等問題（影響品質與可維護性）

#### 3.4 cosmetic-filter.js 加入動態 DOM 追蹤

**問題**：CSS 規則僅載入時注入一次，無法處理 AJAX 動態插入的廣告

**建議改法**：
```javascript
// 在 cosmetic-filter.js 加入 MutationObserver
function initDynamicTracking(selectors) {
  const selectorSet = selectors.join(', ');
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        // 新增的節點本身匹配
        if (node.matches?.(selectorSet)) {
          node.style.setProperty('display', 'none', 'important');
        }
        // 新增節點的子孫匹配
        const children = node.querySelectorAll?.(selectorSet);
        children?.forEach(el => el.style.setProperty('display', 'none', 'important'));
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return observer;
}
```

---

#### 3.5 background.js 模組拆分

**問題**：5014 行單一檔案混合所有職責，違反 SRP

**建議結構**：
```
extension/
├── background.js                    # 入口 (< 300 行) — 初始化 + message routing
├── core/
│   ├── whitelist-manager.js         # 白名單 CRUD
│   ├── stats-collector.js           # 統計資料收集
│   ├── dnr-manager.js               # declarativeNetRequest 規則管理
│   └── script-registrar.js          # 動態腳本註冊
├── ai/
│   ├── risk-engine.js               # 風險評分 + 指數衰減
│   ├── policy-compiler.js           # Policy Gate (T0-T3)
│   ├── provider-gateway.js          # OpenAI/Gemini/LM Studio 介面
│   ├── knowledge-store.js           # 自學習知識庫
│   └── telemetry-aggregator.js      # Telemetry 批次收集
```

**注意**：MV3 Service Worker 支援 `importScripts()` 或 ES modules（manifest 中設 `"type": "module"`），可直接拆分。

---

#### 3.6 AI 超時記憶體洩漏修復

**問題**：`Promise.race()` 超時後未清理 AbortController

**建議改法**：
```javascript
// ✅ 推薦：統一超時管理
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI request timeout (${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);  // 確保清理
  }
}
```

---

#### 3.7 Telemetry 隱私策略

**問題**：收集 hostname + 瀏覽行為但未說明資料流向

**建議**：
1. 在 `README.md` 加入 Privacy 段落：說明收集範圍、是否傳至外部、用途
2. AI 功能提供「關閉 telemetry」選項
3. 本地模式 (LM Studio) 預設啟用，雲端模式需使用者明確 opt-in

---

### 🟢 P2 — 優化建議（提升競爭力）

#### 3.8 擴充播放器相關規則

**目標**：從 EasyList / AdGuard 過濾清單提取播放器相關規則至 5,000-10,000 條

**篩選策略**：
```
包含以下關鍵字的規則：
  - player, video, media, stream, embed
  - overlay, preroll, midroll, postroll
  - exoclick, trafficjunky, juicyads（現有清單域名）
  - popunder, popads
```

---

#### 3.9 借鏡 uBO Selfie 概念快取 AI 策略

**思路**：AI Policy 回應成本高（8-20 秒），應將有效 policy 快取並快速恢復

```javascript
// AI Policy Selfie
class PolicyCache {
  async save(hostname, policy) {
    await chrome.storage.local.set({
      [`policy_${hostname}`]: {
        policy,
        savedAt: Date.now(),
        ttlMs: policy.ttlMs || 600000
      }
    });
  }

  async restore(hostname) {
    const data = await chrome.storage.local.get(`policy_${hostname}`);
    const entry = data[`policy_${hostname}`];
    if (!entry) return null;
    if (Date.now() - entry.savedAt > entry.ttlMs) return null; // 過期
    return entry.policy;
  }
}
```

---

#### 3.10 效能基準測試

**建議建立**：
```bash
# 新增 npm script
npm run bench:cpu        # 量測各 content script 的 CPU 使用率
npm run bench:memory     # 量測記憶體佔用
npm run bench:startup    # 量測擴充功能啟動時間
```

---

## 四、Falcon 獨有優勢（應持續強化）

以下是 uBO/AdGuard **完全不具備**的能力，是 Falcon 的護城河：

| 優勢 | 說明 | 強化方向 |
|------|------|---------|
| **AI 自適應層** | 零日廣告防護，即時學習新模式 | 加速本地推理 (LM Studio/Gemini Nano) |
| **Policy Gate T0-T3** | 安全護欄，防止 AI 過度干預 | 增加 T2 可逆動作種類 |
| **原生 MV3 設計** | 無需重構，長期發展最佳 | 率先支援 Chrome 新 API |
| **播放器專注** | 差異化定位，與 uBO 互補 | 擴大支援站點數量 (目前 8 → 目標 50+) |
| **用戶教學模式** | Element Picker + 規則學習 | 加入社群規則共享機制 |

---

## 五、優先級路線圖

```
P0 立即修復（影響核心功能）
├── 3.1 setInterval → MutationObserver + 統一調度器
├── 3.2 MALICIOUS_DOMAINS → Set + 精確域名匹配
└── 3.3 README 加入 uBOL 搭配使用聲明

P1 短期優化（1-2 週）
├── 3.4 cosmetic-filter.js 動態 DOM 追蹤
├── 3.5 background.js 模組拆分
├── 3.6 AI 超時 AbortController 清理
└── 3.7 Privacy Policy 補充

P2 中期規劃（1-2 月）
├── 3.8 擴充播放器規則至 5,000-10,000 條
├── 3.9 AI Policy 快取機制 (Selfie 概念)
└── 3.10 建立效能基準測試
```

---

## 六、結論

Falcon-Player-Enhance 的**定位策略正確**（播放器專家 + AI 自適應），但底層實作有三個與頂級廣告攔截程式的明顯差距：

1. **效能模型**：polling vs 事件驅動 → 改用 MutationObserver
2. **比對精度**：模糊字串 vs 精確域名 → 改用 Set + URL 解析
3. **模組化程度**：單檔巨石 vs 職責拆分 → 拆分 background.js

修復這三項後，Falcon 可在其專注領域達到與 uBO 互補的品質水準，AI 自適應層則是長期差異化的關鍵競爭力。
