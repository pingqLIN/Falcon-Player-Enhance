# Falcon-Player-Enhance 無干擾播放器 YOLO 執行計畫

日期：2026-03-24
範圍：`extension/popup-player/*`、`extension/content/player-enhancer.js`、必要的 locale 與測試補強

## 背景

目前「無干擾播放器」主流程已具備：

- `player-enhancer.js` 提供浮動 `🎬` 入口
- `background.js` 建立 popup window
- `popup-player.js` 支援 `video / iframe / remote` 三種模式

但在實際檢視後，存在幾個不適合直接放著的問題：

- 入口偏向 hover-only，鍵盤與觸控可達性不足
- popup 視窗控制項缺少清楚 label / focus-visible 樣式
- `Auto Fit` 在 `iframe` 模式呈現可操作但實際無效
- `player-enhancer.js` 會對每個 popup button 累積全域 listener 與 interval
- `zh_TW` locale 仍有明顯混合語系字串
- 現有測試對 popup-player 實際路徑覆蓋不足

## YOLO 執行原則

本輪直接改實作，不先停在更多討論。

- 先修會影響核心使用體驗的問題
- 優先處理 a11y、可用性、狀態一致性、資源清理
- 保持現有視覺語言，不做大改版設計
- 避免擴張範圍到 background/AI/side panel 無關區域

## 執行項目

### 1. Popup 入口可達性

目標：讓無干擾播放器入口不再只靠 hover 才能被發現。

預計調整：

- 為浮動 popup button 增加鍵盤可達行為
- 補上必要的 `aria-label` / title / focus 顯示
- 讓觸控或 focus 情境下也能顯示入口

驗證：

- Tab 可聚焦入口
- 聚焦時按鈕可見
- 不影響既有 hover 體驗

### 2. Popup 視窗控制項 a11y 補強

目標：讓 popup-player 視窗在鍵盤與讀屏情境下至少達到基本可用。

預計調整：

- 為 timeline、volume、speed、theme button 等加上 label/aria
- 為 `.btn`、`.control-btn`、`summary`、`range`、`select` 補 `:focus-visible`
- 補足 icon-only 控制項的可達命名

驗證：

- Tab 導覽時有明確 focus 樣式
- Range / select / icon button 都有可讀名稱

### 3. 模式一致性修正

目標：避免 UI 顯示可用、實際卻無作用。

預計調整：

- `Auto Fit` 僅在真正可作用的模式啟用
- 釐清 `video / iframe / remote` 的控制可用矩陣
- 必要時更新提示文案

驗證：

- `iframe` 模式不再出現無效操作
- 各模式的 disabled/active 狀態一致

### 4. Player Enhancer 資源清理

目標：避免長頁面或 SPA 累積 listener / timer。

預計調整：

- 為 popup button 的 scroll/resize/timer 建立 cleanup 機制
- 當 player 或按鈕已移除時停止更新
- 降低 detached DOM 與重複 interval 風險

驗證：

- 語法檢查通過
- 多播放器頁面不再持續無限制新增 background work

### 5. locale 與測試補強

目標：讓修正可被維持，不只靠人工記憶。

預計調整：

- 修掉 `zh_TW` popup-player 明顯英文殘留
- 補最小必要的核心測試，優先覆蓋 popup 判斷/模式矩陣/可預期 helper

驗證：

- `npm run check:syntax`
- `npm run test:core`

## 暫不處理

這一輪先不做：

- 視覺大改版
- popup-player 全面 E2E 自動化
- iframe 遠端互動能力擴張
- background 架構重整

## 完成定義

符合以下條件視為本輪完成：

- 已有計畫文件落地
- popup 入口與視窗控制具基本鍵盤可用性
- 明顯無效控制已收斂
- player-enhancer 的 popup button 資源清理已落地
- 語法與核心測試通過
