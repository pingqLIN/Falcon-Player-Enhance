# Chrome Built-in Model Load Test Plan

This plan defines a local-only load test for Chrome built-in Prompt API / Gemini Nano style model usage in Falcon-Player-Enhance.

The goal is to measure how the model-facing pipeline behaves when a page contains many hostile player-adjacent elements, without visiting real malicious sites or loading third-party content.

## Safety Boundary

- Serve only synthetic fixtures from `127.0.0.1`.
- Block every non-local browser request.
- Use inert redirect bait such as `data-fake-href`; do not perform real cross-site navigation.
- Do not include real malware binaries or exploit payloads.
- Default to `lanes=1`.
- Stop on GPU temperature, GPU power, wall-clock, per-case timeout, or consecutive Prompt API errors.

Default fuses:

- `maxRunSeconds=120`
- `maxCaseSeconds=20`
- `maxConsecutivePromptErrors=2`
- `gpuSampleIntervalMs=1000`
- `maxGpuTempC=78`
- `maxGpuPowerW=160`
- `cooldownUntilTempBelowC=65`
- `killBrowserOnFuse=true`

For the first GTX 1080 real Prompt API run, use only `density=1`, `repeats=1`, `lanes=1`, and `maxRunSeconds<=60`.

## Metrics

- `case`: one synthetic page scenario.
- `density`: hostile/noise DOM multiplier.
- `features`: candidate features sent toward the model.
- `promptBytes`: UTF-8 bytes in the final prompt.
- `modelCall`: one Prompt API or mock inference.
- `casePerMinute`: completed cases divided by elapsed wall-clock minutes.
- `featuresPerSecond`: processed feature count divided by elapsed wall-clock seconds.
- `joulesPerCase`: integrated GPU `powerDrawW * deltaSeconds` divided by completed cases.
- `stableCapacity`: highest `casePerMinute` that satisfies latency, error-rate, GPU temperature, and power fuses.

## Acceptance

Mock validation must cover:

- happy path
- prompt error fuse
- fake GPU temperature fuse
- fake GPU power fuse
- disabled or missing GPU sampling fallback
- report schema completeness
- local-only request enforcement

Real Prompt API validation must distinguish:

- `promptApiAvailable`
- `promptApiUsable`
- `promptApiRoute`
- `promptApiUnavailableReason`
- `runDisposition`

If Prompt API is unavailable or unusable in real mode, the run is `environment-blocked`, not a capacity result.

## Reference Inputs

- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\run_nano_guard_feasibility.py` - existing local HTTP server and isolated Chrome pattern.
- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\site\nano_guard_probe.js` - existing Prompt API probing pattern.
- `Q:\UniText\runtime\skills\external-audit-orchestrator\SKILL.md` - plan-first audit and source attribution rules.
