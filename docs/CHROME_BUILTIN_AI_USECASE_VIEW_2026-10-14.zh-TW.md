# Falcon — Chrome Built-in AI Use Cases / Model Assets 檢視介面

狀態：2026-10-14 隔離分支實作；2026-10-15 已在整合候選的實際 Chromium 擴充頁驗證匯入與導覽，未部署至日常 Chrome；不修改既有模型。
分支：\`feat/chrome-builtin-usecases-panel-20261014\`

## 使用方式

開啟 Falcon 的 Dashboard，選取 Chrome Built-in AI 供應者，再展開「Chrome Built-in AI · Use Cases / Model Assets (read-only)」。

1. **Open original chrome://on-device-internals**：直接於目前 Chrome 開新的官方內部診斷頁。Chrome WebUI 是權限受保護的介面，擴充不得透過一般 content script 讀取其 DOM；這不是嵌入 iframe，也不是私有 Mojo API 通道。
2. **Check public API availability**：使用者明確點擊後，依序向 LanguageModel、Summarizer、Writer、Rewriter、Proofreader、LanguageDetector 的公開 \`availability()\` 查詢（只在目前 Extension context 且方法存在時）。不呼叫 \`create()\` 或變更 Requested；部分查詢仍可能造成背景模型下載。結果不等於模型識別資訊。
3. **Broker Use Cases snapshot (JSON)**：匯入由 Chrome Broker Lab 的授權唯讀快照所產生的 JSON，顯示每個 Use Case 的 Requested／Unavailable Reason／Availability。匯入是歷史快照，不可標為 live。
4. **Per-model asset inventory (JSON)**：匯入 DevGov \`scripts/chrome-ai/model-inventory.mjs\` 輸出的報告，依 Profile 與 Asset ID 展示每筆檔案狀態、Manifest 模型名稱、版本、儲存是否與 Stable 共用、公開 API 是否測試。
5. 導入資料只留在當次頁面記憶體，無上傳、無儲存 Token；最多接受 1MB JSON，文字使用 \`textContent\` 輸出。

DevGov 產生報告示例（從其隔離 worktree 執行，預先選定合適可寫的輸出位置）：

\`\`\`powershell
node scripts/chrome-ai/model-inventory.mjs --policy registry/chrome-ai-model-allocation.policy.json --profile "Falcon=D:\projects\Falcon-Player-Enhance\.falcon-observability\chrome-cdp-profile" --output "D:\projects\.governance\reviews\ChromeAI-inventory.json"
\`\`\`

可選 \`--snapshot <json-file>\` 加入既有的 Broker 快照，不要使用含憑證或完整原始 User Data 的資料。建議只讀取專案既有 \`.falcon-observability/model-selection-lab/...\` 裡經過遮蔽的快照。

## 與既有 Broker Bridge 的責任邊界

既有 Falcon localhost \`/v1/snapshot\` 需要 Bearer Token 且會拒絕帶 \`Origin\` 的瀏覽器流量。**不要改為允許 Extension 直接存取受保護的控制端點。** 目前面板用「匯入經授權的唯讀 JSON」提供跨程式資料投影。若未來需要 live 狀態，需獨立開發經明確授權、僅回傳篩選後欄位的 Native Messaging 讀取器，並維持寫入禁止。

## 限制與驗收

- 官方公開 API 無法查詢指定 Gemma 4B/12B 的確實路由。Requested 也不是模型選取。
- 組態 Snapshot 的採集時間、來源與 Chrome Profile 必須與資料一起保留；此面板不認定上傳檔案本身等於信任來源。
- 現有程式未對 Chrome Flags、Local State、Profile 模型目錄、ACL、Junction、下載及使用者資訊執行任何修改。
- Node 假 DOM 測試 \`node tests/ai/run_chrome_usecase_panel_regression.js\` 驗證導覽、載入 Broker/Inventory、使用者主動檢查 API、缺失 DOM 風險。
- 2026-10-15 實際 Chromium 153.0.8010.12 擴充 UI 驗收：打開 AI 與二級設定，匯入合成 Broker / Asset inventory JSON，確認列內容及「Historical snapshot, NOT LIVE」「File states are not Runtime readiness」標示。Overview / AI 導覽可操作。
- 這次未點擊公開 API availability 檢查、未開 Chrome 內部頁、未下載模型或推論。這些動作的 runtime 行為仍不屬於上述匯入／導覽驗收。
