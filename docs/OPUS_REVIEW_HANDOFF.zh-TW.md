# Opus Review Handoff

這份文件是給 Opus 的審查簡報，目的是讓它直接針對目前已完成的「AI 整合版」做技術與產品邊界審查，而不是重新從頭理解整個專案。

## 1. 本次要審查的版本

目前主線 repo 已完成一個可運作的整合版，重點不是直接照 Opus fork 的 `v5.0.0-ai` 全量落地，而是先把其中較安全、可驗證的部分整合進現有架構。

這一版的定位：

- 有 `AD LIST` 靜態種子
- 有持久化知識庫
- 有 `Teach mode`
- 保留現有 `Policy Gate`
- 不做 fully autonomous durable mutation

換句話說，這是一個「可交審、可繼續演進」的主線整合版，不是一次推到底的 AI autonomous blocking 版本。

## 2. 已完成的整合內容

### 2.1 靜態 AD LIST 種子

新增：

- `extension/rules/ad-list.json`

用途：

- 作為安全底線
- 作為本地 heuristic seed
- 作為 teach mode / AI 分類時的初始知識種子

### 2.2 持久化知識庫

整合進：

- `extension/background.js`

目前已具備：

- `aiKnowledgeStore` normalize
- seed 載入
- observation / candidate / confirmed / teach session 結構
- export / reset 時一併處理知識庫
- popup 可讀取知識庫統計摘要

### 2.3 Teach Mode

整合進：

- `extension/popup/popup.html`
- `extension/popup/popup.js`
- `extension/content/element-picker.js`

目前流程：

1. 使用者在 popup 按 `Teach AI`
2. content script 進入 teach mode
3. 點選頁面元素
4. 擷取元素特徵
5. background 走 provider 或本地 heuristic 做分類
6. 使用者決定最終標記
7. 結果寫入 `aiKnowledgeStore`

注意：

- teach mode 不會立刻封鎖元素
- teach mode 是學習樣本流程，不是直接 blocking flow

### 2.4 popup / dashboard 補強

已完成：

- popup 新增 `Teach AI` 入口
- AI Monitor 額外顯示知識庫摘要
  - `Seeds`
  - `Learned`
  - `Teach`
- dashboard AI 區較明顯的 title / placeholder / status 文案已補雙語化
- popup / dashboard 的 AI 動態文案補了第一輪 i18n 收斂

### 2.5 i18n

已補：

- `extension/_locales/en/messages.json`
- `extension/_locales/zh_TW/messages.json`

這一輪補的範圍主要是：

- teach mode 相關文案
- popup 的知識庫摘要
- dashboard AI 設定區常見狀態文案
- policy gate / evidence 常見 token 的雙語映射

## 3. 本次主要修改檔案

- `extension/manifest.json`
- `extension/rules/ad-list.json`
- `extension/background.js`
- `extension/content/element-picker.js`
- `extension/popup/popup.html`
- `extension/popup/popup.js`
- `extension/dashboard/dashboard.html`
- `extension/dashboard/dashboard.js`
- `extension/_locales/en/messages.json`
- `extension/_locales/zh_TW/messages.json`
- `docs/AI_INTEGRATED_VERSION.zh-TW.md`

## 4. 驗證結果

已通過：

- `node --check extension/background.js`
- `node --check extension/dashboard/dashboard.js`
- `node --check extension/popup/popup.js`
- `node --check extension/content/element-picker.js`
- locale JSON 與 `ad-list.json` 解析正常
- `npm run test:ai`
- `npm run test:e2e-replay`

目前沒有跑的項目：

- 實站 live browser regression for teach mode
- teach mode 樣本 promotion / review 流程的行為測試

## 5. 目前刻意保留的邊界

這些是目前刻意不做，不是遺漏：

- 不讓 AI 自動做 durable mutation
- 不讓 teach mode 樣本直接轉成永久封鎖規則
- 不把 autonomous blocking 直接推進主線
- 不讓 AI 無條件接管所有陌生站的 blocking 決策

原因：

- 目前仍需保留可逆性
- provider 輸出仍有不穩定性
- regression pool 尚未完整建立
- 知識庫 promotion / rollback 還沒有完整 UX 與驗證鏈

## 6. 我希望 Opus 優先審查的點

請不要重做完整報告，優先看這幾個決策問題：

1. `aiKnowledgeStore` schema 是否合理
- seeds / observations / candidates / confirmed / teachSessions 的邊界是否清楚
- stats 是否足夠，還是應再簡化或拆層

2. `Teach mode` 與 `Block mode` 的責任切分是否乾淨
- 現在 teach mode 不直接封鎖，這個決策是否合理
- 是否還需要中間層，例如 review queue / promotion queue

3. `AD LIST` 的長期定位
- 現在是 seed + baseline
- 未來是否應分成 built-in baseline 與 learned knowledge 兩層資料來源

4. popup / dashboard 現在露出的 AI 資訊是否足夠
- `Seeds / Learned / Teach` 這種摘要是否對使用者有價值
- 還是應改成更偏「系統狀態」而不是資料數量

5. `Policy Gate` 邊界是否應維持現狀
- 目前仍不做 autonomous durable mutation
- 這個安全邊界是否應維持到 regression pool 建立之後

## 7. 目前已知殘餘問題

這些不是 blocker，但值得 Opus 一併檢查：

1. teach mode 的分類 badge 仍直接顯示 `ad / suspicious / tracker / benign`
- 流程可用
- 但顯示層可再做更完整的雙語映射

2. dashboard AI 區仍有少量動態英文 token 風險
- 這輪已補明顯缺口
- 但若有未覆蓋的 provider / policy token，仍可能在極端路徑下落回英文

3. knowledge store 的 promotion 還沒有完整 review UX
- 目前可以收樣本
- 但尚未有「從樣本到候選再到正式規則」的完整審核鏈

4. teach mode 缺少 live-site regression
- 現在語法與 replay 測試都過
- 但 teach mode 本身還沒有實站 smoke baseline

## 8. 建議 Opus 回覆格式

請 Opus 用這個格式回覆：

1. 整體判斷
- 這個整合版是否適合作為主線繼續開發
- 目前最危險的 1 到 3 個問題

2. 結構審查
- `aiKnowledgeStore` 是否合理
- `Teach mode` / `Block mode` 切分是否合理
- `AD LIST` 長期策略是否合理

3. UI / UX 審查
- popup / dashboard 的 AI 狀態資訊是否合理
- teach mode 對使用者是否清楚

4. 建議執行順序
- 下一輪最值得優先做的 3 件事
- 每件事的理由與風險

## 9. 可搭配閱讀的文件

建議一起看：

- `docs/AI_INTEGRATED_VERSION.zh-TW.md`
- `docs/AI_AUTONOMOUS_AD_LEARNING_SUPPLEMENT.zh-TW.md`
- `docs/AI_POLICY_GATE_PARAMETERS.zh-TW.md`
- `docs/AI_CAPABILITY_BOUNDARY.zh-TW.md`
- `docs/BLOCKED_ELEMENTS_FEATURE.zh-TW.md`
- `docs/DASHBOARD_REFACTOR_PLAN.md`
