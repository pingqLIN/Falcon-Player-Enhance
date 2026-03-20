# AI 整合版實作說明

這份文件說明目前主線版本已整合的 AI 學習能力、對應檔案位置、已保留的安全邊界，以及後續交給 Opus 審查時最值得聚焦的項目。

## 1. 這一版已經整合了什麼

目前主線版已落地的能力：

- 靜態 `AD LIST` 種子資料
- 持久化 `aiKnowledgeStore`
- `Teach mode` 教學模式
- 匯出 / 重置 AI 資料時包含知識庫
- popup 中可直接看到知識庫學習摘要

這一版的定位是：

- 已從「只有風險顧問」往「可持續累積樣本與知識」前進
- 但仍保留現有 `Policy Gate` 安全邊界
- 尚未進入「完全自動 durable mutation」或「無條件自主封鎖」

## 2. 關鍵檔案

- `extension/rules/ad-list.json`
- `extension/background.js`
- `extension/content/element-picker.js`
- `extension/popup/popup.html`
- `extension/popup/popup.js`
- `extension/manifest.json`

## 3. 已落地的整合內容

### 3.1 靜態 AD LIST

`extension/rules/ad-list.json` 現在作為：

- 安全底線
- 本地 heuristic seed
- AI 教學 / 分類時的既有知識種子

目前資料類型包含：

- `domain`
- `token`
- `selector`

每筆資料都帶有基本屬性，例如：

- `kind`
- `value`
- `category`
- `confidence`
- `source`
- `action`

### 3.2 持久化知識庫

`background.js` 內已新增 `aiKnowledgeStore` 流程，包含：

- normalize
- seed
- candidate upsert
- teach session 記錄
- stats 重算

目前知識庫中主要結構包含：

- `seeds`
- `observations`
- `candidates`
- `confirmed`
- `teachSessions`
- `stats`

### 3.3 Teach Mode

使用者現在可以從 popup 進入 `Teach mode`。

流程如下：

1. 在 popup 按下 `🎓 Teach AI`
2. content script 進入 teach mode
3. 使用者點選頁面元素
4. extension 擷取元素特徵
5. background 依現有 provider 或本地 heuristic 做分類
6. 使用者決定最終標記
7. 結果寫入 `aiKnowledgeStore`

這個流程目前是「教學樣本收集」，不是立即封鎖流程。

### 3.4 popup 摘要

AI Monitor 現在除了原本的：

- risk score
- high-risk sites
- telemetry events
- provider / model
- policy gate

也會額外顯示知識庫摘要：

- `Seeds`
- `Learned`
- `Teach`

## 4. 這一版刻意沒有做的事

這些是目前保留的邊界，不是遺漏：

- 不做自動 durable mutation
- 不把 teach mode 樣本直接變成永久封鎖規則
- 不讓 AI 無條件主動觀察所有頁面並立即下規則
- 不把 `AUTONOMOUS` 模式直接推到可執行主線

原因是目前仍要保留：

- 可逆性
- 誤判可控性
- provider 輸出不穩定時的安全邊界
- regression 驗證空間

## 5. 與既有文件的關係

這份文件可搭配以下文件一起閱讀：

- [AI Policy Gate 參數說明](./AI_POLICY_GATE_PARAMETERS.zh-TW.md)
- [AI 能力邊界說明](./AI_CAPABILITY_BOUNDARY.zh-TW.md)
- [封鎖元素功能說明](./BLOCKED_ELEMENTS_FEATURE.zh-TW.md)
- [AI 自主學習補充設計](./AI_AUTONOMOUS_AD_LEARNING_SUPPLEMENT.zh-TW.md)
- [Dashboard 重建計畫](./DASHBOARD_REFACTOR_PLAN.md)

## 6. 交給 Opus 時建議優先審查的點

建議 Opus 先看這 5 類：

1. `aiKnowledgeStore` 的 schema 是否足夠穩定
2. `Teach mode` 和 `Block mode` 的邊界是否清楚
3. `AD LIST` 作為 seed 的長期策略是否合理
4. popup 摘要是否足夠支撐使用者理解 AI 學習狀態
5. 是否應維持目前 `Policy Gate` 邊界，或在特定條件下開放更高自主度

## 7. 目前最合理的下一步

建議下一輪依序做：

1. 讓 `Teach mode` 樣本有更清楚的 review / promotion 流程
2. 為 `aiKnowledgeStore` 建立 smoke / regression 驗證
3. 再評估是否要做更高自主度的候選規則套用
