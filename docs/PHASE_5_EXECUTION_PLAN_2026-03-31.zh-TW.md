# Falcon-Player-Enhance Phase 5 執行計畫

> 更新日期: 2026-04-01
> 狀態: Track A/B/C/D groundwork landed + Track E v1/v2 verified + interaction safety guard verified
> 參照: `PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md`、`STANDALONE_BASELINE_RULESET_2026-03-31.zh-TW.md`、`PHASE_4_GLOBAL_REVIEW_2026-03-31.zh-TW.md`

## 1. Phase 5 目標

Phase 5 的目標不是擴張成一般型 blocker，而是把 Phase 4 的 groundwork 推進成可持續維護的產品級執行面：

- 鞏固 `Companion Mode` 的相容性與回退能力
- 把 `Basic Standalone` 的 baseline 轉成 release gate 管理
- 為 `AI-Expanded` 建立可審核、可回退的規則流程
- 解決目前已知四個風險主題：
  - compatibility fallback
  - getSiteRegistry contract
  - whitelist-state divergence
  - release gate unification
- 另外收斂一個跨站高風險問題：
  - interaction safety（登入 / OAuth / 重表單頁面不可被 media automation 誤傷）

## 2. 邊界與非目標

Phase 5 僅處理 player-centric 範圍：

- 播放器偵測、播放器周邊防護、popup/reopen/recovery、site profile 契約

Phase 5 明確不做：

- 擴張通用 tracker blocking
- 複刻 EasyList/EasyPrivacy 類廣域覆蓋
- 非播放器導向的全頁清理競賽

## 3. 工作流與交付

## 3.1 Track A: Compatibility Fallback 收斂

目標：

- 將 compatibility mode 的 fallback 行為標準化，避免 site profile 缺值時各模組漂移

交付：

- 兼容回退規範文件（主機域匹配、預設值、異常處理）
- 受影響模組對齊清單（background / anti-popup / inject-blocker / player-enhancer）

驗收：

- profile 缺值時仍維持一致 fallback
- companion regression 不新增互斥衝突

## 3.2 Track B: getSiteRegistry Contract 定版

目標：

- 將 `getSiteRegistry` 視為單一資料契約，明確欄位、型態、預設值、版本演進規則

交付：

- `getSiteRegistry` contract spec（欄位定義 + default policy）
- contract 變更流程（新增欄位、棄用欄位、相容期）

驗收：

- 所有 consumer 模組對 contract 的依賴可追溯
- contract 缺欄位情境有一致保底策略

## 3.3 Track C: Whitelist-State Divergence 修補

目標：

- 消除 storage state、bridge state、MAIN world state 三者的判斷漂移

交付：

- whitelist runtime state diagram
- divergence 偵測條件與修復流程
- anti-antiblock / related scripts 行為一致性規範
- `document_idle / ISOLATED` canonical helper (`site-state-helper.js`)
- `document_start / MAIN` bridge regression (`run_site_state_bridge_regression.py`)
- anti-antiblock live update regression（whitelist -> strict -> whitelist restore）
- `tests/site-state/run_site_state_helper_regression.py`

驗收：

- non-whitelist 與 whitelist 行為可穩定重現
- 不再依賴共享但語意不清的 global marker 判斷

## 3.4 Track D: Release Gate Unification

目標：

- 將目前分散 smoke/regression 統整為單一 release gate 規格

交付：

- `PHASE_5_ACCEPTANCE_MATRIX_2026-03-31.zh-TW.md`
- `tests/release-gate/run_phase5_acceptance_gate.py`
- gate 執行順序與阻斷條件（Blocker / Warning）

驗收：

- 每次 Phase 5 交付可用同一套 gate 重跑
- 文件、程式、測試證據三者一致

## 3.5 Track E: AI-Expanded Governance v2

目標：

- 在 Track E v1 基礎上建立 `candidate -> review -> controlled promotion -> rollback` 的受控治理鏈
- 明確建立 decision schema v2，確保每次升級與回退都可追溯到同一條 evidence chain

交付：

- decision schema v2 已落地（decision log 含 `decisionId`、`evidenceRefs`、`schemaVersion`）
- controlled promotion 已落地（`accepted` candidate 才可 promotion，且需保留 `decisionId` linkage）
- rollback path 已落地（以 `promotionId` 回退，保留 rollback log 與 evidence refs，且僅回退該 promotion 新增的 `confirmedPatterns`）
- Track E v2 驗證腳本已落地（promotion + rollback）
- `G-08` 已併入 unified release gate（Track E v2）

驗收：

- 每次 `promotion` 都要關聯到已接受 decision 與對應 evidence
- decision/promotion/rollback 三者需形成可查詢的單向鏈
- rollback 後 baseline 必須可還原到 promotion 前快照
- `G-08` 能在 unified gate 中固定重跑

## 3.6 Track F: Interaction Safety Guard

目標：

- 將登入 / OAuth / 多欄位表單頁從「單站例外」提升為「通用頁面模式判定」
- 避免 `shield-basic-docidle` 在互動敏感頁上誤啟動 player detection / overlay cleanup / fake-video cleanup / hotkeys

交付：

- `site-state-helper.js` 新增 `interactionSafety` 與 `shouldRunMediaAutomation()`
- `player-detector`、`fake-video-remover`、`overlay-remover`、`player-enhancer`、`player-controls` 對齊同一條 interaction safety guard
- `tests/interaction-safety/run_interaction_safety_regression.py`
- `G-09` 已併入 unified release gate

驗收：

- 互動敏感頁必須判定為 `shouldRunMediaAutomation = false`
- auth overlay / OAuth button / form submit 不可被全站 media automation 誤傷
- 既有 player detection regression 不可退化

## 4. 里程碑

## M1（Week 1）

- 完成 Track A/B 規格定版
- 建立 getSiteRegistry contract 第一版檢核清單

## M2（Week 2）

- 完成 Track C 行為一致性收斂
- anti-antiblock 與 whitelist 相關 regression 進入 release gate

## M3（Week 3）

- 完成 Track D gate 統一
- 完成 Track E 的 AI candidate 審核流程第一版並自動化 `G-07`

## M4（Week 4）

- 完成 Track E v2 的 decision schema hardening 與 evidence linkage
- 完成 controlled promotion 規範與 rollback path 驗證
- 將 `G-08` 併入 unified release gate

## 5. 決策與協作模式

- 主控監察員：負責全局決策、風險裁決、最終整合
- 子代理（5.3-codex high）：負責文件落地、細節編修、證據整理
- 外部審查：每輪里程碑後執行一次，先出 findings，再修正回寫

## 6. 完成定義（Definition of Done）

Phase 5 在本階段可宣告完成需同時滿足：

- 四個風險主題均有對應規格與驗收證據
- acceptance matrix 全部關鍵項目 PASS（含 `G-08`）
- interaction safety regression PASS（`G-09`）
- roadmap / execution book / phase docs 一致引用同一套邊界語言
- 外部審查 findings 已關閉或有明確 backlog 與風險註記
