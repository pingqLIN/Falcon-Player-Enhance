# Falcon-Player-Enhance Phase 4 Checkpoint

> 更新日期: 2026-03-31
> 狀態: P4 完成，剩餘項目已移入 Phase 5 backlog
> 範圍: `Standalone Baseline + Rule Generalization groundwork`

## 1. 本輪目標

本輪 Phase 4 不做整體規則系統大改，而是完成最小、可驗證、符合 `uBOL Companion` 邊界的 groundwork：

- 將 `popup direct` host 判斷從硬編常數抽到資料層
- 讓 `background` 與 `player-enhancer` 共用 `site-registry` 的同一份來源
- 將 `compatibility mode` host 判斷抽到 canonical `site-registry profile`
- 將 `inject-blocker` 的已知覆蓋層 selector 抽到 canonical `site-registry profile`
- 將 `anti-antiblock` 的 whitelist 判斷對齊到 canonical runtime state
- 建立正式 `Standalone Baseline` 規則清單
- 保持 player-centric 與最小防護範圍，不擴張成一般型 blocker

## 2. 完成內容

### 2.1 `site-registry.json` 升級為最小行為 schema

原本 `site-registry.json` 只提供 `domains` 清單。

本輪新增：

- `profiles.popupDirectIframeHosts`
- `profiles.compatibilityModeSites`
- `profiles.cosmeticFilter.globalSelectors`
- `profiles.cosmeticFilter.siteSelectorGroups`
- `profiles.injectBlocker.knownOverlaySelectors`

這讓 `site-registry` 不再只是 enhanced domain registry，而開始承接最小行為設定。

對應檔案：

- `extension/rules/site-registry.json`

### 2.2 `background.js` 改為讀取 schema 化的 site registry

完成項目：

- 移除 `DIRECT_POPUP_IFRAME_HOSTS` 硬編常數
- 新增 site registry state 正規化
- `getSiteRegistry` 回傳中加入：
  - `profiles.popupDirectIframeHosts`
  - `profiles.compatibilityModeSites`
  - `profiles.cosmeticFilter`
  - `profiles.injectBlocker`

對應檔案：

- `extension/background.js`

### 2.3 `player-enhancer.js` 改為共用 site registry 資料來源

完成項目：

- 移除 `boyfriendtv.com` 的硬編 popup direct host 判斷
- 初始化時透過 `getSiteRegistry` 載入 `popupDirectIframeHosts`
- `shouldOpenPopupDirectly(...)` 改為依賴資料層清單，而不是本地硬編

對應檔案：

- `extension/content/player-enhancer.js`

### 2.4 `anti-popup.js` 與 `inject-blocker.js` 改為共用 compatibility mode site profile

完成項目：

- `anti-popup` 改為讀取 `profiles.compatibilityModeSites`
- `inject-blocker` 改為以 `DEFAULT_COMPATIBILITY_MODE_SITES` 啟動後，再向 `getSiteRegistry` 對齊
- `isCompatibilityModeSite()` 改為讀取 runtime profile 狀態，而不是永久依賴本地硬編

對應檔案：

- `extension/content/anti-popup.js`
- `extension/content/inject-blocker.js`

### 2.5 `cosmetic-filter.js` 改為讀取 canonical site-registry profile

完成項目：

- 移除 `PLAYER_SITE_RULES` 與 `PLAYER_AD_SELECTORS` 硬編常數
- `cosmetic-filter` 改為透過 `getSiteRegistry` 載入 canonical config

對應檔案：

- `extension/content/cosmetic-filter.js`
- `extension/rules/site-registry.json`

### 2.6 `inject-blocker.js` 改為共用 known overlay selector profile

完成項目：

- 移除 `KNOWN_OVERLAY_SELECTORS` 作為唯一來源的做法，改由 `DEFAULT_KNOWN_OVERLAY_SELECTORS` 啟動後，再向 `getSiteRegistry` 對齊
- `removeKnownOverlays()` 改為依賴 runtime profile selector 清單

對應檔案：

- `extension/content/inject-blocker.js`
- `extension/background.js`
- `extension/rules/site-registry.json`

### 2.7 `anti-antiblock.js` 改為讀取 canonical whitelist runtime state

完成項目：

- 移除與 `background.js DEFAULT_WHITELIST` 同步維護的 `WHITELIST_DOMAINS`
- 新增 `site-state-bridge.js`，在 `document_start / ISOLATED` 將 `whitelist + whitelistEnhanceOnly` 橋接到 page world
- `anti-antiblock.js` 改為讀取 canonical runtime state，而不是自帶第二份 whitelist truth
- `anti-antiblock` 的 message listener 改為 guarded registration，避免在 `MAIN` world 因 `chrome.runtime` 不可用而中斷初始化
- 新增 `__antiAntiblockInitDone` 完成標記，將 anti-antiblock 與 inject-blocker 的共用訊號切開

