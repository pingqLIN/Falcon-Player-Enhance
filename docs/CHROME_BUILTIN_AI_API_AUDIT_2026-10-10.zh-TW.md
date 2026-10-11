# Chrome Built-in AI / Prompt API 規範對接稽核

稽核日期：2026-10-10（Asia/Taipei）
專案：Falcon-Player-Enhance
範圍：Chrome Extension Manifest V3 的 Chrome Built-in（Prompt API / LanguageModel）Provider。其他 AI Task APIs（Writer、Rewriter、Summarizer、Translator、Language Detector、Proofreader）僅列為接口目錄，目前不視為 Falcon 已串接的執行 Provider。

## 權威文件

- Chrome Prompt API：https://developer.chrome.com/docs/ai/prompt-api（官方顯示最後更新 2026-08-26）
- Built-in AI APIs：https://developer.chrome.com/docs/ai/built-in-apis
- Get started：https://developer.chrome.com/docs/ai/get-started
- Extension Prompt API guidance：https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/chrome-extensions/references/extensions/prompt-api.md

**來源分類**：Chrome Developers 文件為官方產品/API 指引；W3C 標準化程序仍在進行，不能將 Chrome 產品文件等同於已完成的 W3C 跨瀏覽器正式標準。

## 本次修正

1. **Options 合約**：`availability(options)` 與 `create(options)` 使用同一組選項。不再因為某組語言/取樣選項 unavailable 就自動改試 sampling-only 或空 options，以免違反使用者配置而假成功。
2. **多語言宣告**：`expectedInputs` 一定含英文 `en`（系統提示詞）與使用者勾選的語言；`expectedOutputs` 採勾選的語言（目前允許 en、ja、es、de、fr）。未宣告的語言不能視為已確認支援。
3. **擴充功能取樣參數**：Chrome Extension 使用數值 `temperature` / `topK`，必須兩個同時提供或兩個都省略；自訂取樣在缺少 `LanguageModel.params()` 時明確報錯，不默默忽略設定。Web origin trial 的 `samplingMode` 不套用至本 Extension Provider。
4. **模型下載**：背景 health check 只讀取狀態，不在背景嘗試下載或將建置中誤判為可用；設定頁新增「Download / prepare on-device model」，直接由使用者點擊呼叫 `LanguageModel.create({ monitor })` 並顯示 `downloadprogress`。操作後以 Health check 驗證。
5. **Structured output**：元素分類中的 `responseConstraint` 僅在 `chromeResponseConstraint !== false` 時送出；不可支援時保留無 constraint 的回退處理，但不得把這種回退擴張至語言或模態選項。
6. **現行命名空間**：使用 `LanguageModel`，不再以過時的 `self.ai.languageModel` 做推論入口。
7. **介面同步**：設定載入後才偵測該 Provider 的 capability，避免切換 Provider 時以其他 Provider 暫存參數做 probe。

## 狀態與風險

- **已驗證**：原始碼契約、模擬 API 選項、Chrome Built-in 元素分類既有回歸、Provider 設定隔離。
- **尚待實機驗證**：安裝中的 Chrome extension service worker 是否暴露 `LanguageModel`，特定硬體是否回傳 `available` / `downloadable`，模型實際下載及 `downloadprogress`、日文/西文等語言是否在該設備支援。
- **依設備而異**：Chromium 版本、OS、磁碟空間、裝置能力、on-device model 組態會影響 availability；不可因 extension 介面能顯示選項就宣稱可實際推論。
- **能力邊界**：Falcon 的 AI 仍為 advisory / 可逆措施，不能將模型輸出視為無審核的永久封鎖規則。
- **追蹤來源注意**：現有 Chrome Built-in AI 週期排程所引用的 Google Doc 實際標題是「Gemini In-App API 整合操作指南」，涵蓋 Android ML Kit GenAI / AICore 與 Firebase AI Logic，不是 Chrome Built-in AI 的權威基準。應改用上方 Chrome Developers URL 作為主要追蹤來源；本次未修改該排程。

## 本機驗證命令

```powershell
Set-Location 'D:\projects\Falcon-Player-Enhance'
npm run test:ai:chrome-builtin-contract
npm run test:ai:chrome-builtin-element
npm run test:ai:provider-profiles
node --check extension/background.js
node --check extension/dashboard/chrome-builtin-panel.js
git diff --check
```

## 實機驗收（需重新載入擴充功能）

1. 於 `chrome://extensions` 重新載入未封裝的 Falcon Player Enhance，進入 AI Provider → Chrome Built-in。
2. 使用不同語言與 sampling 設定，觀察頁面 probe 與 Health check 是否一致。若任何選項不支援，應明確失敗，不能不告知而改為其他語言配置。
3. 對 `downloadable` 狀態，在使用者主動按下下載按鈕前，不應啟動模型下載；按下後才顯示下載進度，完成後重新檢查。
4. 關閉 JSON response constraint，確認元素分類 prompt 不附 `responseConstraint`；開啟時使用 JSON Schema，遇到不支援才進行純文字回退。
5. 在相容裝置驗證 Prompt API session 的 create → prompt → destroy 與狀態記錄，並確保 Service Worker lifecycle 不會導致未清理的資源占用。

本文件記錄程式碼與文件稽核，不代表已在真實 Chrome 執行上述五項實機驗收。
