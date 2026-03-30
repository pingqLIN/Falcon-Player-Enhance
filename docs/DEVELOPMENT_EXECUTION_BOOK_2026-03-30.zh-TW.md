# Falcon-Player-Enhance 開發執行書

> 更新日期: 2026-03-30
> 執行模式: YOLO mode + 子代理整併
> 目的: 收斂目前已驗證修補、Nash 已落地主線的播放器修正、剩餘風險，以及下一階段執行順序

## 0. 現況總結

目前主線有兩條已經接起來的改善線：

- popup / redirect / anti-popup 防護的第一輪可靠性修補已落地
- 無干擾播放器的誤判修正已完成第一輪 eligibility 收斂

因此目前系統風險已從「非影片元素常被誤判成播放器」逐步轉成：

- 邊界站點可能出現 false negative，漏掉 atypical 真實播放器
- 部分下游模組若仍直接吃舊 `players` 資料流，之後可能再次產生判定漂移
- trust boundary 與 popup 驗證鏈仍有高優先待補項

本文件取代 `2026-03-28` 版作為目前開發主參考；舊版保留做歷史基線與差異追蹤。

## 1. 本輪已完成且已驗證的修補

### 1.1 main-world policy downgrade containment 已補上第一層防護

本輪已針對 `extension/content/inject-blocker.js` 補上「只能加嚴、不能降級」的 containment patch：

- page-posted `__SHIELD_AI_POLICY__` 不再能清掉已啟用的 `popupStrictMode`
- `sensitivityBoost` 改為只會保留較嚴格值
- `extraBlockedDomains` 改為 union，不再被新訊息覆寫清空
- page-posted `__SHIELD_BLOCKING_LEVEL__` 不再能把目前 protection level 往下拉

這不是完整的 authenticated bridge 重構，但已先收掉最直接的 forged downgrade 路徑。

### 1.2 惡意 URL 比對已改成 token-aware

同一支 `inject-blocker.js` 裡，`MALICIOUS_DOMAINS` 與 AI 動態 blocked domains 的 URL 比對，已從單純 `String.includes()` 強化成 token-aware matching，降低正常 URL 片段被誤判成惡意域名的風險。

### 1.3 pinned popup restore 已補上 startup / onRemoved 共用恢復流程

本輪已針對 `extension/background.js` 補上 popup reliability 第一刀：

- `loadPinnedPopupPlayers()` 不再一律刪除失聯 `windowId`
- 對仍可恢復的 pinned entry，現在會先嘗試重建 popup window
- `chrome.windows.onRemoved` 也改成共用同一套 restore helper
- restore 前會先嘗試把舊 `sourceTabId` rebind 到 live tab
- 找不到 live tab 但仍有 `videoSrc / iframeSrc` 時，會降級成 direct popup，而不是開出 `Remote Offline`
- 若重建失敗，會保留可重試的 pinned entry，而不是直接把記錄吃掉

這一版先解的是「跨 session / runtime restart 後 pinned popup 無法恢復」的主問題；popup-player 內部播放狀態 restore 與完整 smoke 驗證仍屬下一階段。

### 1.4 popup-player 最小 state restore 已接上 pinned 路徑

本輪已針對 `extension/popup-player/popup-player.js` 補上最小 state restore：

- 只在 pinned / reopen 路徑自動套用
- 已接上 `currentTime`
- 已接上 `volume`
- 已接上 `muted`
- 已接上 `playbackRate`
- 已接上 `temperature`

目前刻意未擴大到 `paused / loop / brightness / contrast / saturation / sharpness / hue`，避免一次改動過大。

產品語意提醒：

- `pinned remote restore` 目前會主動對來源頁送出 `setVolume / setSpeed / toggleMute / seekToRatio`
- 這代表「重開 pinned popup」會自動調整來源頁播放器
- 若產品後續不希望這種自動回寫，需要再補一層 user-intent 規則

### 1.5 無干擾播放器偵測已改為 eligibility-first

Nash 已整併到主線的修改，已把播放器判定從「先廣撒候選、後面再 UI 扣分」改成「偵測階段先做可播放資格審核」：

- `player-detector` 現在會對 HTML5 video、iframe、custom container 分別做 eligibility 評估
- 小尺寸、預覽型、縮圖型、廣告型、僅長得像 player 的容器，不再直接進入正式播放器集合
- generic iframe 不再只靠寬高通過，必須同時具備可播放訊號且不落入 ad / preview 指標
- custom container 不再接受寬鬆的 `[class*=player]` / `[id*=player]` 泛匹配直接入列

這次修正的核心收益是：誤判被提早擋在 detector，而不是等 enhancer 或 popup 再補洞。

