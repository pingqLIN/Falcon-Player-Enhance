# Rebuild File Map

This map defines the files needed to rebuild, inspect, and maintain the current Falcon-Player-Enhance extension. Historical planning and review material is retained in the ignored local backup at `local/rebuild-backup-2026-06-05/development-history/`; public documentation keeps only a compact archive index.

## Primary Runtime Surface

| Path | Keep Reason |
|---|---|
| `extension/manifest.json` | Chrome MV3 manifest, permissions, web-accessible resources, and extension entry points |
| `extension/background.js` | Service worker for state, DNR rules, windows, AI policy, candidate governance, telemetry, and recovery records |
| `extension/content/` | Runtime content scripts for player detection, overlay cleanup, popup/redirect protection, AI runtime, state bridge, and player controls |
| `extension/popup/` | Browser action popup and pinned side-panel shell |
| `extension/popup-player/` | Distraction-free player window |
| `extension/dashboard/` | Settings, site lists, AI provider profiles, candidate review, blocked elements, and rescue management |
| `extension/rules/` | DNR filter rules, ad-list source, site registry, and no-op redirect helper |
| `extension/security/` | URL safety helper logic |
| `extension/shared/` | Shared protection-status contract helpers |
| `extension/_locales/` | English and Traditional Chinese UI strings |
| `extension/assets/` | Icons and first-run guide graphics |

## Test and Verification Surface

| Path | Keep Reason |
|---|---|
| `tests/ai/` | AI provider, candidate review, promotion, Chrome Built-in, and privacy regressions |
| `tests/ai-eval/` | Offline and provider-backed evaluation harnesses |
| `tests/anti-popup/` | Popup and redirect guard regressions |
| `tests/content-scripts/` | Dynamic content-script registration and exclusion contracts |
| `tests/inject-blocker/` | MAIN-world injection and overlay guard regressions |
| `tests/interaction-safety/` | False-positive rescue, clickability, picker, and public-surface safety checks |
| `tests/live-browser/` | Optional live browser workflow and judge tooling |
| `tests/player-detection/` | Player detection and iframe source privacy checks |
| `tests/popup-smoke/` | Popup and popup-player smoke tests |
| `tests/release-gate/` | Phase/release acceptance gate wrapper |
| `tests/rules/`, `tests/site-registry/`, `tests/site-state/`, `tests/protection-status/` | Contract tests for rules, state, registry, and status surfaces |

## Documentation Surface

| Path | Keep Reason |
|---|---|
| `README.md` / `README.zh-TW.md` | Public product overview and main entry point |
| `INSTALL.md` | Installation, provider setup, troubleshooting, and privacy notes |
| `docs/FEATURE_GUIDE.md` / `docs/FEATURE_GUIDE.zh-TW.md` | User-facing feature map and detailed walkthrough |
| `docs/ADVANCED_AI_POLICY_GUIDE.md` / `docs/ADVANCED_AI_POLICY_GUIDE.zh-TW.md` | Tutorial for provider profiles, Policy Gate, candidate review, and privacy boundaries |
| `POLICY-GATE.md` | Compact Policy Gate contract for maintainers |
| `ARCHITECTURE.md` | Current architecture flow diagrams |
| `DESIGN.md` | Active UI/design baseline |
| `SELF-LEARNING.md` | Live-browser validation loop operator guide |
| `docs/archive/` | Public archive index that explains where historical material was retained locally |

## Local-Only Surfaces

Ignored local files are intentionally outside the rebuild surface. Use `local/rebuild-backup-2026-06-05/` for recoverable local backup material such as PSD drafts, packed extension files, browser profiles, generated reports, temporary output, and full development-history snapshots.
