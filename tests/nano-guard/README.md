# Nano Guard Feasibility

This folder contains a dedicated feasibility harness for evaluating whether Chrome's local Gemini Nano Prompt API is suitable for Falcon-Player-Enhance runtime advisory use.

## Files

- `run_nano_guard_feasibility.py`: launches isolated Chrome, serves the probe page, runs scenario prompts, and writes a JSON report.
- `scenarios.json`: synthetic and host-derived classification scenarios.
- `site/nano_guard_probe.html`: local HTTP probe page.
- `site/nano_guard_probe.js`: Prompt API probing and scenario execution logic.

## What It Measures

- Prompt API availability
- route used to create a session
- cold start latency
- per-scenario latency
- structured JSON response parse rate
- label consistency across repeated runs
- recommendation:
  - `proceed`
  - `proceed-advisory-only`
  - `do-not-integrate`

## Quick Start

```powershell
python tests/nano-guard/run_nano_guard_feasibility.py --help
pwsh ./scripts/run-nano-guard-feasibility.ps1
```

## Current Finding

Latest local run on `2026-03-13` shows:

- `window.LanguageModel.create` is exposed in Chrome `145.0.0.0`
- Prompt API surface is detectable
- session creation still fails repeatedly with:
  - `Unable to create a text session because the service is not running.`
- recommendation is currently `do-not-integrate`

Interpretation:

- Gemini Nano is promising as a future runtime advisory layer
- but this repo should not yet depend on it for automated browser validation or extension-side guard decisions
- keep it in feasibility mode until the Chrome runtime service becomes reliably usable in the intended environment

## Notes

- This harness is advisory-only. It does not modify Falcon-Player-Enhance runtime behavior.
- By default it looks for the latest model under `%LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel\`.
- It uses an isolated Chrome user-data directory under `tests/nano-guard/reports/`.
- The harness now copies the model into the isolated profile instead of using a junction, to better match the reference Gemini Nano starter behavior.
