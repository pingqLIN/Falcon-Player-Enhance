# Falcon-Player-Enhance — Opus 決策 Briefing

> **更新日期：** 2026-03-20（第三次更新：加入 Round 2 後續修復狀態）  
> **文件定位：** 這不是審查報告的複製，而是「目前實作快照 + 尚存核心風險 + 希望 Opus 回答的 4 個決策題」  
> **撰寫依據：** 兩輪直接原始碼審查（Copilot CLI Sonnet 4.6）+ 開發者本輪後續修復記錄  
> **預期 Opus 輸出：** 針對第 5 節的 4 個決策題給出明確建議，附具體修法方向；不需要重新輸出完整審查

## 1. 目前已完成的主要進度

### 1.1 AI provider 架構

extension 目前已支援以下 provider:

- `openai`
- `gemini`
- `lmstudio`
- `gateway`

目前預設第一選擇為:

- provider: `openai`
- model: `gpt-5.4-mini`
- endpoint: `https://api.openai.com/v1/responses`

相關主要檔案:

- `extension/background.js`
- `extension/dashboard/dashboard.js`
- `extension/dashboard/dashboard.html`

### 1.2 OpenAI direct 模式

目前已改成使用者安裝 extension 後，可直接在 dashboard:

- 選擇 `OpenAI direct`
- 填入自己的 API key
- 指定 model 與 endpoint

不再要求一定要先自架 gateway。

### 1.3 AI output 優化

針對 `gpt-5.4-mini`，目前已做:

- prompt 強化，要求 `recommendedActions` 儘量輸出固定 enum token
- runtime normalization，將模型偏自然語言的輸出收斂為固定 token

目前 action token 主要為:

- `tighten_popup_guard`
- `tune_overlay_scan`
- `guard_external_navigation`
- `apply_extra_blocked_domains`

### 1.4 AI 測試基礎設施

目前已具備:

- OpenAI live eval
- Gemini live eval
- LM Studio live eval
- provider comparison / ranking

主要檔案:

- `tests/ai-eval/run-openai-direct-evaluation.js`
- `tests/ai-eval/run-gemini-direct-evaluation.js`
- `tests/ai-eval/run-lmstudio-evaluation.js`
- `tests/ai-eval/compare-provider-reports.js`

### 1.5 live-browser regression target 種子資料

外部 AI 篩出的 5 個單頁樣本已整理成:

- `tests/live-browser/targets.external-ai.single-page.curated.json`

目的:

- 供播放器周邊廣告干擾測試
- 作為第一批可固定追蹤的 regression targets

## 2. 本輪已明確修復的問題

### 2.1 來自前兩輪審查、目前已處理的項目

- `manifest.json` 移除多餘 `declarativeNetRequestFeedback`
- `inject-blocker.js` 不再透過 `web_accessible_resources` 暴露
- popup 次要文字對比從 `#999` 提升到 `#767676`
- popup base font 從 `12px` 提升到 `13px`
- 建立 `DESIGN.md`
- `POLICY-GATE.md` 絕對路徑改為相對路徑
- Stats Grid 空狀態已補
- header icon-only 按鈕已補 `aria-label`
- shortcut popover 已改成 click / focus / keyboard 可達
- whitelist toggle label 已能動態更新
- AI Gate evidence 文案已較柔和
- popup tagline 已補

### 2.2 Round 2 高優先 findings 已進一步處理

#### F1 — SITE_REGISTRY 成人網域硬編碼

先前問題:

- `background.js` 直接硬編碼整份站點清單

目前狀態:

- 已改為從 `extension/rules/site-registry.json` runtime 載入
- `background.js` 不再直接攜帶那份清單

目前仍開放的延伸問題:

- repo 內仍然存在該 JSON 檔，因此如果目標是未來 CWS build，是否還應繼續拆成 build-time exclusion 或 user-import 模式，尚未定案

#### F2 — API key 暴露面

先前問題:

- `getAiProviderSettings` 會把完整 key 傳回 UI
- handler 沒有限 sender

目前狀態:

- background 已加入 sender 驗證，只允許 extension 自己的頁面呼叫
- `getAiProviderSettings` / `setAiProviderSettings` / `getAiInsights` 只回傳遮罩後設定
- dashboard 不再把儲存中的 key 值回填進 input
- dashboard 只顯示 `hasApiKey` 類型的狀態資訊

目前仍開放的延伸問題:

- `chrome.storage.local` 仍是 provider secret 的儲存位置
- 因為現有 content scripts 廣泛依賴同一個 storage area，目前尚未直接切到 `setAccessLevel(TRUSTED_CONTEXTS)`，避免打壞現有流程

#### F3 — fuzzy matching 過寬

先前問題:

- `normalizeRecommendedActionTokens()` 對 `redirect` / `overlay scan` 等詞的模糊比對過寬

目前狀態:

- 已改成精確 enum token 優先
- fuzzy fallback 只接受更窄的短語，如 `guard external navigation`、`increase overlay scan`
- `tests/ai-eval/run-openai-direct-evaluation.js` 也同步收緊，避免 runtime 與 eval 行為分岔

#### F4 — Shield Pro 品牌殘留

先前問題:

- extension 內仍有 9 處 `Shield Pro`
- `extension/rules/noop.js` 還會在 MAIN world `console.log`

目前狀態:

- 9 處已統一成 `Falcon-Player-Enhance`
- `noop.js` 對外可見 log 已移除

#### F5 — AI Monitor 對使用者呈現方式

先前問題:

- popup 中對外顯示 `(In development)`
- AI Monitor 對一般使用者的初始呈現不夠乾淨

目前狀態:

