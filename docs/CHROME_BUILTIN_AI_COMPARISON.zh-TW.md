# Chrome Built-in AI 接入與模型比較報告

## 摘要

- 已完成 `Chrome Built-in AI` 接入 extension，新增 `chrome_builtin` provider，並透過 offscreen document 呼叫 Prompt API。
- 已在相同 scenario 下重跑目前可執行的 AI 模型：`gpt-5.4-mini`、`gemini-2.5-flash`、`google/gemma-3-4b`，以及 `Chrome Built-in AI (gemini-nano)`。
- 本輪實測結果中，`gpt-5.4-mini` 仍是唯一 `2/2 PASS` 的模型。
- `Chrome Built-in AI` 在本機環境中可讓 Prompt API 介面出現，但 `LanguageModel.create()` 回傳 `NotAllowedError: service is not running`，因此目前屬於「已整合、但本機不可用」。

## 官方參考資料

- Chrome Built-in AI 總覽：<https://developer.chrome.com/docs/ai/built-in?hl=zh-tw>
- Prompt API：<https://developer.chrome.com/docs/ai/prompt-api>
- Extensions Prompt API：<https://developer.chrome.com/docs/extensions/ai/prompt-api>

## 接入設計

### 為什麼用 offscreen document

Chrome Prompt API 需要 document context，比較不適合直接綁在 extension service worker。這次實作改成：

1. `background.js` 保留 provider dispatch、health check、advisory normalization。
2. `offscreen/chrome-builtin.html` + `offscreen/chrome-builtin.js` 作為 Prompt API bridge。
3. 背景頁透過 `BroadcastChannel` 呼叫 offscreen document。
4. offscreen document 用 `LanguageModel.availability()`、`LanguageModel.create()`、`prompt()` 執行結構化輸出。

### 本輪新增檔案

- `extension/offscreen/chrome-builtin.html`
- `extension/offscreen/chrome-builtin.js`
- `extension/testing/ai-eval.html`
- `extension/testing/ai-eval.js`
- `tests/ai-eval/run-chrome-builtin-evaluation.js`

### 本輪修改重點

- `extension/manifest.json`
  - 新增 `offscreen` permission
- `extension/background.js`
  - 新增 `chrome_builtin` provider
  - 新增 health check / advisory request / element classification dispatch
- `extension/dashboard/dashboard.html`
- `extension/dashboard/dashboard.js`
  - 新增 `Chrome Built-in AI` provider card
  - 對 built-in provider 隱藏 API key 與 endpoint 欄位
- `extension/_locales/en/messages.json`
- `extension/_locales/zh_TW/messages.json`
  - 新增 provider label 與說明文案

## 測試方法

### 共用 scenario

本輪比較使用既有 `tests/ai-eval/scenarios.lmstudio.json` 的兩個 scenario：

- `overlay_lure_with_redirect_cta`
- `small_muted_loop_fake_video_cluster`

比較指標：

- `PASS / FAIL`
- `latencyMs`
- `recommendedActions` 是否命中固定 token
- `candidateSelectors` 是否足以支撐 runtime 使用
- `confidence`

### 執行指令

```bash
npm run test:openai:live -- --out tests/ai-eval/reports/round-2026-03-20/openai-gpt-5.4-mini.current.json
npm run test:chrome-builtin:live -- --out tests/ai-eval/reports/round-2026-03-20/chrome-built-in-gemini-nano.json
npm run test:gemini:live -- --out tests/ai-eval/reports/round-2026-03-20/gemini-2.5-flash.current.json
npm run test:lmstudio:live -- --timeout 60000 --out tests/ai-eval/reports/round-2026-03-20/lmstudio-gemma-3-4b.current.json
node tests/ai-eval/compare-provider-reports.js --dir tests/ai-eval/reports/round-2026-03-20 --out tests/ai-eval/reports/round-2026-03-20/provider-comparison.json
```

## 測試結果

