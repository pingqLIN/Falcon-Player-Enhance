# Ad-Blocker Player Enhancer — AI 整合版 技術審查報告

---

## 1. 整體判斷

### ✅ 這個整合版適合作為主線繼續開發

這是一個架構邊界清晰、安全約束嚴格、且已通過基本驗證的整合版。核心設計決策——特別是 `allowDurableMutation: false` 的硬編碼約束、teach mode 與 block mode 的責任分離、以及四層 Policy Gate 的分級架構——都展現出對「可逆性」與「漸進演進」的深思熟慮。

**關鍵驗證結果：** 經過完整程式碼追蹤，`confirmedPatterns` 在當前版本中**完全不被任何 runtime blocking 邏輯讀取**。`matchKnowledgeSeeds()` 僅查詢 `seeds[]`，從不查詢 `confirmedPatterns`。這表示 `allowDurableMutation: false` 不只是宣告——它在實作層面也被徹底執行。promoted patterns 目前只是「預備資料」，等待未來的 review UX 和 regression pool 就緒後才有可能被啟用。

### 目前最危險的 3 個問題

| 優先級 | 問題 | 風險等級 | 原因 |
|--------|------|----------|------|
| **🔴 #1** | **`confirmedPatterns` 無上限增長** | 高 | `seeds` 和 `confirmedPatterns` 沒有 `.slice()` 限制，不像 `observations` (300)、`candidates` (160)、`teachSessions` (200) 都有硬上限。長期使用下可能無限增長，且完全沒有 `chrome.storage.local.getBytesInUse()` 監控 |
| **🔴 #2** | **自動 promotion 無使用者確認** | 高 | 當 candidate 的 observations 達到 3 次，`promoteKnowledgeCandidate()` 會自動執行，使用者無法預覽、審核、或拒絕。雖然目前 confirmed patterns 不被 runtime 讀取，但這個機制為未來啟用 durable mutation 埋下了隱患 |
| **🟡 #3** | **Dashboard i18n 缺口比預期大** | 中 | 探索發現至少 16 個 dashboard HTML 中使用了 `data-i18n` 屬性但對應 key 在 `messages.json` 中不存在（如 `dashboardMenuOverview`、`dashboardAiProviderHeader` 等），以及硬編碼英文字串（如 export 失敗訊息） |

---

## 2. 結構審查

### 2.1 aiKnowledgeStore 是否合理

**判定：架構合理，但有兩處結構性隱患需要修補。**

**✅ 合理之處：**

- **五層結構邊界清晰**：`seeds`（不可變靜態底線）→ `observations`（原始資料）→ `candidates`（學習管線）→ `confirmedPatterns`（已推薦）→ `teachSessions`（使用者互動記錄）。每層有明確的資料流方向，不會逆向汙染。
- **stats 作為快照計數器**：`recalculateAiKnowledgeStats()` 在每次寫入後重新計算，避免了 stale count 問題。7 個 stat 欄位涵蓋了 popup 和 dashboard 需要的所有摘要。
- **Candidate 三元組合唯一鍵**：`(hostname, selector, category)` 作為 upsert 匹配條件是合理的粒度——既不會因為 hostname 差異而過度碎片化，也不會因為 selector 重用而誤合併。

**⚠️ 需要修補：**

1. **`confirmedPatterns` 和 `seeds` 缺少硬上限**

   其他 collection 都有限制：`observations` → 300、`candidates` → 160、`teachSessions` → 200。但 `confirmedPatterns` 和 `seeds` 完全無限。建議加入：
   ```
   AI_KNOWLEDGE_MAX_CONFIRMED = 200
   AI_KNOWLEDGE_MAX_SEEDS = 500
   ```
   並在 `normalizeAiKnowledgeStore()` 中對這兩個陣列也做 `.slice()`。

2. **`confirmedPatterns` 的 ID 生成有碰撞風險**

   目前 ID 格式為 `learned_${hostname}_${selector}`，其中特殊字元被 `replace(/[^a-z0-9_:-]+/gi, '_')` 清除。如果兩個不同 selector 清除後產生相同字串，就會碰撞。建議改用 hash 或加入 timestamp：
   ```
   learned_${hostname}_${hash(selector)}_${Date.now()}
   ```

