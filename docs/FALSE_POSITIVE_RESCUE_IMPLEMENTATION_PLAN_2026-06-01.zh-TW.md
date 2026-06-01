# 誤判評估機制與恢復功能實作計畫

> 日期：2026-06-01
> 狀態：Gemini 外部審核後修正版
> 範圍：False Positive Rescue、誤判觀測、恢復操作、候選規則 promotion 前的負面證據 gate

## 1. 目標

建立一套可回復、可稽核的誤判處理機制，解決 Falcon-Player-Enhance 因 overlay、cosmetic rule、元素封鎖或 AI heuristic 誤判，造成合法物件無法選取、無法點擊、或互動被鎖住的問題。

此計畫同時把誤判回報整理成結構化負面證據，讓單站規則與 AI-generated candidates 在 promotion 前能檢查 false positive 訊號，避免錯誤模式被泛化成更廣規則。

## 2. 範圍

### 2.1 In scope

- 記錄可回復的封鎖/隱藏 action。
- 提供目前頁面可查詢的 Falcon 影響清單。
- 支援使用者對目前頁面執行：
  - 一次性恢復元素。
  - 目前頁面暫停 cosmetic/overlay 類封鎖。
  - 回報誤判。
- 將誤判回報寫入結構化 storage。
- 讓 candidate promotion 檢查誤判負面證據。
- 新增 regression tests，覆蓋恢復、回報、promotion gate。

### 2.2 Out of scope

- 不讓 AI 或 runtime 直接改寫 `extension/rules/site-registry.json`。
- 不讓誤判救援直接修改 `rules/filter-rules.json` 或 DNR baseline。
- 不處理 T0 確定惡意網域的永久放行。
- 不把此計畫擴張成完整一般型 ad blocker。
- 不整理或刪除目前工作區既有未追蹤文件與 diagram。

## 3. 目前證據與假設

### 3.1 Repo 現況

- `extension/background.js` 已有 `NEGATIVE_IMPACT_MEMO_STORAGE_KEY = 'negativeImpactMemo'`，目前偏向頁面層級 rendering issue memo。
- `extension/background.js` 已有 `generatedRuleCandidates`、`candidateReviewLog`、`candidatePromotionLog`、`candidateRollbackLog` 與 `knowledgeStore`。
- `extension/content/cosmetic-filter.js` 會根據 `site-registry` 與 `hiddenElements` 生成 `display: none !important; visibility: hidden !important;` CSS。
- `extension/content/overlay-remover.js` 會將疑似 overlay 設為 `pointer-events: none` 或 `display: none`，並以 `data-shieldHidden` 標記。
- `extension/dashboard/dashboard.js` 已能列出與移除 `hiddenElements`。
- `POLICY-GATE.md` 定義 T0/T1/T2/T3，且 runtime AI 不應做 durable mutation。
- `tests/interaction-safety` 已有登入/OAuth 類互動保護 regression，可延伸成誤判恢復測試。
- `tests/ai/run_candidate_promotion_regression.py` 已覆蓋 candidate promotion/rollback，可加入 false positive gate。

### 3.2 假設

- 第一階段以 dashboard 或 background API 驗證為主，不強制改 popup UI；popup UI 可在第二階段補。
- 恢復功能只針對 Falcon runtime 造成的可回復行為，不嘗試復原第三方網站自身改動。
- 對 T0 baseline/DNR 規則的恢復僅記錄誤判，不做 runtime 放行。

## 4. 受影響檔案

### 4.1 主要修改

- `extension/background.js`
  - 新增 `falconActionRecords` storage 管理。
  - 新增 `falsePositiveObservations` storage 管理。
  - 新增 runtime messages：
    - `recordFalconAction`
    - `getFalconActionRecords`
    - `rescueFalconAction`
    - `reportFalsePositive`
    - `getFalsePositiveObservations`
  - 在 `recordCandidatePromotion(...)` 前檢查近期 false positive observation。

