# Falcon-Player-Enhance Phase 1-3 對外簡報摘要

> 更新日期: 2026-03-31
> 用途: 對外簡報 / 狀態同步 / 協作摘要

## 一句話摘要

Falcon-Player-Enhance 已完成 `Phase 1` 到 `Phase 3` 的核心收斂，產品定位正式轉為 **uBOL Companion**，並把播放器誤判、popup 可靠性與驗證穩定度拉回可持續迭代的基線。

## 目前定位

- 預設模式: `Companion Mode`
- 核心價值: `player-centric protection`
- 與 uBOL 的分工:
  - uBOL 處理一般型內容阻擋
  - Falcon 處理播放器保護、可用性修復、popup / overlay / fake-video / trap 防護

## 本輪完成了什麼

### 1. 播放器誤判收斂

- 建立 `eligibility-first` 判定鏈
- 讓 `eligiblePlayers / info` 成為播放器資料流主來源
- 降低非影片元素、廣告容器、preview / trap video 被誤判為主播放器的機率

### 2. popup player 可靠性補強

- 完成 popup direct / pin / reopen / state restore 主線驗證
- 直載影片失敗時，加入 remote fallback，避免功能直接失效
- popup 視窗尺寸的更精準還原，仍保留為後續項目

### 3. 驗證基線重建

- 將 popup smoke 與回歸頁改為使用 repo 內可重現資產
- 移除對外部遠端 MP4 資產的依賴
- 讓 headless Chromium 驗證結果更穩定、更可信

## 已完成的驗證

### Popup smoke

- `popup-open-local-video` PASS
- `pin-close-reopen` PASS
- `popup-player-state-restore` PASS
- `multi-popup-distinct-windows` PASS

### Player detection regression

- 9 / 9 cases PASS
- 覆蓋：
  - 真實 HTML5 video
  - 假播放器容器
  - preview 縮圖影片
  - ad iframe
  - trap video
  - 小尺寸真影片
  - 延遲 source
  - lazy iframe
  - custom shell + playable child

## 這輪最重要的技術判斷

本輪驗證觀察到，`popup_player_video_not_ready` 的主要因素不是 popup-player 核心邏輯崩壞，而是測試頁使用的遠端 MP4 在 headless Chromium 環境中不穩定。

因此修正採雙軌：

- 產品面: popup-player 增加直載失敗 fallback
- 測試面: 改用本地 deterministic WebM fixture

## 目前還沒做完的事

- `Basic Standalone Protection` 的正式 baseline 清單
- 更完整的 `Standalone Baseline + Rule Generalization` 收斂
- `AI candidate -> review -> baseline` 正式受控流程
- popup 實際視窗尺寸在所有環境中的更精準還原

## 下一步

`P4` 已啟動第一個切片，下一步將持續推進 `Standalone Baseline + Rule Generalization groundwork`，優先處理：

1. 將更多 popup / redirect / anti-antiblock 行為整理成 typed site profiles
2. 建立 `Standalone Baseline` 的正式最小規則清單與 canonical source
3. 持續只做 player-centric 與最小防護收斂，不擴張成一般型 blocker

## 參考文件

- `docs/PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md`
- `docs/ROADMAP_UBOL_COMPANION.zh-TW.md`
- `docs/DEVELOPMENT_EXECUTION_BOOK_2026-03-31.zh-TW.md`
- `docs/PHASE_1_2_3_GLOBAL_REVIEW_2026-03-31.zh-TW.md`
- `docs/PHASE_4_RULE_GENERALIZATION_CHECKPOINT_2026-03-31.zh-TW.md`

## 證據附錄

### Commit 基線

- `d7de8bd` `docs: define uBOL companion strategy and execution plan`
- `0f1819d` `feat: stabilize player eligibility and popup smoke coverage`
- `243813d` `docs: add phase 1-3 global review checkpoint`
- `378c73e` `docs: add phase summary and p4 checkpoint`
- `c51f83b` `feat: generalize popup direct host profiles`

### 驗證命令

```bash
node --check extension/content/player-detector.js
node --check extension/content/player-sync.js
node --check extension/popup-player/popup-player.js
node --check extension/background.js
node --check extension/content/player-enhancer.js

python tests/popup-smoke/run_popup_smoke.py --headless --cases popup-open-local-video pin-close-reopen popup-player-state-restore
python tests/popup-smoke/run_popup_smoke.py --headless --cases multi-popup-distinct-windows
python tests/player-detection/run_player_detection_regression.py --headless
```

### 最新結果

- popup smoke:
  - `popup-open-local-video` PASS
  - `pin-close-reopen` PASS
  - `popup-player-state-restore` PASS
  - `multi-popup-distinct-windows` PASS
- player detection regression:
  - `passedCases = 9`
