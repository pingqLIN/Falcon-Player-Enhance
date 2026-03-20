# Dashboard 重構計畫

> **版本：** v1.0  
> **日期：** 2026-03-20  
> **目前 dashboard 版本：** v4.4.0（787 行 JS／617 行 CSS／330 行 HTML）  
> **目標：** 重組 IA、改善 AI 設定流程、消除 Security tab 超載問題

---

## 一、現況診斷

### 1.1 現有 tab 結構

```
Dashboard（現在）
├── ▶️ Player settings
│   ├── Stats overview（3 cards：overlays, popups, players）
│   ├── Protection features（4 個靜態 badge + 2 個 toggle）
│   └── Hotkey reference（3 欄 grid，全部展開）
├── 🌐 Domain list
│   ├── Whitelist（input + list）
│   └── Blacklist（input + list）
├── ➕ Enhanced sites
│   ├── Built-in protected sites（read-only）
│   ├── Add custom site（input + list）
│   └── Enhanced match patterns（技術預覽）
├── 🚫 Blocked elements
│   └── Elements list + Clear all
└── 🔒 Security settings         ← 嚴重超載
    ├── Runtime policy gate（4 rows card）
    ├── AI provider（完整表單：enable + provider + mode +
    │   endpoint + model + API key + timeout + cooldown +
    │   candidates toggle + 3 action buttons + status display）
    ├── High-risk host gate status（list）
    ├── Sandbox protection（toggle）
    └── Data management（reset stats）
```

### 1.2 核心問題（按影響程度排序）

| # | 問題 | 影響 | 嚴重度 |
|---|------|------|-------|
| P1 | **AI 設定埋在 Security tab** — 主要功能卻需要 3 層才能找到 | 使用者找不到 AI 設定入口 | 🔴 高 |
| P2 | **Security tab 超載** — 政策閘、AI 表單、沙箱、資料管理並列，概念毫無關係 | 認知負荷過高，功能難以發現 | 🔴 高 |
| P3 | **AI 表單 UX 不佳** — API key / timeout / cooldown 排同一行，沒有 progressive disclosure | 技術門檻高，新用戶不知從何設定 | 🟡 中 |
| P4 | **Protection features 全是靜態 badge** — 4 個功能只顯示 "Enabled" 無法互動 | 空間浪費；使用者以為可以點擊 | 🟡 中 |
| P5 | **Domain 管理分散兩個 tab** — whitelist/blacklist 與 enhanced sites 是同一概念 | 用戶需在兩個 tab 間跳轉 | 🟡 中 |
| P6 | **Hotkeys 全部展開佔據 Player tab 大量空間** | 壓縮核心設定的可見性 | 🟢 低 |
| P7 | **Blocked elements 單獨成 tab** — 是很少使用的進階功能 | sidebar 噪音 | 🟢 低 |

---

## 二、重構後 IA（目標）

### 2.1 新 tab 結構（5 → 4 個 tab）

```
Dashboard（重構後）
├── 📊 Overview          ← 原 "Player settings"，重新定位
├── 🌐 Sites             ← 合併 "Domain list" + "Enhanced sites"
├── 🤖 AI               ← 從 Security 抽出，升格為一級 tab
└── ⚙️  Advanced         ← 原 "Security"，合併 "Blocked elements"，精簡
```

### 2.2 各 tab 內容對照

