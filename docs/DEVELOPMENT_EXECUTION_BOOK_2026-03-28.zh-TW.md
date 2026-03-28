# Falcon-Player-Enhance 開發執行書

> 更新日期: 2026-03-28
> 執行模式: YOLO mode + 子代理通盤審查
> 目的: 收斂目前已驗證修補、未完成缺口、以及下一階段執行順序

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

### 1.3 本輪已跑過的新鮮驗證

已通過：

- `node --check extension/content/inject-blocker.js`
- `python -m unittest discover -s tests/live-browser -p "test*.py"`

## 2. 子代理通盤審查摘要

### 2.1 popup / live-browser 驗證線

子代理結論：播放器彈窗這條線目前仍有三個高優先缺口。

1. `pinned popup` 的跨 session restore 尚未真正成立
   - `loadPinnedPopupPlayers()` 目前會直接刪除不存在的 `windowId`
   - 因此瀏覽器重開或 service worker 重啟後，已釘選 popup 不會恢復

2. popup window 本體不會恢復播放狀態與視覺狀態
   - 目前只會靠 query params 重建 payload
   - `currentTime`、`volume/mute`、`playbackRate`、色彩/溫度等 UI 狀態都會重置

3. popup / direct-popup / popup window 的自動化驗證仍明顯不足
   - `browser_judge.py` 偏被動巡檢，不會真的操作 popup button
   - `tests/test-popup-player.html` 仍偏手動頁面
   - repo 內既有 smoke report 還留有舊專案路徑 artifact

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

- `loadPinnedPopupPlayers()` 改成「重建 pinned popup」而不是「清掉失聯 entry」
- popup-player 增加最小 session state restore
  - 最少先補 `currentTime`
  - `volume / muted`
  - `playbackRate`
  - `visualState.temperature`
- 補一支真正會操作 popup button 的 e2e / Playwright smoke
- 將 popup direct / remote / direct-popup overlay 的驗證鏈收斂成可重跑 smoke subset

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

### Phase 4: Rule Generalization

目標：

- 把 popup direct / redirect recovery / anti-antiblock profile 從硬編 host 拉到資料層

完成條件：

- `DIRECT_POPUP_IFRAME_HOSTS` 移除
- `player-enhancer.js` 不再重複硬編 popup direct host
- `anti-antiblock.js` 至少完成第一版 typed profile

## 5. 管理備註

- 本輪子代理審查屬唯讀探索，沒有直接改檔
- 目前已落地的實作修改只有 `inject-blocker.js`
- 若下一輪要繼續 YOLO 執行，最推薦直接從 `Phase 2: Popup Reliability` 開始

