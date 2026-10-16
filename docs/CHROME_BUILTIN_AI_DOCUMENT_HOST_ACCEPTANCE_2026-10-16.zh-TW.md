# Falcon Chrome Built-in AI — Document Host 修正與驗收

日期：2026-10-16（Asia/Taipei）
分支：fix/chrome-builtin-document-host-20261016
專案：D:\projects\Falcon-Player-Enhance
主機：Pacomo / Chrome Dev 157.0.8092.0 / MV3

## 背景與原因

1. 原本 Health Check、政策建議、元素分類三條路徑直接在 background service worker 呼叫 globalThis.LanguageModel；官方 Prompt API 文件至 2026-08-26 表示 Web Workers 尚不受支援。即使 Chrome Dev 157 在 worker 暴露物件，也不應視為受支援的模型會話環境。
2. Health Check 曾將 ready 模型的 prompt() 限制為 3,000 ms；在模型初始化時容易產生 request_timeout，不能據此判定下載或模型損毀。
3. Dashboard 原先將 Chrome 的模型管理呈現為「No discovered models yet」，但公開 Prompt API 不提供實際 Gemma 4B / 12B 版本的模型清單或強制選取。

## 架構與執行邊界

- Background service worker 保有治理、工作排程、Provider 設定及風險處理。
- extension/ai/chrome-prompt-host.html + chrome-prompt-host.js 是真正的 document context；採 chrome.offscreen 按需建立，且僅保存不含個資的 availability 摘要於 localStorage（對應 Offscreen LOCAL_STORAGE 理由）。
- Background 與 Host 透過 chrome.runtime 訊息進行白名單操作：availability、params、create、prompt、destroy；限制單次 prompt 長度及會話數，逾期回收。
- Service Worker 的 AbortSignal 不可跨 chrome.runtime 訊息傳輸：代理層剝離 signal，維持 Worker 側的終止等待及延遲建立會話的清理；模型推論在文件端套用 timeout signal。
- Host 驗證訊息為本擴充 chrome-extension:// origin，防止一般網頁 content script 假冒背景 AI 工作。
- 背景建立 Session 前由 Host 二次確認 availability 為 ready；不可用、下載中或可下載狀態不會自行呼叫 create()，亦不修改 Chrome 模型目錄。
- Model Host 按需啟動並可在無 Dashboard/Side Panel 畫面時執行；惟 Chrome MV3 生命週期仍須依 Chrome 管理，不能承諾永遠存活。

## 修正項目

- extension/manifest.json 新增 offscreen permission。
- extension/background.js 以 Document Host Broker 取代直接在 Worker 操作 LanguageModel，健康檢查推論時間由 3 秒改為 30 秒，冷啟動 timeout 至少 45 秒，遠端 Session 銷毀等待完成。
- extension/dashboard/chrome-builtin-panel.js 手動診斷推論依設定 timeout 而非固定 10 秒；無法使用模型時區分「可下載」與「不可使用」的處理指引。
- extension/dashboard/dashboard.js Chrome 供應者顯示真實限制：不提供可列舉的模型清單，並指出 chrome://settings/system → On-device AI 與 chrome://on-device-internals。

## 驗證範圍與命令

從專案根目錄執行：

- node tests/ai/run_chrome_document_host_broker_regression.js
- node tests/ai/run_chrome_document_host_browser_e2e.js
- npm run test:ai:chrome-builtin-contract
- npm run test:ai:zero-setup
- npm run test:ai:provider-profiles
- npm run test:ai:chrome-builtin-element
- npm run test:ai:chrome-usecases
- D:\projects\.falcon-test-venv\Scripts\python.exe tests/side-panel/run_side_panel_behavior_regression.py --headless
- D:\projects\.falcon-test-venv\Scripts\python.exe tests/side-panel/run_ai_candidate_clickability_regression.py --headless

Chrome Dev 157 官方品牌版已移除 --load-extension 參數。實機 E2E 測試採獨立 Profile 與 DevTools Protocol Pipe，使用 --enable-unsafe-extension-debugging + Extensions.loadUnpacked 安裝測試擴充，不改動使用者日常 Chrome Profile。這個旗標僅限隔離測試實例。

測試紀錄：.falcon-observability/chrome-document-host-e2e/report.json
截圖：.falcon-observability/chrome-document-host-e2e/advanced-settings.png

## 測試狀態與界線

- 確認 Chrome Dev 真正安裝並載入 Falcon 4.4.2 測試擴充。
- 確認 Background → Document Host 存在、LanguageModel API 可用、訊息呼叫通暢。
- 確認 Advanced and provider-specific settings：Chrome Provider 顯示、Advisory、Sampling runtime/custom、temperature、topK、語言、timeout、cooldown、responseConstraint、候選規則、Save、Provider isolation、切換回復、Reset 僅修改未儲存草稿。
- Side Panel 行為與 Candidate UI 測試通過。
- 隔離測試 Profile 的 availability 回傳 unavailable；未執行模型下載，未完成真實 Gemini Nano prompt 成功驗收。此狀態不可等同使用者日常 Profile。
- 日常 Chrome Dev Default Profile 需由使用者重新載入 Falcon 擴充，才能接收新 manifest 與 Broker 程式碼，進行真實推論與效能驗收。

## Chrome 模型資產共用治理：獨立待修項目

2026-10-16 唯讀檢查發現：
- Stable: Chrome\User Data\OptGuideOnDeviceModel\2025.8.8.1141\weights.bin，4,269,932,544 bytes，File ID 0x0000000000000000000300000001fe17。
- Dev: Chrome Dev\User Data\OptGuideOnDeviceModel\2025.8.8.1141\weights.bin，大小相同，File ID 0x0000000000000000000200000008fc1c。
- 兩者都不是 Junction／符號連結，hardlink list 亦各只有自身路徑。故單一 Stable 來源的模型資產政策尚未落實。
- 不可在 Chrome Dev 使用中直接改名、覆蓋、移除或重新映射 4GB 權重；這個治理修復應由 Shared Assets / DevGov 工具在 Chrome 關閉時執行，必須先做對應 Manifest、模型狀態、交易式備份及重開驗證，避免 Falcon 專案自行承擔 Chrome 資產治理。

## 待驗收條件

1. 於日常 Chrome Dev Default 重新載入 Falcon 擴充後，確定 Offscreen Host 成立。
2. Chrome Built-in 採當前儲存的設定進行 Health Check，回傳 available 且成功 create → prompt → destroy；若 unavailable，先檢查 Chrome Settings → System → On-device AI 及 chrome://on-device-internals 的實際原因。
3. 分別觸發一筆實際 Policy Advisory 與 Element Classification；觀察 trace 包含 chrome_builtin_result 而非 timeout / unsupported。
4. 在授權的 Chrome 關閉維護窗口由 DevGov 完成 Stable 資產映射，重新驗證檔案來源及 Chrome Model readiness。
