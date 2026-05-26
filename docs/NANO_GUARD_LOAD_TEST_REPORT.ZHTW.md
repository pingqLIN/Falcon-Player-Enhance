# Nano Guard Load Test 說明報告

產出日期：2026-05-26。範圍是 Chrome built-in model load-test harness。

## 摘要

測試計畫經過 `$external-audit-orchestrator` 的 read-only external audit gate：前兩輪是 `fix-and-rerun`，第三輪通過 `accept`。目前已完成本機 synthetic hostile DOM fixture、request interception、GPU sampling、Prompt API/mock execution、安全熔斷、JSON report 與 npm smoke script。

保守真機 Prompt API gate 沒有得到容量數據，因為 Chrome 雖然暴露 Prompt API surface，但建立 text session 失敗：

```text
Unable to create a text session because the service is not running.
```

本次真機結果是 `environment-blocked`，不能用來推論 GTX 1080 的穩定處理上限。

## 已實作檔案

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

模式：`same-provider-subagent`

審查歷程：

- 第一輪：`fix-and-rerun`
- 第二輪：`fix-and-rerun`
- 第三輪：`accept`

已修正重點：

- 補上 GTX 1080 可執行的熔斷預設。
- 補上強制 local-only request 規則。
- 區分 Prompt API `available`、`usable`、`mock` 與 `environment-blocked`。
- 定義 GPU sample 單位與能耗公式。
- 補上 mock prompt error、GPU temperature、GPU power、GPU sampling fallback 的驗收命令。

## 驗證結果

已執行：

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

重點結果：

- Mock happy path：`mock-validated`，外部 request 數量為 0。
- Mock prompt error：`fuse-tripped`，原因 `consecutive_prompt_errors_1`。
- Fake GPU temperature：`fuse-tripped`，原因 `gpu_temp_c_90.0_gte_78.0`。
- Fake GPU power：`fuse-tripped`，原因 `gpu_power_w_190.0_gte_160.0`。
- 停用 GPU sampling：`mock-validated`，`gpuSamplingAvailable=false`。
- npm smoke：`mock-validated`。
- 真機 Prompt API 保守 gate：`environment-blocked`。

重要報告：

- `tests/nano-guard-load/reports/20260526-100806/nano-guard-load-report.json`
- `tests/nano-guard-load/reports/20260526-100841/nano-guard-load-report.json`

## 目前容量結論

目前可確認：

- Mock harness 已可安全量測 throughput、latency、GPU sampling 與熔斷。
- GTX 1080 的真實 Prompt API 容量尚未可測，因為 Prompt API session 在負載開始前就建立失敗。
- 下一步必須先修復 Chrome Prompt API service usability，然後重跑 `density=1/repeats=1/lanes=1/maxRunSeconds=60` 的保守 gate；只有該報告沒有 fuse trip，才可升級 density 或 lanes。

## Reference Inputs

- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\run_nano_guard_feasibility.py` - 既有本機 Chrome Prompt API feasibility pattern。
- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\site\nano_guard_probe.js` - 既有 Prompt API route probing 與 session behavior。
- `Q:\UniText\runtime\skills\external-audit-orchestrator\SKILL.md` - external audit workflow 與 Reference Inputs 規則。
- `Q:\UniText\runtime\skills\external-audit-orchestrator\references\report-format.md` - audit report 結構。
- `Q:\UniText\runtime\skills\external-audit-orchestrator\references\source-attribution-policy.md` - source attribution policy。