### 1.6 播放器資料流已改成以 detector eligibility 為單一真相來源

本輪已把播放器下游邏輯往同一條資料流收斂：

- `shieldPlayersDetected` 事件已擴充為 `players + eligiblePlayers + info`
- `getPlayersInfo()` 現在提供 `eligible`、`eligibilityReason`、`signalScore`、`isSuspectedAd`
- `player-enhancer` 只會對 eligible player 增強，不再為 non-eligible / suspected-ad 元素加上標示圖示
- popup 列表已改成只顯示 eligible player，不再讓疑似廣告或無效容器進入 UI
- `player-controls` 已改成優先管理 detector 認定的 managed video，避免 fake / removed video 混進控制與同步路徑

這代表未來任何播放器 UI、控制、同步功能，都應建立在 detector eligibility 之後；不應再各自維護第二套寬鬆判定。

### 1.7 已補一頁專用回歸測試頁，作為邊界驗證基線

本輪已新增 `tests/test-player-detection-regression.html`，用來覆蓋以下辨識邊界：

- 真實 `<video controls>` 主播放器
- 預覽型 / autoplay-muted / loop 類影片
- 大尺寸但不可播放的廣告或誘餌容器
- 多類型 iframe / custom player shell 的可播放與不可播放分界

這一頁的價值不只是手動測頁，而是把「什麼算真播放器、什麼不算」固化成可持續驗證的 fixtures。

### 1.8 本輪已知驗證狀態

已重新確認主線包含以下播放器相關實作：

- `player-detector.js`
- `player-enhancer.js`
- `player-controls.js`
- `popup.js`
- `tests/test-player-detection-regression.html`

既有已通過：

- `node --check extension/background.js`
- `node --check extension/content/inject-blocker.js`
- `node --check extension/popup-player/popup-player.js`
- `python -m unittest discover -s tests/live-browser -p "test*.py"`

Nash 子代理已回報通過：

- `node --check extension/content/player-detector.js`
- `node --check extension/content/player-enhancer.js`
- `node --check extension/popup/popup.js`
- popup smoke 驗證

備註：本輪文件整併以主線現況與已提交結果為準，尚未重新執行一整輪 popup smoke 與 eligibility boundary smoke。

## 2. 合併後的系統行為基準

### 2.1 播放器判定原則

新版基準如下：

- detector 先決定 eligibility
- enhancer、popup、controls 只消費 detector 的結果
- UI 不再負責用扣分方式修正 detector 的誤判
- suspected-ad 與 non-eligible 元素應同時從功能與顯示層移除

### 2.2 思想實驗後的結論

若維持舊架構，也就是讓 detector 寬鬆放行、UI 再補扣分，優點是短期不容易漏掉怪站播放器；缺點是：

- 偽陽性會一路流到 enhancer / popup / controls
- 各模組會各自演化出不同判定邏輯
- 新功能越多，資料流越難維持一致

若把 eligibility 收緊到 detector，優點是：

- UI 汙染大幅下降
- 標示圖示與無效功能一起減少
- 控制與同步路徑更容易保持一致

缺點與代價也很明確：

- atypical 真播放器可能被漏判
- 新站點支援時，需要優先補 detector signal，而不是在 UI 層偷補特判

綜合取捨後，最佳做法仍是目前主線採用的 `eligibility-first`，但必須補上更完整的邊界測試與 host-specific positive signals 機制，否則 false negative 會在下一波站點擴充時浮出來。

## 3. 已知風險與缺點

### 3.1 false negative 風險上升

更嚴格的 detector heuristic 可能漏掉：

- 延遲注入 `src` 的播放器
- 沒有標準 controls 的自訂播放器
- 大尺寸 muted autoplay 的合法主播放器
- 依賴 shadow DOM 或多層容器包裝的站點播放器

### 3.2 下游模組仍可能存在舊資料流依賴

雖然本輪已把主要播放器路徑對齊到 `eligiblePlayers / info`，但 repo 內若還有其他模組直接讀 `players` 或自行掃描 DOM，後續仍可能出現判定漂移。

### 3.3 trust boundary 仍非完成態

目前 `inject-blocker` 只是 containment patch，不是完整 authenticated bridge。安全性層級已提升，但尚未達到「page script 無法偽造 runtime 控制訊號」的最終目標。

### 3.4 popup 驗證鏈仍不足

播放器誤判已收斂，但 popup direct / remote / pinned reopen 仍需要一套可重跑的操作型 smoke；否則功能可能在未來修 detector 或 rule pipeline 時回歸而不自知。

## 4. 目前最值得優先處理的未完成項

### P0-A: 補齊 eligibility boundary regression suite

