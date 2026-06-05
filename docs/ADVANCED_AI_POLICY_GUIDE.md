# Advanced AI and Policy Gate Guide

This guide covers the advanced Falcon-Player-Enhance AI features: provider profiles, Policy Gate tiers, generated candidates, false-positive evidence, and privacy boundaries.

## Provider Setup Model

Falcon works without an AI provider. When a provider is enabled, the core rule engine still remains authoritative.

| Provider | Best Use |
|---|---|
| OpenAI | Cloud advisory and candidate generation |
| Gemini | Cloud advisory and candidate generation |
| LM Studio | Local model experiments through an OpenAI-compatible endpoint |
| Chrome Built-in AI | Browser-local Gemini Nano capability when available |
| Gateway | Custom policy service or local gateway |

Secrets are not persisted inside provider profile defaults. Cloud providers receive normalized risk signals and candidate context, not full page dumps.

## Policy Gate Tiers

| Tier | Runtime Authority |
|---|---|
| `T0` | Deterministic rules only |
| `T1` | Advisory AI signals, no AI-authorized runtime mutation |
| `T2` | Reversible runtime actions only |
| `T3` | Development-time escalation, never direct runtime execution |

Allowed T2 actions are intentionally narrow: tune overlay scan timing, tighten popup guard, guard external navigation, and apply temporary extra blocked domains.

## Candidate Workflow

1. Runtime telemetry and heuristics produce structured risk evidence.
2. The selected provider may return advisory output and candidate selectors/domains.
3. Candidate sets remain pending until reviewed.
4. Accepted candidates can be promoted into confirmed patterns.
5. Promotions can be rolled back.
6. Recent false-positive evidence blocks matching promotion.

## False-Positive Evidence

Use the popup or side panel to scan the current page. For each reversible Falcon action, you can preview, restore once, and report false positive. A report becomes negative evidence for candidate promotion so AI-assisted learning does not repeat a user-visible mistake.

## Privacy Boundary

Provider-bound context is normalized before it leaves the extension runtime:

- URLs are reduced before provider requests.
- Telemetry detail fields are schema-limited.
- Page-forged `window.postMessage` AI events are ignored.
- Iframe frame-source messages do not expose media URLs, titles, posters, or frame origins to arbitrary parent pages.

Regression coverage:

```powershell
python tests/ai/run_ai_bridge_spoof_regression.py
python tests/player-detection/run_frame_source_metadata_privacy_regression.py
python tests/ai/run_provider_profiles_privacy_regression.js
python tests/ai/run_candidate_promotion_regression.py
```