- `extension/content/cosmetic-filter.js`
  - 產生 CSS 前排除已救援的特定元素，避免全 selector 放行。
  - 對 T0/site-registry 靜態 selector 採 on-demand 查詢，不在頁面載入時主動回報每條規則。
  - 只對使用者手動 `hiddenElements`、T2 AI/heuristic 或 Dashboard rescue 查詢建立 action record。
  - 支援 `rescueFalconAction` / `refreshFalsePositiveRescueState` 類 message。

- `extension/content/overlay-remover.js`
  - 對 `pointer-events: none` / `display: none` 操作建立 action record。
  - 保存必要的原始 inline style 值。
  - 支援依 actionId 還原 inline style。

- `extension/dashboard/dashboard.js`
  - 在既有 hidden elements 管理區旁新增目前頁面 Falcon action 清單或 false-positive rescue 區。
  - 提供 `Restore once`、`Report false positive`、`Pause page rescue` 操作。

### 4.2 測試

- `tests/interaction-safety/run_false_positive_rescue_regression.py`（新增）
  - 載入測試頁與 extension。
  - 建立可被 Falcon 隱藏或 pointer-events 禁用的合法 CTA。
  - 驗證救援前不能點擊，救援後可點擊。
  - 驗證 false positive observation 被記錄。

- `tests/ai/run_candidate_promotion_regression.py`（修改）
  - seed 一筆 false positive observation。
  - 驗證相關 candidate promotion 被拒絕或要求 rollback/review。

- `tests/ai/run_element_classification_behavior_regression.js`（視實作需要）
  - 若 normalized signature 擴充，補隱私與 collision 測試。

## 5. 資料模型

### 5.1 `falconActionRecords`

```json
{
  "id": "act_...",
  "tabId": 123,
  "frameId": 0,
  "hostname": "example.test",
  "pageUrl": "https://example.test/watch",
  "selector": ".cta",
  "kind": "cosmetic_selector | overlay_inline_style",
  "source": "cosmetic-filter | overlay-remover | element-picker | ai-runtime",
  "policyTier": "T1 | T2 | unknown",
  "action": "hide_element | disable_pointer_events",
  "reason": "site_registry_selector | hidden_element_rule | overlay_heuristic",
  "createdAt": 1780257600000,
  "expiresAt": 1780261200000,
  "restoredAt": 0,
  "restore": {
    "display": "",
    "visibility": "",
    "pointerEvents": ""
  },
  "signature": {
    "tagName": "button",
    "classTokenSummary": "cta play",
    "idTokenSummary": "",
    "positionBucket": "fixed",
    "zIndexBucket": "high",
    "sizeBucket": "medium_rect",
    "hrefHost": "relative",
    "nearPlayer": true
  }
}
```

配額與 pruning：

- 單一 tab 最多保留 100 筆 action records。
- 全域最多保留 1000 筆 action records。
- 預設 TTL 30 分鐘；已恢復項目可保留到 TTL 後清除。
- 寫入前依 `tabId + frameId + selector + source + action` 去重。
- `cosmetic-filter.js` 的 site-registry 靜態 selector 不做頁面載入主動寫入，只在 Dashboard 查詢目前頁面影響清單時掃描。

### 5.2 `falsePositiveObservations`

```json
{
  "id": "fp_...",
  "actionId": "act_...",
  "hostname": "example.test",
  "pageUrl": "https://example.test/watch",
  "selector": ".cta",
  "source": "dashboard_manual_rescue",
  "reason": "user_restored_click_target",
  "createdAt": 1780257700000,
  "signatureHash": "sig_...",
  "candidateRefs": [],
  "result": {
    "restored": true,
    "userConfirmed": true
  }
}
```

## 6. 執行步驟

### Phase 1：計畫與審核

1. 寫入本文件。
2. 以 Gemini CLI 只讀 `plan` 模式審核本文件。
3. 根據審核結果修正本文件。
4. 審核通過或僅剩可接受建議後，進入實作。

### Phase 2：核心 storage 與 API