- popup 中的 `(In development)` 已移除
- AI Monitor 初始 HTML 狀態改為 hidden
- dashboard 已有「Show AI monitor in popup」設定

## 3. 已做過的驗證

已通過:

- `node --check extension/background.js`
- `node --check extension/dashboard/dashboard.js`
- `node --check extension/popup/popup.js`
- `node --check tests/ai-eval/run-openai-direct-evaluation.js`
- `npm run test:ai`
- `npm run test:e2e-replay`

另外:

- `extension/rules/site-registry.json` 已確認可正常 JSON parse

## 4. 目前仍然存在的主要問題

### 4.1 Provider secret 的最終儲存策略仍未完全解決

目前雖然已把 key 的「回傳與 UI 顯示」風險降下來，但根本問題仍是:

- provider secret 仍在 `chrome.storage.local`
- content scripts 也使用同一個 storage area

尚未決定是否要:

1. 重構成 provider secret 專用 storage 流程
2. 將敏感值改由 background-only 記憶體 + 重新輸入模型處理
3. 將 content script 需要的通用設定搬移，之後再把 `storage.local` access level 鎖到 trusted contexts

### 4.2 站點清單雖已外部化，但分發策略仍未定案

目前站點清單只是從 JS 移到 JSON，這已經改善維護性，但還沒有完全回答：

- 若未來要有 CWS build，是否仍允許 repo / package 內含這份清單？
- 是否需要區分：
  - sideload build
  - CWS-safe build
  - user-import build

### 4.3 live-browser 目標資料尚未完成第一輪實跑

目前已有 curated target 檔，但還沒有第一份實跑報告。還不知道：

- 哪些 target 真的穩定
- 哪些 target 只是看起來合理，但實際重現性低
- 哪些 target 應保留到 smoke pool

### 4.4 Popup / Dashboard 還可能有落差

雖然前兩輪審查中的許多 UX 問題已修掉，但仍值得再想：

- `DESIGN.md` 規則是否真的被全面落實
- AI Monitor 對一般使用者的訊息密度是否仍偏高
- popup 初次使用的整體導引是否還能更簡化

## 5. 希望 Opus 回答的 4 個決策題

> **請 Opus 不要只重複問題，而是給出明確建議（選 A/B/C 或自行提案）+ 一句理由 + 程式碼層面的具體修法方向**

### 決策題 1 — Secret 儲存與權限邊界

在不大幅打壞現有 content script 對 `chrome.storage.local` 依賴的前提下，對於 provider API key，最合理的下一步架構是什麼？

希望 Opus 回答:

- 哪種方案風險最低
- 哪種方案改動成本最合理
- 是否值得分兩階段做

### 決策題 2 — Site registry 的長期策略

目前已改成 `site-registry.json`，但如果考慮未來分發與維護，下一步最值得做的是：

- 直接 user-import 化
- build 分流
- dashboard 管理化
- 還是先保持現狀即可

希望 Opus 提供具體建議，而不是只說「有風險」。

### 決策題 3 — AI action normalization 的收斂程度

目前已收緊 fuzzy fallback，但仍想請 Opus 評估：

- 這樣的 fallback 是否已足夠安全
- 是否應再往「幾乎只接受 exact token」靠攏
- runtime 是否還應忽略某些模型輸出的自由欄位

### 決策題 4 — live-browser regression pool 的建立方式

目前有 5 個 curated single-page targets。

希望 Opus 評估：

- 是否應先切出 2 到 3 個 smoke targets
- 評估 target 穩定性的標準應是什麼
- 這批 target 的 schema 是否還該補欄位

## 6. 建議 Opus 優先檢查的檔案

1. `extension/background.js`
2. `extension/dashboard/dashboard.js`
3. `extension/popup/popup.html`
4. `tests/ai-eval/run-openai-direct-evaluation.js`
5. `extension/rules/site-registry.json`
6. `tests/live-browser/targets.external-ai.single-page.curated.json`

## 7. 建議 Opus 回覆格式

請 Opus 用以下結構回覆（不需重新輸出整份審查報告）：

```
## 整體判斷
- 目前最危險的 1–3 個問題
- 哪些問題目前可以先接受

## 4 個決策題的明確建議

### 決策題 1 — Secret 儲存
建議：[明確方向，例：分階段做，第一步 X]
理由：[一句話]
具體修法：[程式碼層面，2–3 行說明]

### 決策題 2 — Site registry
建議：[A / B / C 或自行提案]
前提假設：[是否有 CWS 計畫？]
具體修法：[或補充條件]

### 決策題 3 — Action normalization
建議：[更嚴格 / 維持現狀 / 分離層級]
理由：[對模型輸出穩定度的判斷]
具體修法：[收緊哪些 token，移除哪些 fallback]

### 決策題 4 — Regression pool
建議：[先切 smoke 2–3 個 / 等實跑後再切 / 補充 schema 欄位]
評估標準：[穩定性判定方式]
具體修法：[schema 補充建議或 target 篩選邏輯]

## 建議執行順序
下一輪先做哪 3 件事最划算：
1. ...
2. ...
3. ...
```

## 8. 補充說明

目前 repo 仍是 dirty worktree，且有多條工作線並行進行中。這份文件的目的是讓 Opus 在現有基礎上，幫忙判斷「下一輪最值得投入的工程方向」，而不是宣告整個 repository 已進入可發布狀態。

---
**相關審查文件：**
- `docs/AUDIT_ROUND2.zh-TW.md` — Round 2 完整 findings（11 項，含修復前的原始發現）
- `docs/DESIGN_REVIEW.zh-TW.md` — UI/UX 設計 7-Pass 審查
- `docs/PROJECT_REVIEW_REPORT.zh-TW.md` — 策略與架構審查
