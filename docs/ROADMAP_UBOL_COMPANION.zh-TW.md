# Falcon-Player-Enhance 路線圖：uBOL Companion 對齊版

> 版本：v1.0
> 更新日期：2026-03-31
> 參照：`PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md`

## 1. 路線圖目標

本路線圖將功能發展分成四個桶位，確保 Falcon 走向與 uBOL 互補而非重疊。

- 桶位 A：保留強化（播放器核心價值）
- 桶位 B：降階為最小防護（無 uBOL 仍可自保）
- 桶位 C：避免重疊（停止擴張一般型 blocker 職責）
- 桶位 D：AI 中長期擴張（先 player-centric，後擴覆蓋）

## 2. 桶位 A：保留強化（Now + Next）

### A1. 播放器偵測與穩定性

- 完成 `eligibility-first` 判定鏈的邊界補強
- 強化延遲載入、lazy iframe、custom shell 判定
- 建立 detector 為單一資料真相來源，避免下游各自判斷

驗收：
- regression matrix 覆蓋正向/反誤判/邊界案例
- popup、enhancer、controls、sync 都以 detector eligibility 為主

### A2. 無干擾播放器可靠性

- pinned reopen 與 state restore 完整化
- popup direct / remote / side-panel 互通穩定化
- 操作型 smoke suite 常態化

驗收：
- 三類 popup 模式可重跑驗證
- 重啟後恢復成功率達可接受標準

### A3. 播放器周邊防護

- overlay/clickjacking 清理精準化
- fake video / bait container 判定優化
- popup trap / redirect lure 防護收斂

驗收：
- 不增加主播放器誤傷
- user-visible 干擾顯著下降

## 3. 桶位 B：降階為最小防護（Standalone Baseline）

### B1. 高信心網路防護

- 僅保留高信心惡意導流與高風險域封鎖
- 維持最小 DNR 規則集，不追求通用廣告覆蓋

### B2. DOM 最小防護

- 保留播放器周邊廣告遮罩、假影片、陷阱彈窗清理
- 對全頁通用 cosmetic blocking 採保守策略

### B3. 安全回退與模式切換

- Companion 與 Standalone 行為邊界明確
- 各模式都可回退，不綁死 AI 推論

驗收：
- 無 uBOL 場景下可提供基本防護
- 不因最小防護策略導致大量誤攔截

## 4. 桶位 C：避免與 uBOL 重疊（Freeze / De-scope）

以下項目列為近期凍結或降優先：

- 一般型 tracker blocking 擴張
- 全站通用 ad selector 覆蓋競賽
- 類 EasyList 生態複刻
- 非播放器導向的泛用 annoyance cleanup 擴寫

執行規則：

- 新需求若落入上述範圍，需先提交「非重疊必要性」說明才可進評估
- 缺乏 player-centric 明確價值的需求，預設不排入季度開發

## 5. 桶位 D：AI 中長期擴張

### D1. 近中期（Q2~Q3）

- AI 先專注 player-adjacent 判讀：
  - overlay 類型辨識
  - fake player / decoy 判讀
  - 站點風險分級與 guard 參數調整

### D2. 中長期（Q3~Q4）

- 建立 candidate -> review -> baseline 的規則升級流程
- 擴展到更廣站點，但維持 Companion 模式優先

### D3. 成熟期

- 以「接近 uBOL 覆蓋完成度」作為能力目標之一
- 但產品定位仍維持 player-centric，不轉型成一般型 blocker

驗收：
- 提升未知站點處理成功率
- 維持誤判可控與可回退

## 6. 時程與里程碑

### M1（即日起 ~ 4 週）

- 完成 Phase 1 Player Detection Stabilization
- 完成 Companion / Standalone 行為邊界文件化
- 完成重疊功能凍結清單
- 定義第一版量化驗收欄位（False Positive、False Negative、popup smoke、Companion regression）

### M2（4 ~ 8 週）

- 完成 popup reliability + smoke 常態化
- 完成 trust boundary 第二階段收斂
- 完成最小 DNR/DOM baseline 清點

### M3（8 ~ 16 週）

- 導入 AI candidate review pipeline 第一版
- 針對高流量站點建立 player-centric AI 適配策略
- 評估覆蓋提升與誤判成本

## 7. KPI 建議

- 播放器誤判率（False Positive）
- 主播放器漏判率（False Negative）
- popup 打開成功率與恢復成功率
- overlay/fake-video 有效移除率
- Companion 模式下相容性回歸數量
- Standalone 模式下基本防護有效率

## 8. 交付優先順序（決策版）

1. 先交付播放器穩定性與資料流一致性（A1）。
2. 再交付 popup reliability 與操作驗證（A2）。
3. 同步落地最小防護基線（B1/B2）。
4. 全程維持重疊凍結規則（C）。
5. 最後以 AI 擴張逐步放大覆蓋（D）。
