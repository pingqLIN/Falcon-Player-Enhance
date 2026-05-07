# 全 AI 啟發式廣告 / 惡意元素阻擋擴充開發研究計劃書

## 1. 研究定位

本計劃書提出一條較激進的 extension 研究路線：不再以「網域清單 / selector 清單 / 靜態 DNR 規則」作為核心能力，而是以 AI 建構的即時啟發式模型判斷頁面元素、互動陷阱、播放器干擾與惡意導流。

這不是把既有規則系統換成更大的黑盒規則庫，而是研究一個 `AI-first heuristic blocker`：

- 以瀏覽器現場觀測資料為主要輸入
- 以元素行為、版面上下文、互動結果與網路跡象建立判斷
- 只把清單視為訓練 / 對照 / fallback material，不視為核心阻擋依據
- 讓 AI 產生可解釋、可回放、可回退的 runtime decision
- 將 durable mutation 降到最後階段，且必須經過 replay 與審核

## 2. 核心假設

傳統 blocker 的強項是已知模式快速命中，但弱點是：

- 新站點、新 selector、新導流域會快速繞過清單
- 過度依賴網域 / class name 容易被隨機化命名擊穿
- 清單命中無法完整理解「這個元素是否真的傷害播放器使用流程」
- 通用廣告阻擋容易誤殺登入、付款、年齡驗證、OAuth、播放器合法控制層

本研究假設：

- 廣告 / 惡意元素會留下可觀測的行為特徵，而不只留下可列舉的名稱
- 以事件序列判斷比單點 selector 判斷更穩
- AI 可以將 DOM、layout、network、user interaction、navigation result 合成為較泛化的風險判斷
- 只要 decision 被限制在 host-scoped、time-limited、reversible actions，較激進的 AI 判讀仍可控

## 3. 研究目標

### 3.1 主要目標

建立一個不依賴清單式防護規則的 AI 啟發式阻擋架構，能對未知網站即時判斷：

- 覆蓋播放器的廣告層
- 假播放按鈕 / 假影片
- 點擊劫持透明層
- 首次點擊導流陷阱
- popup / popunder 觸發點
- 惡意 notification / permission lure
- 偽裝成播放器控制項的外跳元素
- iframe 中介的播放器周邊陷阱

### 3.2 非目標

本研究不以成為通用廣告攔截器為第一目標。

暫不承諾：

- 全網廣告零顯示
- 自動永久寫入全域 DNR
- 自動發布站點規則
- 對新聞、商務、社群、登入頁做廣域清理
- 取代 uBlock Origin Lite 這類成熟清單型 blocker

## 4. 系統架構草案

建議拆成七層：

```text
Observation Kernel
→ Feature Builder
→ AI Heuristic Engine
→ Policy Gate
→ Action Executor
→ Evidence Recorder
→ Replay / Promotion Pipeline
```

### 4.1 Observation Kernel

負責在頁面中蒐集低層訊號，但不做最終判斷。

觀測來源：

- DOM mutation
- element geometry
- computed style
- z-index / opacity / pointer-events
- click / pointerdown / mousedown / touchstart
- window.open / location / history API
- frame ancestry
- video / iframe / canvas player candidate
- network request metadata
- blocked / allowed navigation result
- console error / CSP / failed media load
- before / after screenshot diff

重要原則：

- 觀測不等於阻擋
- 所有資料都應最小化，不收集頁面敏感輸入值
- 只記錄 element summary，不記錄 password、token、完整表單內容

### 4.2 Feature Builder

把原始瀏覽器訊號轉為 AI 可讀的結構化特徵。

建議 feature schema：

```json
{
  "page": {
    "hostname": "example.com",
    "urlClass": "video_page",
    "interactionSensitive": false,
    "hasProminentMedia": true
  },
  "element": {
    "tag": "div",
    "role": "button",
    "textTokens": ["play", "continue"],
    "selectorSketch": "div.fixed > button.play",
    "box": { "x": 420, "y": 240, "w": 160, "h": 90 },
    "style": {
      "position": "fixed",
      "zIndexBucket": "very_high",
      "opacityBucket": "transparent",
      "pointerEvents": "auto"
    }
  },
  "context": {
    "nearestPlayerDistance": 12,
    "overlapWithPlayer": 0.72,
    "insideIframe": false,
    "sameOrigin": true,
    "visibleDurationMs": 1800
  },
  "behavior": {
    "afterClick": "popup_opened",
    "newTabHost": "unknown-random-domain.example",
    "sameTabRedirect": false,
    "domChurnAfterClick": "high"
  }
}
```

這裡刻意使用 `selectorSketch`，而不是完整 selector。完整 selector 可以在 evidence 裡保存，但 AI 判斷應優先看行為與語意，而不是學會某個 class name。

