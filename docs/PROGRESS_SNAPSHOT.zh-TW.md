# Falcon-Player-Enhance 進度說明儲存

> 2026-03-28 補充：
> 已新增 `docs/DEVELOPMENT_EXECUTION_BOOK_2026-03-28.zh-TW.md`，收斂本輪 YOLO mode + 子代理通盤審查的 findings、已驗證修補與下一階段執行順序。
> 同日再補：`extension/background.js` 已完成 pinned popup startup/onRemoved restore 第一版修補，Phase 2 正式啟動。
> 同日第三次補充：`extension/popup-player/popup-player.js` 已補上 close/unpin race 修正，並修掉 popup state 在 close 路徑被預設值覆蓋的問題。

> 更新日期: 2026-03-20（第二次更新：加入審查報告摘要）
> 用途: 提供給 Opus 做快速檢查與二次審閱
> 範圍: AI provider 串接、AI 評測、live-browser 測試資料、近期 UX / 安全修正、專案審查紀錄

## 1. 目前已完成的核心進度

### 1.1 AI provider 架構已擴充

目前 extension 端已支援以下 AI provider:

- `openai`
- `gemini`
- `lmstudio`
- `gateway`

其中目前的預設與第一選擇是:

- provider: `openai`
- model: `gpt-5.4-mini`
- endpoint: `https://api.openai.com/v1/responses`

相關核心實作已接入:

- `extension/background.js`
- `extension/dashboard/dashboard.js`
- `extension/dashboard/dashboard.html`

### 1.2 OpenAI direct 已可由使用者直接設定

目前設計已改成:

- 使用者安裝 extension 後，可直接在 dashboard 選擇 `OpenAI direct`
- 可自行填入 OpenAI API key
- 可自行調整 endpoint 與 model
- 不再強制需要自架 gateway 才能使用 GPT 模型

這是依照目前產品方向調整成「使用者自行提供 API key 與官方接口」的模式。

### 1.3 `gpt-5.4-mini` 已做輸出優化

先前 `gpt-5.4-mini` 雖然能理解場景，但 `recommendedActions` 常輸出自然語言，無法穩定命中 extension 需要的固定 token。

目前已做兩層修正:

- prompt 明確要求只輸出固定 action token
- 本地 normalization 會將偏自然語言的動作建議收斂為固定枚舉

目前固定 action token 以這幾個為主:

- `tighten_popup_guard`
- `tune_overlay_scan`
- `guard_external_navigation`
- `apply_extra_blocked_domains`

### 1.4 live eval / compare 基礎設施已補齊

已新增或整理以下測試能力:

- OpenAI live evaluation
- Gemini live evaluation
- LM Studio live evaluation
- provider report compare / ranking

主要檔案:

- `tests/ai-eval/run-openai-direct-evaluation.js`
- `tests/ai-eval/run-gemini-direct-evaluation.js`
- `tests/ai-eval/run-lmstudio-evaluation.js`
- `tests/ai-eval/compare-provider-reports.js`
- `tests/ai-eval/README.md`

### 1.5 live-browser 測試目標已加入 curated 單頁樣本

已把外部 AI 篩出的 5 個「單一內容頁 / 單一影片詳情頁」整理為 machine-readable target 檔:

- `tests/live-browser/targets.external-ai.single-page.curated.json`

這批 target 的用途是:

- 測播放器周邊廣告干擾
- 測 overlay / redirect CTA / popup trigger / external navigation lure
- 作為固定 regression 樣本池的第一版種子資料

README 也已同步補充:

- `tests/live-browser/README.md`

## 2. 已完成的驗證

### 2.1 語法與回歸

已跑過並通過:

- `node --check extension/background.js`
- `node --check extension/dashboard/dashboard.js`
- `npm run test:ai`
- `npm run test:e2e-replay`

### 2.2 OpenAI direct 實測

已確認:

- OpenAI 官方 API 可連線
- `gpt-5.4-mini` 可正常回應
- extension 端設計已可直接吃 OpenAI Responses API

### 2.3 `gpt-5.4-mini` 評測結論

經過 prompt + normalization 優化後，目前 `gpt-5.4-mini` 是現階段最適合的第一選擇。

已知結果:

- `gpt-5.4-mini` optimized report: 通過
- `gpt-5.4-nano`: 不理想
- `gpt-5-nano`: 不理想
- `gemini-2.5-flash`: 可理解場景，但 machine-strict 程度不足

## 3. 目前仍存在的缺口

### 3.1 OpenAI direct 的信任邊界仍值得再審

雖然目前產品方向允許使用者自行填 API key，但這仍屬於 extension 直接持有第三方 API credential 的模式。

建議 Opus 重點檢查:

- API key 儲存位置與暴露風險
- background / content script 之間是否有不必要的 credential 傳遞
- provider health check / advisory request 是否有過量日誌或洩漏風險

### 3.2 AI advisory 到 runtime action 的映射仍可更嚴格

目前已經可用，但仍建議再審:

- token normalization 是否過度寬鬆
- candidate selectors 是否可能過量或過 noisy
- 哪些欄位應被 runtime 忽略，不應直接信任模型自然語句

### 3.3 live-browser curated targets 尚未完成第一輪實跑報告

target 檔已建立，但還沒有針對這 5 個樣本跑出第一份固定報告。

這代表目前資料層已準備好，但真實瀏覽器結果還缺:

- 穩定度評分
- 是否有效觸發干擾
- 哪些 target 應保留進 smoke pool

## 4. 建議 Opus 優先檢查的點

建議 Opus 先看這幾塊:

