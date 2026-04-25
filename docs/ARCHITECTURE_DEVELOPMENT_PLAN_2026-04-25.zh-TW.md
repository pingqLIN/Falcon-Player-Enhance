# Falcon-Player-Enhance 架構開發計畫

> 日期：2026-04-25
> 範圍：架構面主計畫，合併 UX/UI 中與架構、狀態模型、權限邊界、測試 gate 直接相關的項目
> 執行模式：`project-development-loop` Pattern B，5HR time-boxed development

## 1. 目標

本計畫把 Falcon-Player-Enhance 從「功能已多但邊界分散」收斂為可審查、可驗證、可發布判斷的播放器安全增強架構。核心不是擴張成通用 ad blocker，而是強化 player-centric protection、可回退 AI advisory、可解釋 UI 狀態與 release gate。

## 2. 現況判斷

- Extension 已具備 MV3 基礎架構：background service worker、DNR ruleset、content script chains、popup、dashboard、popup player、AI candidate governance。
- Phase 5 已建立 unified release gate，並涵蓋 site-state helper、candidate review/promotion、interaction safety、basic exclusion、rules contract。
- 目前最高風險集中在 `<all_urls>` 權限、MAIN world hooks、web-accessible resources、站點 registry policy surface、DNR 規則定位與 UI 狀態可解釋性。
- UX/UI findings 中真正屬於架構的項目是狀態模型、使用者覆寫、可及性 contract、i18n key、AI panel 顯示策略與 dashboard/popup terminology 一致性。

## 3. UX/UI 合併入架構面的項目

### 3.1 Protection Status 狀態模型

Popup 與 dashboard 需要共用一個可解釋的 protection status contract，至少描述：

- current mode：Companion、Standalone、AI-Expanded、Whitelist-only、Disabled
- active guards：popup guard、external navigation guard、overlay cleanup、fake-video cleanup、AI advisory
- last event：最近一次 blocked popup、managed navigation、overlay removed、AI candidate decision
- user override：使用者是否暫時允許導航、白名單、站點停用

架構理由：目前統計數字與 toggle 不能完整表達保護鏈實際狀態，使用者也無法分辨「未發生事件」和「功能未啟用」。

### 3.2 Whitelist / Enhanced Site 語義統一

需要把 popup、dashboard、site-state-helper、content script consumer 的 whitelist/enhanced-site 語義統一成單一 contract：

- whitelist：使用者信任或降干預的站點狀態
- enhanced site：允許更完整 player-centric protection chain 的站點狀態
- strict mode：啟用更強 guard，但仍必須保護合法互動與播放器本體

架構理由：UI 名稱不一致會導致使用者誤解；程式層語義不一致會造成 content script chain 啟用條件漂移。

### 3.3 AI Monitor 顯示與資料治理

AI Monitor 應從「永遠可見的開發面板」改為：

- 預設隱藏或折疊
- 僅顯示 policy gate 後的摘要
- 明確標示 AI 只做 advisory 與 reversible actions
- 不顯示或匯出過度敏感 telemetry

架構理由：AI 是 trust boundary，不只是 UI 區塊；顯示策略需要反映 policy gate 與資料最小化。

### 3.4 Interaction Safety 與可及性 contract

UX 的 shortcut popover、icon-only buttons、flow indicator lifecycle 不只是視覺問題，應納入 interaction contract：

- 所有 icon-only controls 需有 `aria-label`
- keyboard reachable 的快捷鍵說明不得依賴 hover-only
- flow indicator 鎖定後應轉成狀態顯示或折疊，避免擠壓控制區
- interaction safety guard 不得誤接管 auth/form/CTA 類頁面

架構理由：這些屬於 extension 對 host page 和自身 popup 的互動安全邊界。

## 4. 開發批次

### Batch A：架構邊界與 release gate 文件化

成果：

- 補一份 release architecture gate checklist，對應 manifest permissions、host permissions、web accessible resources、MAIN world scripts、DNR scope、AI telemetry。
- 把 UI/UX 架構項目轉成可測 contract，而不是單純設計建議。
- 在 5HR loop state 中記錄 active batch、deadline、last checkpoint、next action。

完成定義：

- 文件能讓 reviewer 判斷任何新功能是否違反 player-centric / uBOL companion 邊界。
- 每一項 high-risk architecture surface 都有對應 test 或 manual review gate。

### Batch B：Protection Status contract MVP

成果：

