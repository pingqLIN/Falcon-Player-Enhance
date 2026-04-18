# Falcon Safe Audit

## Chosen archetype

- Desktop helper
- Operating mode: foreground CLI helper for Windows-first isolated live-browser audits

## Why this archetype

This project coordinates local browser automation, Windows Sandbox launch attempts, disposable browser profiles, and local audit artifacts. It is not a browser extension and not a generic worker service. The primary surface is a local operator command.

## Hard requirements

- one obvious startup path
- explicit boundary between the audited repo and the helper project
- explicit local state directories for config, runs, logs, cache
- no machine-specific paths in source defaults
- Windows-first assumptions remain configurable

## Storage model

- local file storage only
- `config/` for defaults
- `runs/` for audit artifacts
- `logs/` for helper diagnostics
- `cache/` reserved for future reusable state

## Repo layout

- `scripts/` primary entrypoint
- `docs/` operator docs
- `config/` defaults
- `runs/` generated artifacts
- `logs/` generated helper logs
- `cache/` reserved runtime cache

## Current scope

This helper audits the parent Falcon extension repo by default. It does not own the extension code; it owns the isolation workflow, sampling policy, and artifact management.

Current live-audit report semantics:

- `pass`: playable target inspected without a regression finding
- `invalid_target`: sampled URL resolved to a listing/index page rather than a playable detail page; this is target-pool drift, not a player-detection failure
- `fail`: real regression signal or environment blocker that still needs action

## Current blocker

- `Windows Sandbox` launch diagnostics currently fail before any guest script runs on this host
- the captured host evidence shows `WindowsSandboxRemoteSession.exe` crashes immediately
- the latest captured .NET runtime error is:
  - missing assembly `WinRT.Runtime, Version=2.2.0.0`
- further inspection shows the assembly file exists inside the Sandbox package, so the blocker is now treated as host runtime / component-store corruption, not a missing project file
- `DISM /RestoreHealth` was attempted and failed with `0x800f0915`, which means a repair source is still required
- practical consequence:
  - `Windows Sandbox` is not yet a usable execution path on this machine
  - the production testing path remains the disposable host browser profile

See the host repair runbook:

- [WINDOWS_SANDBOX_HOST_REPAIR.zh-TW.md](Q:\Projects\Falcon-Player-Enhance\projects\falcon-safe-audit\docs\WINDOWS_SANDBOX_HOST_REPAIR.zh-TW.md)

## Startup

```powershell
pwsh ./scripts/run-live-browser-audit-safe.ps1 -Mode Host -Headless
```

To audit the parent Falcon repo explicitly:

```powershell
pwsh ./scripts/run-live-browser-audit-safe.ps1 -AuditedRepoRoot ../.. -Mode Host -Headless
```