1. `extension/background.js`
   檢查 provider dispatch、OpenAI direct、normalization、policy trust boundary。

2. `extension/dashboard/dashboard.js` 與 `extension/dashboard/dashboard.html`
   檢查使用者設定流程是否合理，是否有遺漏的安全或 UX 問題。

3. `tests/ai-eval/run-openai-direct-evaluation.js`
   檢查目前評測方式是否足夠代表 extension 真實需求。

4. `tests/live-browser/targets.external-ai.single-page.curated.json`
   檢查 target schema、tagging 策略、以及是否適合作為長期 regression 樣本池。

## 5. 建議下一步

最合理的下一步順序如下:

1. 先讓 Opus 審一次 OpenAI direct 的安全邊界與 prompt normalization
2. 實跑 `tests/live-browser/targets.external-ai.single-page.curated.json`
3. 從 5 個 target 裡切一份更穩定的 smoke subset
4. 再把 README / INSTALL 的 AI 使用說明全面同步成最新狀態

## 6. 補充說明

目前 worktree 仍是 dirty 狀態，repo 內也有不少同時進行中的修改。因此這份文件的目的是讓審查者快速掌握「本輪新增與目前最值得檢查的區塊」，而不是宣稱整個 repository 已進入可發布狀態。

---

## 7. 本輪 Copilot 審查紀錄（2026-03-20）

本輪由 GitHub Copilot CLI (Claude Sonnet 4.6) 完成兩份雙語審查報告，存於 `docs/`：

| 檔案 | 語言 | 說明 |
|------|------|------|
| `docs/PROJECT_REVIEW_REPORT.md` | English | 策略/安全/架構/AI 整合審查 |
| `docs/PROJECT_REVIEW_REPORT.zh-TW.md` | 繁體中文 | 同上（中文版） |
| `docs/DESIGN_REVIEW.md` | English | UI/UX 設計 7-Pass 審查 |
| `docs/DESIGN_REVIEW.zh-TW.md` | 繁體中文 | 同上（中文版） |

### 7.1 已在本輪前確認修復的問題

以下問題在審查報告撰寫時，透過直接比對原始碼確認已修復：

| 問題 | 原始狀態 | 目前狀態 |
|------|----------|----------|
| `declarativeNetRequestFeedback` 多餘權限 | 存在於 manifest | ✅ 已移除 |
| `inject-blocker.js` 暴露至 `<all_urls>` | 在 web_accessible_resources | ✅ 已移除 |
| `--text-secondary` 對比度不足（#999） | 對比度 2.85:1 | ✅ 已改為 `#767676`（4.54:1） |
| Base font 12px 不符無障礙建議 | `12px` | ✅ 已改為 `13px` |
| 無 DESIGN.md 設計系統文件 | 只存在於 CSS 註解 | ✅ 已建立 `DESIGN.md` |

> 注意：`DESIGN.md` 中的 Component Rules 已明確寫入 shortcuts popover 需鍵盤可達、toggle 須有 aria-label、popup panel 排列順序（Flow → Control → Stats → Level → AI Monitor）等規範。

### 7.2 仍開放的高優先問題（P0）

**安全 / 隱私（立即處理）：**

- 🔴 `tests/bookmarks_2026_3_13.html` 與 `.bak` — 個人書籤已 commit 至 git
  - 處理方式：`git filter-repo --path tests/bookmarks_2026_3_13.html --invert-paths`（需對 .bak 重複執行）
  - 並將兩個檔案加入 `.gitignore`

- 🔴 `POLICY-GATE.md` 內含開發者本機絕對路徑 `C:\Dev\Projects\...`
  - 改為相對路徑或 Markdown 相對連結

**品牌命名（短期處理）：**

- 🟡 `inject-blocker.js`、`ai-runtime.js`、`POLICY-GATE.md` 等仍使用 `Shield Pro`
  - 目標：全部統一為 `Falcon-Player-Enhance`

**CWS 發布風險（若有 CWS 發布計畫）：**

- 🔴 `background.js` 的 `SITE_REGISTRY.domains` 直接列出成人內容網域名稱
  - 建議：移出原始碼，改為使用者可自行匯入清單

### 7.3 設計層仍開放的決策（P1）

以下為 design review 識別、尚未在程式碼中實作的設計決策：

| 決策 | 若不處理 |
|------|----------|
| Player chip list 空狀態設計 | 無玩家時畫面空白，使用者不知下一步 |
| Stats Grid 初始全零狀態 | 看起來像功能壞掉 |
| Flow Indicator 完成後的狀態機 | 永遠佔位，擠壓 Control Hub |
| AI Monitor panel 預設隱藏 | 所有使用者看到「開發中」標籤，影響信任 |
| 側欄導覽 "Enhanced sites" 標籤說明不清 | 新使用者不懂差異 |
| 部分 emoji 按鈕缺 `aria-label` | 視障使用者、觸控裝置無法存取 |
| 仍有硬碼中文字串（如 `白名單保護模式`） | i18n 未完整 |

### 7.4 建議 Opus 在本輪重點審查的新增項目

除原本 section 4 的範圍外，本輪新增建議審查：

1. **`DESIGN.md`** — 確認 Component Rules 是否已真正反映在 popup.html / popup.css / dashboard 中
2. **`manifest.json`** — 確認 `host_permissions: <all_urls>` 的必要性，是否可縮限
3. **AI Monitor panel 的預設可見性** — `dashboard.html` 是否有對應的 show/hide 設定
4. **Shortcut popover 互動** — 確認是否已改為 click/focus 可觸發（DESIGN.md 已規範，但實作未驗證）
