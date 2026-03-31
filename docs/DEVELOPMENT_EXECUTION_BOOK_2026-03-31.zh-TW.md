# Falcon-Player-Enhance 開發執行書

> 更新日期: 2026-03-31
> 執行模式: YOLO mode + 主控監察 + 子代理持續開發
> 目的: 將 `uBOL Companion` 產品邊界正式併入執行序列，並啟動 Phase 5 的契約化與驗收門檻整合

## 0. 本版重點（相較 2026-03-30）

本版不是重述舊計畫，而是新增一個關鍵決策：

- Falcon 產品定位正式採 `Companion Mode` 為預設
- 允許 `Basic Standalone Protection`，但僅保留最小必要防護
- `AI-Expanded Mode` 以播放器場景優先，不立即走向一般型 blocker 擴張

這表示後續實作不再以「通用廣告覆蓋」為優先，而是以「播放器偵測、可用性、可靠性」為第一順位。

## 1. 目前基線（已完成）

## 1.1 播放器判定主線已收斂

- `player-detector` 已採 `eligibility-first` 判定
- `shieldPlayersDetected` 已提供 `eligiblePlayers + info`
- `player-enhancer` / `popup` / `player-controls` 已改為優先消費 eligibility 資料流
- 非影片與疑似廣告元素在 UI 與功能層的暴露大幅降低

## 1.2 popup 與保護鏈第一輪修補已落地

- pinned popup restore 共用流程已補上
- popup-player 最小 state restore 已接入 pinned 路徑
- main-world policy downgrade containment 已完成第一層防護

## 1.3 回歸測試基線已建立

- 已有播放器誤判回歸頁面作為基底
- 可持續擴展正向、反誤判、邊界案例

## 2. Phase 1（進行中）: Player Detection Stabilization

Phase 1 目前焦點是「在不擴張通用 blocker 職責下，補齊播放器邊界穩定度」。

已進行中的實作方向：

- 補強 detector 對延遲載入與 attribute 變化的 re-detect 能力
- 補強 sync 對 managed/eligible player 的資料流對齊
- 擴增 regression matrix，納入小尺寸真影片、延遲 source、lazy iframe、custom shell 等邊界案例

Phase 1 完成條件（修正版）：

1. 真實主播放器在動態載入場景下仍可被穩定偵測。
2. non-eligible/suspected-ad 元素不進入播放器操作路徑。
3. 測試矩陣可重現 false positive 與 false negative 的關鍵邊界。

## 3. 確認 3 部分調整（本版強制納入）

這三項是本輪執行強制調整，已作為後續 PR 與任務分派的 gate。

### 3.1 調整一：產品邊界調整（Companion-first）

- 預設模式改為 Companion Mode
- 產品價值集中於 player-centric protection
- 不再把一般型 ad/tracker 覆蓋提升作為近期 KPI

### 3.2 調整二：最小防護調整（Standalone Baseline）

- 無 uBOL 時保留最小防護能力
- 只保留高信心惡意導流與播放器周邊必要清理
- 避免因追求覆蓋導致誤攔截與互相干擾

### 3.3 調整三：Phase 1 實作調整（對齊策略邊界）

- Phase 1 任務只做播放器穩定與資料流一致性
- 不在 Phase 1 插入一般型 blocking 擴張需求
- 新增重疊檢核：與 uBOL 高度重疊功能預設不進入本階段

## 4. 接下來執行優先順序

### P0（立即）

- 完成 Phase 1 邊界補強與回歸矩陣落地
- 將 `eligiblePlayers / info` 作為播放器路徑唯一真相來源
- 清理仍可能使用舊 `players` 的殘餘消費點
- 定義本階段量化驗收欄位與量測方式，避免「高信心 / 可接受」在不同任務間漂移

### P1（短期）

- 完成 popup reliability 操作型 smoke
- 完成 trust boundary 第二階段收斂
- 確保 Companion 模式下功能無明顯衝突回歸

### P2（中期）

- 定義 Standalone 最小防護 baseline 清單
- 將候選規則導入 `candidate -> review -> baseline` 流程
- 建立 AI player-centric 擴張的驗收指標

## 4.1 Phase 5 Kickoff（新增）

Phase 5 已啟動，先處理四個風險主題：

- compatibility fallback
- getSiteRegistry contract
- whitelist-state divergence
- release gate unification

Phase 5 核心文件：

- `docs/PHASE_5_EXECUTION_PLAN_2026-03-31.zh-TW.md`
- `docs/PHASE_5_ACCEPTANCE_MATRIX_2026-03-31.zh-TW.md`

Phase 5 執行順序：

1. 先定版 contract/fallback 規格。
2. 再做 whitelist state 一致性收斂。
3. 最後統一 release gate，將 smoke/regression 轉為固定驗收矩陣。

## 5. 執行規範（主控監察模式）

- 主控代理負責全局決策、優先序、風險裁決
- 子代理負責任務實作與文件/測試落地
- 模式切換預設由主控或使用者明確指定；現階段不把「自動偵測 uBOL 安裝狀態」視為必要依賴
- 每輪交付必須附上：
  - 本輪修改範圍
  - 與策略邊界的對齊說明
  - 回歸驗證結果與已知風險

任何需求若屬以下範圍，需先升級決策再實作：

- 與 uBOL 一般型 blocker 職責高度重疊
- 可能擴大誤攔截面
- 無法在 Companion/Standalone 模式下明確定義行為

## 6. 風險清單（本版）

- 風險 A: Phase 1 修補過嚴，造成 atypical 真播放器漏判
- 風險 B: 下游模組仍有舊資料流依賴，導致行為不一致
- 風險 C: 規劃中途插入通用 blocker 擴張，侵蝕差異化定位
- 風險 D: compatibility fallback 在 profile 缺值時出現模組間漂移
- 風險 E: getSiteRegistry contract 演進無規格，導致 consumer 不一致
- 風險 F: whitelist runtime state 在 storage/bridge/MAIN world 之間發散
- 風險 G: 測試入口分散，release gate 無單一阻斷標準

對應緩解：

- 持續擴充 regression fixtures（含動態載入與客製播放器）
- 以資料流盤點清單逐項關閉舊依賴
- 在任務受理前執行「uBOL 重疊檢核」
- 將 Phase 5 驗收矩陣作為每輪交付前的 gate（先證據、後宣告）

## 7. 文件關聯

- 策略文件：`docs/PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md`
- 路線圖：`docs/ROADMAP_UBOL_COMPANION.zh-TW.md`
- 前版執行書：`docs/DEVELOPMENT_EXECUTION_BOOK_2026-03-30.zh-TW.md`
- Phase 5 計畫：`docs/PHASE_5_EXECUTION_PLAN_2026-03-31.zh-TW.md`
- Phase 5 驗收矩陣：`docs/PHASE_5_ACCEPTANCE_MATRIX_2026-03-31.zh-TW.md`

本版（2026-03-31）作為後續執行主依據。
