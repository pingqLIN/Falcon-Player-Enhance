# Windows Sandbox Host Repair

這份文件只處理這台主機上的 `Windows Sandbox` host runtime 問題，不處理 extension 本身。

## 目前已知事實

- `WindowsSandbox.exe` 可以被呼叫
- 但 `WindowsSandbox` process 會在約 2 秒內消失
- guest 端完全沒有寫出：
  - `sandbox-started.json`
  - `sandbox-bootstrap.log`
- host 端事件紀錄顯示：
  - `WindowsSandboxRemoteSession.exe` 啟動即崩潰
  - `.NET Runtime` 例外：
    - `System.IO.FileNotFoundException`
    - `Could not load file or assembly 'WinRT.Runtime, Version=2.2.0.0'`

最新實證可見：

- [sandbox-host-evidence.txt](Q:\Projects\Falcon-Player-Enhance\projects\falcon-safe-audit\runs\live-browser-safe\20260417-024425\sandbox-host-evidence.txt)
- [sandbox-launch.log](Q:\Projects\Falcon-Player-Enhance\projects\falcon-safe-audit\runs\live-browser-safe\20260417-024425\sandbox-launch.log)

## 已排除事項

以下不是目前主因：

- Falcon 專案的 guest script
- `browser_judge.py`
- mapped folder 設定
- `WinRT.Runtime.dll` 單純缺檔

原因：

- Sandbox 套件目錄內已存在 `WinRT.Runtime.dll`
- 該 DLL 的 assembly version 為 `2.2.0.0`
- `WindowsSandboxRemoteSession.deps.json` 也有正常的 .NET 8 相依宣告

所以問題更像是：

- host 的 component store / Windows package load chain 損壞
- 或 Windows Sandbox runtime 註冊鏈異常

## 本輪系統修復結果

### 1. DISM

已執行：

```powershell
DISM /Online /Cleanup-Image /RestoreHealth
```

結果：

- 失敗碼：`0x800f0915`
- 關鍵訊息：
  - `The repair content could not be found anywhere.`
  - `try to restore the image using the /source option.`

代表：

- host 的 component store 確實有修復需求
- 但 Windows Update / 線上來源不足以完成修復
- 下一步要改用明確的 repair source

### 2. SFC

嘗試執行：

```powershell
sfc /scannow
```

結果：

- 沒有真正開始
- 原因：UAC 提升被取消

因此目前不能宣稱 `sfc` 已完成。

## 建議修復順序

### A. 先準備對應版本的 Windows 安裝來源

需要：

- 與目前主機版本相容的 Windows 安裝媒體
- 優先使用同 major build 的 ISO / WIM / ESD

目前從 `DISM` log 可見：

- target OS version：`10.0.26300.8170`

### B. 用 `/Source` 重跑 DISM

若來源是 `install.wim`：

```powershell
DISM /Online /Cleanup-Image /RestoreHealth /Source:wim:X:\sources\install.wim:1 /LimitAccess
```

若來源是 `install.esd`：

```powershell
DISM /Online /Cleanup-Image /RestoreHealth /Source:esd:X:\sources\install.esd:1 /LimitAccess
```

注意：

- `:1` 只是範例 index
- 實際要先確認映像內的 edition index 是否對應目前系統版本

### C. 再跑 `sfc`

```powershell
sfc /scannow
```

### D. 重開機

### E. 重測 Windows Sandbox

重測命令：

```powershell
pwsh ./projects/falcon-safe-audit/scripts/run-live-browser-audit-safe.ps1 -Mode WindowsSandbox -SourceTargets tests/live-browser/targets.from-bookmarks.filtered.json -SampleCount 1 -Headless -LaunchSandbox -WaitTimeoutSec 45
```

## 成功條件

若修復成功，下一次 Sandbox run 至少應看到：

- `sandbox-started.json` 存在
- `sandbox-bootstrap.log` 存在

若更進一步成功，還應看到：

- `run-complete.json` 存在

## 目前正式結論

在這台主機上：

- `Windows Sandbox` 目前仍不可作為正式測試主流程
- production path 仍應使用：
  - host disposable browser profile

直到：

1. `DISM /Source` 成功
2. `sfc /scannow` 成功
3. Sandbox guest bootstrap marker 能出現