```
                 ┌─────────────────────────────────────────────────────┐
                 │              TA B  對 照 表                          │
  ──────────────────────────────────────────────────────────────────────
  原 tab            │  原內容              │  重構後 tab    │  備注
  ──────────────────────────────────────────────────────────────────────
  Player settings  │  Stats overview      │  Overview     │  保留
  Player settings  │  Protection features │  Overview     │  改為 toggles or 移除靜態 badge
  Player settings  │  Popup settings      │  Overview     │  保留
  Player settings  │  Hotkey reference    │  Overview     │  折疊成 <details>，預設關閉
  ──────────────────────────────────────────────────────────────────────
  Domain list      │  Whitelist           │  Sites        │  保留
  Domain list      │  Blacklist           │  Sites        │  保留
  Enhanced sites   │  Built-in sites      │  Sites        │  保留
  Enhanced sites   │  Custom sites        │  Sites        │  保留
  Enhanced sites   │  Match patterns preview │ Sites      │  改為 collapsible，預設關閉
  ──────────────────────────────────────────────────────────────────────
  Security         │  AI provider         │  AI           │  全部移過來，重新設計 UX
  (new)            │  (無)               │  AI           │  新增 AI status card
  ──────────────────────────────────────────────────────────────────────
  Security         │  Policy gate         │  Advanced     │  保留
  Security         │  High-risk hosts     │  Advanced     │  改為 collapsible
  Security         │  Sandbox             │  Advanced     │  保留
  Security         │  Data management     │  Advanced     │  保留
  Blocked elements │  Elements list       │  Advanced     │  移入
  ──────────────────────────────────────────────────────────────────────
```

---

## 三、各 tab 詳細規格

### 3.1 Tab 1 — Overview

**目的：** 擴充版的 popup 狀態總覽。使用者打開 dashboard 時應立即看到「extension 狀態」和「可互動設定」。

```
┌──────────────────────────────────────────────────────────────┐
│  Overview                                                     │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  STATUS BAR                                             │ │
│  │  ● Active  |  Enhanced on 12 sites  |  AI: advisory    │ │  ← 一行狀態摘要
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  STATS  ─────────────────────────────────────────────────── │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │    847   │  │    312   │  │     28   │  │     19   │   │
│  │ overlays │  │  popups  │  │ players  │  │  AI eval │   │  ← 新增第 4 個
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  PROTECTION FEATURES  ───────────────────────────────────── │
│  [ Auto overlay removal    ] [●──────] Enabled             │
│  [ Popup blocking          ] [●──────] Enabled             │  ← 如果不可關閉：
│  [ Fake video removal      ] [●──────] Enabled             │    改成狀態點，不是 toggle
│  [ Playback progress sync  ] [●──────] Enabled             │
│                                                              │
│  POPUP DISPLAY  ─────────────────────────────────────────── │
│  [ Auto-fit popup player   ] [──────●] On                  │
│  [ Show AI monitor in popup] [●──────] Off                 │
│                                                              │
│  ▸  Hotkey reference  （折疊，預設關閉）                       │
└──────────────────────────────────────────────────────────────┘
```

**改動清單：**
- 新增 Status bar（讀 `aiState.enabled`、`aiState.providerSettings.mode`、enhanced sites count）
- Stats cards 從 3 個擴充到 4 個（新增 AI assessments count）
- Protection features：確認 background.js 是否有對應 toggle → 有則改 toggle，無則改為 `●` 狀態點（不再用 "Enabled" badge）
- Hotkeys 改為 `<details>` 可折疊區塊，預設 `open` 屬性移除

---

### 3.2 Tab 2 — Sites

**目的：** 集中管理所有域名相關設定，終止「Domain list / Enhanced sites」的概念分裂。

```
┌──────────────────────────────────────────────────────────────┐
│  Sites                                                        │
├──────────────────────────────────────────────────────────────┤
│  WHITELIST  ─────────────────────────────────────── (no rules applied)
│  [ example.com                              ] [Add]          │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  youtube.com                              ✕           │    │
│  │  netflix.com                              ✕           │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  BLACKLIST  ─────────────────────────────────────── (strict protection)
│  [ dangerous.com                            ] [Add]          │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  (empty state)                                        │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ENHANCED SITES  ───────────────────────────────────────────  │
│  [ Add custom domain                        ] [Add]          │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  CUSTOM  mysite.com                       ✕           │    │
│  │  BUILT-IN  xhamster.com           [built-in]          │    │  ← 合在同一個 list
│  │  BUILT-IN  xvideos.com            [built-in]          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ▸  Enhanced match patterns  （折疊，預設關閉）                 │
└──────────────────────────────────────────────────────────────┘
```

