param(
    [string]$ModelSourceDir = "",
    [string]$BrowserChannel = "chrome",
    [int]$Repeats = 2,
    [int]$HttpPort = 5611,
    [switch]$Headless
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

$args = @(
  "$repoRoot\tests\nano-guard\run_nano_guard_feasibility.py",
  "--browser-channel", $BrowserChannel,
  "--repeats", $Repeats,
  "--http-port", $HttpPort
)

if ($ModelSourceDir) {
  $args += @("--model-source-dir", $ModelSourceDir)
}

if ($Headless) {
  $args += "--headless"
}

python @args
