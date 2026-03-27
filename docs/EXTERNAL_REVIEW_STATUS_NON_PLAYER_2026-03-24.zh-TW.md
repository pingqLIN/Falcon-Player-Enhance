# Falcon-Player-Enhance 外部審查進度說明（播放器外）

日期：2026-03-24  
範圍：本文件僅整理主程序進度，不包含「播放器 / 無干擾播放器 / popup-player」那條工作線。

## 一、此次審查範圍

本輪希望外部審查聚焦在以下主程序面向：

- Extension 穩定性與基本可載入性
- Dashboard 設定與持久化行為
- `Block Element` 的使用者流程與資料持久化
- site-specific 邏輯往「通用引擎 + 文本規則」重構的進度
- 秘密資料處理策略與後續原生安全儲存方向

不在本輪範圍內：

- `popup-player`
- `無干擾播放器`
- popup-player UI/UX 細部調整
- 播放器專用體驗優化

## 二、已完成項目

### 1. 基礎穩定性修正

- 修正 extension 無法載入的 locale placeholder 問題
- 修正右鍵 action context menu duplicate id 問題
- 修正 `anti-antiblock.js` 在 MAIN world 直接碰 `chrome.runtime` / `chrome.storage` 時可能造成的崩潰
  - 現在在 extension API 不可用時會安全降級，不再直接中止整支腳本

### 2. `Block Element` 功能完成一輪實用化

- 使用者確認後會立即隱藏目標元素
- 同時保存多組 selector candidates，而不是只記單一 selector
- `background + cosmetic-filter` 的資料流與持久化已接通
- 等於目前已形成：
  - 選取元素
  - 立即生效
  - selector 候選保存
  - 後續重載仍可持續套用

### 3. Dashboard 的 AI provider 設定重構

- API key 改為「每個 provider 分開保存」，不再共用單一 key
- Dashboard 內輸入中的 key 會保留為 draft，不會因切 provider / 改 mode / 改 endpoint 被立刻清掉
- autosave 已補上，但 secret 與一般設定分流：
  - 一般設定可 autosave
  - key 只在確認時提交，避免 draft 被意外覆蓋

### 4. 保護功能開關改為獨立控制

Overview 中原本同步切換的保護功能，已改為各自獨立開關，目前可分開控制：

- `Auto overlay removal`
- `Popup blocking`
- `Fake video removal`
- `Playback progress sync`

### 5. Secret handling 文檔與治理入口

已新增：

- `Q:\UniText\SECRET_HANDLING_GUIDELINES.md`

並已串到：

- `Q:\UniText\INDEX.md`
- `Q:\UniText\README.md`
- `Q:\UniText\OPERATIONS.md`

目前狀態是：

- 文件策略與儲存模型已到位
- 真正的 Windows `DPAPI` / native host 尚未實作

### 6. site-specific 永久邏輯的通用化重構已開始落地

已完成的基礎設施：

- 建立重構計畫文件  
  - `docs/SITE_RULE_GENERALIZATION_PLAN.zh-TW.md`
- 建立現況盤點文件  
  - `docs/SITE_SPECIFIC_LOGIC_INVENTORY.zh-TW.md`
- 建立初版規則檔  
  - `extension/rules/site-behaviors.json`
- 建立驗證器並接入檢查流程  
  - `scripts/validate-site-behaviors.js`
  - `npm run check` 已包含 `check:site-behaviors`
- 建立 content-side 共用 profile helper  
  - `extension/content/site-profile.js`

已接上規則層的模組：

- `anti-popup.js`
  - 不再使用本地 `COMPATIBILITY_MODE_SITES` 常數
  - 改由 profile capability 判斷 compatibility mode
- `background.js`
  - popup routing 不再依賴 `DIRECT_POPUP_IFRAME_HOSTS`
  - 改由 `site-behaviors.json` 中的 `forcePopupDirect` / `popupMode` 決定
- `overlay-remover.js`
  - `SAFE_MEDIA_HOST_PATTERNS` 已改為讀取 profile 的 `safeMediaHosts`

這代表目前不是只有文件規劃，而是：

- 規則檔
- 驗證器
- matcher/helper
- 第一批 runtime 消費者

這條鏈已經真的接通。

## 三、已完成驗證

已跑過並通過：

- `node --check`（相關 background / content / dashboard / validator）
- `node tests/core/run-core-tests.js`
- `npm run check`
- Dashboard provider autosave 的 live-browser 驗證

目前代表：

- 語法層沒有已知錯誤
- core smoke tests 維持通過
- 新增的 `site-behaviors.json` 也有 validator 保護

## 四、目前尚未完成或刻意延後的項目

### 1. Windows 原生安全儲存

尚未完成：

- Windows `DPAPI`
- native host secret storage

目前只是先把：

- 文件策略
- provider 分離儲存模型
- UI / draft / autosave 行為

先穩定下來。

### 2. site-specific 重構仍在中途

已開工，但還沒有完全收斂的模組包括：

- `inject-blocker.js`
- `anti-antiblock.js`
- 其他仍殘留 site-specific 常數或 workaround 的 runtime 模組

尤其：

- `anti-antiblock.js` 仍是高複雜度單點
- `handleJavboysPlayer()` 類型的行為邏輯，未來不一定能 100% 純 JSON 化

## 五、希望外部審查者特別關注的問題

### A. 規則化架構是否合理

請協助審查：

- `site-behaviors.json` 的 schema 是否足以承接後續遷移
- `popupMode` / `forcePopupDirect` / `safeMediaHosts` / `antiAntiBlock` 這類 capability 分層是否合理
- runtime 是否應再更早抽出共用 `profileMatcher()`

### B. 遷移順序與回歸風險

請協助審查：

- 目前先接 `anti-popup`、`background popup routing`、`overlay-remover` 作為低風險入口，順序是否合適
- 後續處理 `inject-blocker.js` / `anti-antiblock.js` 時，是否還需要額外中繼層或測試保護

### C. provider key 的儲存策略

請協助審查：

- 目前「每 provider 分開持久化 + draft 保留 + secret/非 secret 分流 autosave」是否合理
- 在尚未導入 `DPAPI` 前，這個過渡狀態的風險敘述是否足夠清楚

## 六、審查摘要

若只用一句話總結目前主程序進度：

> 主程序已完成一輪穩定性修正、Dashboard provider 設定重構、`Block Element` 實用化，以及 site-specific 邏輯規則化的第一階段落地；目前最值得外部審查的，是規則 schema、遷移順序與 secret storage 的後續方向，而不是播放器 UI 細節。
