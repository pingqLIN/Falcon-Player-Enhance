## AI 驗證實驗

### 目的
- 驗證 AI 風險引擎對惡意行為的分級能力
- 確認正常站點不會被過度升級
- 檢查高風險案例是否能在有限事件內進入高風險策略

### 執行方式
```bash
node tests/ai-eval/run-ai-evaluation.js
```

### LM Studio 測試
```bash
npm run test:lmstudio
```

### LM Studio 真機測試
```bash
npm run test:lmstudio:live
```

### LM Studio Health Check
```bash
npm run check:lmstudio
```

### LM Studio 候選規則輸出
```bash
npm run build:lmstudio-rules
```

### LM Studio 真機候選規則輸出
```bash
npm run build:lmstudio-rules:live
```

### OpenAI 真機測試
預設模型為 `gpt-5.4-mini`，使用官方 `Responses API`。
```bash
npm run test:openai:live
```

### Chrome Built-in AI 真機測試
預設模型標示為 `gemini-nano`，使用 Chrome Prompt API。
```bash
npm run test:chrome-builtin:live
```

注意事項：
- 這條路徑依賴 Chrome 內建 AI 能力，而不是外部 API key。
- 目前專案透過 offscreen document 呼叫 Prompt API，避免把 Prompt API 綁死在 service worker。
- 若本機 Chrome 尚未具備可用的 built-in model，測試會回 `availability: unavailable` 或 `service is not running`。
- 測試腳本會先嘗試 extension integration smoke，失敗後再退回 localhost + Chrome flags 檢查 API 是否可見。

### Gemini 真機測試
預設模型為 `gemini-2.5-flash`，使用官方 `generateContent` 端點。
```bash
npm run test:gemini:live
```

### 多模型比較
把 `tests/ai-eval/reports/` 內的 live report 做成排行榜。
```bash
npm run test:ai:compare
```

### 目前建議
- 第一選擇：`gpt-5.4-mini`
- 原因：
  - 經過 prompt + 本地正規化後，已可穩定輸出擴充可執行的 action token
  - live eval 已通過
  - 延遲與輸出穩定度都優於目前測過的 `gpt-5.4-nano`、`gpt-5-nano`、`gemini-2.5-flash`

### 2026-03-20 同條件比較摘要
- `gpt-5.4-mini`: `2/2 PASS`，目前最佳
- `Chrome Built-in AI (gemini-nano)`: 已完成擴充整合，但本機 Chrome 回報 `service is not running`，無法完成 live inference
- `gemini-2.5-flash`: `0/2 PASS`，主要卡在 action token 與 selector 輸出穩定度
- `google/gemma-3-4b` via LM Studio: `0/2 PASS`，輸出較偏自然語言建議

### 真機模式
若本機已啟動 LM Studio server 並載入模型，可直接執行:
```bash
node tests/ai-eval/run-lmstudio-evaluation.js --endpoint http://127.0.0.1:1234/v1/chat/completions
```

### 測試輸入
- `scenarios.json`
  - benign 情境
  - stubborn popup trap 情境
  - critical multi-vector abuse 情境

### 驗證重點
- `maxTier` 上限驗證
- `minTier` 下限驗證
- `reachWithinEvents` 反應速度驗證

### 延伸建議
- 把真實 `exportAiDataset` 匯出資料回放成 scenario
- 建立 A/B 對照
  - A: baseline 固定策略
  - B: AI adaptive policy
- 比較指標
  - 惡意彈窗觸發率下降
  - 覆蓋層移除成功率
  - 誤攔截率
  - 使用者回退率
- 持續把 `recommendedActions` 壓成固定 enum，而不是自然語句
- 對 `candidateSelectors` 增加數量與 specificity 限制