- 新增或整理可供 popup/dashboard 共用的 protection status schema。
- 先不大改 UI，優先建立背景層到 UI 層可讀的狀態欄位。
- 將 whitelist/enhanced/strict/AI advisory 對應到同一組 status terms。

完成定義：

- 有 contract 文件或 schema。
- 至少一個 regression 驗證 status builder 不會把 disabled/whitelist/strict/AI advisory 混淆。

### Batch C：MAIN world 與 navigation guard 回歸補強

成果：

- 補足針對 `top.document.location`、`document.location` 或同類 setter 導流的防護測試。
- 明確區分 user-initiated navigation、managed external navigation、ad-driven popunder redirect。
- 驗證合法 same-site / user-initiated flow 不被誤攔。

完成定義：

- inject-blocker 或 background guard 有可重跑 regression。
- 測試覆蓋舊視窗改址、新視窗目的地、back-stack 不可回原站的風險模型。

### Batch D：真實瀏覽器驗證與 smoke pool

成果：

- 優先跑現有 release gate 或相關 headless browser regression。
- 若權限允許，再跑 live-browser curated/smoke target 的最小集合。
- 產出 artifact 或 stage report，記錄 pass/fail、flake、manual review needed。

完成定義：

- 至少完成一組本機 browser regression。
- 若外部站點受限，記錄限制並保留 repo-local evidence。

## 5. 審查 gate

外部 reviewer 需檢查：

- 計畫是否維持 player-centric / uBOL companion 邊界。
- UX/UI 合併項是否真的屬於架構，不是單純視覺 polish。
- 5HR 第一批是否足夠小，可在同一批內完成、驗證、回報。
- 是否有任何會觸發不可替代使用者批准的事項：破壞性操作、發布、secret/auth、付款、合規。

## 5.1 外部 reviewer 審核結果

審核結論：准許開始實作，但範圍限縮為 Batch A + Batch C 的交集。

阻斷性問題：

- 未發現阻斷 Batch A/C 開始的問題。
- 本批不得擴大 manifest/host permissions、web-accessible resources、MAIN world 注入範圍、AI 自動決策或發布流程。

非阻斷建議與採納方式：

- Protection Status、whitelist/enhanced/strict 語義、AI Monitor governance、interaction safety 已正確轉成架構 contract/gate。
- Batch A checklist 需要補負面規則：`AI-Expanded`、`enhanced site`、`strict mode` 不得變成 generic ad blocker，不得對非播放器場景擴權。
- 第一批 artifact 固定為：release architecture gate checklist、managed external navigation regression、最小 browser regression 指令與 evidence。
- 使用者批准邊界需明列：權限擴張、站點 registry promotion、MAIN world 新注入點、telemetry 匯出、CWS/side-loaded 發布不得在 5HR 批次中默默執行。

## 6. 本輪 5HR 推薦起點

第一刀採 Batch A + Batch C 的交集：

1. 建立 release architecture gate checklist。
2. 補 navigation/popunder guard 的缺口測試規格。
3. 若測試顯示目前未覆蓋 `top.document.location` 類型，補 regression。
4. 跑最小 browser regression。

理由：這直接回應最初的 poapan popunder 研究，也能支撐後續商業頁面與 CWS/side-loaded 發布風險判斷。

## 7. 決策紀錄

- 2026-04-25：採用 repo-local durable state 作為 5HR Pattern B 支撐，避免 live session 中斷後無法恢復。
- 2026-04-25：正式 `$conversation-memo` raw archive 若無法寫入 `C:\Users\miles\.agents`，先使用 repo-local memo，必要時再升級權限。
- 2026-04-25：外部 Agent 可替代一般審查與取捨，但不替代平台要求的高風險批准。
- 2026-04-25：外部 reviewer 准許開始 Batch A/C，但禁止本批默默做權限擴張、發布、telemetry 匯出、AI 自動處置或廣域 blocking 擴張。
- 2026-04-25：Batch A/C 驗證通過後，外部 reviewer 准許 Batch B 最小切片；範圍限於 Protection Status schema/contract/純函式與 regression，不改 UI 版面、manifest、WAR 或 MAIN world。
- 2026-04-25：same-origin iframe `window.top.document.location` regression 揭露現有 guard 缺口；嘗試最小 `Document/HTMLDocument.prototype.location` hook 未修復，因此不保留 runtime 變更，改以 known gap evidence 進入下一輪審查。