1. 在 `background.js` 新增 action record normalize/prune/store helpers。
2. 新增 false positive observation normalize/prune/store helpers。
3. 新增 message handlers：
   - `recordFalconAction`
   - `getFalconActionRecords`
   - `rescueFalconAction`
   - `reportFalsePositive`
4. Action record 要限制數量與 TTL，避免 storage 無限成長。

### Phase 3：content scripts 整合

1. `cosmetic-filter.js`
   - 對 site-registry/T0 靜態 selector 採 lazy action reporting：只有 Dashboard 發出 `collectFalconActions` 時才掃描 DOM 並回報。
   - 對 `hiddenElements` 或 T2/heuristic selector 才允許主動建立 action record。
   - 恢復單一元素時，在目標元素加上 `data-shield-rescued="<actionId>"`。
   - 產生 CSS 時使用 `:not([data-shield-rescued])` 或等效 selector 排除已救援元素，不重載頁面。
2. `overlay-remover.js`
   - 在改 inline style 前保存原值。
   - 建立 action record。
   - 收到 rescue 訊息後嘗試還原該元素。
   - 受配額限制；同一元素短時間重複命中應更新既有 action record，不重複刷 storage。

### Phase 4：Dashboard 操作面

1. 在 dashboard 既有 blocked elements 區旁加入 false-positive rescue 清單。
2. 清單優先顯示目前 active tab / hostname 的 action records。
3. 每筆提供：
   - Restore once
   - Report false positive
4. 暫不把救援操作做成全域白名單。

### Phase 5：Promotion gate

1. 在 `recordCandidatePromotion(...)` 之前檢查 false positive observations。
2. 若同 hostname + selector/signature 在近期有誤判紀錄，拒絕 promotion，回傳 `candidate_has_false_positive_observation`。
3. Dashboard 顯示錯誤訊息，要求 reviewer 先 rollback、修改 candidate 或補 evidence。

### Phase 6：測試

1. 新增 false positive rescue regression。
2. 修改 candidate promotion regression。
3. 執行最小高訊號測試：
   - `node --check extension/background.js`
   - `node --check extension/content/cosmetic-filter.js`
   - `node --check extension/content/overlay-remover.js`
   - `node --check extension/dashboard/dashboard.js`
   - `python -m py_compile tests/interaction-safety/run_false_positive_rescue_regression.py`
   - `python tests/interaction-safety/run_false_positive_rescue_regression.py`
   - `python tests/ai/run_candidate_promotion_regression.py`
4. 若修改影響 hidden elements，補跑：
   - `python tests/interaction-safety/run_element_picker_injection_regression.py`
5. 增加 storage pruning 驗證：
   - seed 超過單 tab / 全域配額的 action records。
   - 驗證 background helper 會裁切、去重，不拋出 quota error。

## 7. 驗證標準

- 救援前：測試 CTA 因 Falcon action 不能點擊或不可見。
- 救援後：不重載頁面即可恢復 CTA 點擊。
- Action record 可從 background API 查詢。
- Action record 有單 tab / 全域配額，重複回報會去重或更新，不會 storage spam。
- False positive observation 可從 background API 查詢。
- 有 false positive observation 的 candidate 不可 promotion。
- 既有 candidate accepted/promotion/rollback 正常路徑不被破壞。
- T0/DNR 類封鎖不被此機制直接放行。
- 單一元素 rescue 不會把同 selector 的其他元素一起放行。

## 8. 恢復與回滾路徑

- 所有 runtime rescue 都是 TTL / session-scoped，不寫入 baseline rules。
- 若 content script rescue 失敗，使用者仍可用 existing extension disable / whitelist path。
- 若 candidate promotion gate 誤擋，可刪除對應 false positive observation 或以 reviewer evidence override，但第一版不做 override UI。
- 若實作導致 regression 失敗，回退本輪新增的 action record / false positive observation / dashboard rescue 變更，不碰既有 AI provider 與 candidate review/promotion/rollback 架構。

## 9. 審核門檻

