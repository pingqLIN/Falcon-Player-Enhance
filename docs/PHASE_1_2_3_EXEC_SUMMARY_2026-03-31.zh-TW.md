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

- 完成 popup direct / pin / reopen / state restore 主線穩定化
- 直載影片失敗時，加入 remote fallback，避免功能直接失效

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

原本 `popup_player_video_not_ready` 的主要成因，不是 popup-player 核心邏輯崩壞，而是測試頁使用的遠端 MP4 在 headless Chromium 環境中不穩定。

因此修正採雙軌：

- 產品面: popup-player 增加直載失敗 fallback
- 測試面: 改用本地 deterministic WebM fixture

## 目前還沒做完的事

- `Basic Standalone Protection` 的正式 baseline 清單
- `Standalone Baseline + Rule Generalization` 第一階段
- `AI candidate -> review -> baseline` 正式受控流程
- popup 實際視窗尺寸在所有環境中的更精準還原

## 下一步

下一階段將進入 `P4 / Standalone Baseline + Rule Generalization groundwork`，優先處理：

1. 把 `popup direct` host 判斷從硬編常數抽到資料層
2. 讓站點 profile 與 popup / detector 規則鏈有更一致的來源
3. 只做 player-centric 與最小防護收斂，不擴張成一般型 blocker

## 參考文件

- `docs/PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md`
- `docs/ROADMAP_UBOL_COMPANION.zh-TW.md`
- `docs/DEVELOPMENT_EXECUTION_BOOK_2026-03-31.zh-TW.md`
- `docs/PHASE_1_2_3_GLOBAL_REVIEW_2026-03-31.zh-TW.md`
