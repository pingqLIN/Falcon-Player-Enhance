## E2E AI Replay

### 目的
- 回放 AI 事件序列並驗證策略轉換
- 驗證 `false_positive_signal` 與 `user_override` 會觸發 host fallback
- 輸出各 host 風險曲線摘要與 pass/fail 報告

### 執行方式
```bash
node tests/e2e-ai-replay/run-e2e-ai-replay.js
```

### 使用匯出的資料集回放
```bash
node tests/e2e-ai-replay/run-e2e-ai-replay.js --dataset <path-to-exported-dataset.json>
```

### 指定 scenario 檔
```bash
node tests/e2e-ai-replay/run-e2e-ai-replay.js --scenarios tests/e2e-ai-replay/scenarios.json
```

### 輸出報告
- 預設輸出 `tests/e2e-ai-replay/reports/latest-report.json`
- 可用 `--out` 指定輸出路徑

### NPM 指令
```bash
npm run test:e2e-replay
```
