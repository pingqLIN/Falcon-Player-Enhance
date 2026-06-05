# 進階 AI 與 Policy Gate 教學

本文件說明 Falcon-Player-Enhance 的進階 AI 功能：provider profiles、Policy Gate 分層、候選規則、誤判證據與隱私邊界。

## Provider 設定模型

Falcon 不需要 AI provider 也能運作。啟用 provider 後，核心規則引擎仍是權威決策來源。

| Provider | 適合用途 |
|---|---|
| OpenAI | 雲端 advisory 與 candidate generation |
| Gemini | 雲端 advisory 與 candidate generation |
| LM Studio | 透過 OpenAI-compatible endpoint 做本機模型實驗 |
| Chrome Built-in AI | 瀏覽器內建 Gemini Nano capability 可用時使用 |
| Gateway | 自訂 policy service 或本機 gateway |

Secrets 不寫入 provider profile defaults。雲端 provider 接收的是正規化風險訊號與候選上下文，不是完整頁面傾倒。

## Policy Gate 分層

| Tier | Runtime 權限 |
|---|---|
| `T0` | 純 deterministic rules |
| `T1` | AI advisory signals，不允許 AI 授權 runtime mutation |
| `T2` | 僅允許可逆 runtime actions |
| `T3` | 開發時期 escalation，不在 runtime 直接執行 |

目前允許的 T2 actions 很窄：調整 overlay scan timing、收緊 popup guard、保護 external navigation、套用 temporary extra blocked domains。

## Candidate Workflow

1. Runtime telemetry 與 heuristics 產生結構化風險證據。
2. 所選 provider 可回傳 advisory output 與 candidate selectors/domains。
3. Candidate sets 在 review 前都維持 pending。
4. Accepted candidates 才能 promote 成 confirmed patterns。
5. Promotions 可以 rollback。
6. 近期 false-positive evidence 會阻擋相符 promotion。

## 誤判證據

在 popup 或 side panel 掃描目前頁面。每個可逆 Falcon action 都可以 preview、restore once、report false positive。回報會成為 candidate promotion 的 negative evidence，避免 AI-assisted learning 重複使用者可見的錯誤。

## 隱私邊界

Provider-bound context 在離開 extension runtime 前會收斂：

- URL 在 provider request 前移除 query/hash。
- Telemetry detail fields 受 schema 限制。
- Page-forged `window.postMessage` AI events 會被忽略。
- Iframe frame-source messages 不再向任意 parent page 暴露 media URLs、titles、posters 或 frame origins。

Regression coverage:

```powershell
python tests/ai/run_ai_bridge_spoof_regression.py
python tests/player-detection/run_frame_source_metadata_privacy_regression.py
node tests/ai/run_provider_profiles_privacy_regression.js
python tests/ai/run_candidate_promotion_regression.py
```