### 4.3 AI Heuristic Engine

AI 不直接回傳「封鎖某 selector」，而是回傳一份 typed decision：

```json
{
  "decisionId": "heuristic_...",
  "classification": "malicious_player_obstruction",
  "confidence": 0.91,
  "riskTier": "high",
  "reasonCodes": [
    "overlaps_player",
    "transparent_click_layer",
    "popup_after_first_click"
  ],
  "recommendedAction": "neutralize_element_runtime",
  "scope": {
    "host": "example.com",
    "frame": "top",
    "durationMs": 600000
  },
  "explanation": "Element overlaps the player, intercepts clicks, and causes a popup on first interaction.",
  "evidenceRefs": ["obs_...", "screenshot_...", "network_..."]
}
```

可用模型分工：

- local small model：快速判斷低風險 / 中風險元素
- cloud model：高風險、跨訊號、多步行為推理
- rules-free heuristic scorer：不使用清單，只用本地數值特徵先打分
- consensus mode：local scorer + AI model 不一致時只 observe，不 action

### 4.4 Policy Gate

激進不代表無閘門。Policy Gate 仍是核心安全層。

建議分級：

| Gate | 條件 | 允許動作 |
|---|---|---|
| G0 observe | confidence < 0.70 | 只記錄 |
| G1 soft-neutralize | 0.70-0.82 | `pointer-events: none`、降低 z-index、短時觀察 |
| G2 runtime-hide | 0.82-0.92 且有播放器重疊 / click trap | host-scoped 隱藏元素、阻擋一次 popup |
| G3 sandbox-interaction | 0.92+ 且有 popup / redirect 實證 | 沙盒化互動、攔截外跳、強制二次確認 |
| G4 review-candidate | 多次 replay 通過 | 產生候選規則，等待人工或外部審核 |

禁止事項：

- AI 單次判斷不得寫入永久 DNR
- AI 不得在未回放前 promotion 為正式規則
- AI 不得在登入 / 付款 / OAuth / 年齡驗證頁自動移除核心互動層
- AI 不得根據文字「廣告」兩字單獨封鎖元素

### 4.5 Action Executor

Action 必須比現有 selector block 更細：

- `observe_only`
- `mark_suspicious`
- `disable_pointer_events`
- `lower_z_index`
- `hide_runtime`
- `restore_runtime`
- `block_popup_once`
- `guard_same_tab_redirect`
- `sandbox_click_probe`
- `ask_user_before_navigation`

每個 action 必須包含：

- action id
- target element fingerprint
- host scope
- frame scope
- TTL
- rollback method
- evidence refs
- user override hook

### 4.6 Evidence Recorder

所有 AI decision 都要能回放。

最小 evidence bundle：

- page URL hash / hostname
- DOM feature snapshot
- element fingerprint
- before / after element bounding box
- click result
- navigation result
- popup result
- screenshot crop
- model input / output hash
- action applied / rolled back record

敏感資料規則：

- 不保存 input value
- 不保存 cookies / authorization headers
- 不保存完整 HTML
- screenshot crop 需避開登入 / 表單區，或標記 `sensitive_redacted`

### 4.7 Replay / Promotion Pipeline

AI-first blocker 的可信度不來自模型自信，而來自 replay。

promotion 條件：

- 同一 host 至少 3 次獨立 observation
- 或跨 host 相似 pattern 至少 5 次 observation
- replay 中 action 能降低 popup / redirect / overlay 指標
- false positive smoke 測試通過
- rollback 測試通過
- 使用者或 reviewer 接受 candidate

promotion 後仍不應直接變成全域清單，可先變成：

- host-scoped heuristic profile
- pattern-family profile
- local-only user profile
- release candidate rule

## 5. 不依賴清單的啟發式特徵

### 5.1 Layout Heuristics

- 高 z-index 且覆蓋播放器
- 透明但可點擊
- fixed / sticky 區塊遮擋播放區
- 元素面積和播放器重疊超過門檻
- 元素不含媒體內容但包住 player
- 短時間反覆插入 / 移除

### 5.2 Interaction Heuristics

- 首次點擊非播放器元素後出現 popup
- 點擊透明層後主頁 URL 改變
- pointerdown 被 preventDefault / stopPropagation 異常攔截
- click target 與 visual target 不一致
- 使用者點播放器中心卻觸發外站導流

### 5.3 Semantic Heuristics

- 文字暗示播放、繼續、允許、驗證，但位置 / 行為像陷阱
- CTA 覆蓋播放器但不屬於已知播放器控制列
- notification permission lure 疊在影片播放前
- fake close button 點擊後導流

### 5.4 Network / Navigation Heuristics

