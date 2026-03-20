# AI 主控權提升與廣告學習機制補充開發資訊

## 文件目的

本文件是給後續 `Opus fork` 對照使用的補充開發說明，聚焦在以下新方向：

- 讓 AI 在廣告辨識與處置流程中擁有更高主控權
- 先提供一份 `AD LIST` 作為靜態範本
- 對未知或新型態廣告建立「邊上網邊學」的動態判讀機制
- 在既有「封鎖元素」之外，新增一個「教學模式」，允許使用者點選疑似廣告但不直接封鎖，交由 AI 判斷與學習

這份文件不是最終定案，而是：

- 用來和 Opus 交付版本做差異比對
- 用來釐清目前 repo 能力邊界與下一步合理擴張方向
- 用來避免新 fork 直接跳進高風險 durable mutation

## 關聯文件

建議和以下文件一起閱讀：

- [AI_CAPABILITY_BOUNDARY.zh-TW.md](./AI_CAPABILITY_BOUNDARY.zh-TW.md)
- [AI_POLICY_GATE_PARAMETERS.zh-TW.md](./AI_POLICY_GATE_PARAMETERS.zh-TW.md)
- [BLOCKED_ELEMENTS_FEATURE.zh-TW.md](./BLOCKED_ELEMENTS_FEATURE.zh-TW.md)
- [AUDIT_ROUND2.zh-TW.md](./AUDIT_ROUND2.zh-TW.md)
- [DASHBOARD_REFACTOR_PLAN.md](./DASHBOARD_REFACTOR_PLAN.md)

## 目前基線與新方向差異

## 目前基線

目前系統比較接近：

- AI 輔助的自適應防護
- host-scoped risk scoring
- advisory + reversible action
- 不做 durable mutation

也就是：

- 會觀察
- 會詢問 AI
- 會做有限可逆強化
- 不會自動把新廣告模式沉澱成正式永久規則

## 新方向

Opus fork 想做的方向更接近：

- AI 主導的廣告理解與處置
- 靜態規則作為底座
- 動態未知樣式由 AI 邊執行邊學
- 使用者可透過「教學模式」主動餵案例給 AI

這個方向是合理的，但如果不加邊界，會直接碰到：

- false positive 擴散
- selector 污染
- durable mutation 失控
- provider secret / provider latency / rollback 問題

所以建議設計成「分層主控」，而不是「全權放給 AI」。

## 建議架構總覽

建議把新 fork 拆成 5 層：

1. `StaticLayer`
2. `ObservationLayer`
3. `LearningLayer`
4. `ActionLayer`
5. `ReviewLayer`

### 1. StaticLayer

作用：

- 先提供已知廣告網域、已知廣告 selector、已知導流型 UI 的靜態底座
- 作為 AI 判斷時的先驗知識
- 即使 AI provider 離線，也能維持基本攔截能力

建議內容：

- known ad domains
- known ad hosts
- known selector signatures
- known click-lure tokens
- known fake-player patterns
- provider-independent heuristic tags

### 2. ObservationLayer

作用：

- 在使用者瀏覽時蒐集未知廣告訊號
- 不直接等於阻擋
- 為 AI 提供可推理的上下文

建議觀察欄位：

- hostname
- page URL
- iframe ancestry
- clicked element selector
- normalized text
- href / target / rel
- element bounding box
- z-index / opacity / position
- nearby player candidate
- DOM churn before click
- navigation result after click
- popup / redirect / tab-open result
- overlay removal history

### 3. LearningLayer

作用：

- 對未知案例建立 host-scoped / pattern-scoped 學習記錄
- 不直接寫入正式規則
- 先形成 candidates 與 confidence

建議輸出：

- `classification`
- `confidence`
- `adPatternFamily`
- `candidateSelectors`
- `candidateDomains`
- `recommendedActions`
- `suggestedScope`
- `requiresReview`

### 4. ActionLayer

作用：

- 根據靜態規則 + AI 判讀 + risk gate 決定實際處置

建議分成 4 種等級：

- `observe_only`
- `advise_only`
- `reversible_runtime_action`
- `review_required_mutation`

這一層建議仍然保留 Policy Gate，不要直接拿掉。

### 5. ReviewLayer

作用：

- 把 AI 學到的東西沉澱成可審核物件
- 決定哪些可升級成靜態 AD LIST 或正式規則

