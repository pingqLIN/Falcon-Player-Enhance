# uBlock Origin Lite vs Falcon 事件流程比較

> README 改版素材：本文件用同一組事件說明 uBlock Origin Lite 與 Falcon-Player-Enhance 的處理差異，並補充目前 Gemini Nano / Chrome Built-in 路徑的實測狀態。

## 核心差異

uBlock Origin Lite 是 MV3 的宣告式 content blocker。它主要把 filter list 編譯成瀏覽器可執行的 declarative rules，當 request 或 cosmetic filtering 條件命中時，由瀏覽器直接阻擋或注入隱藏規則。

Falcon 則是 runtime 防護系統。它除了既有規則與 heuristic，也會觀察 DOM、popup、overlay、clickjacking、外部跳轉與播放器干擾訊號，再把這些訊號累積成 host risk profile，交給 AI provider 產生 advisory / candidate，最後由 Policy Gate 決定是否只記錄、臨時加強，或升級到開發期審核。

## 實體事件 1：假播放鍵導流

事件：

使用者點擊播放器上的假 `Play` 按鈕，頁面觸發 `window.open`、同分頁外部跳轉或導向廣告網域。

uBlock Origin Lite：

1. 瀏覽器準備發出 navigation / request。
2. DNR 規則比對目標 URL、resource type、initiator 等條件。
3. 若命中既有 filter rule，瀏覽器直接 block / redirect / allow。
4. 若沒有命中，該次跳轉通常不會因為「行為看起來可疑」而被現場推論成新規則。

Falcon：

1. `inject-blocker` / `ai-runtime` 觀察 click、popup、external navigation trap。
2. 已知廣告網域或 popup trap 先由 deterministic rule 處理。
3. 未完全命中的事件會進入 telemetry，累積 host risk score。
4. AI provider 可根據近期事件提出 `guard_external_navigation` 或 candidate domain。
5. Policy Gate 若判定為 T2，才允許可逆的外部跳轉 guard；不會永久寫入正式規則。

## 實體事件 2：全螢幕 overlay 擋住播放器

事件：

頁面在播放器上方插入 fixed / high z-index overlay，攔截使用者點擊，真實播放器仍在底下。

uBlock Origin Lite：

1. 若 cosmetic filter 已有 selector，瀏覽器注入 CSS 隱藏該元素。
2. 若 selector 尚未存在，uBOL Lite 不會在現場理解「這個 overlay 是播放器干擾」並自行產生新 selector。
3. 後續通常依賴 filter list 維護或使用者回報。

Falcon：

1. `overlay-remover` 掃描 player-adjacent overlay。
2. `ai-runtime` 觀察 suspicious DOM churn，例如 overlay / popup / ad-like node 大量插入。
3. 風險升高後，AI 可提出 candidate selector 或 `tune_overlay_scan`。
4. Policy Gate 只允許調整掃描頻率、臨時隱藏或提升播放器層級等可逆動作。
5. selector 若要成為正式規則，仍需開發期審核與 regression。

## 實體事件 3：未知廣告 iframe 反覆重生

事件：

頁面反覆插入未知 `iframe`，來源網域尚未在既有規則內，且每次 class / id 都略有變化。

uBlock Origin Lite：

1. 若 iframe URL 或父頁 cosmetic selector 命中 filter list，瀏覽器阻擋或隱藏。
2. 若 URL / selector 未命中，uBOL Lite 本身不會根據「反覆重生」這個 runtime pattern 產生新規則。
3. 新規則通常由外部 filter list 更新帶入。

Falcon：

1. content scripts 觀察 iframe 插入、DOM churn、ad-like token、外部跳轉風險。
2. background 將事件合併到 host risk profile。
3. AI provider 統整近期訊號，提出 candidate domain、candidate selector 或 `apply_extra_blocked_domains`。
4. Policy Gate 若允許 T2，只能臨時套用 extra blocked domains。
5. durable mutation 仍被禁止，正式規則需要 review / promotion 流程。

## 比較表

