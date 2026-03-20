param(
    [string]$Model = "gemini-3-pro-high",
    [string]$OutputPath = "assets/icons/icon.svg",
    [string]$PromptPath = "scripts/logo-prompt-shield-pro.txt",
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
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }
    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PathValue))
}

function Extract-Svg([string]$Text) {
    $clean = $Text -replace "^\s*```(?:svg)?\s*", "" -replace "\s*```\s*$", ""
    $match = [regex]::Match($clean, "<svg[\s\S]*?</svg>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) {
        throw "Model response does not contain a valid <svg>...</svg> block"
    }
    return $match.Value.Trim()
}

function Test-SvgXml([string]$SvgText) {
    [xml]$doc = $SvgText
    if (-not $doc.DocumentElement -or $doc.DocumentElement.Name -ne "svg") {
        throw "SVG parsed but the root element is not <svg>"
    }
}

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
    if ($env:LLM_API_KEY) {
        $ApiKey = $env:LLM_API_KEY
    } elseif ($env:OPENAI_API_KEY) {
        $ApiKey = $env:OPENAI_API_KEY
    }
}

if ([string]::IsNullOrWhiteSpace($GoogleApiKey) -and $env:GOOGLE_API_KEY) {
    $GoogleApiKey = $env:GOOGLE_API_KEY
}

$promptFile = Get-ResolvedPath $PromptPath
$outputFile = Get-ResolvedPath $OutputPath
$outDir = Split-Path -Parent $outputFile

if (-not (Test-Path $promptFile)) {
    throw "Prompt file not found: $promptFile"
}

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$prompt = Get-Content -Raw $promptFile

if ($PreviewOnly) {
    $provider = "openai-compatible"
    if ($UseGoogleApi) { $provider = "google-native" }
    Write-Host "[PREVIEW] model=$Model"
    Write-Host "[PREVIEW] base_url=$BaseUrl"
    Write-Host "[PREVIEW] provider=$provider"
    Write-Host "[PREVIEW] output=$outputFile"
    Write-Host "---------- prompt ----------"
    Write-Host $prompt
    exit 0
}

Write-Host "Generating logo with $Model ..."
Write-Host "Endpoint: $BaseUrl"

$rawText = $null
$response = $null

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
                    @{
                        text = "You are a senior icon designer. Return only one valid SVG document and nothing else."
                    },
                    @{
                        text = $prompt
                    }
                )
            }
        )
        generationConfig = @{
            temperature = 0.6
            maxOutputTokens = 2200
        }
    }

    try {
        $response = Invoke-RestMethod -Method Post -Uri $googleEndpoint -ContentType "application/json" -Body ($googleBody | ConvertTo-Json -Depth 8) -TimeoutSec 120
    } catch {
        throw "Google Gemini call failed: $($_.Exception.Message)"
    }

    if ($response.candidates -and $response.candidates.Count -gt 0) {
        $parts = $response.candidates[0].content.parts
        if ($parts) {
            $rawText = ($parts | ForEach-Object { $_.text }) -join "`n"
        }
    }
} else {
    $body = @{
        model = $Model
        temperature = 0.6
        max_tokens = 2200
        messages = @(
            @{
                role = "system"
                content = "You are a senior icon designer. Return only one valid SVG document and nothing else."
            },
            @{
                role = "user"
                content = $prompt
            }
        )
    }

    $headers = @{
        "Content-Type" = "application/json"
    }

    if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
        $headers["Authorization"] = "Bearer $ApiKey"
    }

    try {
        $response = Invoke-RestMethod -Method Post -Uri $BaseUrl -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) -TimeoutSec 120
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
        if ($parts) {
            $rawText = ($parts | ForEach-Object { $_.text }) -join "`n"
        }
    }
}

if ([string]::IsNullOrWhiteSpace($rawText)) {
    throw "Model response does not include usable text content for SVG extraction"
}

$svg = Extract-Svg $rawText
Test-SvgXml $svg

if (Test-Path $outputFile) {
    $backup = "$outputFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $outputFile $backup -Force
    Write-Host "Backup created: $backup"
}

$svg | Set-Content -Path $outputFile -Encoding UTF8
Write-Host "Logo updated: $outputFile"
