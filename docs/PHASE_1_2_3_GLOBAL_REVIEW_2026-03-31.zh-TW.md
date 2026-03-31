# Falcon-Player-Enhance Phase 1-3 全局檢視

> 更新日期: 2026-03-31
> 狀態: Checkpoint
> 範圍: `Phase 1`、`Phase 2`、`Phase 3`

## 1. 檢視目的

本文件用來在 `Phase 1 -> Phase 2 -> Phase 3` 完成後，重新確認以下三件事：

1. 目前的目標功能項目是什麼。
2. 實際已完成的功能項目是什麼。
3. 已完成項目有哪些功能測試與驗證結果。

本文件作為 2026-03-31 階段性 checkpoint，供後續 roadmap、實作與 review 直接引用。

## 2. 目標功能項目

本階段目標以 `uBOL Companion` 策略為主，不再以一般型 blocker 擴張作為短期核心。

### 2.1 產品邊界

- 預設採 `Companion Mode`
- 不與 uBlock Origin Lite 在一般型全站內容阻擋上正面重疊
- 無 uBOL 時保留 `Basic Standalone Protection`
- 中長期保留 `AI-Expanded Mode`，但先服務播放器場景

### 2.2 Phase 1 目標

- 收斂播放器 eligibility-first 判定
- 降低非影片元素、廣告容器、trap video 的誤判
- 讓播放器操作路徑改用 `eligiblePlayers / info` 作為單一真相來源
- 建立可重現的播放器誤判回歸測試

### 2.3 Phase 2 目標

- 提升 popup player 開啟可靠性
- 補強 pin / reopen / state restore
- 在直載失敗時維持可用性，不直接讓 popup player 壞掉

### 2.4 Phase 3 目標

- 建立可重現的 popup smoke 驗證
- 排除外部遠端測試資產對驗證穩定度的污染
- 讓 smoke 驗證能直接驗證功能，而不是驗證環境偶發差異

## 3. 實際完成項目

## 3.1 策略與文件對齊

已完成以下文件落地：

- `uBOL Companion` 產品策略
- `Companion / Standalone / AI-Expanded` 三層模式定義
- roadmap 與 execution book 重排
- README 與 README.zh-TW 對外口徑對齊

對應文件：

- `docs/PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md`
- `docs/ROADMAP_UBOL_COMPANION.zh-TW.md`
- `docs/DEVELOPMENT_EXECUTION_BOOK_2026-03-31.zh-TW.md`
- `README.md`
- `README.zh-TW.md`

## 3.2 Phase 1 已完成項目

- `player-detector` 已採 `eligibility-first` 邏輯
- `shieldPlayersDetected` 已提供 `eligiblePlayers + info`
- detector 已補強動態 DOM 與 attribute-driven re-detect
- `player-sync` 已改成只處理 managed / eligible video
- 先前已完成的 `player-controls`、`player-enhancer`、`popup` 已優先對齊 eligibility 資料流
- 播放器誤判回歸頁已擴充成 9-case matrix

對應檔案：

- `extension/content/player-detector.js`
- `extension/content/player-sync.js`
- `extension/content/player-controls.js`
- `extension/content/player-enhancer.js`
- `extension/popup/popup.js`
- `tests/test-player-detection-regression.html`

## 3.3 Phase 2 已完成項目

- popup player 直載影片失敗時，會回退到 remote mode
- popup player 已補上 `seeked` 後的 runtime state persist
- pin / reopen / state restore 路徑已穩定通過 smoke 驗證

對應檔案：

- `extension/popup-player/popup-player.js`

## 3.4 Phase 3 已完成項目

- popup smoke 測試已改用 repo 內本地影片資產
- 測試頁與 smoke 腳本不再依賴遠端 `commondatastorage` MP4
- 新增 deterministic WebM fixture，供 headless Chromium 穩定播放

對應檔案：

- `tests/assets/falcon-smoke.webm`
- `tests/popup-smoke/run_popup_smoke.py`
- `tests/test-popup-player.html`
- `tests/test-page.html`
- `tests/test-player-detection-regression.html`

## 4. 已完成項目的功能測試

## 4.1 語法檢查

以下檔案已重新執行 `node --check`：

- `extension/content/player-detector.js`
- `extension/content/player-sync.js`
- `extension/popup-player/popup-player.js`

結果：全部通過。

## 4.2 Popup Smoke 測試

已執行：

```bash
python tests/popup-smoke/run_popup_smoke.py --headless --cases popup-open-local-video pin-close-reopen popup-player-state-restore
python tests/popup-smoke/run_popup_smoke.py --headless --cases multi-popup-distinct-windows
```

結果：

- `popup-open-local-video` PASS
- `pin-close-reopen` PASS
- `popup-player-state-restore` PASS
- `multi-popup-distinct-windows` PASS

## 4.3 Player Detection Regression

已以 Playwright + local HTTP 方式重新驗證：

- `tests/test-player-detection-regression.html`

結果：

- 9 / 9 cases PASS

覆蓋案例：

- 真實 HTML5 video
- 假播放器容器
- preview 縮圖影片
- ad iframe
- trap video
- 小尺寸真影片
- 延遲注入 source
- lazy iframe
- custom shell + playable child

## 5. 關鍵判斷

本輪驗證後，確認以下結論：

- 原本 `popup_player_video_not_ready` 的主因不是 popup-player 核心邏輯壞掉
- 問題主要來自測試頁遠端 MP4 資產在 headless Chromium 中不穩定
- 因此本輪修正採雙軌：
  - 產品面: popup-player 加入直載失敗 fallback
  - 測試面: 測試素材改為本地 deterministic WebM

這樣可以同時提升產品韌性與驗證可信度。

## 6. 尚未完成項目

以下項目不屬於本輪已完成範圍，保留到後續階段：

- `Basic Standalone Protection` 的正式 baseline 清單與 canonical source 收斂
- `AI-Expanded Mode` 的 `candidate -> review -> baseline` 正式流程
- popup 實際視窗尺寸在所有環境中的更精準還原
- 將 regression matrix 進一步納入更正式的自動化驗收管線

## 7. 目前結論

截至 2026-03-31，本專案在 `Phase 1`、`Phase 2`、`Phase 3` 的主要執行目標已完成：

- 目標功能項目已與 `uBOL Companion` 策略對齊
- 實際完成項目已進入主線 commit
- 已完成項目的核心功能測試已重新驗證通過

目前最適合作為後續主依據的文件是：

- `docs/PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md`
- `docs/ROADMAP_UBOL_COMPANION.zh-TW.md`
- `docs/DEVELOPMENT_EXECUTION_BOOK_2026-03-31.zh-TW.md`
- `docs/PHASE_1_2_3_GLOBAL_REVIEW_2026-03-31.zh-TW.md`
