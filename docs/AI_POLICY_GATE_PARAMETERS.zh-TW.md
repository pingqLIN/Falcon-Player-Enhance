# AI / Policy Gate 參數說明

## 文件目的

本文件專門說明 Dashboard / Popup 中 AI 風險卡片與 Policy Gate 卡片所顯示的主要參數，特別是下列欄位：

- 風險等級 `LOW / MEDIUM / HIGH / CRITICAL`
- 風險分數 `riskScore`
- 高風險站點數 `highRiskHosts`
- Policy 版本 `Policy v2`
- 提供者狀態 `provider online`
- 最近生效時間 `lastUpdatedAt`
- 模型 `model`
- 策略閘門 `Policy Gate`
- 模式 `mode`
- 原因 `reason`
- 可逆操作 `allowedActions`
- 依據 `evidence.topSignals`

這份說明以目前 extension 實作為準，對應背景邏輯主要位於 `extension/background.js`，畫面整理則位於 `extension/dashboard/dashboard.js`。

## 介面範例對照

以畫面中的例子來看：

- 風險等級：`LOW`
- 風險分數：`6.71`
- 高風險站點：`5`
- Policy 版本：`v2`
- 提供者：`線上`
- 模型：`gpt-5.4-mini`
- 策略閘門 Tier：`T1`
- 模式：`advisory-only`
- 原因：`runtime default`
- 可逆操作：`目前沒有可逆操作`
- 依據：`Runtime Bootstrap ×6`、`Suspicious Dom Churn ×4`、`Overlay Removed ×1`

## 參數總覽

| 介面欄位 | 內部欄位 | 說明 |
| --- | --- | --- |
| 風險等級 | `riskTier` | 由 `riskScore` 經閾值換算出的等級 |
| 風險分數 | `riskScore` | 目前 host 的累積風險分數，保留兩位小數 |
| 高風險站點 | `highRiskHosts.length` | 所有 `riskTier != low` 的 host 數量 |
| Policy v2 | `policyVersion` | 目前策略資料版本 |
| 提供者 線上 | `provider.state.lastHealthOk` | AI provider 最近一次健康檢查是否成功 |
| 最近生效 | `lastUpdatedAt` | 該 host 最近一次風險/策略更新時間 |
| 模型 | `provider.state.lastResolvedModel` 或 advisory model | 最近一次成功回應使用的模型 |
| T1 / T2 | `policyGate.tier` | Policy Gate 的執行層級 |
| 模式 | `policyGate.mode` | 目前允許的動作模式 |
| 原因 | `policyGate.reason` | 為何落到這個 gate 模式 |
| 可逆操作 | `policyGate.allowedActions` | 當前允許的可逆調整項目 |
| 依據 | `evidence.topSignals` | 造成目前風險與 gate 判斷的主要訊號 |

## 風險分數與等級

`riskScore` 是 host 級別的累積值，不是單次事件分數。系統會針對不同事件累加不同權重，再隨時間衰減。

目前重要事件權重大致如下：

- `runtime_bootstrap`: `0.2`
- `blocked_popup`: `6`
- `blocked_malicious_navigation`: `7`
- `overlay_removed`: `4`
- `clickjacking_detected`: `8`
- `suspicious_dom_churn`: `3`
- `false_positive_signal`: `-5`
- `user_override`: `-2`

風險等級門檻：

- `LOW`: `< 8`
- `MEDIUM`: `>= 8`
- `HIGH`: `>= 18`
- `CRITICAL`: `>= 30`

所以畫面中的 `6.71` 會被判成 `LOW`，是符合目前實作的。

## Policy Gate 是什麼

Policy Gate 是 AI 建議真正進入 runtime 之前的安全閘門，用來決定：

- 現在只允許 advisory，還是可做有限可逆調整
- 是否需要升級到更高審查等級
- 是否允許額外的保護動作進入當前 host

目前主要有兩個 tier：

- `T1`: 保守模式，通常只允許 advisory-only
- `T2`: 風險較高時，允許有限的 reversible actions

## 模式 `mode`

### `advisory-only`

代表目前只接受 AI advisory 作為參考，不執行可逆調整動作。這通常發生在：

- 風險仍低
- 或系統尚未滿足較高風險門檻
- 或目前是 runtime 預設策略

### `reversible-actions`

代表目前允許有限、可回退的保護調整。這通常發生在：

- `riskTier` 已達 `HIGH` 或 `CRITICAL`
- 且 Policy Gate 認為可以進入較積極保護模式

## 原因 `reason`

目前常見值：

- `runtime_default`: 使用 runtime 的預設 gate 決策
- `host_fallback_active`: 該 host 正處於 fallback 保護狀態
- `high_risk_runtime_alignment`: 高風險狀態下，runtime 與 gate 對齊到較積極策略

畫面中的 `runtime default` 表示：目前沒有進入 fallback，也還沒升高到允許可逆操作的 gate。

## 可逆操作 `allowedActions`

當 `mode = advisory-only` 時，通常會顯示：

- `目前沒有可逆操作`

當 `mode = reversible-actions` 時，目前允許的動作集合可能包含：

- `tune_overlay_scan`: 收緊或提高 overlay 掃描策略
- `tighten_popup_guard`: 收緊 popup 防護
- `guard_external_navigation`: 更嚴格保護外部導流/跳轉
- `apply_extra_blocked_domains`: 對高風險廣告網域套用額外阻擋

注意：這裡的「可逆」意思是能回退，不代表永久寫入。Policy Gate 目前明確設定 `allowDurableMutation = false`。

## 依據 `Evidence`

畫面中的 evidence 來自 `buildPolicyEvidence()`，優先顯示 `topSignals`，若沒有才退回 `recentSignals`。

顯示格式：

- `Runtime Bootstrap ×6` 表示 `runtime_bootstrap` 事件累計 6 次
- `Suspicious Dom Churn ×4` 表示觀察到 4 次可疑 DOM churn
- `Overlay Removed ×1` 表示移除過 1 次 overlay

這些 evidence 只是在說明「為什麼現在分數是這樣」，不是單獨的封鎖命令。

## Provider 區塊補充

畫面中的 `提供者 線上`、`模型 gpt-5.4-mini` 主要對應 AI provider state：

- `lastHealthOk = true` 會顯示線上
- `lastHealthCheckAt` 代表最近一次健康檢查時間
- `lastResolvedModel` 代表最近一次成功使用的模型
- OpenAI 預設模型目前是 `gpt-5.4-mini`

如果健康檢查失敗，畫面應理解為：provider 狀態不可用，但 Policy Gate 仍可回退到 runtime 預設模式。

## 如何解讀這張圖

針對這張圖，可以這樣解讀：

1. 這個 host 目前有一些風險訊號，但總分仍低於 `8`，所以風險等級仍是 `LOW`。
2. 因為沒有進入 `HIGH` / `CRITICAL` 區間，所以 Policy Gate 維持 `T1 + advisory-only`。
3. `runtime default` 表示目前採用的是保守預設路徑，而不是 fallback 或高風險升級策略。
4. `目前沒有可逆操作` 不是錯誤，而是代表目前不允許 runtime 做進一步可逆調整。
5. `gpt-5.4-mini` 與 `提供者 線上` 表示 AI provider 可用，但可用不等於一定要進入積極策略。

## 維護備註

若後續調整下列項目，請同步更新本文件：

- `AI_EVENT_WEIGHTS`
- `AI_POLICY_GATE_DEFAULT_THRESHOLDS`
- `AI_POLICY_GATE_ACTION_BUDGET`
- Dashboard / Popup 中對應欄位名稱或顯示順序