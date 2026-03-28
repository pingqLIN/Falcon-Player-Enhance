# Falcon-Player-Enhance 開發執行書

> 日期：2026-03-28  
> 分支：`chore/commit-cleanup-20260327`  
> 模式：YOLO / 子代理驅動審查與主線整合  
> 目的：將目前專案的未完成項目、可加強區塊、立即修正項與後續執行順序整理為單一執行文件。

---

## 一、這輪做了什麼

本輪不是單點修 bug，而是一次通盤審查與收斂：

- 以多個子代理平行掃描主程序 runtime、popup/player、Dashboard/AI/secret handling、測試/文件/CI
- 由主控代理整合 findings，挑選低風險高價值項目先落地
- 將結果回寫到 repo 內的 validator、規則資料、進度快照與 backlog

這輪子代理重點審查範圍：

- 主程序與 rule-driven 重構殘留熱點
- popup-player / direct-popup 的功能與驗證缺口
- Dashboard / provider key / AI export 的安全與資料邊界
- 文件、tests、CI 與長期維護風險

---

## 二、這輪已先落地的修正

### 2.1 `dnrAllowRules` 一致性驗證加強

已完成：

- `scripts/validate-site-behaviors.js` 不再只檢查單向存在性
- 現在會同時檢查：
  - `site-behaviors.json > dnrAllowRules`
  - `filter-rules.json` 的 `allow urlFilter`
  - `filter-rules.json` 的 `allow initiatorDomains`
- 已補齊目前資料落差，將 `javboys.online` 加回對應 `initiatorDomains`

這代表目前 `dnrAllowRules` 不再只是「看起來有資料」，而是開始被當成真正的規則一致性契約。

### 2.2 popup quick-add 死路徑先關閉

已完成：

- popup 中的「將目前站點提升為 enhanced protection」quick-add UI 先行隱藏
- 原因是 popup 端已有 `getCustomSites` / `addCustomSite` 呼叫，但 `background.js` 尚未提供對應 handler

這個修正的目標不是砍功能，而是先避免使用者碰到假功能或無回應按鈕。

### 2.3 backlog 與進度文件同步

已更新：

- `TODOS.md`
- `docs/PROGRESS_SNAPSHOT.zh-TW.md`

新增內容包含：

- popup 視窗本體驗證缺口
- provider secret lifecycle 與 sender trust 邊界
- BoyfriendTV detector rule extraction
- quick-add 重新啟用前提

---

## 三、這輪確認出的高優先問題

以下問題已由子代理與主控交叉確認，應視為目前最值得優先處理的主線。

### P1. popup 驗證仍偏向「來源頁」而非「popup 視窗本體」

目前已有：

- fixture-based popup verification
- reviewed live smoke target pool

但仍缺：

- `popup-player.html` 本體的 iframe-mode shield 啟動驗證
- shortcut dispatch 驗證
- direct-popup overlay click-through 驗證
- popup 狀態還原（header/theme/auto-fit）驗證

影響：

- 來源頁通過，不代表 popup 視窗本體沒有回歸
- 使用者最直接接觸的互動層仍可能靜默退化

### P1. provider secret lifecycle 仍未完成安全收斂

目前已有：

- provider 分離儲存
- draft 保留
- autosave 分流

但仍缺：

- 明確的 key 清除路徑
- `getAiInsights` / `exportAiDataset` / `getAiRuleCandidates` 等資料出口的 sender gating 對齊
- 更清楚的 retention/clearance 文件說明
- Windows-native secret store（DPAPI / native host）

影響：

- 功能上可用，但安全模型仍是過渡態

### P1. `anti-antiblock.js` 仍是半資料化、半站族策略

目前已有：

- profile-driven strategy dispatch
- `antiAntiBlock` config consumption
- controlled boundary

但仍缺：

- 移除 legacy hostname fallback
- 讓策略執行完全由 `antiAntiBlockProfile` 決定
- 將更多 selector / iframe / suppression 行為移出裸寫死判斷

影響：

- 通用化方向正確，但現在仍保有明顯站族耦合

### P2. `player-detector.js` 的 BoyfriendTV 解析仍嵌在 generic detector 內

已確認熱點：

- hostname checks
- inline script scraping hints
- container ID / ad-signature 判斷

影響：

- 未來新增或調整類似站點時，仍需改 code 而非改規則

### P2. `cosmetic-filter.js` 與 `player-enhancer.js` 尚未真正消費 `site-behaviors.json` 的 selector slots

目前 `site-behaviors.json` 已有：

- `selectors.cosmeticHide`
- `selectors.overlayIgnore`
- `selectors.playerHints`

但目前主要消費者仍偏向：

- `cosmetic-filter.js` 內建 hostname → selectors map
- `player-enhancer.js` 內建 DOM heuristic sweep

影響：

- 規則層已存在，但 selector 知識還沒有真正集中

---

## 四、建議執行順序

### Phase 1：驗證與死路徑補齊

1. 為 `popup-player.html` 補一個 popup 視窗本體測試
2. 為 `direct-popup-overlay.js` 補 click-through interaction test
3. 為 `player-enhancer.js` 補 payload selection / fallback route tests
4. 讓 quick-add 保持隱藏，直到 background handler 正式存在

### Phase 2：rule-driven 主線繼續收斂

1. 將 `anti-antiblock` 改為 explicit profile-only strategy execution
2. 將 BoyfriendTV detector literals 抽成規則物件或 profile-backed metadata
3. 為 `site-profile.js` 增加 selector accessors
4. 讓 `cosmetic-filter.js` / `player-enhancer.js` 先讀規則層，再做 heuristic fallback

### Phase 3：安全硬化

1. provider key 清除流程
2. AI export / insight sender gating
3. retention / clearance 文件對齊
4. Windows-native secret storage

---

## 五、這輪後的判斷

目前專案狀態比前一輪更成熟，但仍是「可審查、可持續推進」而非「整體收尾完成」。

這輪之後比較準確的說法是：

- 規則化重構已開始進入真正的約束階段，不再只是文件藍圖
- popup-player 驗證已經有 fixture 與 live smoke 基礎，但離完整功能驗證還差 popup 視窗本體覆蓋
- Dashboard / provider key UX 已到位，但安全硬化仍需後續工程
- 子代理審查已幫忙把接下來最值得投資的問題順序拉清楚

---

## 六、建議下一輪直接做的 3 件事

1. 補 popup 視窗本體測試
2. 將 `anti-antiblock` 改成 explicit profile-only strategy
3. 為 provider key 補清除與 sender gating

這三件事完成後，主線的「功能可信度」與「架構可信度」都會再往前推一大步。