3. **stats 可以不必簡化也不必拆層**——目前 7 個欄位全部由 `recalculateAiKnowledgeStats()` 自動計算，不需要使用者維護，也不會造成 schema 膨脹。維持現狀即可。

### 2.2 Teach mode / Block mode 切分是否合理

**判定：切分乾淨且正確。Teach mode 不直接封鎖的決策是這個版本最重要的安全決策之一。**

| 面向 | Teach Mode | Block Mode |
|------|-----------|-----------|
| 目的 | 學習樣本收集 | 即時視覺保護 |
| AI 參與 | 有（分類建議） | 無（純 selector） |
| 封鎖行為 | ❌ 不封鎖 | ✅ `display: none !important` |
| 儲存位置 | `aiKnowledgeStore` | `hiddenElements`（獨立） |
| 頁面影響 | 無 | 頁面重載 |
| 可逆性 | 純資料，完全可逆 | 可清除規則 |

**為何不需要中間層（review queue / promotion queue）？**

目前不需要，但**未來需要**。理由：

- **現在**：`confirmedPatterns` 不被任何 runtime 讀取，所以自動 promotion 的「危害」僅限於資料儲存膨脹，不會影響使用者體驗。
- **未來啟用 durable mutation 時**：必須在 `candidates → confirmedPatterns` 之間加入 review queue，讓使用者在 dashboard 中預覽候選規則、看到它會影響哪些站、然後手動確認或拒絕。

**建議**：在啟用 `allowDurableMutation: true` 之前，必須先實作 review queue。這是解鎖下一階段的前置條件，不是現在的 blocker。

### 2.3 AD LIST 長期策略是否合理

**判定：目前的 seed + baseline 設計合理，但建議從現在就規劃雙層資料來源的 schema 準備。**

**長期建議 — 雙層模型：**

```
Layer 1: Built-in Baseline (ad-list.json)
├── 隨擴充套件版本更新
├── 不可變（使用者無法修改）
├── 作為所有分類的信心底線
└── 更新機制：擴充套件版本升級

Layer 2: Learned Knowledge (confirmedPatterns)
├── 來自 teach mode + runtime learning
├── 使用者可審核、刪除、匯出
├── 作為 Layer 1 的補充（不覆蓋）
└── 更新機制：use-time learning + user review
```

**具體建議：**
- 在 `matchKnowledgeSeeds()` 中加入對 `confirmedPatterns` 的查詢（但保持 seeds 優先順序）——這是啟用 learned knowledge 的最小改動
- 在查詢結果中標記 `source: 'seed'` vs `source: 'learned'`，讓 UI 可以區分
- **不要合併兩層**——保持 seeds 不可變是確保可逆性的關鍵

---

## 3. UI / UX 審查

### 3.1 popup / dashboard 的 AI 狀態資訊是否合理

**Popup 目前顯示的 3 個指標：**
- `Seeds: {seedCount}` — 靜態種子數量
- `Learned: {confirmedCount}` — 已確認模式數量
- `Teach: {teachSessionCount}` — 教學互動次數

**判定：資訊足夠但應該加入「系統狀態」維度。**

| 面向 | 目前 | 建議 |
|------|------|------|
| Seeds | ✅ 數量清楚 | 可加入版本/更新時間 |
| Learned | ⚠️ 數量本身缺乏意義 | 改為 "Learned: 12 patterns on 5 sites" |
| Teach | ⚠️ 只看次數不知品質 | 加入最近一次教學的時間戳 |
| AI Provider | ❌ popup 不顯示 provider 健康 | 加入簡易狀態點（🟢/🟡/🔴） |
| Policy Gate | ❌ popup 不顯示當前站風險 | 加入 "Current site: LOW/MEDIUM/HIGH" |

**Dashboard 問題：**