| 面向 | uBlock Origin Lite | Falcon-Player-Enhance |
| --- | --- | --- |
| 主要模型 | 宣告式 filter / DNR / cosmetic rules | Runtime telemetry + heuristic + AI advisory + Policy Gate |
| 觸發來源 | request、resource type、已編譯 cosmetic rule | request-like 訊號、DOM、click、popup、overlay、iframe、host risk |
| 未命中時 | 通常放行或只套用其他既有規則 | 記錄 telemetry，可能升高 host risk 並請 AI 統整 |
| 對未知樣態 | 依賴 filter list 更新 | 可提出 candidate selector/domain/action，但不直接永久生效 |
| 執行者 | 瀏覽器 DNR / CSS/JS injection | content scripts + background + provider + Policy Gate |
| 資源成本 | 低，過濾時不需常駐判斷程序 | 較高，需要 runtime 觀察與狀態累積 |
| 可預測性 | 高，規則命中結果穩定 | 較彈性，但需 gate 控制誤判 |
| 永久規則變更 | 來自 ruleset / filter list 更新 | Runtime AI 不允許 durable mutation |
| 最適合場景 | 已知廣告網域、已知 selector、標準 tracker | 站點特化播放器干擾、假播放、overlay、未知重生行為 |

## 流程圖

Mermaid source: `docs/diagrams/ubol-vs-falcon-event-flow.mmd`

Rendered SVG: `docs/diagrams/ubol-vs-falcon-event-flow.svg`

## Gemini Nano 目前表現

目前 Falcon 內的 Chrome Built-in / Gemini Nano 路徑已有 provider integration、dashboard 設定、health check、advisory path、element classification path，以及 local-only nano guard load harness。

2026-05-27 重新執行結果：

- Mock load harness：`mock-validated`，2 cases completed，error rate `0.0`，沒有外部 request。
- Mock p50 model latency：約 `37ms`，p95 約 `39.7ms`。
- Mock run GPU peak：約 `51C`、`50.74W`、`3079MiB`。
- Real Prompt API gate：`environment-blocked`。
- Real gate 錯誤：`Unable to create a text session because the service is not running.`

結論：

目前不能說 Gemini Nano 在 Falcon 內「效能不好」，因為真實模型尚未成功建立 session；只能說 harness、資料收集、安全 fuse 與 mock path 是可用的，但 real Prompt API service 仍不可用，因此還沒有有效的 GTX 1080 / Gemini Nano 容量數據。

## 目前可修正或補強的點

1. Health check 應拆成 `available` 與 `usable`：目前 health path 主要看 availability，容易出現「API surface 存在」但 `create()` 仍失敗的狀況。
2. Background 的 Chrome Built-in advisory / classification 應加入短 retry / warm-up：既有 feasibility probe 已針對 `service is not running` 做 retry，但 production provider path 目前沒有同等重試。
3. Prompt 應更小：load fixture density 1 已可產生約 9.9KB prompt；對 on-device model 來說偏重，README 與 runtime 可考慮先限制 top candidates 到 12-20 個、目標 4-6KB。
4. Route probing 應統一：feasibility probe、load harness、background 對 `LanguageModel` / `ai.languageModel` / `createTextSession` 的嘗試順序不完全一致，建議抽成一致策略。
5. 真實容量測試前應先做 Prompt API doctor：確認 Chrome channel、feature flags、model pack、profile、`chrome://on-device-internals/` 狀態與 service warm-up，不應直接進入 density escalation。
6. 在 service 不可用時，runtime 應快速 fallback 到 local heuristic / other provider，避免 UI 或 policy pipeline 等待 Chrome Built-in。

## README 建議口徑

Falcon 可以與 uBlock Origin Lite 並用：uBOL Lite 負責低成本、宣告式、已知規則命中的網路與 cosmetic filtering；Falcon 負責播放器場景中更動態的假播放、overlay、popup、導流與未知干擾樣態。Falcon 的 AI 不取代 filter list，而是把現場訊號整理成 advisory / candidate，再交由 Policy Gate 控制行動權限。
