# Falcon AI Observability／外部 AI 診斷模式

日期：2026-10-11（台北時間）
專案：D:\projects\Falcon-Player-Enhance

## 使用方式

1. 在 `chrome://extensions/` 將本機 Falcon-Player-Enhance 擴充功能「重新載入」。進入 Falcon Dashboard 的 AI 設定，展開 **AI Observability / 外部 AI 除錯**。
2. 從「Observe website」選定目前開啟的網站 hostname。按 **Start 15-min capture**。預設僅記錄結構化遙測、風險與 Prompt API 執行狀態；自動在 15 分鐘後停止。可隨時按 **Stop capture**，記錄仍可匯出直到期限屆滿。
3. 瀏覽該網站並觸發相關事件。若使用 Chrome Built-in AI，選擇提供者並啟用；Chrome Built-in AI 版塊另提供 **Run diagnostic Prompt API inference**，此動作在使用者點擊後直接從 Dashboard 的擴充功能頁執行。每三秒重新整理開啟的觀測面板。
4. 按 **Export JSON** 可將保留的 trace 手動交給外部 AI 檢查；按 **Clear trace** 刪除。開啟「Include model output excerpts」才會記錄最多 1,600 字的模型輸出節錄，而且需再次確認；基本遮蔽不是隱私保證，不建議使用於敏感網站。
5. 如需同時讓外部 AI 透過本機 MCP 讀取持續更新的 JSONL 記錄：在命令列執行 `node scripts/ai-observer-bridge.js`（PowerShell 先進入專案路徑）。服務只監聽 `http://127.0.0.1:38271`。複製服務啟動訊息中的 **Observer token** 貼到 Dashboard「Local bridge token」再啟動觀測。外部 AI 在取得使用者授權之本機檔案存取後，可讀取 `D:\projects\Falcon-Player-Enhance\.falcon-observability\latest.ndjson`。按 Ctrl+C 關閉橋接服務。

## 事件串流

- `page_navigation`：Chrome WebNavigation 確認的分頁／frame 導覽紀錄，只包含 hostname、tabId、frameId 及 transition type。
- `page_telemetry_batch`：風險事件種類、來源、severity、confidence、分數前後、riskTier、Policy Gate mode/reason。
- `chrome_builtin_availability`：模型可用性、language、Temperature、Top K、Response Constraint 等設定。
- `chrome_builtin_request`：Falcon 自行發起的 Prompt API task、promptChars、model。
- `chrome_builtin_result`：latencyMs、responseChars、confidence、riskScoreDelta 或 element classification 的類別與建議動作。模型文字僅在明確開啟後提供節錄。
- `chrome_builtin_error`：執行失敗時的錯誤類型，不含原始 exception 字串或 prompt。
- `chrome_builtin_manual_probe`：使用者在 Dashboard 主動執行的 Chrome Prompt API 小型測試。

## 設計邊界與治理

- **預設關閉**，限定單一 hostname，最長 15 分鐘；不進行自動傳輸到任何外部 AI 雲端。
- 紀錄最多保留 250 筆，放在 `chrome.storage.session`，不寫入長期 `storage.local`。Stop 不立即刪除，以便匯出；期限到期或 Clear 會刪除。
- 本機橋接只有在使用者另行啟動 Node 程式、輸入隨機權杖並在 Dashboard 明確確認時，才會接收限定範圍 trace。服務拒絕非 extension Origin 與無效 token，且對 payload 設有限制。輸出目錄已加入 .gitignore。
- 橋接檔案仍屬使用者私人瀏覽與模型資料；外部 AI 只能在連接、授權並讀取該檔案後進行分析。系統不會自行把資料交給任何 AI 廠商。
- 只觀測 **Falcon 自行發起的 Chrome Prompt API 呼叫**和使用者觸發的 Dashboard 測試。Chrome 內部權重／注意力／token logits、其他網站及其他擴充功能的私人模型 session 無法透過這套 API 讀取。
- Chrome Built-in AI 在 Dashboard／extension page 的可用性與 background service worker 可能不同；兩者應分開紀錄與測試。MAIN world 傳來的任意網頁訊息不能直接升格為可信風險計分證據。
- **只提供調參建議，不自動更動 Policy Gate、風險閾值、Temperature 或 Top K**。變更需透過原有設定與開發流程經人工審核。
- 建議外部 AI 比對相同 hostname 的 `page_navigation → page_telemetry_batch → chrome_builtin_request → chrome_builtin_result → policy decision` 序列，針對誤判、延遲、模型輸出不一致、參數敏感度提出可驗證的修正方案。

## 回歸測試

`npm run test:ai:observability`：驗證預設關閉、單一 hostname 限定、15 分鐘到期、輸出 opt-in／遮蔽、停止可匯出、trace 最小化、橋接 token／Origin 權限、localhost JSONL 存檔及無憑證落盤。

`npm run test:ai:risk-telemetry`、`npm run test:ai:chrome-builtin-contract`、`npm run test:ai`、`npm run test:e2e-replay`：持續核對不影響原有政策計算。

實際瀏覽器整合測試需在本機載入新版本擴充功能後操作；這些 Node 合約測試不能取代真實網站驗收。
