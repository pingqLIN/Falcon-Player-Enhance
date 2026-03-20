<#
.SYNOPSIS
    Generate three operation guide SVG illustrations for Shield Pro using Gemini.

.DESCRIPTION
    Calls Gemini to generate three SVG illustrations of a spherical robot
    character for the three-step operation guide: CLICK, DETECT, PLAY.

.PARAMETER Model
    The model name (default: gemini-3-pro-high).

.PARAMETER OutputDir
    Output directory for the three SVG files (default: extension/assets/guide).

.PARAMETER PromptPath
    Path to the prompt file (default: scripts/guide-prompt-spherical-robot.txt).

.EXAMPLE
    .\generate-guide-gemini.ps1 -UseGoogleApi
    .\generate-guide-gemini.ps1 -UseLocalGateway
#>
param(
    [string]$Model = "gemini-3-pro-high",
    [string]$OutputDir = "extension/assets/guide",
    [string]$PromptPath = "scripts/guide-prompt-spherical-robot.txt",
    [string]$BaseUrl = "",
    [string]$ApiKey = "",
    [string]$GoogleApiKey = "",
    [switch]$UseLocalGateway,
    [switch]$UseGoogleApi,
    [switch]$PreviewOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ResolvedPath([string]$PathValue) {
    if ([System.IO.Path]::IsPathRooted($PathValue)) { return $PathValue }
    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PathValue))
}

function Extract-AllSvg([string]$Text) {
    $matches = [regex]::Matches($Text, "<svg[\s\S]*?</svg>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($matches.Count -eq 0) {
        throw "Model response does not contain any valid <svg>...</svg> block"
    }
    $results = @()
    foreach ($m in $matches) {
        $results += $m.Value.Trim()
    }
    return $results
}

function Test-SvgXml([string]$SvgText) {
    [xml]$doc = $SvgText
    if (-not $doc.DocumentElement -or $doc.DocumentElement.Name -ne "svg") {
        throw "SVG parsed but the root element is not <svg>"
    }
}

# Resolve endpoints
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    if ($UseGoogleApi) {
        $BaseUrl = "https://generativelanguage.googleapis.com"
    } elseif ($UseLocalGateway) {
        $BaseUrl = "http://127.0.0.1:8045/v1/chat/completions"
    } elseif ($env:LLM_BASE_URL) {
        $BaseUrl = $env:LLM_BASE_URL
    } else {
        $BaseUrl = "http://127.0.0.1:8045/v1/chat/completions"
    }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    if ($env:LLM_API_KEY) { $ApiKey = $env:LLM_API_KEY }
    elseif ($env:OPENAI_API_KEY) { $ApiKey = $env:OPENAI_API_KEY }
}

if ([string]::IsNullOrWhiteSpace($GoogleApiKey) -and $env:GOOGLE_API_KEY) {
    $GoogleApiKey = $env:GOOGLE_API_KEY
}

$promptFile = Get-ResolvedPath $PromptPath
$outputPath = Get-ResolvedPath $OutputDir

if (-not (Test-Path $promptFile)) {
    throw "Prompt file not found: $promptFile"
}

if (-not (Test-Path $outputPath)) {
    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
}

$prompt = Get-Content -Raw $promptFile

$stepNames = @("step-click", "step-detect", "step-play")

if ($PreviewOnly) {
    $provider = "openai-compatible"
    if ($UseGoogleApi) { $provider = "google-native" }
    Write-Host "[PREVIEW] model=$Model"
    Write-Host "[PREVIEW] base_url=$BaseUrl"
    Write-Host "[PREVIEW] provider=$provider"
    Write-Host "[PREVIEW] output=$outputPath"
    Write-Host "---------- prompt ----------"
    Write-Host $prompt
    exit 0
}

Write-Host "Generating 3 guide illustrations with $Model ..."
Write-Host "Endpoint: $BaseUrl"

$rawText = $null

if ($UseGoogleApi) {
    if ([string]::IsNullOrWhiteSpace($GoogleApiKey)) {
        throw "Google API key is required for -UseGoogleApi. Set GOOGLE_API_KEY or pass -GoogleApiKey"
    }

    $googleEndpoint = ($BaseUrl.TrimEnd("/")) + "/v1beta/models/$Model`:generateContent?key=$GoogleApiKey"
    $googleBody = @{
        contents = @(
            @{
                role = "user"
                parts = @(
                    @{ text = "You are a senior illustration designer. You MUST return exactly three separate SVG documents — one for each step (CLICK, DETECT, PLAY). Each SVG must be a complete document with unique prefixed IDs. Return nothing else besides the three SVG blocks." },
                    @{ text = $prompt }
                )
            }
        )
        generationConfig = @{
            temperature = 0.6
            maxOutputTokens = 12000
        }
    }

    try {
        $response = Invoke-RestMethod -Method Post -Uri $googleEndpoint -ContentType "application/json" -Body ($googleBody | ConvertTo-Json -Depth 8) -TimeoutSec 300
    } catch {
        throw "Google Gemini call failed: $($_.Exception.Message)"
    }

    if ($response.candidates -and $response.candidates.Count -gt 0) {
        $parts = $response.candidates[0].content.parts
        if ($parts) { $rawText = ($parts | ForEach-Object { $_.text }) -join "`n" }
    }
} else {
    $body = @{
        model = $Model
        temperature = 0.6
        max_tokens = 12000
        messages = @(
            @{
                role = "system"
                content = "You are a senior illustration designer. You MUST return exactly three separate SVG documents — one for each step (CLICK, DETECT, PLAY). Each SVG must be a complete document with unique prefixed IDs. Return nothing else besides the three SVG blocks."
            },
            @{
                role = "user"
                content = $prompt
            }
        )
    }

    $headers = @{ "Content-Type" = "application/json" }
    if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
        $headers["Authorization"] = "Bearer $ApiKey"
    }

    try {
        $response = Invoke-RestMethod -Method Post -Uri $BaseUrl -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) -TimeoutSec 300
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match "\(401\)|\(403\)") {
            throw "Model call failed with auth error ($msg). Set LLM_API_KEY or OPENAI_API_KEY, or pass -ApiKey"
        }
        throw "Model call failed: $msg"
    }

    if ($response.choices -and $response.choices.Count -gt 0 -and $response.choices[0].message.content) {
        $rawText = [string]$response.choices[0].message.content
    } elseif ($response.candidates -and $response.candidates.Count -gt 0) {
        $parts = $response.candidates[0].content.parts
        if ($parts) { $rawText = ($parts | ForEach-Object { $_.text }) -join "`n" }
    }
}

if ([string]::IsNullOrWhiteSpace($rawText)) {
    throw "Model response does not include usable text content for SVG extraction"
}

$svgs = Extract-AllSvg $rawText

if ($svgs.Count -lt 3) {
    Write-Warning "Expected 3 SVGs but got $($svgs.Count). Will save what we have."
}

for ($i = 0; $i -lt [Math]::Min($svgs.Count, 3); $i++) {
    $svg = $svgs[$i]
    Test-SvgXml $svg

    $outFile = Join-Path $outputPath "$($stepNames[$i]).svg"

    if (Test-Path $outFile) {
        $backup = "$outFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item $outFile $backup -Force
        Write-Host "Backup: $backup"
    }

    $svg | Set-Content -Path $outFile -Encoding UTF8
    Write-Host "Saved: $outFile"
}

Write-Host "`nGuide illustrations updated successfully!"