1. **i18n 缺口嚴重**：至少 16 個 `data-i18n` 屬性指向不存在的 key
2. **Export 功能只匯出 `generatedRuleCandidates`**：使用者無法從 dashboard 備份學習資料
3. **Reset 功能只重設 stats**：需要透過 popup 的完整 reset 才能清除 knowledge store
4. **Provider 切換未保存警告**：切換 provider card 時如果有未儲存的設定，會直接覆蓋而沒有提示

### 3.2 teach mode 對使用者是否清楚

**判定：流程可用但有 3 個清晰度問題。**

1. **分類 badge 沒有 i18n**：4 個按鈕直接顯示 `ad / suspicious / tracker / benign`。中文使用者需要理解英文術語。建議映射為「廣告 / 可疑 / 追蹤器 / 正常」。
2. **自動 promotion 完全無回饋**：candidate 達到 3 次觀察被自動 promote 時，使用者看不到任何通知。
3. **2 分鐘自動關閉無視覺倒數**：Element picker 的 `pickerAutoOffTimer` 設定為 2 分鐘，但 UI 上沒有倒數計時器或提示。
4. **Teach mode 成功後無確認訊息**：`commitTeachObservation` 成功後只是靜默退出 picker。

---

## 4. 風險與應變分析

### 4.1 外部環境假設

| 假設 | 合理性 | 風險 |
|------|--------|------|
| Chrome Manifest V3 API 穩定 | 高 | Google 可能繼續收緊 content script 權限 |
| OpenAI/Gemini API 穩定可用 | 中 | 價格變動、rate limit 收緊、模型下線 |
| 使用者願意手動 teach | 中 | Teach mode 需要動機——如果沒有即時回報，使用率可能很低 |
| chrome.storage.local 限制 10MB 足夠 | 中-高 | 目前無監控，超標會靜默失敗 |
| 單一開發者/小團隊維護 | 高 | 知識集中風險 |

### 4.2 已識別風險

#### 🔴 Critical

**C1：chrome.storage.local 靜默溢出**

- **觸發條件**：長期使用 teach mode + AI runtime 產生大量資料，總計超過 10MB
- **應變策略**：
  1. 在 `persistAiState()` 中加入 `chrome.storage.local.getBytesInUse()` 檢查
  2. 設定 80% 閾值警告（8MB），超過時觸發自動 pruning
  3. Pruning 優先序：old observations > old teach sessions > old candidates > old telemetry
- **影響評估**：如果觸發，所有 `chrome.storage.local.set()` 會靜默失敗。修復成本低（0.5-1 天）。

#### 🟠 High

**H1：AI Provider 不穩定導致 teach mode 體驗退化**

- **觸發條件**：API 超時、rate limit、或回傳格式異常
- **應變策略**：確保 local heuristic fallback 始終可用（已實作 ✅），在 teach dialog 中明確顯示「AI 不可用」狀態
- **影響評估**：不影響核心功能，但影響 AI 輔助的信任。

**H2：i18n 缺口導致中文使用者體驗破碎**

- **觸發條件**：中文使用者開啟 dashboard AI tab
- **應變策略**：補齊所有缺失的 key，移除硬編碼英文字串，加入 CI i18n coverage check
- **影響評估**：不影響功能但嚴重影響觀感。工作量約 0.5 天。

**H3：Policy Gate `escalateToCodexReview` 旗標完全未使用**

- **觸發條件**：站點風險分數達到 critical（≥30），旗標被設定但無任何程式碼讀取
- **影響評估**：無實際危害，但代表設計意圖未完成的缺口。

#### 🟡 Medium

**M1：confirmed patterns 未來啟用時缺乏 review UX**

- **觸發條件**：開發者將 `allowDurableMutation` 改為 `true`
- **應變策略**：將 review queue UI 列為啟用 durable mutation 的硬性前置條件
- **影響評估**：如果沒有 review UX 就啟用，可能產生 false positive blocking。

**M2：Teach mode 使用率過低**

