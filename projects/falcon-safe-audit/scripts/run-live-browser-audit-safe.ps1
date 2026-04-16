[CmdletBinding()]
param(
    [ValidateSet('Auto', 'Host', 'WindowsSandbox')]
    [string]$Mode = 'Auto',
    [string]$AuditedRepoRoot,
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

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $AuditedRepoRoot) {
    $AuditedRepoRoot = (Resolve-Path (Join-Path $projectRoot '..\..')).Path
} else {
    $AuditedRepoRoot = (Resolve-Path $AuditedRepoRoot).Path
}

$defaultConfigPath = Join-Path $projectRoot 'config/audit.defaults.json'
if (Test-Path $defaultConfigPath) {
    $defaults = Get-Content $defaultConfigPath -Raw | ConvertFrom-Json
    $boundKeys = @($PSBoundParameters.Keys)
    if (-not ($boundKeys -contains 'Mode') -and $defaults.defaultMode) { $Mode = [string]$defaults.defaultMode }
    if (-not ($boundKeys -contains 'SourceTargets') -and $defaults.sourceTargets) { $SourceTargets = [string]$defaults.sourceTargets }
    if (-not ($boundKeys -contains 'SampleCount') -and $defaults.sampleCount) { $SampleCount = [int]$defaults.sampleCount }
    if (-not ($boundKeys -contains 'TimeoutMs') -and $defaults.timeoutMs) { $TimeoutMs = [int]$defaults.timeoutMs }
    if (-not ($boundKeys -contains 'SettleMs') -and $defaults.settleMs) { $SettleMs = [int]$defaults.settleMs }
    if (-not ($boundKeys -contains 'WaitTimeoutSec') -and $defaults.waitTimeoutSec) { $WaitTimeoutSec = [int]$defaults.waitTimeoutSec }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $projectRoot "runs/live-browser-safe/$timestamp"
$reportPath = Join-Path $runRoot 'live-browser-report.json'
$sampleTargetsPath = Join-Path $runRoot 'live-browser-sampled-targets.json'
$sandboxMarkerPath = Join-Path $runRoot 'run-complete.json'
$sandboxGuestScriptPath = Join-Path $runRoot 'run-live-browser-in-sandbox.ps1'
$sandboxConfigPath = Join-Path $runRoot 'live-browser-audit.wsb'
$sandboxLaunchLogPath = Join-Path $runRoot 'sandbox-launch.log'

function New-RunDirectory {
    New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
}

function Resolve-InputPath {
    param(
        [Parameter(Mandatory)]
        [string]$InputPath,
        [Parameter(Mandatory)]
        [string[]]$BaseDirs
    )

    if ([System.IO.Path]::IsPathRooted($InputPath)) {
        if (Test-Path $InputPath) {
            return (Resolve-Path $InputPath).Path
        }
        throw "Path not found: $InputPath"
    }

    foreach ($baseDir in $BaseDirs) {
        $candidate = Join-Path $baseDir $InputPath
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    throw "Path not found in base dirs: $InputPath"
}

function Get-ExcludedUrls {
    if (-not $ExcludeReport) {
        return @{}
    }

    $excludePath = Resolve-InputPath -InputPath $ExcludeReport -BaseDirs @($projectRoot, $AuditedRepoRoot)
    $report = Get-Content $excludePath -Raw | ConvertFrom-Json
    $urls = @{}
    foreach ($result in @($report.results)) {
        if ($result.url) {
            $urls[[string]$result.url] = $true
        }
    }
    return $urls
}

function Get-SampledTargets {
    $sourcePath = Resolve-InputPath -InputPath $SourceTargets -BaseDirs @($AuditedRepoRoot, $projectRoot)
    $data = Get-Content $sourcePath -Raw | ConvertFrom-Json
    if (-not $data.targets -or $data.targets.Count -eq 0) {
        throw "Targets file has no targets: $sourcePath"
    }

    $excludedUrls = Get-ExcludedUrls
    $eligibleTargets = @()
    foreach ($target in @($data.targets)) {
        if (-not $target.url) {
            continue
        }
        if ($excludedUrls.ContainsKey([string]$target.url)) {
            continue
        }
        $eligibleTargets += $target
    }

    if ($SkipCount -gt 0) {
        $eligibleTargets = @($eligibleTargets | Select-Object -Skip $SkipCount)
    }

    $selected = @($eligibleTargets | Select-Object -First $SampleCount)
    if ($selected.Count -eq 0) {
        throw "Sample selection produced zero targets after exclusions."
    }

    $payload = [ordered]@{
        generatedFrom = $sourcePath
        excludedFromReport = $(if ($ExcludeReport) { (Resolve-InputPath -InputPath $ExcludeReport -BaseDirs @($projectRoot, $AuditedRepoRoot)) } else { $null })
        generatedAt = (Get-Date).ToString('s')
        sampleCount = $selected.Count
        targets = $selected
    }

    $payload | ConvertTo-Json -Depth 10 | Set-Content $sampleTargetsPath
    return $selected
}

function Get-HostPythonInfo {
    $pythonExe = python -c "import sys; print(sys.executable)" 2>$null
    if (-not $pythonExe) { throw 'Python executable not found on host.' }
    $pythonExe = $pythonExe.Trim()
    $userSite = python -c "import site; print(site.getusersitepackages())" 2>$null
    if (-not $userSite) { throw 'Python user site-packages path not found on host.' }
    $userSite = $userSite.Trim()
    return @{ PythonExe = $pythonExe; UserSite = $userSite }
}

function Get-PlaywrightBrowsersPath {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'ms-playwright'),
        (Join-Path $env:USERPROFILE 'AppData\Local\ms-playwright')
    ) | Select-Object -Unique

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }

    throw 'Playwright browser cache was not found under the expected host paths.'
}

