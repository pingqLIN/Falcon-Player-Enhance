# Falcon-Player-Enhance Phase 4 Checkpoint

> 更新日期: 2026-03-31
> 狀態: P4 第一個可交付切片完成
> 範圍: `Standalone Baseline + Rule Generalization groundwork`

## 1. 本輪目標

本輪 Phase 4 不做整體規則系統大改，而是先完成一個最小、可驗證、符合 `uBOL Companion` 邊界的切片：

- 將 `popup direct` host 判斷從硬編常數抽到資料層
- 讓 `background` 與 `player-enhancer` 共用 `site-registry` 的同一份來源
- 保持 player-centric 與最小防護範圍，不擴張成一般型 blocker

## 2. 完成內容

### 2.1 `site-registry.json` 升級為最小行為 schema

原本 `site-registry.json` 只提供 `domains` 清單。

本輪新增：

- `profiles.popupDirectIframeHosts`

這讓 `site-registry` 不再只是 enhanced domain registry，而開始承接最小行為設定。

對應檔案：

- `extension/rules/site-registry.json`

### 2.2 `background.js` 改為讀取 schema 化的 site registry

完成項目：

- 移除 `DIRECT_POPUP_IFRAME_HOSTS` 硬編常數
- 新增 site registry state 正規化
- `shouldOpenPopupDirectly(...)` 改為讀取 `profiles.popupDirectIframeHosts`
- `getSiteRegistry` 回傳中加入 `profiles.popupDirectIframeHosts`

對應檔案：

- `extension/background.js`

### 2.3 `player-enhancer.js` 改為共用 site registry 資料來源

完成項目：

- 移除 `boyfriendtv.com` 的硬編 popup direct host 判斷
- 初始化時透過 `getSiteRegistry` 載入 `popupDirectIframeHosts`
- `shouldOpenPopupDirectly(...)` 改為依賴資料層清單，而不是本地硬編

對應檔案：

- `extension/content/player-enhancer.js`

## 3. 為什麼這樣切

這一刀符合舊版 Phase 4 規劃中的核心目標：

- popup direct host 判斷不再重複散落
- site profile 與 popup 行為開始共用資料來源

同時它也避免一次把整個 rule pipeline 全部打開，降低了：

- 破壞 Phase 1-3 穩定度的風險
- 與 uBOL 一般型 blocker 邊界重疊的風險
- 規則供應鏈半套重構帶來的資料漂移

## 4. 驗證

### 4.1 靜態檢查

已通過：

- `node --check extension/background.js`
- `node --check extension/content/player-enhancer.js`
- `site-registry.json` JSON parse 驗證

### 4.2 Runtime 驗證

已驗證：

- background runtime 可正確讀出 `popupDirectIframeHosts`
- `shouldOpenPopupDirectly({ iframeSrc: 'https://www.boyfriendtv.com/embed/example' })` 回傳 `true`

### 4.3 回歸驗證

已重新驗證：

- `popup-open-local-video` PASS
- `multi-popup-distinct-windows` PASS
- `test-player-detection-regression.html` 9 / 9 PASS

## 5. 尚未完成的 P4 後續項目

本輪只完成了 P4 的第一個切片，以下仍屬後續工作：

- 將更多 popup / redirect / anti-antiblock 行為抽成 typed site profiles
- 讓 `cosmetic-filter`、`inject-blocker`、其他 site-specific 分支逐步接 canonical source
- 建立 `Standalone Baseline` 的正式最小規則清單

## 6. 結論

截至 2026-03-31，本專案已完成 `Phase 4` 的第一個有效切片：

- `site-registry` 開始承接最小行為 schema
- popup direct host 規則不再分散硬編
- background 與 player-enhancer 對齊到同一資料來源

這表示 `Rule Generalization` 已從概念階段，進入「小步可驗證落地」階段。