建議輸出：

- pending candidates
- accepted rules
- rejected rules
- rollback log
- confidence drift record

## `AD LIST` 靜態範本建議

這份 `AD LIST` 不應只是單純 domain block list，建議做成帶語意的結構化資料。

## 建議資料形態

```json
{
  "version": "2026-03-20",
  "entries": [
    {
      "id": "ad-domain-001",
      "kind": "domain",
      "value": "example-ad-network.com",
      "category": "ad_network",
      "confidence": 1,
      "source": "manual_seed",
      "action": "block_request"
    },
    {
      "id": "ad-selector-001",
      "kind": "selector",
      "value": ".floating-ad-overlay",
      "category": "overlay",
      "confidence": 0.95,
      "source": "manual_seed",
      "action": "hide_element"
    },
    {
      "id": "ad-pattern-001",
      "kind": "pattern",
      "value": {
        "textTokens": ["watch now", "continue", "play"],
        "nearPlayer": true,
        "opensExternal": true
      },
      "category": "redirect_lure",
      "confidence": 0.8,
      "source": "manual_seed",
      "action": "guard_navigation"
    }
  ]
}
```

## 類型建議

- `domain`
- `selector`
- `pattern`
- `token`
- `iframe_host`
- `click_signature`

## 類別建議

- `overlay`
- `popup_trigger`
- `redirect_lure`
- `fake_play_button`
- `fake_video_cluster`
- `external_navigation_lure`
- `ad_network`

## 來源標記建議

- `manual_seed`
- `runtime_learning`
- `teaching_mode`
- `review_accepted`
- `imported_feed`

## 動態學習機制建議

核心原則：

- 不是每次遇到可疑元素就永久學到系統裡
- 先學成 `candidate`
- 累積足夠證據後才升級

## 建議學習流程

1. 觀察事件發生
2. 建立 `observation record`
3. 送 AI 做分類
4. 產出 `candidate`
5. 放入 host-local 或 global pending pool
6. 等待更多同型事件交叉驗證
7. 通過門檻才允許升級為靜態規則或正式 runtime policy

## 建議信心門檻

- `0.00 - 0.49`: observe only
- `0.50 - 0.74`: advisory only
- `0.75 - 0.89`: reversible runtime action
- `0.90+`: review candidate

## 建議升級條件

至少同時滿足其中數項：

- 連續多次出現在同 host
- 在不同頁面重複出現
- 點擊後確實導致外跳 / popup / redirect
- 與已知 ad pattern 高相似
- AI 自身 confidence 足夠高
- 經使用者教學模式標記過

## 新增「教學模式」建議

這個模式的定位不是「封鎖元素的另一個 UI」，而是：

`讓使用者把疑似廣告案例餵給 AI 學習，但不直接對當前頁做封鎖落地`

## 建議名稱

- `Teach this ad`
- `Teach suspicious element`
- `AI learning mode`

繁中可先用：

- `教學模式`
- `標記為疑似廣告`
- `交給 AI 判讀`

## 與封鎖元素模式的差異

### 封鎖元素模式

- 目標是立即隱藏
- 使用者已經知道這是不要的元素
- 優先做本地規則落地

### 教學模式

- 目標是蒐集樣本
- 使用者懷疑是廣告，但不一定馬上封鎖
- 優先做觀察、分類、學習、建議

## 建議操作流程

1. 使用者啟動 `教學模式`
2. 滑鼠選到可疑元素
3. UI 顯示：
   - 送給 AI 分析
   - 模擬點擊並觀察
   - 加入候選學習
4. 若使用者選擇「點選但不封鎖」：
   - 系統記錄 click 前狀態
   - 允許一次受控點擊
   - 觀察點擊後是否外跳 / popup / redirect / DOM churn
   - 回傳 AI 判讀結果
5. 系統將樣本寫入 `teaching observations`

## 重要安全建議

「點選廣告但不封鎖」不建議真的在主頁面直接裸放行。建議至少做其中一種：

- sandbox tab
- isolated popup window
- controlled open with telemetry capture
- one-shot allow with clear rollback boundary

比較安全的預設是：

`允許一次受控互動 + 完整記錄 + 不做永久寫入`

而不是：

`使用者點一下，AI 就自動學成正式規則`

## 建議新增資料結構

## 1. `ad-list.json`

靜態廣告範本庫。