- click 後新開 tab host 與頁面 / player host 無關
- 外跳到隨機子網域或短生命週期 domain
- popup target 沒有使用者可預期語意
- iframe src 與 video src 不一致且導向中介頁
- media load 被遮罩誘導點擊後才出現

### 5.5 Temporal Heuristics

- 頁面載入後 0-5 秒內插入高 z-index 點擊層
- 第一次互動後立即 DOM churn
- popup 被阻擋後又插入替代 overlay
- overlay 在 mousemove / scroll 後重新出現

## 6. 研究工作包

### WP1：觀測核心原型

目標：在不阻擋的情況下建立完整 observation log。

交付物：

- `ObservationKernel`
- feature schema
- sensitive redaction
- element fingerprint
- local evidence export

驗收：

- 能在 20 個未知影片站輸出一致 observation
- 不收集表單值與 credential
- 對登入 / OAuth 頁能正確標記 interaction-sensitive

### WP2：本地啟發式 scorer

目標：先不用外部 AI，建立可解釋數值評分。

交付物：

- layout score
- interaction score
- navigation score
- temporal score
- combined risk score

驗收：

- 高風險 popup trap 能進 G2+
- 正常播放器控制列維持 G0/G1
- 年齡驗證 / 登入對話框不被自動 hide

### WP3：AI decision compiler

目標：把 feature bundle 轉為 typed decision。

交付物：

- model prompt / schema
- JSON validator
- confidence calibration
- reason code taxonomy
- fallback on malformed output

驗收：

- malformed model output 不會 action
- AI reasonCodes 必須能映射到 evidence
- AI confidence 不足時只 observe

### WP4：Runtime action executor

目標：建立可回復 action，不寫永久規則。

交付物：

- action TTL
- rollback registry
- user override
- host fallback
- false-positive signal

驗收：

- 每個 action 都可 restore
- 使用者 override 會降低該 host aggressiveness
- action 不跨 host 擴散

### WP5：DevTools MCP 協作研究

目標：用 DevTools MCP 產生高品質 browser evidence，作為 AI-first heuristic 的研究加速器。

角色分工：

- extension 原生 AI：使用者端 runtime 判斷
- DevTools MCP：研究 / replay / debugging / evidence capture
- Codex / external reviewer：候選決策審查與 patch planning

DevTools MCP 可觀測：

- DOM snapshot
- screenshot
- network request
- console errors
- performance trace
- click replay
- popup / navigation side effect

限制：

- 只用 isolated browser profile
- 不連使用者日常登入 profile
- 不保存敏感 headers / cookies
- 不直接把 DevTools MCP 結果寫入正式規則

### WP6：Replay 評估基準

目標：用 replay 取代模型自信作為 promotion 依據。

交付物：

- scenario corpus
- action success metric
- false positive corpus
- regression report
- replay-to-candidate pipeline

核心指標：

- popup reduction rate
- overlay removal precision
- player usability preserved
- false positive rate
- rollback success rate
- user override rate

### WP7：Promotion governance

目標：把 AI 學到的 pattern 從 runtime 觀察提升為可審核資產。

promotion 階段：

1. observation
2. runtime decision
3. candidate pattern
4. replay-validated candidate
5. local profile
6. reviewed release candidate
7. durable rule / heuristic profile

## 7. 資料模型草案

### 7.1 Observation

```json
{
  "id": "obs_...",
  "host": "example.com",
  "createdAt": 0,
  "pageClass": "video_page",
  "features": {},
  "sensitiveRedaction": {
    "inputValuesRemoved": true,
    "screenshotRedacted": false
  }
}
```

### 7.2 Decision

```json
{
  "id": "decision_...",
  "observationIds": ["obs_..."],
  "classification": "clickjacking_overlay",
  "confidence": 0.88,
  "gate": "G2",
  "recommendedAction": "hide_runtime",
  "reasonCodes": ["overlaps_player", "transparent_click_target"],
  "ttlMs": 600000
}
```

### 7.3 Action

```json
{
  "id": "action_...",
  "decisionId": "decision_...",
  "type": "hide_runtime",
  "host": "example.com",
  "frameScope": "top",
  "targetFingerprint": "fp_...",
  "appliedAt": 0,
  "expiresAt": 0,
  "rolledBackAt": 0
}
```

### 7.4 Candidate Pattern

```json
{
  "id": "candidate_...",
  "patternFamily": "transparent_player_click_layer",
  "scope": "host",
  "host": "example.com",
  "evidenceRefs": ["obs_...", "decision_...", "action_..."],
  "replay": {
    "runs": 3,
    "passed": 3,
    "falsePositiveHits": 0
  },
  "state": "pending_review"
}
```

## 8. 評估方法

### 8.1 測試集

建立三類 corpus：

- hostile player corpus：真實或可重現的播放器干擾站
- benign media corpus：YouTube、Vimeo、Twitch、新聞影片、課程平台
- sensitive interaction corpus：login、OAuth、checkout、age gate、permission prompt

