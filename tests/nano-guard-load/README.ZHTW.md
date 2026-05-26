# Nano Guard Load Test

這是 Chrome built-in Prompt API / Gemini Nano 的本機壓測 harness。

它只啟動 `127.0.0.1` synthetic hostile DOM fixture，攔截並阻擋所有非本機 request，能在可用時透過 `nvidia-smi` 取樣 GPU 狀態，並把 JSON 報告輸出到 `tests/nano-guard-load/reports/`。

## Mock Smoke

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --mock-model --density-levels 1,2 --repeats 1 --headless
```

## GTX 1080 第一輪真機測試

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --density-levels 1 --repeats 1 --lanes 1 --max-run-seconds 60 --max-case-seconds 20 --max-gpu-temp-c 78 --max-gpu-power-w 160 --browser-channel chrome
```

只有完整報告顯示沒有觸發 fuse，才提高 density。