| Model | Provider | Result | 平均延遲 | 結論 |
| --- | --- | --- | ---: | --- |
| `gpt-5.4-mini` | OpenAI Responses API | `2/2 PASS` | `2699 ms` | 目前最佳，輸出最穩 |
| `gemini-nano` | Chrome Built-in AI | `0/2 PASS` | `0 ms` | API 已接入，但本機服務未啟動 |
| `gemini-2.5-flash` | Gemini API | `0/2 PASS` | `7918 ms` | JSON 合法，但 action token 與 selector 不穩 |
| `google/gemma-3-4b` | LM Studio | `0/2 PASS` | `N/A` | 語意可用，但 machine-action 不穩 |

## Chrome Built-in AI 實測觀察

### 已確認可用的部分

- 在 Chrome 加上 built-in AI 相關 flags，且使用 `localhost` 頁面時，可以讓 `LanguageModel` 物件出現。
- 擴充已完成 `chrome_builtin` provider 接線，dashboard 可選、background 可 dispatch、offscreen bridge 可工作。
- 結構化輸出使用 `responseConstraint`，與目前 extension 的 advisory schema 對齊。

### 本機無法完成推理的原因

本機在建立 session 時回傳：

```text
NotAllowedError: Unable to create a text session because the service is not running.
```

另外，localhost probe 雖然能看到 Prompt API 介面，但 availability 回傳 `unavailable`。這代表：

- Prompt API surface 已出現
- 但內建模型服務沒有真正可用

因此本輪結論不是「整合失敗」，而是「整合完成，但本機 Chrome Built-in AI 執行環境尚未 ready」。

## 模型差異分析

### `gpt-5.4-mini`

- 穩定輸出固定 action token
- `candidateSelectors` 與 `candidateDomains` 結構完整
- latency 最低且結果最穩
- 適合當目前主線 provider

### `Chrome Built-in AI (gemini-nano)`

- 最大優勢是本地執行、不需外部 API key
- 目前 extension 端接線已完成
- 真正阻塞點在本機 Chrome 執行環境，不在 extension 程式碼

### `gemini-2.5-flash`

- 能回合法 JSON
- 但 `recommendedActions` 偏自然語言，缺乏固定 token
- `candidateSelectors` 為空，無法直接支撐 runtime 使用

### `google/gemma-3-4b` via LM Studio

- 能理解情境，也會回 summary / confidence
- 但輸出較偏顧問式語句
- 未能穩定符合 extension 的 strict machine-action 要求

## 建議

### 目前上線建議

1. 繼續以 `gpt-5.4-mini` 作為第一選擇。
2. 保留 `Chrome Built-in AI` provider，作為未來 Chrome 本地模型可用時的零 API-key 路徑。
3. 暫時不要把 `chrome_builtin` 設成預設 provider，直到至少有一台可用環境完成 `2/2 PASS` live eval。

### Chrome Built-in AI 下一步

1. 在支援 built-in AI 的 Chrome 穩定環境重跑 `test:chrome-builtin:live`。
2. 補一組 extension page 實機 smoke，確認 dashboard -> health check -> advisory request 全鏈路可用。
3. 一旦 `LanguageModel.create()` 可成功建立 session，再與 `gpt-5.4-mini` 比較延遲與輸出穩定度。

## 產出位置

- 本輪比較結果摘要：`tests/ai-eval/reports/round-2026-03-20/provider-comparison.json`
- Chrome Built-in AI 原始結果：`tests/ai-eval/reports/round-2026-03-20/chrome-built-in-gemini-nano.json`
- OpenAI 原始結果：`tests/ai-eval/reports/round-2026-03-20/openai-gpt-5.4-mini.current.json`
- Gemini 原始結果：`tests/ai-eval/reports/round-2026-03-20/gemini-2.5-flash.current.json`
- LM Studio 原始結果：`tests/ai-eval/reports/round-2026-03-20/lmstudio-gemma-3-4b.current.json`

注意：`tests/ai-eval/reports/` 目前在 `.gitignore` 中，所以 raw report 會保留在本機，不會隨 repo 推送。這份文件已把核心結果收斂成可追蹤版本。
