# Live Browser Safe Testing

本 repo 目前不再保留 `projects/falcon-safe-audit` helper workspace。
若要做輕量 live-browser audit，請使用 repo 內建 wrapper：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-live-browser-audit-safe.ps1 -Mode Host -Headless
```

## 目前支援範圍

- `-Mode Auto` 與 `-Mode Host` 會直接呼叫 `tests/live-browser/browser_judge.py`。
- `-SourceTargets` 預設使用 `tests/live-browser/targets.from-bookmarks.filtered.json`。
- `-SampleCount` 與 `-SkipCount` 可用來切小批次，避免一次打開太多 live target。
- `-ExcludeReport` 可排除上一份 report 中已出現過的 URL。
- report 會寫入 `tests/live-browser/reports/`，此目錄已由 `.gitignore` 排除。

## 已移除範圍

- `-Mode WindowsSandbox` 與 `-LaunchSandbox` 目前不可用，因為 sandbox helper workspace 已移除。
- 若需要恢復 Windows Sandbox 隔離流程，應重新設計為 repo-local script 或獨立專案，並先通過發布邊界審查。
