# Nano Guard Load Test

Local-only load harness for Chrome built-in Prompt API / Gemini Nano experiments.

The harness serves a synthetic hostile DOM fixture from `127.0.0.1`, blocks every non-local request, samples GPU state with `nvidia-smi` when available, and writes JSON reports under `tests/nano-guard-load/reports/`.

## Mock Smoke

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --mock-model --density-levels 1,2 --repeats 1 --headless
```

## GTX 1080 First Real Run

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --density-levels 1 --repeats 1 --lanes 1 --max-run-seconds 60 --max-case-seconds 20 --max-gpu-temp-c 78 --max-gpu-power-w 160 --browser-channel chrome
```

Only increase density after a completed report with no fuse trip.