**改動清單：**
- 移除「Built-in protected sites」獨立區塊，custom + built-in 合並顯示，built-in 用 badge 區分
- 「Enhanced match patterns」移為 `<details>`，預設關閉（技術性資訊）
- 新增 empty state 文案：whitelist 空時顯示 "No exceptions — all enhanced sites are active"；blacklist 空時顯示 "No strict rules added"

---

### 3.3 Tab 3 — AI（全新設計）

**目的：** 讓 AI provider 設定有尊嚴地存在，Progressive disclosure 降低技術門檻。

```
┌──────────────────────────────────────────────────────────────┐
│  AI                                                           │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  AI POLICY CONTROL          [──────●] Enabled           │ │  ← enable toggle 在 status card
│  │  Status: ● Connected · gpt-5.4-mini · advisory mode    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  PROVIDER  ──────────────────────────────────────────────── │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ OpenAI   │  │ Gemini   │  │LM Studio │  │ Gateway  │   │  ← card 選擇，不是 dropdown
│  │ ● active │  │          │  │          │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  CONFIGURE  ─────────────────── (展開 OpenAI 對應欄位) ────── │
│  API Key   [sk-••••••••••••••••••••]  [🔑 Update]          │  ← 僅顯示遮罩
│  Model     [gpt-5.4-mini                           ]        │
│  Endpoint  [https://api.openai.com/v1/responses   ]        │
│                                                              │
│  MODE  ──────────────────────────────────────────────────── │
│  ● Off         No AI assessment                             │
│  ○ Advisory    AI suggests, you decide                      │  ← radio cards 取代 dropdown
│  ○ Hybrid      AI actively applies safe policies            │
│                                                              │
│  ADVANCED  ─────────────────────────────────────────────── │
│  ▸ Timeout / Cooldown / Candidate rules  （折疊，預設關閉）   │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  [Save]  [Health check]  Status: ● Last check OK 12s   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  GENERATED CANDIDATES  ─────────────────────────────────── │
│  No candidates yet. Enable "Generate candidate rules" above.│
└──────────────────────────────────────────────────────────────┘
```

**改動清單：**
- **Provider 選擇**：從 `<select>` 改為 4 個 card，點選後展開對應欄位
- **API Key 顯示**：永遠顯示遮罩（`●●●●●●`），不從 storage 讀回明文；「Update」按鈕開 inline input
- **Mode 選擇**：從 `<select>` 改為 radio card group，每個 mode 附一行說明
- **Progressive disclosure**：API key/model/endpoint 為第一層（主要設定）；timeout/cooldown 藏在「Advanced」`<details>` 裡
- **Per-provider 欄位**：
  - OpenAI → API key + model + endpoint（endpoint 預填，可覆蓋）
  - Gemini → API key + model（endpoint 預填）
  - LM Studio → endpoint（預填 `http://localhost:1234/v1`）
  - Gateway → endpoint + bearer token
- **Health check** 移到 Save 按鈕旁，結果 inline 顯示

---

### 3.4 Tab 4 — Advanced

**目的：** 收納所有技術性、低頻使用的設定，讓 sidebar 保持簡潔。

```
┌──────────────────────────────────────────────────────────────┐
│  Advanced                                                     │
├──────────────────────────────────────────────────────────────┤
│  RUNTIME POLICY GATE  ──────────────────────────────────────  │
│  ┌──────────────────────────────────────────────┐            │
│  │  Policy version    1.0.0                     │            │
│  │  Gate version      1.0.0                     │            │
│  │  High-risk hosts   0                         │            │
│  │  Active fallbacks  0                         │            │
│  └──────────────────────────────────────────────┘            │
│  ▸  High-risk hosts detail  （折疊）                           │
│                                                              │
│  BLOCKED ELEMENTS  ─────────────────────────────────────── │
│  （原 Blocked elements tab 全部移入）                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  xhamster.com  (3)                                   │   │
│  │    .overlay-ad  ✕                                    │   │
│  │    .popup-cta   ✕                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│  [Clear all rules]                                          │
│                                                              │
│  SANDBOX PROTECTION  ───────────────────────────────────── │
│  [ Sandbox protection      ] [●──────] Enabled             │
│  Limits site permissions including popups and downloads.    │
│                                                              │
│  DATA MANAGEMENT  ─────────────────────────────────────── │
│  [ Reset statistics        ]                  [Reset]      │
└──────────────────────────────────────────────────────────────┘
```

