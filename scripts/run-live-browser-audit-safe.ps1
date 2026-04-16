[CmdletBinding()]
param(
    [ValidateSet('Auto', 'Host', 'WindowsSandbox')]
    [string]$Mode = 'Auto',
    [string]$SourceTargets = 'tests/live-browser/targets.from-bookmarks.filtered.json',
    [string]$ExcludeReport,
    [int]$SampleCount = 10,
    [int]$SkipCount = 0,
    [int]$TimeoutMs = 45000,
    [int]$SettleMs = 3500,
    [int]$WaitTimeoutSec = 1800,
    [switch]$Headless,
    [switch]$LaunchSandbox
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectScript = Join-Path $repoRoot 'projects/falcon-safe-audit/scripts/run-live-browser-audit-safe.ps1'

if (-not (Test-Path $projectScript)) {
    throw "Safe audit project runner not found: $projectScript"
}

$forward = @{
    AuditedRepoRoot = $repoRoot
    Mode = $Mode
    SourceTargets = $SourceTargets
    SampleCount = $SampleCount
    SkipCount = $SkipCount
    TimeoutMs = $TimeoutMs
    SettleMs = $SettleMs
    WaitTimeoutSec = $WaitTimeoutSec
    Headless = $Headless
    LaunchSandbox = $LaunchSandbox
}

if ($ExcludeReport) {
    $forward.ExcludeReport = $ExcludeReport
}

& $projectScript @forward
