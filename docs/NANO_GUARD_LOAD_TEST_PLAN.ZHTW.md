# Chrome Built-in Model Load Test Plan

## 目的

本計畫用來驗證 Chrome built-in Prompt API / Gemini Nano 類型的本機模型，在未安裝 uBlock Origin Lite 或其他通用 blocker 時，面對高噪音、高惡意元素密度頁面的可承受範圍。

測試目標不是打真實惡意網站，而是先用本機 synthetic fixture 重播幾種可控壓力來源：

- 覆蓋播放器的大型 clickable overlay
- 彈窗與重新導向誘餌元素
- iframe fanout
- 大量 script/link/img 噪音節點
- mutation burst
- 過長文字與屬性資料

## 安全邊界

- 預設只跑本機 `127.0.0.1` fixture。
- 預設不連外、不打真實惡意網站、不下載第三方內容。
- 預設 `lanes=1`，避免同時建立多個 Prompt API session。
- Playwright 必須攔截所有 request；任何非 `http://127.0.0.1:<port>/` 或 `data:` request 都必須讓 run fail。
- fixture 只能使用 inline script/style 與本機 fixture resource，不允許 remote `script`、`img`、`iframe`、`link`、`fetch`、`beacon`。
- redirect bait 必須是 inert data，例如 `data-fake-href`，不得真的觸發跨站 navigation。
- fixture 不放真實 malware binary、不放 exploit payload，只模擬 DOM 形狀、事件密度與高噪音特徵。
- 每輪測試都必須有 GPU 熔斷條件：
  - GPU temperature 達到門檻即停止。
  - GPU power draw 達到門檻即停止。
  - Prompt API 連續錯誤即停止。
- 預設熔斷值：
  - `maxRunSeconds=120`
  - `maxCaseSeconds=20`
  - `maxConsecutivePromptErrors=2`
  - `gpuSampleIntervalMs=1000`
  - `maxGpuTempC=78`
  - `maxGpuPowerW=160`
  - `cooldownUntilTempBelowC=65`
  - `killBrowserOnFuse=true`
- 若目標機 GTX 1080 在高負載下會整機重開，正式壓測應先用短秒數、低 density 跑 dry run，再逐步拉高。
- GTX 1080 第一輪實機只能使用 `density=1`、`repeats=1`、`lanes=1`、`maxRunSeconds<=60`；只有完整報告顯示沒有 fuse trip，才進入下一個 density 或 lane。

## 量測單位

主要用以下單位描述可承受流量：

- `case`: 一個 synthetic page scenario。
- `density`: 惡意元素與噪音節點倍率。
- `features`: feature extractor 實際送入模型前保留下來的候選特徵數。
- `promptBytes`: 實際模型 prompt 的 UTF-8 byte size。
- `modelCall`: 一次 Prompt API 推論。
- `casePerMinute`: 每分鐘穩定處理 case 數。
- `featuresPerSecond`: 每秒完成的候選特徵數。
- `joulesPerCase`: 使用 `power.draw(W) * duration(s)` 估算的每 case 能耗。
- `stableCapacity`: 同時滿足 p95 latency、錯誤率、GPU 溫度與功耗門檻時的最高 `casePerMinute`。

公式：

- `latencyMs`: 每次 `modelCall` 的 wall-clock 毫秒。
- `errorRate`: `failed modelCall / attempted modelCall`。
- `casePerMinute`: `completedCaseCount / elapsedWallClockMinutes`。
- `featuresPerSecond`: `processedFeatureCount / elapsedWallClockSeconds`，預設包含 feature extraction 與 model time。
- `joulesPerCase`: 對 GPU sample 做區間積分，`sum(powerDrawW * deltaSeconds) / completedCaseCount`。
- `p95LatencyMs`: 對成功完成的 `modelCall` latency 排序後取第 95 百分位；若成功樣本不足，報告 `null` 並標記 `insufficientSamples=true`。

## 測試分層

### Layer 1: Feature Budget Baseline

確認 extractor 不會把整頁 DOM 直接丟給模型。

驗收條件：

- 可設定 `maxCandidates`。
- 可設定 `maxPromptBytes`。
- 報告包含原始節點數、候選數、截斷數、prompt bytes。
- density 增加時，prompt bytes 應被上限控制。

### Layer 2: Prompt API Latency Baseline

確認單一模型呼叫在不同 density 下的 latency、parse 結果與錯誤率。

驗收條件：

- 報告包含 p50/p95/max latency。
- 報告包含 success/error count。
- Prompt API 不可用時，報告必須明確標記 `promptApiAvailable=false`，而不是假裝測試通過。
- Prompt API surface 存在但 session 建立失敗時，報告必須標記 `promptApiAvailable=true`、`promptApiUsable=false`。
- 真機模式下 Prompt API 不可用或不可用時，`runDisposition` 必須是 `environment-blocked`，不得輸出 capacity recommendation。
- mock mode 下 `mockModel=true`，明確豁免 Prompt API 可用性要求，`runDisposition` 可為 `mock-validated`。

