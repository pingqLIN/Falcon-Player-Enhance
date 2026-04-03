# Falcon-Player-Enhance 開發執行書

> 更新日期: 2026-03-28
> 執行模式: YOLO mode + 子代理通盤審查
> 目的: 收斂目前已驗證修補、未完成缺口、以及下一階段執行順序
>
> 同日追加:
>
> - 已新增 `tests/live-browser/test_popup_reliability.py`
> - 已補上兩個可重跑 smoke:
>   - `popup-open-local-video`
>   - `runtime-state-restore-on-reopen`
> - 已確認這兩個 case 可在 headless Chromium + unpacked extension 下通過
> - 已新增 `tests/popup-reliability.smoke.js`
> - 已補 `npm run test:popup-reliability`，驗證 direct-popup 與 remote mode 分流不互相覆蓋
> - 已補上 `pinned-remote-restore` smoke，Phase 2 的 remote restore 現在已有 headless 可重跑驗證

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

這一版先解的是「跨 session / runtime restart 後 pinned popup 無法恢復」的主問題；popup-player 內部播放狀態 restore 仍屬下一階段。

### 1.4 popup-player 最小 state restore 已接上 pinned 路徑

本輪已針對 `extension/popup-player/popup-player.js` 補上最小 state restore：

- 只在 pinned/reopen 路徑自動套用
- 已接上 `currentTime`
- 已接上 `volume`
- 已接上 `muted`
- 已接上 `playbackRate`
- 已接上 `temperature`

目前刻意未擴大到 `paused / loop / brightness / contrast / saturation / sharpness / hue`，避免一次改動過大。

已知產品語意提醒：

- `pinned remote restore` 目前會主動對來源頁送出 `setVolume / setSpeed / toggleMute / seekToRatio`
- 這代表「重開 pinned popup」會自動調整來源頁播放器
- 若產品後續不希望這種自動回寫，需要再補一層 user-intent 規則

### 1.5 popup close / unpin race 與 state clobber 已補上第二刀

本輪再補了兩個會直接影響 Phase 2 體感的可靠性問題：

- `togglePin()` 現在會等待 background pin/unpin 同步完成，避免使用者剛 unpin 就立刻關閉視窗時，background 還來不及吃到 `pinned:false`
- `beforeunload` 與 `cleanupAndClose()` 的 runtime state 持久化順序已改正
  - 先 persist，再 cleanup
  - 避免把剛恢復的 `currentTime / volume / muted / playbackRate / temperature` 又寫回預設值
- `remotePlayerState` 尚未回來時，runtime state 會優先保留已恢復狀態，而不是覆寫成空白初始值
- `cleanupPlayer()` 現在會一併清掉 pending persist timer，避免 close 流程尾端再寫一次過期狀態

### 1.6 direct-popup / remote mode 分流已補上第三刀

本輪再補了一個會直接影響 `direct-popup overlay` 驗證可信度的路徑問題：

- `player-enhancer.js` 不再把 direct host 的 iframe popup 一律標成 `remoteControlPreferred`
- `background.js` 現在會優先判斷 direct-popup path，再決定是否進 remote mode
- `withSenderPopupPlayerContext()` 不再把 direct host 強制升級成 remote mode

這代表 `direct-popup overlay` 路徑現在真的能被走到，不會在有 `sourceTabId` 時被 remote popup 抢走。

### 1.7 本輪已跑過的新鮮驗證

已通過：

- `node --check extension/background.js`
- `node --check extension/content/inject-blocker.js`
- `node --check extension/popup-player/popup-player.js`
- `node --check tests/popup-reliability.smoke.js`
- `npm run test:popup-reliability`
- `python -m unittest tests/live-browser/test_popup_reliability.py`
- `python -m unittest discover -s tests/live-browser -p "test*.py"`

### 1.8 popup reliability smoke 已形成第一版可重跑子集

本輪新增：

- `tests/live-browser/test_popup_reliability.py`

目前已自動驗證的 case：

- `popup-open-local-video`
  - 開 `tests/test-popup-player.html`
  - 點 `.shield-popup-player-btn`
  - 透過 extension service worker 的 `chrome.windows.getAll({ populate: true })` 驗證 popup window 與 target URL
- `runtime-state-restore-on-reopen`
  - 直接開啟 `popup-player/popup-player.html?pin=1`
  - 寫入 `currentTime / volume / muted / playbackRate / temperature`
  - 關閉後重新開啟同一路徑
  - 驗證 runtime state 已恢復
- `pinned-remote-restore`
  - 以 `tests/test-popup-player.html` 作為 source tab
  - 開啟 `remote=1&pin=1` 的 popup-player 路徑
  - 直接種入 popup runtime state，避免把 smoke 綁死在 close-persist 細節
  - 重新開啟後驗證 source page 的 `currentTime / volume / muted / playbackRate` 被 remote bridge 拉回預期值
- `direct-popup-vs-remote-routing`
  - 透過 `tests/popup-reliability.smoke.js` 直接驗證 background 路由決策
  - 確認 direct host iframe 走外站 popup / overlay 路徑
  - 確認純 remote payload 仍走 extension popup `remote=1`

這一版刻意不用 Playwright 的一般 page event 當 popup 開窗唯一訊號，因為 headless Chromium 下 `chrome.windows.create()` 建立的 popup window 不一定會以一般 `context.pages` 浮現；目前改採 background 可觀測狀態驗證 popup 開窗，對 headless 比較穩定。

## 2. 子代理通盤審查摘要