function Invoke-HostAudit {
    $args = @(
        (Join-Path $AuditedRepoRoot 'tests/live-browser/browser_judge.py'),
        '--targets', $sampleTargetsPath,
        '--extension-dir', (Join-Path $AuditedRepoRoot 'extension'),
        '--out', $reportPath,
        '--timeout-ms', $TimeoutMs,
        '--settle-ms', $SettleMs
    )

    if ($Headless) { $args += '--headless' }

    Write-Host 'Running host audit with disposable browser profile...'
    & python @args
    if ($LASTEXITCODE -ne 0) {
        if (Test-Path $reportPath) {
            Write-Warning "browser_judge.py returned exit code $LASTEXITCODE, but audit artifacts were written to $reportPath"
            return
        }
        throw "Host audit failed with exit code $LASTEXITCODE"
    }
}

function New-SandboxGuestScript {
    $headlessArgLiteral = if ($Headless) { "'--headless'" } else { '$null' }
    $content = @"
`$ErrorActionPreference = 'Stop'
`$env:PYTHONPATH = 'C:\FalconTools\PythonSite'
`$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\FalconTools\PlaywrightBrowsers'
`$env:PYTHONUTF8 = '1'

`$pythonExe = 'C:\FalconTools\Python\python.exe'
`$repoRoot = 'C:\FalconRepo'
`$outputRoot = 'C:\FalconOutput'
`$reportPath = Join-Path `$outputRoot 'live-browser-report.json'
`$targetsPath = Join-Path `$outputRoot 'live-browser-sampled-targets.json'
`$markerPath = Join-Path `$outputRoot 'run-complete.json'
`$logPath = Join-Path `$outputRoot 'judge-console.log'

`$args = @(
    'C:\FalconRepo\tests\live-browser\browser_judge.py',
    '--targets', `$targetsPath,
    '--extension-dir', 'C:\FalconRepo\extension',
    '--out', `$reportPath,
    '--timeout-ms', '$TimeoutMs',
    '--settle-ms', '$SettleMs'
)

if ($headlessArgLiteral -ne '$null') {
    `$args += $headlessArgLiteral
}

`$exitCode = 1
`$failure = `$null

try {
    Push-Location `$repoRoot
    & `$pythonExe @`$args *>&1 | Tee-Object -FilePath `$logPath
    `$exitCode = `$LASTEXITCODE
} catch {
    `$failure = `$_.Exception.Message
    "Sandbox guest failure: `$failure" | Tee-Object -FilePath `$logPath -Append | Out-Null
} finally {
    try { Pop-Location } catch {}
}

@{
    finishedAt = (Get-Date).ToString('s')
    exitCode = `$exitCode
    reportPath = `$reportPath
    logPath = `$logPath
    failure = `$failure
} | ConvertTo-Json | Set-Content `$markerPath
"@

    Set-Content -Path $sandboxGuestScriptPath -Value $content
}

function New-SandboxConfig {
    param(
        [string]$HostPythonDir,
        [string]$HostUserSite,
        [string]$HostPlaywrightDir
    )

    $config = @"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Enable</Networking>
  <ClipboardRedirection>Disable</ClipboardRedirection>
  <AudioInput>Disable</AudioInput>
  <VideoInput>Disable</VideoInput>
  <PrinterRedirection>Disable</PrinterRedirection>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$AuditedRepoRoot</HostFolder>
      <SandboxFolder>C:\FalconRepo</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$HostPythonDir</HostFolder>
      <SandboxFolder>C:\FalconTools\Python</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$HostUserSite</HostFolder>
      <SandboxFolder>C:\FalconTools\PythonSite</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$HostPlaywrightDir</HostFolder>
      <SandboxFolder>C:\FalconTools\PlaywrightBrowsers</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$runRoot</HostFolder>
      <SandboxFolder>C:\FalconOutput</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -ExecutionPolicy Bypass -File C:\FalconOutput\run-live-browser-in-sandbox.ps1</Command>
  </LogonCommand>
</Configuration>
"@

    Set-Content -Path $sandboxConfigPath -Value $config
}

function Invoke-SandboxAudit {
    $pythonInfo = Get-HostPythonInfo
    $playwrightDir = Get-PlaywrightBrowsersPath
    $pythonDir = Split-Path -Parent $pythonInfo.PythonExe

    New-SandboxGuestScript
    New-SandboxConfig -HostPythonDir $pythonDir -HostUserSite $pythonInfo.UserSite -HostPlaywrightDir $playwrightDir

    Write-Host "Windows Sandbox config written: $sandboxConfigPath"

    if (-not $LaunchSandbox) {
        Write-Host 'Sandbox config prepared but not launched.'
        return
    }

    if (-not (Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue)) {
        throw 'WindowsSandbox.exe is not available on this host.'
    }

    Remove-Item $sandboxMarkerPath -ErrorAction SilentlyContinue
    Remove-Item $sandboxLaunchLogPath -ErrorAction SilentlyContinue
    "[$((Get-Date).ToString('s'))] Launch requested." | Set-Content $sandboxLaunchLogPath
    Write-Host 'Launching Windows Sandbox for isolated live-browser audit...'
    Start-Process 'C:\Windows\System32\WindowsSandbox.exe' -ArgumentList "`"$sandboxConfigPath`""
    "[$((Get-Date).ToString('s'))] WindowsSandbox.exe launched with config $sandboxConfigPath" | Add-Content $sandboxLaunchLogPath

    $deadline = (Get-Date).AddSeconds($WaitTimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $sandboxMarkerPath) {
            Write-Host "Sandbox audit completed: $sandboxMarkerPath"
            "[$((Get-Date).ToString('s'))] Completion marker detected." | Add-Content $sandboxLaunchLogPath
            return
        }
        Start-Sleep -Seconds 5
    }

    "[$((Get-Date).ToString('s'))] Timed out waiting for marker $sandboxMarkerPath" | Add-Content $sandboxLaunchLogPath
    throw "Timed out waiting for Windows Sandbox completion marker: $sandboxMarkerPath"
}

New-RunDirectory
$selectedTargets = Get-SampledTargets

$effectiveMode = $Mode
if ($effectiveMode -eq 'Auto') {
    $effectiveMode = if (Get-Command WindowsSandbox.exe -ErrorAction SilentlyContinue) { 'WindowsSandbox' } else { 'Host' }
}

Write-Host "Project root: $projectRoot"
Write-Host "Audited repo root: $AuditedRepoRoot"
Write-Host "Run root: $runRoot"
Write-Host "Selected targets: $($selectedTargets.Count)"
Write-Host "Mode: $effectiveMode"

switch ($effectiveMode) {
    'Host' { Invoke-HostAudit }
    'WindowsSandbox' {
        try {
            Invoke-SandboxAudit
        } catch {
            Write-Warning "Windows Sandbox audit failed: $($_.Exception.Message)"
            Write-Warning 'Falling back to host audit with a disposable browser profile.'
            Invoke-HostAudit
        }
    }
    default { throw "Unsupported mode: $effectiveMode" }
}

Write-Host "Live-browser audit artifacts: $runRoot"