**改動清單：**
- High-risk hosts detail 改為 `<details>`（預設關閉，減少視覺噪音）
- Blocked elements 從獨立 tab 移入（減少 sidebar 一個項目）
- Sandbox "About sandbox" 說明文字改為與 toggle 同行的 desc，不再是獨立 section

---

## 四、Sidebar 對照

```
現在                         重構後
─────────────────────────    ─────────────────────────
▶️  Player settings           📊 Overview
🌐  Domain list               🌐 Sites
➕  Enhanced sites            🤖 AI             ← 新
🚫  Blocked elements          ⚙️  Advanced
🔒  Security settings
─────────────────────────    ─────────────────────────
5 個 tab                      4 個 tab
```

**Tab 命名（中文化建議）：**

| Tab ID | 英文標籤 | 中文標籤（建議） |
|--------|---------|---------------|
| `overview` | Overview | 總覽 |
| `sites` | Sites | 站點管理 |
| `ai` | AI | AI 設定 |
| `advanced` | Advanced | 進階 |

---

## 五、新元件設計規格

### 5.1 Provider Card（AI tab）

```css
.provider-card {
  border: 1px solid var(--separator);
  border-radius: 6px;
  padding: 12px 16px;
  cursor: pointer;
  flex: 1;
  transition: border-color 0.15s, background 0.15s;
}
.provider-card.active {
  border-color: var(--text-primary);
  background: var(--bg-card);
}
.provider-card-name { font-size: 13px; font-weight: 600; }
.provider-card-sub  { font-size: 11px; color: var(--text-secondary); }
```

### 5.2 Mode Radio Card（AI tab）

```css
.mode-option {
  border: 1px solid var(--separator);
  border-radius: 6px;
  padding: 10px 14px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 6px;
}
.mode-option.selected { border-color: var(--text-primary); }
.mode-option-title { font-weight: 500; font-size: 13px; }
.mode-option-desc  { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
```

### 5.3 Collapsible Section（多個 tab）

```html
<details class="collapsible-section">
  <summary class="collapsible-header">Hotkey reference</summary>
  <div class="collapsible-body">
    <!-- 內容 -->
  </div>
</details>
```

```css
.collapsible-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  cursor: pointer;
  padding: 8px 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.collapsible-header::before { content: "▸"; transition: transform 0.15s; }
details[open] .collapsible-header::before { transform: rotate(90deg); }
```

### 5.4 Status Bar（Overview tab）

```html
<div class="status-bar">
  <span class="status-dot active"></span>
  <span class="status-text">Active</span>
  <span class="status-sep">|</span>
  <span id="status-enhanced-count">Enhanced on 0 sites</span>
  <span class="status-sep">|</span>
  <span id="status-ai-mode">AI: off</span>
</div>
```

```css
.status-bar {
  background: var(--bg-card);
  border: 1px solid var(--separator);
  border-radius: 6px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 20px;
}
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #CCC; }
.status-dot.active { background: #34C759; }
.status-sep { color: var(--separator); }
```

---

## 六、受影響的 i18n Keys

新增 / 修改的 i18n keys（需同步更新 `_locales/`）：

