# 無干擾播放器 Session Recovery

日期：2026-03-24  
來源：TB2 外部終端 `codex` session scrollback 恢復  
目的：保存當機前外部 `codex` 對「無干擾播放器」所做的靜態檢查、計畫與已落地修改狀態

## Session 資訊

- `room_id`: `51e30b65d8dc`
- `bridge_id`: `7a09cf968ca8`
- `pane_a`: `tb2:0.0`
- `pane_b`: `tb2:0.1`
- scrollback 來源：`tmux capture-pane -p -J -t tb2:0.0`

## 恢復結論

已確認當時外部 `codex` 不是只做口頭檢視，而是完成了以下三件事：

1. 對無干擾播放器鏈路做了一輪靜態 audit
2. 產出正式計畫文件 `docs/POPUP_PLAYER_YOLO_PLAN.zh-TW.md`
3. 依計畫直接落地第一輪修正，並跑過 `npm run check:syntax` 與 `npm run test:core`

## 當時 audit 的主要 findings

### 第一輪檢查

- `P2` `extension/content/player-enhancer.js`
  - 每個播放器按鈕會額外掛上 `scroll` / `resize` 監聽與未追蹤的 `setInterval()`。
  - 缺少 teardown，對 SPA 或反覆替換播放器的頁面有長時間效能風險。

- `P2` `extension/popup-player/popup-player.js`
  - `Auto Fit` 只在 remote 模式被停用，但實際 resize 只在 `currentVideo` 存在時才有效。
  - 結果是 `iframe` 模式看得到按鈕，但按下去沒有作用，屬於 UI / 行為不一致。

- `P3` `extension/_locales/zh_TW/messages.json`
  - popup-player 仍有明顯英文殘留，例如 `Video`、`Embed`、`Play`、`Shield On`、`Auto Fit On/Off`。

- `P3` `tests/core/run-core-tests.js` / `tests/test-popup-player.html`
  - 測試沒有真正覆蓋 popup-player 的實際執行路徑。
  - 核心測試主要停在 helper / smoke case，手動頁也未覆蓋 `iframe`、`remote`、`pin`。

### 第二輪補查

- `P1` `extension/popup-player/popup-player.html`
  - timeline / volume / speed 等主要控制項缺少清楚 label / `aria-label`。

- `P1` `extension/content/player-enhancer.js`
  - 浮動 `🎬` 入口基本上是 hover-only。
  - 鍵盤使用者幾乎無法發現入口，觸控裝置也沒有穩定顯示機制。

- `P2` `extension/popup-player/popup-player.html`
  - 幾乎沒有 keyboard focus 樣式，且有把 range 的 outline 拿掉。
  - 小視窗高度下也有被擠壓和截斷的版面風險。

- `P2` `extension/popup-player/popup-player.html` / `extension/popup-player/popup-player.js`
  - icon-only theme button 缺少穩定的可達命名與狀態更新。

- `P2` `extension/content/player-enhancer.js`
  - listener / timer cleanup 問題再次被確認，是優先修項。

## 當時產出的正式文件

- `docs/POPUP_PLAYER_YOLO_PLAN.zh-TW.md`

此文件已存在 repo，內容與 scrollback 一致，包含：

- 修正順序
- 驗證方式
- 暫不處理範圍
- 完成定義

## scrollback 中明確記錄的已落地修改

scrollback 顯示外部 `codex` 當時已完成第一輪修正，包含：

- 為 popup 視窗補 `focus-visible`
- 為 timeline / volume / speed / theme 補 `aria` 命名
- 修正 `Auto Fit` 僅在真正可作用的 video 模式啟用
- 讓浮動 `🎬` 入口支援 `focus` / `touch`，不再只靠 hover
- 為 popup 入口按鈕補 listener / interval cleanup
- 補 `zh_TW` / `en` locale 中最顯眼的 popup-player 字串
- 新增 popup 相關 core tests

scrollback 中提到的修改檔案：

- `extension/popup-player/popup-player.html`
- `extension/popup-player/popup-player.js`
- `extension/content/player-enhancer.js`
- `extension/_locales/zh_TW/messages.json`
- `extension/_locales/en/messages.json`
- `tests/core/run-core-tests.js`

## 目前 worktree 比對結果

已確認下列修改目前仍可在檔案中找到：

- `extension/popup-player/popup-player.html`
  - 存在 `.btn:focus-visible`
  - timeline / volume / speed 使用 `data-i18n-aria-label`
  - theme button 具 `data-i18n-aria-label`

- `extension/popup-player/popup-player.js`
  - theme button 會設定 `aria-label`
  - 仍可見 `remoteControlPreferred`、remote sync interval 清理

- `extension/content/player-enhancer.js`
  - popup button 有 `aria-label` / `title`
  - 存在 `refreshTimer` / `disposed`
  - 存在 `clearInterval(...)` 與多組 `removeEventListener(...)`
  - 存在 `shouldPreferIframePopup(...)`

- `extension/_locales/zh_TW/messages.json`
  - 存在 `popupPlayerTimelineAria`
  - 存在 `popupPlayerVolumeAria`
  - 存在 `popupPlayerSpeedAria`
  - 存在 `popupPlayerThemeAria`

- `extension/_locales/en/messages.json`
  - 存在對應的英文 key

- `tests/core/run-core-tests.js`
  - 存在 `shouldPreferIframePopup` 相關測試

## 已知限制

- 目前找到的是 session scrollback 與計畫文件，不是另一份獨立命名的完整 audit report。
- 沒有從 pane B 找到額外報告輸出。
- scrollback 也明確寫到：當時沒有做 live browser 實機巡檢，結論屬於靜態檢視 + 既有測試驗證。

## 建議後續

若要延續當時的工作，最自然的下一步是：

1. 先以目前 worktree 為準，確認上述 popup-player 相關修改是否都仍符合預期
2. 補一輪 live browser 實機檢查，專查：
   - `video / iframe / remote` 三種模式
   - `Auto Fit` 狀態矩陣
   - popup 入口在 keyboard / touch 下的可發現性
3. 若要正式存檔為可引用審查資料，可再將本文件整理為更短的 decision / audit snapshot