- **觸發條件**：使用者沒有動機使用 teach mode，因為教學結果不產生立即效果
- **應變策略**：顯示積極回饋、考慮推送「待教學建議」、讓 confirmed patterns 影響 heuristic 信心分數
- **影響評估**：不影響功能，但影響 AI 學習系統的價值實現。

### 4.3 風險優先排序

| 排序 | 風險 ID | 等級 | 緊急性 | 修復成本 |
|------|---------|------|--------|----------|
| 1 | C1 | Critical | 高 | 低 (0.5-1 天) |
| 2 | H2 | High | 高 | 低 (0.5 天) |
| 3 | H1 | High | 中 | 低 (0.5 天) |
| 4 | M1 | Medium | 低（當前不影響） | 中 (2-3 天) |
| 5 | H3 | High | 低 | 低 (0.5 天) |
| 6 | M2 | Medium | 中 | 中 (1-2 天) |

---

## 5. 建議執行順序

### 下一輪最值得優先做的 3 件事

#### 🥇 第一優先：Storage 安全網 + confirmedPatterns 上限

**做什麼：**
1. 在 `normalizeAiKnowledgeStore()` 中對 `confirmedPatterns` 加入 `.slice(0, 200)` 限制
2. 在 `persistAiState()` 中加入 `chrome.storage.local.getBytesInUse()` 檢查
3. 超過 80% (8MB) 時自動 pruning 最舊的 observations 和 teach sessions
4. 在 console 記錄 storage 使用率

**理由：** 唯一可能導致「資料靜默丟失」的問題。修復成本低，風險消除效果高。

**風險：** 極低——只是加入防禦性程式碼，不改變任何現有行為。

#### 🥈 第二優先：i18n 缺口修補

**做什麼：**
1. 補齊 dashboard HTML 中 16+ 個缺失的 i18n key（兩個語系同步）
2. 將 teach dialog 的分類 badge 改為 i18n key
3. 移除 `dashboard.js` 中的硬編碼英文字串
4. 加入 teach mode 成功/promotion 的 i18n 回饋訊息
5. （建議）在 CI 中加入 locale key 同步檢查 script

**理由：** i18n 缺口在中文環境下導致 dashboard 顯示大量空白標題，對使用者觀感的傷害是即時且明顯的。

**風險：** 極低——純文案工作，不影響邏輯。

#### 🥉 第三優先：Teach mode UX 強化（為啟用 learned knowledge 鋪路）

**做什麼：**
1. 在 `commitTeachObservation` 成功後加入 toast 回饋
2. 在自動 promotion 時顯示通知
3. 在 element picker 顯示 teach mode 倒數計時器
4. （進階）在 `matchKnowledgeSeeds()` 中加入對 `confirmedPatterns` 的查詢，作為 heuristic 信心加分——這是**不需要 durable mutation** 的最小啟用路徑

**理由：** 讓 teach mode 從「功能可用」升級為「使用者願意用」的關鍵。特別是第 4 點——如果 confirmed patterns 能影響本地 heuristic 的信心分數（而不是直接封鎖），使用者就能看到 teach mode 的具體效果，同時不需要打破 `allowDurableMutation: false` 的安全邊界。

**風險：** 中低——toast 和倒數計時器是純 UI 改動；`matchKnowledgeSeeds` 的改動需要確保不會意外提升 benign 元素的 ad 分數。

---

## 關於 Policy Gate 邊界的決策建議

**應維持 `allowDurableMutation: false` 直到以下三個前置條件全部滿足：**

1. ✅ **Regression pool 建立** — live-site regression baseline 涵蓋 ≥ 20 個目標站
2. ✅ **Review queue UX 完成** — dashboard 可預覽、確認、拒絕候選規則
3. ✅ **Rollback 機制就緒** — confirmed pattern 可單獨撤銷，不需要全量 reset

在這三個條件滿足之前，`allowDurableMutation: false` 是這個系統最重要的安全閥，不應鬆動。

---

*審查完畢。此版本作為主線整合版的品質是合格的。上述建議按優先序執行後，即可進入下一輪的 learned knowledge 啟用規劃。*