對應檔案：

- `extension/content/anti-antiblock.js`
- `extension/content/site-state-bridge.js`

### 2.8 建立 regression runners

完成項目：

- `cosmetic-filter` regression page + runner
- `inject-blocker` overlay regression page + runner
- `anti-antiblock whitelist` regression page + runner
- 透過 host resolver 映射本地頁面，避免依賴外站
- `inject-blocker` regression 走真實 `applyBlockingLevel` 路徑，而不是 mock

對應檔案：

- `tests/test-cosmetic-filter.html`
- `tests/cosmetic-filter/run_cosmetic_filter_regression.py`
- `tests/test-inject-blocker-overlays.html`
- `tests/inject-blocker/run_inject_blocker_overlay_regression.py`
- `tests/test-anti-antiblock-whitelist.html`
- `tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py`

### 2.9 建立 `Standalone Baseline` 正式清單

完成項目：

- 定義沒有安裝 uBOL 時，本專案仍應提供的最小防護邊界
- 將 canonical source 與驗收標準明文化
- 將超出 `Companion Mode` 邊界的 generic blocker 擴張明確排除

對應檔案：

- `docs/STANDALONE_BASELINE_RULESET_2026-03-31.zh-TW.md`

## 3. 為什麼這樣切

這組切片符合 Phase 4 的核心目標：

- popup direct host 判斷不再重複散落
- site profile 與 popup / compatibility mode / inject-blocker overlay 行為開始共用資料來源
- anti-antiblock 的 whitelist 判斷回到 canonical runtime state

同時它避免一次把整個 rule pipeline 全部打開，降低了：

- 破壞 Phase 1-3 穩定度的風險
- 與 uBOL 一般型 blocker 邊界重疊的風險
- 半套重構帶來的資料漂移

## 4. 驗證

### 4.1 靜態檢查

已通過：

- `node --check extension/background.js`
- `node --check extension/content/anti-antiblock.js`
- `node --check extension/content/site-state-bridge.js`
- `node --check extension/content/inject-blocker.js`
- `node --check extension/content/cosmetic-filter.js`
- `node --check extension/content/player-enhancer.js`
- `site-registry.json` JSON parse 驗證
- `python -m py_compile tests/cosmetic-filter/run_cosmetic_filter_regression.py`
- `python -m py_compile tests/inject-blocker/run_inject_blocker_overlay_regression.py`
- `python -m py_compile tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py`

### 4.2 Runtime 驗證

已驗證：

- background runtime 可正確讀出 `popupDirectIframeHosts`
- background runtime 可正確讀出 `compatibilityModeSites`
- background runtime 可正確讀出 `injectBlocker.knownOverlaySelectors`
- background runtime 可正確讀出 `cosmeticFilter.globalSelectors`
- `shouldOpenPopupDirectly({ iframeSrc: 'https://www.boyfriendtv.com/embed/example' })` 回傳 `true`
- `cosmetic-filter` 可正確讀取 `profiles.cosmeticFilter` 並生成 host-specific CSS
- `inject-blocker` 可在 `STANDARD` blocking level 下依照 canonical selector profile 移除已知 overlay
- `anti-antiblock` 可在 non-whitelist 模式下隱藏 anti-adblock message，並在 whitelist 模式下保留訊息與 iframe 可見

### 4.3 回歸驗證

已重新驗證：

- `popup-open-local-video` PASS
- `pin-close-reopen` PASS
- `popup-player-state-restore` PASS
- `multi-popup-distinct-windows` PASS
- `tests/cosmetic-filter/run_cosmetic_filter_regression.py` PASS
- `tests/inject-blocker/run_inject_blocker_overlay_regression.py` PASS
- `tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py` PASS
- `test-player-detection-regression.html` 9 / 9 PASS

## 5. Phase 5 Backlog

以下工作已從 Phase 4 移入 Phase 5，避免在 groundwork 階段把範圍推進到過大：

- 將更多 popup / redirect / anti-antiblock 行為抽成 typed site profiles
- 讓其他 site-specific 分支逐步接 canonical source
- 評估哪些 standalone baseline 規則值得進一步系統化，而不跨到類 uBOL 的 generic blocker 範圍

## 6. 結論

截至 2026-03-31，本專案已完成 `Phase 4`：

- `site-registry` 開始承接最小行為 schema
- popup direct host 與 compatibility mode host 規則不再分散硬編
- cosmetic filter 與 inject-blocker 的 player-adjacent selector 規則開始回收到 canonical source
- anti-antiblock 的 whitelist 判斷也回到 canonical runtime state
- background、player-enhancer、anti-popup、cosmetic-filter、inject-blocker、anti-antiblock 的關鍵行為開始對齊到同一資料來源與 runtime state

這表示 `Rule Generalization groundwork` 已從概念階段，進入「已完成最小可驗證落地」階段，後續擴張留待 Phase 5。
