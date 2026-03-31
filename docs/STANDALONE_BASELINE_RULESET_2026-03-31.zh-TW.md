# Falcon-Player-Enhance Standalone Baseline Ruleset

> 更新日期: 2026-03-31
> 狀態: Phase 4 正式交付物
> 定位: 沒有安裝 uBOL 時，本專案仍必須提供的最小防護與播放器保護邊界

## 1. 目的

本文件定義 Falcon-Player-Enhance 在 `Companion Mode` 產品策略下的 `Standalone Baseline`。

這個 baseline 的目標不是取代 uBOL，而是確保在使用者沒有安裝 uBOL 時，仍具備最基本且高信心的：

- 播放器偵測與無干擾播放
- popup / redirect trap 最小防護
- player-adjacent overlay / fake video / bait element 清理
- whitelist / compatibility mode / site profile 對齊

## 2. 不包含的範圍

以下內容明確不屬於 Standalone Baseline：

- 通用型 tracker blocking
- EasyList / EasyPrivacy 類廣域清單覆蓋
- 一般 annoyance cleanup 競賽
- 與 uBOL 高重疊的全站 generic blocker 行為

## 3. Canonical Sources

### 3.1 Site Registry

主要來源：

- `extension/rules/site-registry.json`

目前承接：

- `profiles.popupDirectIframeHosts`
- `profiles.compatibilityModeSites`
- `profiles.cosmeticFilter.globalSelectors`
- `profiles.cosmeticFilter.siteSelectorGroups`
- `profiles.injectBlocker.knownOverlaySelectors`

消費端：

- `background.js`
- `player-enhancer.js`
- `anti-popup.js`
- `cosmetic-filter.js`
- `inject-blocker.js`

### 3.2 Runtime Whitelist State

主要來源：

- `chrome.storage.local.whitelist`
- `chrome.storage.local.whitelistEnhanceOnly`

初始化權威：

- `background.js` 內的 `DEFAULT_WHITELIST`

消費端：

- `background.js`
- `anti-antiblock.js`
- `site-state-bridge.js`
- 其他讀取 `whitelist + whitelistEnhanceOnly` 的 player-centric content scripts

### 3.3 Verification Sources

正式驗證來源：

- `tests/popup-smoke/run_popup_smoke.py`
- `tests/player-detection/run_player_detection_regression.py`
- `tests/cosmetic-filter/run_cosmetic_filter_regression.py`
- `tests/inject-blocker/run_inject_blocker_overlay_regression.py`
- `tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py`

## 4. Baseline Rule Groups

### 4.1 Popup Direct

用途：

- 對已知需要直接 popup 的 iframe host，避免 UI 層分散硬編

目前來源：

- `profiles.popupDirectIframeHosts`

### 4.2 Compatibility Mode

用途：

- 對敏感播放器站放寬侵入式清理，避免誤傷播放器初始化

目前來源：

- `profiles.compatibilityModeSites`

### 4.3 Cosmetic Filter

用途：

- 以 CSS 隱藏高信心 player-adjacent 廣告/覆蓋元素

目前來源：

- `profiles.cosmeticFilter.globalSelectors`
- `profiles.cosmeticFilter.siteSelectorGroups`

### 4.4 Inject Blocker Overlay Cleanup

用途：

- 在 MAIN world / `STANDARD` blocking level 下移除已知 overlay selector

目前來源：

- `profiles.injectBlocker.knownOverlaySelectors`

### 4.5 Whitelist Runtime State

用途：

- 在白名單網站上維持「只增強、不過度清理」的 companion-friendly 行為

目前來源：

- `chrome.storage.local.whitelist`
- `chrome.storage.local.whitelistEnhanceOnly`

## 5. 驗收標準

Standalone Baseline 應滿足：

- 非影片元素不應被誤判為可操作播放器
- popup player 主路徑可開啟並維持基本 state restore
- high-confidence cosmetic selector 與 inject-blocker overlay selector 可正確作用
- compatibility mode 與 whitelist 模式不應因分散硬編而漂移

## 6. 與 uBOL 的關係

本 baseline 的設計前提是：

- 預設假設使用者可能同時安裝 uBOL
- 本專案不與 uBOL 競爭一般型 blocker 覆蓋
- 即便沒有 uBOL，仍有最小可信防護

一句話定義：

- `uBOL blocks the web; Falcon rescues the player.`
