# Live Browser 安全測試流程

這份流程用來在暫時關閉防毒或其他網路層防護時，仍維持可接受的測試隔離。

## 目標

- 讓 `tests/live-browser/browser_judge.py` 能對真站做 5 到 10 個樣本 audit
- 減少測試過程污染日常主機環境、瀏覽器 profile、帳號 session 的風險
- 讓測試輸出固定落在 `tests/.clean/`

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

行為：

- 從 `tests/live-browser/targets.from-bookmarks.filtered.json` 抽前 `N` 個樣本
- 建立一次性輸出目錄：
  - `tests/.clean/live-browser-safe/<timestamp>/`
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
- 測試報告與 profile 都只能寫進 `tests/.clean/`
- 不把 `Downloads`、`Documents`、雲端同步目錄映射成可寫共享

## 產物

每次執行至少會留下：

- `live-browser-sampled-targets.json`
- `live-browser-report.json`
- `judge-console.log`（Sandbox 模式）
- `run-complete.json`（Sandbox 模式）
- `sandbox-launch.log`（Sandbox 模式）
- `screenshots/`
- `browser-profile/`

## 目前驗證狀態

- 已驗證可穩定完成：
  - host disposable browser profile 模式
- 已驗證可正確產生：
  - Windows Sandbox `.wsb`
  - guest 執行腳本
  - launch 診斷 log
- 尚未在此主機完成：
  - Windows Sandbox end-to-end 回寫 `run-complete.json`

因此目前的實務建議是：

1. 真站批次測試先使用 host disposable profile
2. 若要把 Sandbox 升級為正式主流程，先處理 host 端的 Sandbox feature / guest 啟動問題

## 判讀原則

- 若結果落到 `security interstitial`，先視為環境阻擋，不直接歸咎於 extension heuristics
- 若 managed host 發生 popup / same-tab 導流，才進一步回頭檢查 `inject-blocker.js`、`background.js`、`ai-runtime.js`