| Key | 說明 | 新文案方向 |
|-----|------|-----------|
| `dashboardMenuPlayer` | 原 "Player settings" | → `"Overview"` / `"總覽"` |
| `dashboardMenuSecurity` | 原 "Security settings" | → `"Advanced"` / `"進階"` |
| `dashboardMenuAi` | 新增 | `"AI"` / `"AI 設定"` |
| `dashboardMenuSites` | 新增（合併 domains + custom-sites） | `"Sites"` / `"站點管理"` |
| `dashboardAiStatusCard` | 新增 | `"AI Policy Control"` |
| `dashboardAiModeOff` | 新增 | `"Off — No AI assessment"` |
| `dashboardAiModeAdvisory` | 新增 | `"Advisory — AI suggests, you decide"` |
| `dashboardAiModeHybrid` | 新增 | `"Hybrid — AI actively applies safe policies"` |
| `dashboardAiProviderOpenAI` | 新增 | `"OpenAI"` |
| `dashboardAiProviderGemini` | 新增 | `"Gemini"` |
| `dashboardAiUpdateKey` | 新增 | `"Update key"` |
| `dashboardAdvancedHeading` | 新增 | `"Advanced"` |

---

## 七、JS 改動範圍

### 7.1 Tab switching

```js
// 現在的 tab IDs:   player, domains, custom-sites, elements, security
// 重構後的 tab IDs: overview, sites, ai, advanced
```

需更新：
- `data-tab` 屬性（HTML）
- `menu-item` 點擊 handler（JS）
- `loadTabData(tab)` 函數的 case 分支

### 7.2 AI tab 新增邏輯

| 功能 | 目前位置 | 重構後 |
|------|---------|--------|
| `lmstudio-enabled` toggle | Security tab render | AI tab render |
| `ai-provider` select | Security tab render | AI tab：改為 card 點擊 |
| `lmstudio-mode` select | Security tab render | AI tab：改為 radio card |
| `ai-provider-token` input | Security tab | AI tab：遮罩顯示 + Update 按鈕 |
| `lmstudio-endpoint/model` | Security tab | AI tab：per-provider 展開 |
| `lmstudio-timeout/cooldown` | Security tab | AI tab：Advanced collapsible |
| `btn-save-lmstudio` | Security tab | AI tab |
| `btn-check-lmstudio` | Security tab | AI tab |
| `lmstudio-status` display | Security tab | AI tab：Status bar |
| candidates | Security tab | AI tab |

### 7.3 Sites tab 新增邏輯

- `loadCustomSitesTab()` 與 `loadDomainsTab()` 合併為 `loadSitesTab()`
- Built-in + custom 合在同一個 render loop，built-in 標記 `[built-in]` badge
- Match patterns preview 改為 `<details>` 內的 lazy-load（`toggle` 事件觸發）

---

## 八、不在本次範圍

| 項目 | 原因 |
|------|------|
| background.js messaging API 改動 | 保持 API 穩定，本次只動前端 |
| Storage key 更名 | 需要 migration，另立 issue |
| 新增 AI monitoring 視覺化 | 功能範圍過大，下一輪 |
| 響應式設計 / mobile layout | Dashboard 目前限定為擴充功能頁面，固定寬度可接受 |
| 動畫 / transition 強化 | 可作為 polish pass，不是重構核心 |

---

## 九、執行建議順序

| 步驟 | 工作 | 預計改動檔案 |
|------|------|------------|
| 1 | 更新 HTML：新 tab structure + data-tab IDs + AI tab markup | `dashboard.html` |
| 2 | 更新 CSS：provider cards + mode radio cards + status bar + collapsible | `dashboard.css` |
| 3 | 更新 JS：tab switching + loadTabData + AI tab 邏輯重寫 + Sites tab 合併 | `dashboard.js` |
| 4 | i18n：新增 / 更名 keys | `_locales/en/messages.json` 等 |
| 5 | 驗證：`node --check dashboard.js` + 手動 smoke test 每個 tab | — |

---

*文件依據：直接閱讀 `dashboard.html`（330 行）、`dashboard.css`（617 行）、`dashboard.js`（787 行）、`DESIGN.md` 與 `AUDIT_ROUND2.zh-TW.md`*
