# Protection Status Contract

> 日期：2026-04-25
> 範圍：Batch B MVP，僅定義狀態語義與純函式 contract，不改 UI 版面、不改權限、不擴 MAIN world。

## 1. 目的

Popup 與 dashboard 需要用同一套 vocabulary 解釋目前保護狀態，避免使用者把「沒有事件」、「保護停用」、「白名單降干預」、「嚴格模式」與「AI advisory」混為一談。

## 2. Contract

`extension/shared/protection-status.js` 提供：

- `buildProtectionStatus(input)`
- `MODES`
- `LEVELS`

輸出欄位：

- `schemaVersion`：目前為 `1`
- `mode`：`disabled`、`whitelist_only`、`companion`、`standalone`、`ai_expanded`
- `protectionLevel`：`off`、`standard`、`hardened`
- `activeGuards`：已啟用的 guard，例如 `popup_guard`、`external_navigation_guard`、`overlay_cleanup`、`fake_video_cleanup`、`strict_mode`、`ai_advisory`
- `lastEvent`：最近事件摘要，若無事件則為 `null`
- `userOverride`：`whitelisted`、`whitelistEnhanceOnly`、`siteDisabled`、`temporaryAllowNavigation`

## 3. 優先序

狀態解析採以下優先序：

1. `disabled`：extension 關閉、blocking level 為 0、或 site disabled。
2. `whitelist_only`：host 在 whitelist 且 whitelist enhance only 開啟。
3. `ai_expanded`：AI monitor 與 advisory active，且 policy 允許 reversible actions。此狀態優先於 `standalone`，因為它描述的是目前 host 已進入 AI 強化判讀，而不是改變基礎分發模式。
4. `standalone`：standalone mode 明確開啟。
5. `companion`：預設 uBOL companion 語義。

## 4. 非目標

- 不在本批接入 popup/dashboard 視覺版面。
- 不改 manifest、host permissions、web-accessible resources。
- 不新增 content script 或 MAIN world hook。
- 不讓 AI advisory 產生 durable mutation。

## 5. Regression

最小回歸：

```powershell
node tests\protection-status\run_protection_status_contract_regression.js
```

驗證：

- disabled 不會被 AI advisory 或 strict level 覆蓋。
- whitelist-only 不會顯示 active guards。
- strict mode 只表達為 `protectionLevel: hardened` 與 `strict_mode` guard，不會被誤標成 AI mode。
- AI advisory 只在 policy 允許 reversible actions 時進入 `ai_expanded`。
- standalone 與 AI-expanded 的優先序有 regression，避免後續 UI adapter 誤解兩者邊界。
