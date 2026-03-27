# Falcon-Player-Enhance 專案審查報告

> 審查日期：2026-03-19  
> 審查版本：v4.4.0  
> 審查範圍：架構設計、程式碼品質、安全性、AI 整合、測試策略、發布可行性

---

## 目錄

1. [專案優勢](#1-專案優勢)
2. [目標與流程評估](#2-目標與流程評估)
3. [技術評估](#3-技術評估)
4. [實作評估](#4-實作評估)
5. [風險與應變分析](#5-風險與應變分析)
6. [總體建議](#6-總體建議)

---

## 1. 專案優勢

### 1.1 產品定位清晰

將專案從「通用廣告攔截 + 播放器增強」聚焦到「播放器保護專家」，並委託 uBlock Origin Lite 處理通用廣告攔截，這是有策略思維的差異化選擇，避免與大型開源專案正面競爭。

### 1.2 AI 安全護欄設計良好

Policy Gate（T0–T3）層級制度設計嚴謹，明確禁止 AI 直接執行 DOM 操作，所有 AI 輸出都必須通過 `Policy Compiler` 驗證。`forceSandbox`、TTL、host fallback 等機制顯示出對安全邊界的認真考量。

### 1.3 架構文件完整

流程圖（ARCHITECTURE.md）、AI 設計（.AI_ENHANCEMENT_ARCHITECTURE.md）、API 合約（.AI_MODEL_GATEWAY_API_CONTRACT.md）、Schema（.AI_POLICY_SCHEMA_V1.json）等均有完整文件，架構思路清晰。

### 1.4 白名單機制設計合理

`shield-*` class prefix 和 `data-shield-internal` 作為內部元素識別標記，搭配 10 層父元素遍歷深度限制，在功能性和效能之間取得了平衡。

### 1.5 Popup Player 降級策略完整

三層 fallback（`chrome.windows.create` → `window.open(extension URL)` → 直接 tab）確保功能在訊息傳遞失敗時仍可運作。

---

## 2. 目標與流程評估

### 2.1 品牌命名不一致 🔴 高優先

| 位置 | 使用名稱 |
|------|----------|
| `README.md`、`manifest.json` | Falcon-Player-Enhance |
| `background.js` 程式碼 | APP_BRAND = `'Falcon-Player-Enhance'` |
| `inject-blocker.js` 註解 | Falcon-Player-Enhance |
| `ai-runtime.js` 標頭 | Falcon-Player-Enhance |
| `.DEVELOPMENT_PLAN.md` | Falcon-Player-Enhance 重構 |
| `POLICY-GATE.md` | Falcon-Player-Enhance |

**問題**：程式碼內部與外部文件品牌不統一，顯示重構尚未完成，容易造成維護混亂。

**建議**：統一採用 `Falcon-Player-Enhance`，全面替換程式碼中的 `Falcon-Player-Enhance` 字串。

### 2.2 重構狀態不明確 🟡 中優先

`.DEVELOPMENT_PLAN.md` 列出 Phase 1–4，但無法判斷目前實際完成度。`player-controls.js` 和 `player-sync.js` 已存在（Phase 4 預計新增），顯示部分 Phase 已完成，但計畫文件未同步更新。

**建議**：在 DEVELOPMENT_PLAN.md 標記每個 Phase 的實際完成狀態，或以新文件取代。

### 2.3 競爭架構提案未決 🟡 中優先

專案同時存在：
- `ARCHITECTURE.md`（現行）
- `ARCHITECTURE-PROPOSAL.md`（三層式）
- `ARCHITECTURE-ALTERNATIVE.md`（Probe-First）

三份文件並列且無明確決策記錄，會造成新加入者困惑，也暗示架構方向仍未定案。

**建議**：選定一個方向並明確標記其他文件為「已評估但未採用」的歷史記錄。

---

## 3. 技術評估

### 3.1 Chrome Web Store 發布風險 🔴 高優先

#### 3.1.1 成人內容網域硬編碼

`background.js` 的 `SITE_REGISTRY.domains` 中明確包含：
```
javboys.com, missav.com, supjav.com, thisav.com, jable.tv, avgle.com,
netflav.com, pornhub.com, xvideos.com, xhamster.com, redtube.com,
youporn.com, spankbang.com, eporner.com...
```

Chrome Web Store 政策禁止擴充功能主要針對成人內容網站提供服務。此清單會造成審查被拒的高風險。

**建議**：將網域清單移出程式碼，改為用戶可自行設定，或透過使用者匯入清單機制提供。

#### 3.1.2 過度廣泛的權限組合

manifest.json 同時請求：
- `declarativeNetRequest` + `declarativeNetRequestWithHostAccess` + `declarativeNetRequestFeedback`
- `<all_urls>` host_permissions
- `scripting` + `tabs` + `sidePanel` + `storage`

`declarativeNetRequestFeedback` 需要額外說明，`<all_urls>` 在 CWS 審查中會觸發人工審核。

**建議**：移除未使用的 `declarativeNetRequestFeedback`，評估是否可改用更窄的 host_permissions。

### 3.2 安全性問題

#### 3.2.1 web_accessible_resources 暴露範圍過大 🔴 高優先

```json
"web_accessible_resources": [
  {
    "resources": ["content/inject-blocker.js", ...],
    "matches": ["<all_urls>"]
  }
]
```

`inject-blocker.js` 可被任意外部網頁透過 `chrome-extension://` URL 偵測，洩漏擴充功能安裝資訊。`noop.js` 和 `sandbox.js` 需要這樣的暴露是合理的，但 `inject-blocker.js` 不應對 `<all_urls>` 可見。

**建議**：將 `web_accessible_resources` 的 `matches` 改為僅允許已知播放器站點的 pattern。

#### 3.2.2 POLICY-GATE.md 洩漏開發機器路徑

```
[background.js](C:\Dev\Projects\Falcon-Player-Enhance\extension\background.js)
```

文件中硬編碼了開發者的本機絕對路徑，不應進入版本控制。

**建議**：改用相對路徑或 Markdown 相對連結。

### 3.3 個人資料洩漏 🔴 高優先

以下檔案已提交到 Git：
- `tests/bookmarks_2026_3_13.html`
- `tests/bookmarks_2026_3_13.html.bak`

這是瀏覽器書籤的匯出，包含個人瀏覽歷史。應立即從版本歷史中移除（`git filter-repo` 或 BFG）。

**建議**：
1. 立即將這兩個檔案加入 `.gitignore`
2. 使用 `git filter-repo --path tests/bookmarks_2026_3_13.html --invert-paths` 從歷史移除
3. `filter-rules.json.backup` 也應移出版本控制

### 3.4 AI 整合技術缺口 🟡 中優先

#### 3.4.1 Model Gateway 尚未實作

`.AI_MODEL_INTEGRATION_NEXT_PHASE_PLAN.md` 規劃了完整的 `Signal Aggregator → Model Gateway → Policy Compiler → Policy Enforcer` 架構，但目前：
- Model Gateway 只有 API Contract 文件，無實作
- LM Studio 整合是本地端選用功能，需使用者自行啟動伺服器
- `ai_model` source 在 schema 中定義但無對應的雲端呼叫路徑

**建議**：在架構文件中明確標記哪些是「已實作」、哪些是「規劃中」，避免誤導貢獻者。

#### 3.4.2 telemetry 資料治理不足

`exportAiDataset` 功能可匯出用戶的瀏覽行為遙測資料。目前文件未說明：
- 資料儲存在哪裡（本機 chrome.storage？）
- 匯出格式是否包含識別性資訊
- 用戶是否知情並可拒絕

**建議**：補充資料最小化實作細節與使用者知情同意機制的文件說明。

---

## 4. 實作評估

### 4.1 效能風險

#### 4.1.1 全域注入成本 🟡 中優先

`ai-runtime.js` 設定 `allFrames: true` 並對所有播放器站點注入，搭配：
- `FLUSH_INTERVAL_MS = 1200`ms 定期刷新 telemetry
- `DOM_HEALTH_INTERVAL_MS = 4000`ms MutationObserver 健康檢查
- 每 4 秒的 DOM 健康掃描在高 churn 頁面（播放器網站廣告頻繁 DOM 操作）可能放大 CPU 負載

**建議**：
- 實作 `.AI_ENHANCEMENT_AUDIT_REPORT.md` 中提到的 Phase A 可觀測性：`page_interaction_latency_p95`、`cpu_overhead_p95` 指標
- 在低活躍頁面（visibility hidden 或 tab 非 focus）時降低掃描頻率

#### 4.1.2 多框架競態風險

審查報告（`.AI_ENHANCEMENT_AUDIT_REPORT.md` §3）已識別：
> 多路 message 與多 frame 同步可能產生競態

`background.js` 中 policy cache 與 tab 生命週期同步點不完整的問題，目前尚未有對應 fix 的實作記錄。

### 4.2 測試覆蓋率不足 🟡 中優先

| 測試類型 | 現況 |
|----------|------|
| 核心模組單元測試 | ❌ 無（player-detector、overlay-remover、anti-antiblock） |
| AI 風險引擎 | ✅ 離線情境模擬（3/3 通過） |
| E2E 回放 | ⚠️ 存在但需真實瀏覽器環境 |
| 自學習迴圈 | ⚠️ 依賴外部 AI 模型（Codex/Claude/OpenCode） |
| 效能基準 | ❌ 無自動化測試 |

`package.json` 中的 `test:ai` 和 `test:e2e-replay` 存在，但沒有可在 CI 中自動執行的基礎單元測試。

**建議**：為以下核心邏輯補充單元測試：
- `overlay-remover.js` 的覆蓋層識別規則
- `player-detector.js` 的播放器偵測邏輯
- `inject-blocker.js` 的 whitelist 判斷邏輯（`isInternalElement`）

### 4.3 無建置系統 🟢 低優先（可接受）

專案直接使用原始 JS 檔案，無 Webpack/Rollup/ESBuild。對 MV3 Extension 來說這是可接受的做法，但隨著 `ai-runtime.js` 等模組增加複雜度，缺乏模組打包會使依賴管理變困難。

**建議**：若日後需要 npm 套件依賴（如 JSON schema validator），考慮引入輕量 bundler。

### 4.4 ESLint/Linting 設定缺失 🟢 低優先

複雜的 MAIN world 腳本（`inject-blocker.js`）沒有靜態分析保護，容易在重構時引入 `use strict` 衝突或全域變數污染。

---

## 5. 風險與應變分析

### 外部環境假設

本審查基於以下假設：
- 目標為個人使用或小範圍分發，非 Chrome Web Store 公開上架
- 開發者對目標網站有定期更新規則的能力
- 用戶願意手動安裝 unpacked extension

---

### 5.1 🔴 關鍵風險：Chrome 政策變更封鎖功能

**描述**：MV3 對 `declarativeNetRequest` 規則上限（目前靜態 30,000 條）持續調整，Manifest V4 的討論也在進行中。

**觸發條件**：Chrome 宣布進一步限制 content script 的 MAIN world 注入，或限制 `<all_urls>` 無需明確用戶同意。

**應變策略**：
- 維持 uBlock Origin Lite 作為規則主力的設計決策，降低對 `declarativeNetRequest` 的直接依賴
- 確保核心播放器功能（popup player、keyboard shortcuts）在無 MAIN world 注入時仍可降級運作
- 監控 Chromium blog 和 extensions-samples 的 breaking change 公告

**影響評估**：高影響，可能需要 2–4 週重構 inject-blocker.js

---

### 5.2 🔴 關鍵風險：個人資料洩漏（書籤檔案）

**描述**：`tests/bookmarks_2026_3_13.html` 已提交 Git，包含完整瀏覽紀錄。若此 repo 設為公開，個人隱私將直接暴露。

**觸發條件**：repo 設為 public，或 repo access 意外開放。

**應變策略（立即執行）**：
1. `git filter-repo --path tests/bookmarks_2026_3_13.html --invert-paths`
2. `git filter-repo --path tests/bookmarks_2026_3_13.html.bak --invert-paths`
3. 將書籤範例改用 `targets.example.json`（已存在）

---

### 5.3 🔴 關鍵風險：Chrome Web Store 審查拒絕

**描述**：成人內容網站清單硬編碼、過廣的 host_permissions，任一項都可能導致 CWS 審查拒絕。

**觸發條件**：嘗試提交至 Chrome Web Store。

**應變策略**：
- **方案 A（推薦）**：改為側載（sideloading）分發，完全避開 CWS 政策限制
- **方案 B**：建立「網域清單由使用者自行設定」機制，程式碼內不含任何成人網站名稱
- **方案 C**：分拆為「通用版（CWS）」和「完整版（side-loaded）」兩個 build

---

### 5.4 🟡 高風險：AI 誤攔截合法導航

**描述**：`guardExternalNavigation` 在 `high/critical` 風險層啟用時，邊界案例可能阻擋用戶期望的合法跳轉（如付費頁面、OAuth 認證）。

**觸發條件**：風險分數因多次廣告觸發升至 `high`，隨後用戶點擊合法付款連結被攔截。

**應變策略**：
- 補齊 `false_positive_signal` 降權機制（審查報告 §4 Phase C 已規劃）
- 在 popup UI 中加入「允許此次導航」的即時覆寫按鈕
- 設定 `guardExternalNavigation` 的最大啟用時間（如 TTL 5 分鐘後自動回退 T1）

---

### 5.5 🟡 高風險：目標網站反制

**描述**：播放器網站持續升級反擴充功能偵測，`anti-antiblock.js` 的偽裝策略可能失效。

**觸發條件**：目標網站偵測到 `shield-*` class 前綴或 `data-shield-internal` attribute，並以此作為封鎖依據。

**應變策略**：
- 考慮使隨機化 `shield-` 前綴（每次安裝時生成 UUID 前綴）
- 自學習迴圈（SELF-LEARNING.md）正是為此設計的快速修補機制，應確保其在 CI 中可定期執行

---

### 5.6 🟡 高風險：LM Studio 本地依賴脆弱

**描述**：AI 輔助功能依賴用戶自行啟動 LM Studio 本地伺服器，安裝步驟繁瑣，且伺服器隨時可能不可用。

**觸發條件**：用戶重開電腦後忘記重啟 LM Studio，或 LM Studio 版本更新破壞 API 相容性。

**應變策略**：
- 本地 AI 僅作為增強層，核心保護功能已設計為在無 AI 時獨立運作（已實作，良好）
- 在 Health Check 失敗時提供明確的降級提示，而非靜默失敗
- 文件中補充「AI 功能為選用增強，關閉不影響基本保護」的使用者說明

---

## 6. 總體建議

### 立即執行（安全性）

| 優先 | 項目 | 說明 |
|------|------|------|
| P0 | 移除書籤檔案 | `git filter-repo` 清除歷史，加入 `.gitignore` |
| P0 | 修正 POLICY-GATE.md 路徑 | 移除開發機器絕對路徑 |
| P1 | 縮小 web_accessible_resources | `inject-blocker.js` 不應對 `<all_urls>` 可見 |
| P1 | 移除 `declarativeNetRequestFeedback` | 若未使用則移除 |

### 短期優化（品質）

| 優先 | 項目 | 說明 |
|------|------|------|
| P1 | 統一品牌名稱 | 全面將 `Falcon-Player-Enhance` 替換為 `Falcon-Player-Enhance` |
| P1 | 確定架構方向 | 選定一份架構文件為主，其他標記為歷史記錄 |
| P2 | 補充核心模組單元測試 | `isInternalElement`、`detectPlayers`、overlay 識別邏輯 |
| P2 | 解決多框架競態 | 參考審查報告 Phase A，加入 policy version 與生效時間戳 |

### 中期規劃（戰略）

| 優先 | 項目 | 說明 |
|------|------|------|
| P2 | 決定發布策略 | 側載分發 vs CWS 雙 build |
| P2 | 網域清單外部化 | 移出 background.js，改為使用者可管理的清單 |
| P3 | 實作 Model Gateway MVP | 填補 AI 架構文件與程式碼的落差 |
| P3 | false_positive 降權閉環 | 補齊 Phase C 的 user_override 全鏈路寫回 |

### 監控重點

- Chrome Extensions 政策更新（每季檢查）
- uBlock Origin Lite 的 API 相容性變更
- 目標網站的反擴充功能策略升級（自學習迴圈報告）
- AI telemetry 的誤攔截率（`false_positive_rate` 基準建立後追蹤）

---

*本報告由 GitHub Copilot CLI（Claude Sonnet 4.6）依據專案原始碼與文件自動生成，結論需由開發者驗證後採用。*
