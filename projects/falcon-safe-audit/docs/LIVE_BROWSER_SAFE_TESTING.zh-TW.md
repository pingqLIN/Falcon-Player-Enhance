# Live Browser 安全測試流程

這份流程用來在暫時關閉防毒或其他網路層防護時，仍維持可接受的測試隔離。

## 目標

- 讓父層 Falcon extension repo 的 `tests/live-browser/browser_judge.py` 能對真站做 5 到 10 個樣本 audit
- 減少測試過程污染日常主機環境、瀏覽器 profile、帳號 session 的風險
- 讓測試輸出固定落在本專案的 `runs/`

## 最佳解

優先順序：

1. `Windows Sandbox`
2. 可丟棄的 host browser profile

原因：

- `Windows Sandbox` 提供一次性 OS 隔離，最接近你要的「先關防毒但不讓主機裸奔」
- 但 Sandbox 預設沒有 Python、Playwright 與瀏覽器快取，因此需要額外把 host 依賴以只讀方式映射進去
- 若當前機器的 Sandbox 功能不可用或執行失敗，回退到 repo 內建的 disposable profile runner

## Runner

使用：

```powershell
pwsh ./scripts/run-live-browser-audit-safe.ps1 -Mode Auto -SampleCount 10 -Headless -LaunchSandbox
```

第二輪或後續批次可用 `-ExcludeReport` 排除前一輪已測 URL：

```powershell
pwsh ./scripts/run-live-browser-audit-safe.ps1 `
  -Mode Host `
  -SourceTargets tests/live-browser/targets.from-bookmarks.json `
  -ExcludeReport runs/archive/live-browser-safe/20260417-010602/live-browser-report.json `
  -SampleCount 10 `
  -Headless
```

行為：

- 從父層被測 repo 的 target 檔抽前 `N` 個樣本
- 建立一次性輸出目錄：
  - `runs/live-browser-safe/<timestamp>/`
- 優先嘗試：
  - 產生 `.wsb`
  - 啟動 `Windows Sandbox`
  - 在 Sandbox 內執行 `browser_judge.py`
- 若 Sandbox 不可用或超時：
  - 回退到 host 上的 disposable browser profile

## 安全邊界

即使只跑 host fallback，也要遵守：

- 不登入任何正式帳號
- 不使用日常瀏覽器 profile
- 測試報告與 profile 都只能寫進本專案的 `runs/`
- 不把 `Downloads`、`Documents`、雲端同步目錄映射成可寫共享

## 產物

每次執行至少會留下：

- `live-browser-sampled-targets.json`
- `live-browser-report.json`
- `sandbox-started.json`（Sandbox guest script 一進入就會寫）
- `sandbox-bootstrap.log`（Sandbox guest 啟動與 Python preflight 診斷）
- `judge-console.log`（Sandbox 模式）
- `run-complete.json`（Sandbox 模式）
- `sandbox-launch.log`（Sandbox 模式）
- `sandbox-host-evidence.txt`（Sandbox timeout 時自動擷取的 host 端錯誤證據）
- `screenshots/`
- `browser-profile/`

`live-browser-report.json` 的結果判讀：

- `pass`: 可播放 detail page，且本輪 audit 沒看到回歸
- `invalid_target`: 抽樣到 listing/index page，應視為 target pool drift，不算 player-detection regression
- `fail`: 仍需處理的真實 blocker，例如 security interstitial、導流、overlay、或可信 player 缺失

## 目前驗證狀態

- 已驗證可穩定完成：
  - host disposable browser profile 模式
- 已驗證可正確產生：
  - Windows Sandbox `.wsb`
  - guest 執行腳本
  - launch 診斷 log
- 已補強：
  - host 端可區分「Sandbox 已啟動但 guest script 沒跑」與「guest 已跑但未完成」
  - Sandbox timeout 時會自動抓 `Application Error` / `Windows Error Reporting` 證據
- 尚未在此主機完成：
  - Windows Sandbox end-to-end 回寫 `run-complete.json`

因此目前的實務建議是：

1. 真站批次測試先使用 host disposable profile
2. 若要把 Sandbox 升級為正式主流程，先處理 host 端的 Sandbox feature / guest 啟動問題

## 目前已知阻塞

最新 host-side 證據顯示：

- `WindowsSandbox.exe` 會被呼叫
- 但 2 秒內已沒有存活中的 `WindowsSandbox` process
- guest 端沒有寫出 `sandbox-started.json`
- host 端 `Application Error` / `.NET Runtime` 顯示：
  - `WindowsSandboxRemoteSession.exe` 啟動即崩潰
  - 未處理例外來自缺少 `WinRT.Runtime, Version=2.2.0.0`

代表目前問題不在本專案的 guest script，也不在 `browser_judge.py`，而是在這台機器的 Windows Sandbox host runtime。

後續更進一步確認：

- Sandbox 套件目錄內其實有 `WinRT.Runtime.dll`
- 該 DLL 的 assembly version 也是 `2.2.0.0`
- 因此目前阻塞已收斂為：
  - host component store / package load chain 損壞

另外本輪嘗試過：

- `DISM /Online /Cleanup-Image /RestoreHealth`

結果：

- 失敗碼 `0x800f0915`
- 需要改用 `/Source`

修復細節與下一步請看：

- [WINDOWS_SANDBOX_HOST_REPAIR.zh-TW.md](Q:\Projects\Falcon-Player-Enhance\projects\falcon-safe-audit\docs\WINDOWS_SANDBOX_HOST_REPAIR.zh-TW.md)

## 判讀原則

- 若結果落到 `security interstitial`，先視為環境阻擋，不直接歸咎於 extension heuristics
- 若 managed host 發生 popup / same-tab 導流，才進一步回頭檢查 `inject-blocker.js`、`background.js`、`ai-runtime.js`