### 8.2 指標

| 指標 | 目標 |
|---|---|
| 阻擋有效率 | popup / redirect / overlay 有明顯下降 |
| 誤殺率 | benign media 與 sensitive pages 低於門檻 |
| 可解釋性 | 每次 action 至少 2 個 evidence-backed reason |
| 可回復性 | action rollback 成功率接近 100% |
| 延遲 | runtime 判斷不明顯拖慢播放器互動 |
| 成本 | cloud AI 呼叫有 cooldown 與 budget |

### 8.3 A/B 模式

建議支援：

- `observe-only`
- `suggest-only`
- `soft-neutralize`
- `runtime-block`
- `review-promote`

每次研究階段只開一個更激進層級。

## 9. 風險與對策

### 9.1 False Positive 擴散

風險：AI 把合法 overlay / 登入 / 年齡驗證當成廣告。

對策：

- interaction-sensitive page 降級到 observe
- action TTL
- one-click restore
- user override 自動降低 host aggressiveness

### 9.2 模型幻覺

風險：AI 產生不存在的 selector 或錯誤原因。

對策：

- schema validation
- reason code 必須對應 evidence
- selector 必須能在 DOM 中 resolve
- confidence 不足不 action

### 9.3 隱私外洩

風險：把敏感頁面內容送給 cloud model。

對策：

- feature minimization
- no input values
- host/url class hashing option
- local model preferred for sensitive pages
- dashboard 顯示 provider data policy

### 9.4 性能負擔

風險：高頻 DOM observation 造成頁面卡頓。

對策：

- sampling
- viewport/player-nearby only
- adaptive observation window
- idle callback
- per-host budget

### 9.5 對抗式規避

風險：網站偵測 extension 或欺騙 AI feature。

對策：

- feature ensemble
- temporal behavior over static names
- randomized observation timing
- DevTools replay validation
- 不依賴單一 selector / class name

## 10. 開發階段建議

### Phase 0：研究準備

- 定義 feature schema
- 建立 sensitive redaction 規則
- 整理 replay corpus
- 補充 DevTools MCP evidence workflow

### Phase 1：Observe-only 原型

- 不阻擋，只收集 observation
- Dashboard 顯示 AI heuristic debug
- 匯出 evidence bundle

### Phase 2：Suggest-only AI

- AI 產生 decision，但不 action
- 與人工標註比對
- 校準 confidence 與 reason code

### Phase 3：Soft runtime action

- 允許 G1 / G2 可回復 action
- 僅 host-scoped
- TTL 到期自動還原

### Phase 4：Sandbox click probe

- 對高風險元素做受控互動探測
- 觀察 popup / redirect / DOM churn
- 不讓探測外跳污染使用者主要瀏覽狀態

### Phase 5：Replay-validated candidate

- 將有效 decision 轉成 candidate pattern
- 用 live-browser / DevTools MCP replay
- 產生 promotion report

### Phase 6：Hybrid release candidate

- 把多次驗證的 heuristic profile 接入現有 policy gate
- 不作為通用清單發布
- 只作為 AI heuristic profile / host profile / pattern-family profile

## 11. 與現有 Falcon 架構的銜接

現有能力可作為起點：

- `site-state-helper`：interaction-sensitive page 偵測
- `overlay-remover`：播放器重疊與 runtime hide 基礎
- `inject-blocker`：MAIN world 行為攔截能力
- `ai-runtime`：policy gate 與 telemetry pipeline
- `dashboard`：candidate review / promote / rollback UI
- `tests/live-browser`：真瀏覽器 replay 與 evidence corpus
- Chrome DevTools MCP：研究端 browser evidence capture

建議新增模組：

- `content/observation-kernel.js`
- `content/feature-builder.js`
- `background/heuristic-decision-engine.js`
- `background/action-executor.js`
- `background/evidence-store.js`
- `tests/heuristic-replay/`

## 12. 最終研究判準

本研究成功的標準不是「AI 感覺更聰明」，而是：

- 對未知 hostile player sites 的首次防護明顯提升
- 不依賴網域 / selector 清單也能辨識主要廣告 / 惡意元素家族
- 所有 action 都可解釋、可回放、可回復
- false positive 被 policy gate、sensitive-page detection、user override 控住
- replay 通過前不做 durable mutation
- DevTools MCP 能穩定產生研究證據，而不是成為使用者端必要依賴

## 13. 一句話結論

這條路線值得研究，但應把「激進」放在觀測與推理上，把「保守」放在落地動作上：

`AI 可以主導辨識與策略建議，但 runtime action 必須 host-scoped、time-limited、evidence-backed、reversible；永久規則必須經 replay 與 review。`
