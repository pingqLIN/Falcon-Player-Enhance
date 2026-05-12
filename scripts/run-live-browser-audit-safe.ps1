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

if ($Mode -eq 'WindowsSandbox' -or $LaunchSandbox) {
    throw 'WindowsSandbox mode was removed with projects/falcon-safe-audit. Use -Mode Host or run browser_judge.py directly.'
}

$sourcePath = Join-Path $repoRoot $SourceTargets
if (-not (Test-Path $sourcePath)) {
    throw "Source targets not found: $sourcePath"
}

$reportDir = Join-Path $repoRoot 'tests/live-browser/reports'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $reportDir "safe-audit-$timestamp.json"
$targetsPath = $sourcePath
$tempTargetsPath = $null

if ($SampleCount -gt 0 -or $SkipCount -gt 0 -or $ExcludeReport) {
    $payload = Get-Content -Raw -Path $sourcePath | ConvertFrom-Json
    $targets = @($payload.targets)

    if ($ExcludeReport) {
        if (-not (Test-Path $ExcludeReport)) {
            throw "Exclude report not found: $ExcludeReport"
        }

        $excludePayload = Get-Content -Raw -Path $ExcludeReport | ConvertFrom-Json
        $excludedUrls = New-Object 'System.Collections.Generic.HashSet[string]'
        foreach ($item in @($excludePayload.results)) {
            $url = ''
            if ($item.PSObject.Properties.Name -contains 'url') {
                $url = [string]$item.url
            } elseif (($item.PSObject.Properties.Name -contains 'target') -and $item.target -and ($item.target.PSObject.Properties.Name -contains 'url')) {
                $url = [string]$item.target.url
            }
            if ($url) {
                [void]$excludedUrls.Add($url)
            }
        }
        $targets = @($targets | Where-Object { -not $excludedUrls.Contains([string]$_.url) })
    }

    if ($SkipCount -gt 0) {
        $targets = @($targets | Select-Object -Skip $SkipCount)
    }

    if ($SampleCount -gt 0) {
        $targets = @($targets | Select-Object -First $SampleCount)
    }

    $tempTargetsPath = Join-Path $env:TEMP "falcon-safe-audit-targets-$timestamp.json"
    $tempPayload = [pscustomobject]@{
        generatedFrom = $SourceTargets
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        targets = $targets
    } | ConvertTo-Json -Depth 20
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempTargetsPath, $tempPayload, $utf8NoBom)
    $targetsPath = $tempTargetsPath
}

$judgeArgs = @(
    (Join-Path $repoRoot 'tests/live-browser/browser_judge.py'),
    '--targets', $targetsPath,
    '--out', $reportPath,
    '--extension-dir', (Join-Path $repoRoot 'extension'),
    '--timeout-ms', [string]$TimeoutMs,
    '--settle-ms', [string]$SettleMs
)

if ($Headless) {
    $judgeArgs += '--headless'
}

try {
    & python @judgeArgs
    exit $LASTEXITCODE
} finally {
    if ($tempTargetsPath -and (Test-Path $tempTargetsPath)) {
        Remove-Item -LiteralPath $tempTargetsPath -Force
    }
}
