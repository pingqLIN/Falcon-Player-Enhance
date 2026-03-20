param(
    [string]$Bookmarks = "tests/bookmarks_2026_3_13.html",
    [string]$TargetsOut = "tests/live-browser/targets.from-bookmarks.filtered.json",
    [string]$DomainRegex = "javboys|missav|thisav|jable|avgle|poapan",
    [string]$ExcludeUrlRegex = "/tag/|/all-models/|/_page=|/category/",
    [int]$Limit = 20,
    [int]$LimitPerDomain = 5,
    [string]$ReviewAgent = "codex",
    [string]$ReviewAgentModel = "",
    [string]$PatchAgent = "codex",
    [string]$PatchAgentModel = "",
    [int]$MaxIterations = 2,
    [int]$TimeoutMs = 15000,
    [int]$SettleMs = 2000,
    [switch]$Headless
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$uBlockDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\Default\Extensions\ddkjiahejlhfcafbddmgiahcphecmpfh"

if (-not (Test-Path $uBlockDir)) {
    throw "uBlock Origin Lite extension directory was not found under Chrome Default profile."
}

$uBlockVersionDir = Get-ChildItem $uBlockDir -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $uBlockVersionDir) {
    throw "No unpacked uBlock version directory was found under $uBlockDir"
}

Write-Host "Using uBlock directory: $($uBlockVersionDir.FullName)"

python "$repoRoot\tests\live-browser\import_bookmarks.py" `
  --input "$repoRoot\$Bookmarks" `
  --include-domain-regex $DomainRegex `
  --exclude-url-regex $ExcludeUrlRegex `
  --limit $Limit `
  --limit-per-domain $LimitPerDomain `
  --out "$repoRoot\$TargetsOut"

$loopArgs = @(
  "$repoRoot\tests\live-browser\self_learning_loop.py",
  "--targets", "$repoRoot\$TargetsOut",
  "--extension-dir", "$repoRoot\extension",
  "--ublock-extension-dir", $uBlockVersionDir.FullName,
  "--timeout-ms", $TimeoutMs,
  "--settle-ms", $SettleMs,
  "--max-iterations", $MaxIterations,
  "--patch-agent", $PatchAgent
)

if ($ReviewAgent) {
  $loopArgs += @("--review-agent", $ReviewAgent)
}

if ($ReviewAgentModel) {
  $loopArgs += @("--review-agent-model", $ReviewAgentModel)
}

if ($PatchAgentModel) {
  $loopArgs += @("--patch-agent-model", $PatchAgentModel)
}

if ($Headless) {
  $loopArgs += "--headless"
}

python @loopArgs