## 2. `ai-learning-observations.json`

記錄原始觀察事件。

```json
{
  "id": "obs-001",
  "hostname": "sample.test",
  "pageUrl": "https://sample.test/watch/123",
  "selector": ".cta.play-now",
  "text": "Watch now",
  "href": "https://ad.example/landing",
  "nearPlayer": true,
  "trigger": "teaching_mode_click",
  "result": {
    "openedPopup": false,
    "redirected": true,
    "openedNewTab": true
  },
  "createdAt": "2026-03-20T10:00:00.000Z"
}
```

## 3. `ai-learning-candidates.json`

記錄 AI 產生但尚未正式升級的候選規則。

```json
{
  "id": "cand-001",
  "hostname": "sample.test",
  "category": "redirect_lure",
  "candidateSelectors": [".cta.play-now"],
  "candidateDomains": ["ad.example"],
  "confidence": 0.86,
  "source": "teaching_mode",
  "state": "pending_review"
}
```

## 4. `ai-teaching-sessions.json`

記錄使用者主動教學事件。

## 模組切分建議

如果 Opus fork 要實作，建議新增或拆分成以下模組：

- `extension/rules/ad-list.json`
- `extension/content/ad-teaching.js`
- `extension/content/ad-observer.js`
- `extension/content/ad-runtime-actions.js`
- `extension/background/ai-learning-store.js`
- `extension/background/ai-learning-engine.js`
- `extension/background/ai-candidate-review.js`

若不想大拆，也至少應在現有 `background.js` 內做明確區段分離：

- static seed loading
- observation ingestion
- AI inference dispatch
- candidate persistence
- reversible action enforcement
- review promotion

## 與現有系統的整合點

## 可以直接重用的部分

- host risk score
- Policy Gate
- generated rule candidates
- AI provider dispatch
- blocked elements storage
- custom site registry

## 建議不要直接混用的部分

- 不要把 `hiddenElements` 直接當成 AI 學習資料
- 不要把 teaching mode 和 block mode 用同一個 action name
- 不要讓 AI 直接改寫正式 site registry
- 不要讓 AI 在沒有 review 的情況下自動推進 durable mutation

## 建議的控制權配置

如果目標是「AI 主控權更大」，我建議是以下這種分配，而不是完全放權：

### AI 可以主導

- 廣告分類
- 風險排序
- selector/domain 候選生成
- reversible runtime policy 建議
- teaching samples 聚類與模式歸納

### AI 不應直接主導

- 永久寫入正式規則
- 直接擴張 global block list
- 直接改寫 site registry
- 無審核地刪除合法內容元素

## 建議分階段落地

## Phase 1

- 引入 `ad-list.json`
- 建立 teaching mode 的事件模型
- 把未知廣告學習先落到 observation + candidate，不做正式 mutation

## Phase 2

- 加入 candidate review 流程
- 對高 confidence 候選允許 host-scoped reversible actions
- 建立 regression / smoke 驗證資料池

## Phase 3

- 導入半自動規則升級
- 對跨站重複出現的 ad pattern 做聚合
- 建立 rollback 與 drift monitoring

## 建議先不做的事

- AI 自動寫正式靜態規則且立即全域生效
- 讓 teaching mode 直接變成 block mode
- 沒有 replay / regression 就讓 AI 更新全域 AD LIST
- 讓 provider 離線時 fallback 到不透明的猜測規則

## 需要和 Opus fork 對比的重點

等拿到 Opus fork 版本後，建議逐項對比：

1. 是否真的有 `Static AD LIST`，還是只是把舊規則換名字
2. 是否有把 unknown ad learning 明確拆成 observation / candidate / review 三層
3. teaching mode 是否和 block mode 正確分離
4. 是否存在 durable mutation 的安全邊界
5. AI 是否被賦權過頭，導致 false positive / rollback 無法控管
6. 是否有把 UI 說明、資料結構、provider 成本與 latency 一起考慮

## 結論

這個新方向值得做，但最穩的做法不是「讓 AI 無限制接管」，而是：

- 先有 `AD LIST` 靜態底座
- 再讓 AI 學未知樣式
- 再透過 teaching mode 增加高品質樣本
- 最後才把通過驗證的學習結果升級成正式規則

一句話總結：

`AI 可以主導理解與建議，但規則升級仍應經過分層 gate。`