目標：把本輪 detector 收緊後最可能造成 false negative 的邊界案例固定下來。

最少要補：

- 小尺寸但真實可播放的影片案例
- 大尺寸 muted autoplay 真播放器案例
- 延遲載入 iframe / video source 案例
- custom player shell 內含真實 media source 的案例
- non-player 但含 `player` 命名的容器案例

完成條件：

- 每一類案例都能在 regression page 或 e2e smoke 中重現
- non-eligible 元素不會出現標示圖示
- 真實主播放器仍可開啟 popup player 並被 controls 接管

### P0-B: 完成 main-world trust boundary 第二階段收斂

目標：讓 page-forged runtime 訊號無法影響 extension 內部保護決策。

完成條件：

- `inject-blocker.js` 不再接受可降級的 page-forged runtime 指令
- 有一份明確 bridge 威脅面備忘或設計說明

### P1: 補齊 popup reliability 與操作型 smoke

目標：把播放器資料流修正後的 popup 行為也納入可重跑驗證。

至少要覆蓋：

- `video` 模式 popup
- `remote / direct` 模式 popup
- `direct-popup overlay` 模式
- `pin-close-reopen` 單次恢復流程

完成條件：

- 至少 3 個可重跑 smoke case
- pinned reopen 後能正確帶回最小 state restore
- popup 不會因 eligibility 收斂而找不到真正主播放器

### P1.5: 建立 detector 中央化站點例外機制

目標：把未來怪站支援集中到 detector，而不是讓 enhancer / popup 各自加 host 特判。

最低需求：

- 建立 host-specific positive signals lookup
- 保持 detector 為唯一 eligibility 決策點
- 禁止 popup / enhancer 自行擴寫第二套寬鬆 player 判定

### P2: 推進 rule generalization 與 canonical source 收斂

目標：把 popup direct、redirect recovery、anti-antiblock profile、selector metadata 逐步從硬編 host / 分散常數拉回資料層。

完成條件：

- `site-registry.json` 升成最小行為 schema
- popup direct 判斷共用 lookup
- `anti-antiblock.js` 至少完成第一版 typed profile
- selector metadata 不再在 background / dashboard 中途丟失

## 5. 建議執行順序

### Phase 1: Player Detection Stabilization

目標：

- 補齊 eligibility regression matrix
- 確認 detector-first 資料流不會在真實站點產生明顯漏判

完成條件：

- regression page 可覆蓋正向、反誤判與邊界案例
- popup / enhancer / controls 都以 `eligiblePlayers / info` 為主來源

### Phase 2: Trust Boundary Hardening

目標：

- 完成 main-world 橋接的第二階段安全收斂
- 盤點哪些設定只能由 trusted extension page 下發

完成條件：

- `inject-blocker.js` 不再接受可降級的 page-forged runtime 指令
- 有一份 bridge threat model 或設計備忘

### Phase 3: Popup Reliability and Verification

目標：

- 讓 pinned popup 真正可跨 session 重建
- 把 popup-player 最小 state restore 與三種 popup 模式納入可重跑 smoke

完成條件：

- 重啟後 pinned popup 可重建
- `currentTime / volume / muted / playbackRate` 至少 4 個欄位可恢復
- 至少 3 個 popup smoke case 可穩定重跑

### Phase 4: Rule Generalization

目標：

- 把 popup direct / redirect recovery / anti-antiblock profile 從硬編 host 拉到資料層
- 把播放器 eligibility 與站點例外維持在單一規則供應鏈上

完成條件：

- popup direct host 判斷不再重複散落
- site profile 與 detector positive signals 有一致資料來源

## 6. Nash 合併摘要

本文件已將 Nash 已提交到主線的修改納入正式開發計畫，對應成果包括：

- `player-detector`：eligibility-first、ad/preview/fake candidate 過濾、event contract 擴充
- `player-enhancer`：只對 eligible player 增強與顯示標示
- `player-controls`：優先管理 managed / eligible video
- `popup`：只顯示 eligible player，避免無效功能入口
- `test-player-detection-regression.html`：建立播放器誤判回歸測試基底

後續若要擴充播放器支援，預設原則為：

- 先補 detector signal 與 regression fixture
- 再檢查 popup / enhancer / controls 是否仍沿用單一資料流
- 不在 UI 層新增補洞式特判

## 7. 管理備註

- 本輪文件整併以主線目前已提交狀態為準，播放器修正對應主線最新提交 `025e7d2`
- `2026-03-28` 版執行書保留做歷史參照，不再作為後續開發主依據
- 若下一輪繼續 YOLO 執行，最推薦從 `Phase 1: Player Detection Stabilization` 開始，再接 `Phase 2: Trust Boundary Hardening`