### Layer 3: GPU / Power Sampling

用 `nvidia-smi` 取樣 GPU 狀態。

驗收條件：

- 每次執行輸出 raw GPU samples。
- Summary 包含平均與峰值 power draw、temperature、GPU utilization、memory used。
- 無 `nvidia-smi` 時測試仍可跑，但報告標記 `gpuSamplingAvailable=false`。
- Raw sample schema 必須使用明確單位：
  - `timestampIso`
  - `elapsedMs`
  - `temperatureC`
  - `powerDrawW`
  - `gpuUtilizationPct`
  - `memoryUtilizationPct`
  - `memoryUsedMiB`
- `N/A` 或 parse failure 不可當作 0；應存為 `null` 並在 summary 標記 `missingSampleCount`。
- `lanes>1` 時，`joulesPerCase` 是 run-level 平均分攤，不代表單一 case 精準 attribution。

### Layer 4: Throughput Ramp

以短時間漸進方式找出穩定流量。

初始建議：

- `density=1,2,4`
- `repeats=3`
- `lanes=1`
- `maxGpuTempC=78`
- `maxGpuPowerW=160`

後續若穩定，再提高：

- `density=8`
- `repeats=5`
- `lanes=2`

## 建議檔案

- `tests/nano-guard-load/README.md`
- `tests/nano-guard-load/README.ZHTW.md`
- `tests/nano-guard-load/run_nano_guard_load_test.py`
- `tests/nano-guard-load/site/malicious_fixture.html`
- `tests/nano-guard-load/site/malicious_fixture.js`
- `tests/nano-guard-load/reports/`，加入 `.gitignore`

## 報告格式

輸出 `nano-guard-load-report.json`，至少包含：

- `generatedAt`
- `browserChannel`
- `headless`
- `mockModel`
- `promptApiAvailable`
- `promptApiUsable`
- `promptApiRoute`
- `promptApiUnavailableReason`
- `runDisposition`
- `safetyLimits`
- `runMatrix`
- `caseResults`
- `gpuSamples`
- `summary`
- `recommendation`

`runDisposition` 可用值：

- `mock-validated`
- `completed`
- `fuse-tripped`
- `environment-blocked`
- `failed`

## Mock Mode 驗收

`--mock-model` 必須驗證：

- report JSON 欄位完整，且 `mockModel=true`。
- request interception 有記錄，且 `blockedExternalRequestCount=0`。
- `maxPromptBytes` 截斷可被觸發並反映在 `truncatedPromptBytes` 或同等欄位。
- 可用參數注入 Prompt API mock error，並讓 `maxConsecutivePromptErrors` fuse 生效。
- 可用 fake GPU sample 觸發 temp/power fuse。
- 找不到 `nvidia-smi` 或手動停用 GPU sampling 時，報告 `gpuSamplingAvailable=false`，但 runner 不崩潰。

## 驗收命令

最小驗證先用 mock model，避免依賴本機 Chrome Prompt API 狀態：

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --mock-model --density-levels 1,2 --repeats 1 --headless
```

Mock fuse 驗證必須另外跑：

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --mock-model --mock-error-after 1 --density-levels 1 --repeats 3 --max-consecutive-prompt-errors 1 --headless
python tests/nano-guard-load/run_nano_guard_load_test.py --mock-model --fake-gpu-temp-c 90 --density-levels 1 --repeats 1 --max-gpu-temp-c 78 --headless
python tests/nano-guard-load/run_nano_guard_load_test.py --mock-model --fake-gpu-power-w 190 --density-levels 1 --repeats 1 --max-gpu-power-w 160 --headless
python tests/nano-guard-load/run_nano_guard_load_test.py --mock-model --disable-gpu-sampling --density-levels 1 --repeats 1 --headless
```

GTX 1080 真機 Prompt API 第一輪只能跑保守 gate：

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --density-levels 1 --repeats 1 --lanes 1 --max-run-seconds 60 --max-case-seconds 20 --max-gpu-temp-c 78 --max-gpu-power-w 160 --browser-channel chrome
```

只有第一輪完整報告顯示 `runDisposition=completed` 且沒有 fuse trip，才允許跑 escalation：

```powershell
python tests/nano-guard-load/run_nano_guard_load_test.py --density-levels 1,2 --repeats 2 --lanes 1 --max-run-seconds 120 --max-case-seconds 20 --max-gpu-temp-c 78 --max-gpu-power-w 160 --browser-channel chrome
```

## Reference Inputs

- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\run_nano_guard_feasibility.py` - 沿用既有 Chrome Prompt API feasibility harness 的本機 HTTP server 與 isolated Chrome pattern。
- `Q:\Projects\Falcon-Player-Enhance\tests\nano-guard\site\nano_guard_probe.js` - 沿用 Prompt API route probing、session 建立與 JSON 解析方向。
- `Q:\UniText\runtime\skills\external-audit-orchestrator\SKILL.md` - 本計畫依照 external-audit-orchestrator 的 plan-first 與 Reference Inputs 規則進行審查。
