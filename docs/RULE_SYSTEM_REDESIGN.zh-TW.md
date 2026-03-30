# Falcon 規則體系重設藍圖

## 目的

這份藍圖針對目前專案中的廣告阻擋與播放器保護機制，重新定義：

- 哪些規則應該被視為正式底座
- 哪些行為只能存在於 runtime
- 哪些 AI 與使用者輸入只能先進 review queue
- 各模組應該如何切分，避免規則重疊與漂移

對應圖面請見 [rule-system-blueprint.html](./rule-system-blueprint.html)。

## 問題重述

目前系統可用，但規則真相來源分散：

- `rules/filter-rules.json` 承擔靜態 DNR
- `background.js` 持有另一份動態 redirect trap 清單
- `inject-blocker.js` 再持有一份 MAIN world domain/block token 規則
- `cosmetic-filter.js`、`overlay-remover.js`、`anti-popup.js` 各自維護 DOM/CSS 側的 heuristic
- `ad-list.json` 同時帶有 domain、selector、token 語意，但目前主要餵給 AI knowledge seeds
- `hiddenElements` 與 AI candidates 又是另一條獨立儲存鏈

結果是：

- 同一種風險可能被 2 到 4 個模組重複處理
- 很難回答「哪裡才是正式規則」
- 每次 patch 都可能加劇 drift
- AI 與使用者自訂規則的安全邊界不夠直觀

## 思想實驗

### 實驗 1：保留現況多來源模型

效益：

- 補丁很快
- 單一模組可自行演化
- 不需要先做 schema 重整

缺點：

- 規則真相來源持續分裂
- 難以建立可驗證的優先順序
- 誤判回溯成本高

結論：

`適合短期救火，不適合當長期架構。`

### 實驗 2：把 `ad-list.json` 直接升格為統一 blocklist

效益：

- 所有規則看起來有單一入口
- AI seed 與正式規則資料結構接近

缺點：

- `domain / selector / token / pattern` 混型資料不適合直接驅動同一條 blocking pipeline
- request blocking、DOM hiding、navigation guard 的誤判風險模型完全不同
- 容易把 AI seed 當成正式 runtime truth

結論：

`可作為 canonical vocabulary，不適合作為唯一執行規則集。`

### 實驗 3：允許 AI 自動 durable mutation

效益：

- 學習速度最快
- 新站點可快速收斂規則

缺點：

- false positive 擴散速度也最快
- 一旦 selector 污染，會直接傷到真播放器與合法導航
- rollback、審核與可觀測性需求急遽上升

結論：

`在目前 repo 能力邊界下不值得啟用。`

### 實驗 4：把 enhanced chain 全域下放到所有站

效益：

- 陌生站首訪保護更早
- 規則鏈路更一致

缺點：

- `document_start` MAIN world 攔截成本高
- 誤攔截與相容性風險會明顯上升
- 偏離「播放器保護專家」定位

結論：

`應改成風險觸發升級，而不是全域最強注入。`

## 最佳方案：四層規則體系

### 1. Baseline Rules

用途：

- 存放高信心、低誤判、可長期維護的正式底座
- 規則必須能追溯來源與用途

內容：

- DNR request/domain rules
- 高信心 selector hide 規則
- 高信心站點 profile

特性：

- 可版本化
- 可測試
- 可 build 出不同執行格式

### 2. Runtime Guards

用途：

- 處理 document_start/document_idle 的即時風險
- 屬於可逆、防禦性、上下文敏感的行為

內容：

- popup interception
- overlay/popup cleanup
- fake video detection
- player-adjacent navigation guard

特性：

- 不應維護第二份 canonical domain truth
- 只讀 baseline 與 policy overlay

### 3. Policy Overlay

用途：

- 由 blocking level 與 AI advisory 動態覆蓋 runtime guard 參數

內容：

- `popupStrictMode`
- `guardExternalNavigation`
- `overlayScanMs`
- `extraBlockedDomains`

特性：

- 僅限 reversible actions
- 不直接寫入 baseline

### 4. Review Queue

用途：

- 接住使用者自訂與 AI 候選規則
- 把「可學習」與「已正式採用」分開

內容：

- `hiddenElements`
- generated rule candidates
- confirmed review items

特性：

- 需可審核、可拒絕、可回滾
- 預設不是正式 runtime baseline

## Canonical Source 重設

新版建議把規則來源整理成三個正式入口：

### `rules/baseline-rules.*`

作為正式底座，承接目前：

- `filter-rules.json` 的 DNR request 規則
- `inject-blocker.js` 中高信心的 domain/block token
- `cosmetic-filter.js` 中高信心且跨站穩定的 selector

### `rules/site-profiles.*`

由 `site-registry.json` 升級為最小行為 schema，至少描述：

- 站點是否啟用 enhanced chain
- 是否需要相容模式
- 可接受的 popup/iframe/player family
- 需停用或放寬的 guard

### `storage review state`

承接：

- `hiddenElements`
- AI generated candidates
- teach/review 狀態

這一層預設不可直接視為正式底座。

## 模組重整方向

### `inject-blocker.js`

- 保留 MAIN world 必須做的事
- 不再持有第二份長期 ad domain truth
- domain/block token 改為讀 baseline 或 policy overlay

### `overlay-remover.js`

- 與 `anti-popup.js` 收斂為同一條 DOM heuristic 鏈
- 同時保留 age-gate 保護與 player control 白名單

### `cosmetic-filter.js`

- 只負責套用 baseline selectors + reviewed custom selectors
- 不再承擔動態 heuristic 判斷

### `ad-list.json`

- 留作 AI vocabulary / seed baseline
- 不直接冒充 request blocking 規則集

## 遷移順序

### Phase 1

- 定義 baseline schema 與 site profile schema
- 建立 source-of-truth 對照表

### Phase 2

- 合併 `anti-popup` 與 `overlay-remover`
- 抽離共用 age-gate / overlay heuristic

### Phase 3

- 將 `inject-blocker` 的 domain truth 轉為讀取 canonical baseline/policy

### Phase 4

- 讓 `cosmetic-filter` 只消費 baseline + reviewed custom selectors

### Phase 5

- 建立 AI candidates → review queue → accepted baseline 的受控輸送帶

## 驗收標準

- 每一條正式 blocking 規則都能追溯到單一 canonical source
- `hiddenElements` 與 AI candidates 不會被誤當 baseline
- enhanced chain 與全域 basic chain 的升級條件可明確說明
- 年齡驗證、合法 modal、播放器控制列不因規則收斂而被誤刪
- HTML 圖面可獨立展示新版體系、問題與遷移路線

## 最終判斷

綜合效益、風險與思想實驗後，最佳方案不是「新增一套規則」，而是：

`建立單一規則供應鏈，並把 baseline、runtime、AI overlay、review queue 的邊界清楚分層。`

這樣才能同時保住：

- 播放器保護能力
- AI 可逆強化能力
- 使用者自訂規則彈性
- 長期可維護性