### 2.1 popup / live-browser 驗證線

子代理結論：播放器彈窗這條線目前仍有三個高優先缺口。

1. popup window 本體不會恢復播放狀態與視覺狀態
   - 這個缺口已完成第一版
   - 已補欄位：
     `currentTime`
     `volume`
     `muted`
     `playbackRate`
     `visualState.temperature`
   - 仍未擴大到：
     `paused / loop / brightness / contrast / saturation / sharpness / hue`

2. popup / direct-popup / popup window 的自動化驗證仍明顯不足
   - `browser_judge.py` 偏被動巡檢，不會真的操作 popup button
   - `tests/test-popup-player.html` 現在已有自動 smoke 消費者，但頁面本身仍偏手動驗證導向
   - repo 內既有 smoke report 還留有舊專案路徑 artifact
   - 目前最該優先補的驗證是：
     `direct-popup-overlay-smoke`
     `popup-blocked-counter`

### 2.2 rule-generalization / site-specific 收斂線

子代理結論：目前還停在「domain registry + 分散硬編 host」的過渡階段。

1. `site-registry.json` 目前只有 domain registry，還不是 behavior schema
   - `DIRECT_POPUP_IFRAME_HOSTS` 仍硬編在 `background.js`
   - `player-enhancer.js` 仍重複 host 判斷
   - `redirectRecoveryEnabled` 等行為欄位尚未正式落地

2. selector metadata / richer rule typing 與 runtime consumer 不一致
   - `ad-list.json` 已有較豐富欄位
   - 但 runtime matcher 與 dashboard 端中途被壓扁成 `string[]` 或 `{ selector, reason }`

3. `anti-antiblock.js` 仍是 host sniffing
   - `javboys` / `myvidplay` / `luluvdoo` 仍直接寫在腳本邏輯裡
   - 尚未形成 typed profile，例如 `antiAntiBlockProfile: 'javboys-cvp'`

## 3. 目前最值得優先處理的未完成項

### P0

- 完整的 main-world trust boundary 重構尚未完成
  - 目前只是 containment patch
  - page script 仍能偽造同型 `postMessage`
  - 只是已不能輕易把 protection 往下拉

### P1

- `direct-popup-overlay-smoke`
- `popup-blocked-counter`
- 將 popup direct / remote / direct-popup overlay 的驗證鏈收斂成更完整 smoke subset

### P1.5

- 先把 `site-registry.json` 升成最小行為 schema
  - `schemaVersion`
  - `iframeDirect`
  - `redirectRecoveryEnabled`
- 將 `background.js` 與 `player-enhancer.js` 的 popup direct 判斷改成共用 lookup
- 為 `anti-antiblock.js` 建立最小 typed profile
  - `none`
  - `javboys-cvp`

### P2

- selector metadata 不要在 background / dashboard 中途丟失
- 將 `pattern / iframe_host / click_signature` 納入 runtime matcher
- 清理 repo 內仍指向舊專案名稱或舊路徑的 live-browser artifact

## 4. 建議執行順序

### Phase 1: Trust Boundary Hardening

目標：

- 完成 main-world 橋接的第二階段安全收斂
- 盤點哪些設定只能由 trusted extension page 下發

完成條件：

- `inject-blocker.js` 不再接受可降級的 page-forged runtime 指令
- 有一份明確 bridge 威脅面備忘或設計說明

### Phase 2: Popup Reliability

目標：

- 讓 pinned popup 真正可跨 session 重建
- 讓 popup player 具備最小 state restore

完成條件：

- 重啟後 pinned popup 仍可重建
- `currentTime / volume / muted / playbackRate` 至少 4 個欄位可恢復

### Phase 3: Popup Verification

目標：

- 建立真實可操作的 popup smoke

完成條件：

- 至少 3 個 case：
  - `video` 模式
  - `remote/direct` 模式
  - `direct-popup overlay` 模式

目前進度：

- `video` 模式: 已完成 `popup-open-local-video`
- `runtime state restore`: 已完成 `runtime-state-restore-on-reopen`
- `remote restore` 模式: 已完成 `pinned-remote-restore`
- `direct-popup overlay` 模式: 尚未完成

建議最小 smoke suite：

- `popup-open-local-video`
  - 開 `tests/test-popup-player.html`
  - 點 `.shield-popup-player-btn`
  - 斷言新視窗 URL 指向 `popup-player/popup-player.html`
- `popup-blocked-counter`
  - 觸發測試惡意彈窗
  - 斷言沒有外站 popup 建立，且 blocked counter 有增加
- `direct-popup-overlay-smoke`
  - 觸發 direct host popup
  - 斷言 popup tab 內出現 `#falcon-direct-popup-overlay-root`
- `pin-close-reopen`
  - 切 pinned mode
  - 關閉 pinned popup
  - 確認 restore 只發生一次且 storage entry 有正確更新

### Phase 4: Rule Generalization

目標：

- 把 popup direct / redirect recovery / anti-antiblock profile 從硬編 host 拉到資料層

完成條件：

- `DIRECT_POPUP_IFRAME_HOSTS` 移除
- `player-enhancer.js` 不再重複硬編 popup direct host
- `anti-antiblock.js` 至少完成第一版 typed profile

## 5. 管理備註

- 本輪子代理審查屬唯讀探索，沒有直接改檔
- 目前已落地的實作修改為 `inject-blocker.js` 與 `background.js`
- 若下一輪要繼續 YOLO 執行，最推薦直接從 `Phase 2: Popup Reliability` 開始