- Required：yes
- Strength：external
- Channel：Gemini CLI headless audit
- Mode：read-only / `--approval-mode plan`
- Handoff：Gemini 審核後，直接依審核修正並進入開發；不等待人工確認，除非審核指出安全阻塞或 repo 狀態阻止安全修改。

### 9.1 Gemini 審核結果

- Verdict：`approve_with_changes`
- 阻塞修正：
  - `cosmetic-filter.js` 靜態規則改為 lazy/on-demand action reporting。
  - `background.js` 必須實作 action record 配額與 pruning。
  - 單一元素 rescue 必須精準標記目標元素，不能讓同 selector 的其他元素全數恢復。
- 本文件已納入上述修正，並以此版本作為開發依據。

## 10. 不該做的事

- 不在 rescue 時重新載入頁面作為主要路徑。
- 不讓 AI 自動修改正式靜態規則。
- 不把使用者的 `hiddenElements` 直接當成可泛化正例。
- 不把一次誤判回報直接變成全域 allowlist。
- 不對 T0 confirmed malicious navigation 或 DNR baseline 做一鍵放行。
- 不清理或刪除目前未追蹤 memo/diagram。

## 11. 實作完成摘要

完成日期：2026-06-01

已完成項目：

- `background.js` 新增 `falconActionRecords` 與 `falsePositiveObservations` 的 normalize、TTL、去重、查詢、匯出與 storage pruning。
- `background.js` 新增 `recordFalconAction`、`getFalconActionRecords`、`rescueFalconAction`、`reportFalsePositive`、`getFalsePositiveObservations` runtime message。
- `recordCandidatePromotion(...)` 改為 promotion 前檢查近期 false positive observation；同 hostname + selector 命中時回傳 `candidate_has_false_positive_observation`。
- `cosmetic-filter.js` 改為 lazy/on-demand 收集可恢復 action，不在頁面載入時為 T0/static selector 急切寫入 action record。
- `cosmetic-filter.js` 單一元素 rescue 使用 `data-shield-rescued="<actionId>"`，並在產生 CSS 時加入 `:not([data-shield-rescued])` guard。
- `overlay-remover.js` 在覆蓋層修改 inline style 前記錄原始 `display`、`visibility`、`pointerEvents`，支援單次 restore。
- Dashboard 新增 false-positive rescue 區塊，可掃描目前/最近 HTTP(S) tab、單次恢復、回報誤判。
- 新增 `tests/test-false-positive-rescue.html` 與 `tests/interaction-safety/run_false_positive_rescue_regression.py`。
- 擴充 `tests/ai/run_candidate_promotion_regression.py`，驗證 false positive observation 會阻止 candidate promotion。

已執行驗證：

- `node --check extension/background.js`
- `node --check extension/content/cosmetic-filter.js`
- `node --check extension/content/overlay-remover.js`
- `node --check extension/dashboard/dashboard.js`
- `python -m json.tool extension/_locales/en/messages.json`
- `python -m json.tool extension/_locales/zh_TW/messages.json`
- `python -m py_compile tests/interaction-safety/run_false_positive_rescue_regression.py tests/ai/run_candidate_promotion_regression.py`
- `python tests/interaction-safety/run_false_positive_rescue_regression.py --browser-channel msedge`
- `python tests/ai/run_candidate_promotion_regression.py --browser-channel msedge`
- `python tests/interaction-safety/run_element_picker_injection_regression.py --browser-channel msedge`

已知限制：

- Rescue 是 runtime/session-scoped，不會寫入 DNR baseline 或全域 allowlist。
- Overlay rescue 只恢復原本被同一 DOM action record 標記的元素；若網站重新建立 DOM 節點，需要重新掃描。
- 第一版 promotion gate 採保守策略，命中近期同 hostname + selector false positive observation 時直接阻止 promotion，暫不提供 reviewer override UI。
- Playwright 預設 bundled Chromium 在本機缺少執行檔，本輪真實 extension 驗收改用已安裝的 Microsoft Edge channel。
