param(
  [string]$Targets = "tests/live-browser/targets.popup-player.reviewed.smoke.json",
  [string]$ExtensionDir = "extension",
  [string]$BrowserChannel = "chromium",
  [string]$BrowserProfileDir = "",
  [string]$Out = "tests/live-browser/reports/popup-player-smoke-latest.json",
  [int]$PassThreshold = 6,
  [int]$SettleMs = 2500,
  [int]$TimeoutMs = 30000,
  [switch]$Headless
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$command = @(
  "python",
  "tests/live-browser/browser_judge.py",
  "--targets", $Targets,
  "--extension-dir", $ExtensionDir,
  "--browser-channel", $BrowserChannel,
  "--pass-threshold", "$PassThreshold",
  "--settle-ms", "$SettleMs",
  "--timeout-ms", "$TimeoutMs",
  "--out", $Out
)

if ($Headless) {
  $command += "--headless"
}

if ($BrowserProfileDir) {
  $command += @("--browser-profile-dir", $BrowserProfileDir)
}

Write-Host "Running popup-player smoke targets from $Targets" -ForegroundColor Cyan
Push-Location $repoRoot
try {
  & $command[0] $command[1..($command.Length - 1)]
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
