# AI 功能能力邊界與升級方向

## 問題摘要

當使用者開啟 AI 功能後，extension 是否已具備以下能力：

- 對陌生網頁自動學習新型態廣告
- 自動辨識新型態廣告或新型播放器干擾
- 自動阻擋並長期記住這些新模式

短答案：`部分具備，但尚未達到完全自動學習 + 永久阻擋`。

## 目前已具備的能力

### 1. 陌生網頁仍有基礎偵測能力

即使站點不在既有 registry 內，目前仍有一條全域基礎鏈會跑在 `<all_urls>` 上，包含：

- player detector
- overlay remover
- fake video remover
- player enhancer
- player controls
- player sync

這代表陌生頁面不是完全裸奔，而是至少會先有基礎播放器與干擾偵測。

### 2. 會累積 host 級風險訊號

系統會根據事件類型為 host 累積風險，例如：

- `blocked_popup`
- `blocked_malicious_navigation`
- `overlay_removed`
- `clickjacking_detected`
- `suspicious_dom_churn`

這些訊號會進入 telemetry 與 risk score，而不是只看單次事件。

### 3. 達條件時會詢問 AI provider

當 AI provider 已啟用，而且符合以下條件之一時，系統才會去詢問 AI：

- 出現優先事件，例如 popup / 惡意跳轉 / clickjacking
- 或目前 host 的風險分數已高於設定門檻
- 且沒超過 cooldown 限制

也就是說，AI 不是每一頁都即時執行，而是條件式觸發。

### 4. 能產生 host-scoped advisory

AI 回傳後，目前可以形成 host 級別的 advisory，內容可能包含：

- `riskScoreDelta`
- `candidateSelectors`
- `candidateDomains`
- `recommendedActions`
- `summary`

這些資料會進入 runtime state，作為當前 host 的保護強化依據。

### 5. 高風險時可做有限可逆動作

目前允許的可逆動作主要有：

- `tighten_popup_guard`
- `tune_overlay_scan`
- `guard_external_navigation`
- `apply_extra_blocked_domains`

這些是「runtime 可回退」的調整，不是永久寫入的規則。

## 目前還做不到的事

### 1. 不能自動永久學習

現在雖然會產生 `generatedRuleCandidates`，但系統還沒有完整的「自動審核後寫入正式規則」流程。

也就是說：

- 會觀察
- 會提出候選規則
- 會在當前 host 做有限調整
- 但不會自動把新規則永久寫進正式靜態規則集

### 2. 不能保證第一次遇到新型態就完整擋住

如果陌生網站使用的是全新廣告手法，而目前基礎 detector 沒有足夠訊號，AI 也不一定會立刻有足夠依據做正確強化。

所以目前比較像：

- 有自適應能力
- 但不是首見即全擋

### 3. 不是所有陌生站都會啟用最強保護鏈

目前較積極的保護，例如：

- `ai-runtime`
- `anti-popup`
- `inject-blocker`
- `cosmetic-filter`

仍偏向 enhanced-site chain，也就是跟站點清單有關，不是所有陌生網頁都會完整拿到同一級別的早期保護。

### 4. 不會做 durable mutation

目前 Policy Gate 明確設定：

- `allowAiAdvisory = true`
- `allowReversibleActions = 視風險而定`
- `allowDurableMutation = false`

這是目前能力邊界最重要的一條。

意思是：AI 可以給建議、可以推動可逆強化，但不能自己做永久變更。

## 準確定位：它現在是什麼

如果要精準描述目前系統，我會定義成：

`AI 輔助的自適應防護系統`

而不是：

`全自動自我學習型廣告攔截器`

差異在於：

- 前者會根據風險、事件、AI advisory 動態調整當前 host 行為
- 後者會自動把新模式沉澱成永久規則並持續擴張知識庫

目前這個 repo 明顯還停在前者。

## 若要升級成更接近「自動學習型」還缺什麼

### 1. 候選規則落地流程

需要把 `generatedRuleCandidates` 變成真正可審核、可驗證、可回滾的規則輸送帶，例如：

- 先存為 pending candidates
- 跑 regression / smoke 驗證
- 通過後才進入正式規則集
- 保留回滾記錄

### 2. 更通用的 enhanced-site 啟用條件

要讓陌生網站也能更早吃到較強保護，不能只靠固定 registry。

可能方向：

- 根據偵測到的播放器家族動態升級保護鏈
- 根據風險分數自動提升站點到 enhanced 模式
- 根據 iframe / popup / overlay 特徵觸發 document_start 級保護

### 3. 真實 regression pool

如果沒有真實站點池，就無法確認 AI 的 candidate selectors / candidate domains 是有幫助還是只是在加噪音。

至少需要：

- smoke subset
- curated regression pool
- 失敗樣本回灌流程

### 4. 更完整的安全邊界

如果未來真的要讓 AI 更接近自動落地規則，還必須補：

- selector/domain 安全審核
- false positive 防護
- 可觀測性與回滾
- durable mutation 的人工或半自動 gate

## 結論

目前開啟 AI 功能後：

- `有`：對陌生網頁做風險觀察、條件式詢問 AI、產生 host-scoped 建議、執行有限可逆強化
- `沒有`：自動永久學習新型態廣告並長期穩定阻擋的完整能力

所以如果要一句話回答原問題：

`目前已具備 AI 輔助的自適應辨識與有限阻擋能力，但還不具備完整的自動學習型永久攔截能力。`

## 建議下一步

最值得優先做的 3 件事：

1. 把 `generatedRuleCandidates` 接到受控的審核後落地流程
2. 讓陌生站也能動態升級到 enhanced protection chain
3. 建立 live-browser regression pool 驗證 AI 強化是否真的有效