# Nano Guard Load Test Report

Generated on 2026-05-26 for the Chrome built-in model load-test harness.

## Summary

The load-test plan passed the external-audit gate after two fix rounds and a third read-only acceptance pass. The implementation now provides a local-only synthetic hostile DOM fixture, request interception, GPU sampling, Prompt API/mock execution, safety fuses, JSON reporting, and npm smoke coverage.

The conservative real Prompt API gate did not reach a model capacity result because Chrome exposed the Prompt API surface but could not create a text session:

```text
Unable to create a text session because the service is not running.
```

Disposition: `environment-blocked`. Do not infer GTX 1080 stable capacity from this run yet.

## Implemented Files

- `tests/nano-guard-load/run_nano_guard_load_test.py`
- `tests/nano-guard-load/site/malicious_fixture.html`
- `tests/nano-guard-load/site/malicious_fixture.js`
- `tests/nano-guard-load/README.md`
- `tests/nano-guard-load/README.ZHTW.md`
- `docs/NANO_GUARD_LOAD_TEST_PLAN.md`
- `docs/NANO_GUARD_LOAD_TEST_PLAN.ZHTW.md`
- `docs/NANO_GUARD_LOAD_TEST_REPORT.md`
- `docs/NANO_GUARD_LOAD_TEST_REPORT.ZHTW.md`

## External Audit Gate

Mode: `same-provider-subagent`

Disposition history:

- First pass: `fix-and-rerun`
- Second pass: `fix-and-rerun`
- Third pass: `accept`

Resolved findings:

- Added executable GTX 1080 fuse defaults.
- Added enforceable local-only request rules.
- Split Prompt API `available`, `usable`, `mock`, and `environment-blocked` outcomes.
- Defined GPU sample units and energy formula.
- Added mock commands for prompt error, GPU temperature, GPU power, and GPU sampling fallback paths.

## Validation Results

Commands run:

```powershell
python -m compileall tests\nano-guard-load
node --check tests\nano-guard-load\site\malicious_fixture.js
git diff --check
python tests\nano-guard-load\run_nano_guard_load_test.py --mock-model --density-levels 1,2 --repeats 1 --headless
python tests\nano-guard-load\run_nano_guard_load_test.py --mock-model --mock-error-after 1 --density-levels 1 --repeats 3 --max-consecutive-prompt-errors 1 --headless
python tests\nano-guard-load\run_nano_guard_load_test.py --mock-model --fake-gpu-temp-c 90 --density-levels 1 --repeats 1 --max-gpu-temp-c 78 --headless
python tests\nano-guard-load\run_nano_guard_load_test.py --mock-model --fake-gpu-power-w 190 --density-levels 1 --repeats 1 --max-gpu-power-w 160 --headless
python tests\nano-guard-load\run_nano_guard_load_test.py --mock-model --disable-gpu-sampling --density-levels 1 --repeats 1 --headless
npm run test:nano-guard:load
python tests\nano-guard-load\run_nano_guard_load_test.py --density-levels 1 --repeats 1 --lanes 1 --max-run-seconds 60 --max-case-seconds 20 --max-gpu-temp-c 78 --max-gpu-power-w 160 --browser-channel chrome
```

Key outcomes:

- Mock happy path: `mock-validated`, no external requests.
- Mock prompt error: `fuse-tripped`, `consecutive_prompt_errors_1`.
- Fake GPU temperature: `fuse-tripped`, `gpu_temp_c_90.0_gte_78.0`.
- Fake GPU power: `fuse-tripped`, `gpu_power_w_190.0_gte_160.0`.
- Disabled GPU sampling: `mock-validated`, `gpuSamplingAvailable=false`.
- npm smoke: `mock-validated`.
- Real Prompt API conservative gate: `environment-blocked`.

Latest important reports:

- `tests/nano-guard-load/reports/20260526-100806/nano-guard-load-report.json`
- `tests/nano-guard-load/reports/20260526-100841/nano-guard-load-report.json`

## Current Capacity Answer

For this machine, the current confirmed answer is:

- Mock harness throughput is measurable and safe.
- GTX 1080 real Prompt API capacity is not yet measurable because Prompt API session creation is blocked before load begins.
- The next valid capacity run must first restore Prompt API service usability, then rerun the conservative gate before any density or lane escalation.

## Reference Inputs

- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\run_nano_guard_feasibility.py` - existing local Chrome Prompt API feasibility pattern.
- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\site\nano_guard_probe.js` - existing Prompt API route probing and session behavior.
- `Q:\UniText\runtime\skills\external-audit-orchestrator\SKILL.md` - external audit workflow and Reference Inputs requirement.
- `Q:\UniText\runtime\skills\external-audit-orchestrator\references\report-format.md` - audit report structure.
- `Q:\UniText\runtime\skills\external-audit-orchestrator\references\source-attribution-policy.md` - source attribution policy.
