# Falcon-Player-Enhance — UI/UX 設計審查報告

> 審查日期：2026-03-19  
> 分支：`claude/bold-gagarin`  
> 審查範圍：Popup UI、Dashboard UI、設計系統一致性、互動狀態、可及性  
> 方法：/plan-design-review（Designer's Eye Plan Review）

---

## 系統審計摘要（Pre-Review Audit）

| 項目 | 狀態 |
|------|------|
| DESIGN.md | ❌ 不存在（設計系統僅記錄於 CSS 註解） |
| 設計系統命名 | `Three-Gray Achromatic Design System`（popup.css 第 1 行） |
| 主題支援 | ✅ Light / Dark，支援 `prefers-color-scheme` |
| 字型 | `-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto` |
| 基礎字型大小 | `12px`（⚠️ 低於可及性建議值） |
| Popup 寬度 | 固定 `300px`（pinned mode 擴展至 100%） |
| 顏色系統 | 無色彩主題，純灰階（`#F5F5F5` / `#333` / `#999`） |
| 多語系 | ✅ i18n 架構，但存在硬編碼中文字串 |

**UI 範圍確認：** Popup、Dashboard、Popup Player 視窗，均有設計審查價值。

---

## Step 0：整體設計評分

> **初始評分：5/10**

這個 UI 已有明確的設計語言（無彩色系統、三層灰）和一些差異化元素（3步流程引導器、AI Gate 資訊卡），顯示有設計意圖。扣分原因：

- 缺乏 DESIGN.md 導致設計決策未被文件化
- 12px 基礎字型損害可及性
- 多處互動狀態（空白態、載入中）未被定義
- AI Monitor 面板的資訊密度過高，且顯示「(In development)」但對所有用戶可見
- 部分 Emoji 作為 UI 控件，無文字備用

---

## Pass 1：資訊架構（Information Architecture）

**評分：5/10 → 目標 8/10**

### Popup 結構（由上至下）

```
┌─────────────────────────────────┐
│ Header（標題 / Pin / 主題 / 開關）│  ← 永遠顯示，Sticky
├─────────────────────────────────┤
│ Flow Indicator（3步引導器）      │  ← 第一眼視覺焦點 ✅
├─────────────────────────────────┤
│ Control Hub（目標鎖定 / 播放控制）│  ← 核心功能區
├─────────────────────────────────┤
│ Level Panel（封鎖等級 / 白名單）  │  ← 設定類，位置偏上
├─────────────────────────────────┤
│ Stats Grid（4個計數器）          │  ← 狀態類，位置偏下
├─────────────────────────────────┤
│ AI Monitor Panel（風險 / Gate）  │  ← 進階功能，在底部 ✅
├─────────────────────────────────┤
│ Footer（元素選擇 / 快捷鍵 / 設定）│  ← 工具列
└─────────────────────────────────┘
```

### 問題：Level Panel 與 Stats Grid 位置顛倒

**現況：** 封鎖等級選擇（設定項目）在統計數字（狀態資訊）之上。  
**問題：** 用戶進入 Popup 的首要動機是「確認防護狀態」，而非調整設定。  
**建議排列：**

```
1. Flow Indicator（引導）
2. Control Hub（鎖定目標 / 播放控制）
3. Stats Grid（防護狀態一覽）
4. Level Panel（若需調整再往下看）
5. AI Monitor（進階用戶）
```

### 問題：AI Monitor 有 "(In development)" 標籤但對所有用戶可見

當前所有用戶都能看到這個面板，但標籤說明功能還在開發中。這會：
- 產生信任疑慮（功能是否可靠？）
- 製造資訊噪音（新用戶不需要這個面板）

**建議：** 在 Dashboard 提供 AI Monitor 面板的顯示/隱藏開關，預設隱藏。

### Dashboard 側欄導覽架構

```
▶️ Player settings     ← 最常用，排第一 ✅
🌐 Domain list         ← 應改名為更直覺的標籤
➕ Enhanced sites      ← 功能不明確（Enhanced 是什麼？）
🚫 Blocked elements    ← 清楚 ✅
🔒 Security settings   ← 過於寬泛
```

**問題：** "Enhanced sites" 和 "Domain list" 的區別對新用戶不直覺。  
**建議：** 改為 "My whitelist" / "Custom block rules" 等更口語化標籤。

---

## Pass 2：互動狀態覆蓋（Interaction State Coverage）

**評分：4/10 → 目標 8/10**

### 狀態矩陣

| UI 功能 | 載入中 | 空白態 | 錯誤態 | 成功態 | 部分態 |
|---------|--------|--------|--------|--------|--------|
| Player Chip List | ❓ 未定義 | ❌ 未設計 | ❓ | 已有 chip 元件 | ❓ |
| Stats Grid (0,0,0,0) | ❓ | ❌ 數字全 0 像故障 | ❓ | 正常計數 | — |
| Flow Status 文字 | ❓ | 顯示 "Click target player to lock" | ❓ | ❓ | ❓ |
| AI Risk Tier | — | 顯示 "LOW" / "0.00" | ❓ | — | — |
| AI Provider Status | — | 顯示 "offline" | ❓ | 顯示 "online" | — |
| Playback Controls | — | `locked-off` class (CSS 隱藏) | ❓ | — | — |

### 關鍵空白態問題

**Stats Grid 初始狀態：**  
用戶首次使用時，4 個數字全為 `0`。這個狀態傳達的訊息是「什麼都沒有發生」，但實際情況可能是：
- 擴充功能剛安裝（正確：什麼都沒有發生）
- 用戶在不支援的網站上（應明確提示）
- 有問題（看起來像 bug）

**建議：** 首次使用空白態應有暖心引導文字，例如：「Visit a video site to start protecting your player」。

**Player Chip List 空白態：**  
`#player-chip-list` 在沒有偵測到播放器時顯示什麼？HTML 中沒有 fallback 內容。  
**建議：** 加入空白態說明，例如：「No players detected on this page」＋ DETECT 按鈕作為主要動作。

**AI Gate Evidence 空白態：**  
目前空白態文字是 `"No recent signals"` — 這是 chip 文字，感覺像資料而非說明。  
**建議：** 改為更暖和的說明，如 `"This site looks clean so far"`。

---

## Pass 3：用戶旅程與情感弧線（User Journey & Emotional Arc）

**評分：6/10 → 目標 8/10**

### 新用戶旅程

| 步驟 | 用戶行為 | 情緒 | 現有設計支援？ |
|------|----------|------|----------------|
| 1 | 安裝擴充功能後首次開啟 popup | 好奇，希望確認「有效果嗎？」 | 🟡 Flow Indicator 有引導，但 Stats 全 0 讓人存疑 |
| 2 | 進入一個影片網站 | 期待 | ✅ 自動偵測，不需手動操作 |
| 3 | 看到廣告覆蓋層出現時 | 焦慮 | 🔴 無即時視覺回饋說明正在處理 |
| 4 | 廣告被移除後 | 滿足 | 🟡 Stats 數字增加，但 popup 要主動開啟才看得到 |
| 5 | 想調整設定 | 探索 | 🟡 Footer 裡的 ⚙ 不夠明顯 |

### 問題：Flow Indicator 引導器的生命週期不明確

3步引導器（CLICK → DETECT → PLAY）是一個很好的新用戶教育元件，但：
- 它是永遠顯示，還是在用戶完成流程後消失？
- 當 player 被鎖定後，引導器是否應轉換成「狀態顯示」模式？

**建議：** 定義引導器的狀態機：
```
初始態：顯示 3 步說明（動畫 pulse）
鎖定後：縮小/隱藏，讓出空間給 Control Hub
再次解鎖：重新展開
```

### 問題：5秒第一印象（Visceral Design）

開啟 popup 的第一眼：盾牌 🛡️ + "Falcon-Player-Enhance" 標題 + Pin/主題/開關。  
問題：「Falcon-Player-Enhance」是技術名稱，不是用戶語言。  

**建議：** 副標題加入一句話定位，例如：  
`Falcon-Player-Enhance` → `Clean Video Player`（副標題）

---

## Pass 4：AI 生成感風險（AI Slop Risk）

**評分：7/10（相對較好）**

### 差異化設計元素（值得保留）

- ✅ **3步流程引導器**：有動畫 wire-pulse 效果，不是通用 card grid
- ✅ **AI Gate Card**：tier badge（T1/T2）+ mode + reason + evidence chip 組合，是這個產品獨有的 UI 語言
- ✅ **Player Chip List**：鎖定目標概念對播放器場景有意義
- ✅ **A-B Loop 按鈕**：高度特定於影片播放的功能

### 需要改進的通用化元素

- 🟡 **Stats Grid（4數字）**：常見儀表板模式，但在 300px 寬的 popup 內還算合理
- 🟡 **封鎖等級下拉選單（`<select>`）**：相比其他現代設計語言感覺較陳舊；可考慮用 segmented control（`0 | 1 | 2 | 3`）取代
- 🔴 **Dashboard 設定清單**：`setting-item` + `status-badge` 的組合完全是通用 settings 頁面模式，無個性
- 🔴 **Emoji 作為圖示**：🛡️ 📌 ⚙ 🚫 🔒 ▶️ 等 Emoji 在不同 OS 渲染差異大，且無法精確控制視覺一致性

### Emoji 圖示替換建議

| 現況 | 問題 | 建議替代 |
|------|------|----------|
| 🛡️ 標題圖示 | 各 OS 渲染不一 | SVG icon（已有 icon.svg） |
| ⚙ 設定按鈕 | 無文字標籤時不可及 | SVG + aria-label |
| 📌/📍 Pin 按鈕 | 語意不夠清晰 | SVG + tooltip |
| ▶️ 🌐 ➕ 🚫 🔒（側欄） | Emoji 渲染不穩定 | 一致的 SVG icon set |

---

## Pass 5：設計系統對齊（Design System Alignment）

**評分：4/10 → 目標 7/10**

### 現有設計系統（從 CSS 推導）

| 項目 | 現況 | 問題 |
|------|------|------|
| 顏色 | `#F5F5F5` / `#FFFFFF` / `#333` / `#999` / `#E0E0E0` | ✅ 完整的灰階系統 |
| 字型 | 系統字型堆疊 | ✅ 合理，無外部依賴 |
| 基礎字型大小 | `12px` | ❌ 低於建議值（16px） |
| 間距 | 無明確 spacing scale | ❌ 散落在各 CSS 規則中 |
| 圓角 | `26px`（toggle）、`50%`（按鈕） | 🟡 不一致 |
| 陰影 | `0 2px 4px rgba(0,0,0,0.2)`（toggle） | 🟡 未統一定義 |
| 動畫時間 | `0.15s`（hover）、`0.3s`（toggle） | 🟡 未統一為 token |

### 致命缺口：無 DESIGN.md

設計系統規格只存在於 `/* Shield Pro v4.0 — Three-Gray Achromatic Design System */` 這一行 CSS 註解，沒有：
- 完整 token 清單
- 元件庫清單
- 設計決策記錄（為什麼選無彩色？）
- 新增元件的命名規範

**建議：** 建立最小可行 DESIGN.md，至少涵蓋顏色 token、字型大小比例、間距比例。

### 混用設計語言

popup 和 dashboard 使用了部分重複但不完全一致的 class 命名：
- popup 用 `rescan-btn`，dashboard 用類似功能的不同 class
- popup 有 `toggle-switch-sm`，dashboard 也有自己的 toggle

---

## Pass 6：響應式與可及性（Responsive & Accessibility）

**評分：4/10 → 目標 7/10**

### 響應式

| 情境 | 現況 |
|------|------|
| Popup 模式（300px） | ✅ 固定寬度，合理 |
| Side Panel 模式（pinned） | ✅ `body.pinned-mode` 切換至 `width: 100%` |
| Dashboard（全頁） | 🟡 側欄 + 內容區，未確認在窄視窗的行為 |
| Popup Player 視窗（1280×720） | ❓ 未審查 |

### 可及性問題

#### 🔴 高優先：基礎字型 12px

WCAG 2.1 SC 1.4.4 要求文字可放大至 200%，但 12px 基礎已在許多用戶配置下過小。  
Chrome Extension popup 建議最小 `14px`，理想 `13px`（考量 300px 寬度限制）。

#### 🔴 高優先：快捷鍵 Popover 僅限滑鼠 hover 觸發

```html
<div class="shortcuts-reference" title="Shortcuts and controls overview">
    <div class="shortcuts-summary">...</div>
    <div class="shortcuts-popover" id="shortcuts-popover">...</div>
</div>
```

只有滑鼠 hover 才能顯示 shortcuts-popover，鍵盤用戶無法存取完整快捷鍵列表。  
**建議：** 改為 click/focus 觸發，或提供「查看全部快捷鍵」按鈕。

#### 🔴 高優先：Emoji 按鈕缺乏可及性文字

```html
<button class="footer-small-btn" id="btn-pick-element" title="Enable element blocking mode">
    🚫
</button>
```

`title` 屬性在觸控設備和部分螢幕閱讀器上不可靠。  
**建議：** 改用 `aria-label`（已在部分元件使用，需統一）。

#### 🟡 中優先：Toggle 開關的狀態傳達

白名單保護模式的 toggle 只有視覺樣式，無文字說明當前狀態（開/關）。  
**建議：** 加入動態的 `aria-label`，如 `"白名單保護模式：已啟用"`。

#### 🟡 中優先：焦點順序未定義

Popup 的 Tab 鍵焦點順序未在 HTML 中明確設計（沒有 `tabindex` 策略），可能導致焦點在視覺上跳躍。

#### 🟡 中優先：色彩對比度驗證

無彩色（灰階）系統通常對比度良好，但需驗證：
- `--text-secondary: #999` 在 `--bg-card: #FFFFFF` 上的對比度：約 2.85:1（❌ 不達 WCAG AA 4.5:1）
- 小字型（12px）的對比度要求更高

#### 觸控目標尺寸

| 元件 | 估計尺寸 | WCAG 建議 |
|------|----------|-----------|
| 主題切換按鈕 | `28px × 28px` | ⚠️ 低於 44px |
| Footer 小按鈕 | 未知 | ❓ 需確認 |
| Toggle-sm | `36px × 20px` | ❌ 低於 44px 高度 |

---

## Pass 7：未解決的設計決策

| 決策 | 若推遲，發生什麼 |
|------|------------------|
| Stats Grid 空白態（全 0 時）顯示什麼？ | 工程師留 `0`，看起來像故障 |
| Player Chip List 空白態有什麼說明文字？ | 顯示空白區域，用戶不知道下一步 |
| Flow Indicator 在鎖定 player 後是否收起？ | 永遠佔用空間，擠壓 Control Hub |
| AI Monitor 面板是否預設隱藏？ | 所有用戶看到 "(In development)" 標籤 |
| 快捷鍵 popover 是否改為 click 觸發？ | 鍵盤用戶無法存取快捷鍵列表 |
| `白名單保護模式` 硬編碼中文字串是否 i18n 化？ | 英語界面出現中文，品牌不一致 |
| Dashboard 「Domain list」vs「Enhanced sites」命名混淆 | 新用戶不知道差異在哪裡 |
| Emoji 圖示是否統一替換為 SVG？ | 跨 OS 渲染不一致，無法精確控制 |
| 基礎字型是否從 12px 升至 13-14px？ | 可及性不達標 |

---

## 未納入審查範圍（Not in Scope）

| 項目 | 理由 |
|------|------|
| Popup Player 視窗設計 | 另一個獨立視窗，應另行審查 |
| 動畫效果細節（wire-pulse） | 已有實作，非本次重點 |
| Dashboard 各 Tab 內容細節 | 需單獨的 Dashboard 設計審查 |
| Extension Icon 設計 | 已有 icon.svg，非本次重點 |

---

## 現有可重用設計元素

| 元素 | 位置 | 重用建議 |
|------|------|----------|
| Toggle Switch | popup.css | ✅ 已統一，在 dashboard 中沿用 |
| 三層灰色彩系統 | popup.css CSS 變數 | ✅ 應提升至 DESIGN.md |
| AI Gate Card 視覺語言 | popup.html | ✅ 獨特，保留 |
| Flow Indicator 元件 | popup.html | 🟡 可考慮抽取為可複用元件 |
| rescan-btn 樣式 | popup.css | 🟡 在 popup/dashboard 中命名不一致 |

---

## 建議 TODOS

### P0 — 可及性修復（立即執行）

1. **修正 `#999` 對比度不足**  
   `--text-secondary` 在白色背景對比度 2.85:1，不達 WCAG AA。  
   建議改為 `#767676`（對比度 4.54:1）。

2. **快捷鍵 Popover 改為 click/focus 觸發**  
   目前 hover-only，鍵盤用戶無法存取 shortcuts 列表。

3. **Emoji 按鈕統一加上 `aria-label`**  
   `🚫 📌 ⚙` 等按鈕需要明確的無障礙標籤。

4. **基礎字型從 12px 升至 13px**  
   最低限度的可及性改善。

### P1 — 空白態與狀態設計

5. **設計 Player Chip List 空白態**  
   加入說明文字 + DETECT 主要動作。

6. **設計 Stats Grid 首次使用態**  
   區分「全 0（尚無防護記錄）」與「全 0（功能未啟動）」兩種情境。

7. **定義 Flow Indicator 狀態機**  
   明確在哪些條件下引導器收起/展開。

### P2 — 設計系統

8. **建立 DESIGN.md**  
   至少包含：顏色 token 清單、字型比例、間距比例、Emoji vs SVG 使用規範。

9. **統一 i18n 覆蓋**  
   將 `白名單保護模式`、`點選播放器` 等硬編碼中文字串改為 i18n key。

10. **AI Monitor 面板加入顯示/隱藏設定**  
    在 Dashboard 提供開關，降低新用戶的認知負擔。

---

## 完成摘要

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | 無 DESIGN.md，設計系統僅記錄於 CSS 註解       |
| Step 0               | 初始 5/10，重點：空白態、可及性、AI 面板     |
| Pass 1  (Info Arch)  | 5/10 → 目標 8/10（Stats/Level 建議調序）   |
| Pass 2  (States)     | 4/10 → 目標 8/10（空白態未定義）           |
| Pass 3  (Journey)    | 6/10 → 目標 8/10（Flow Indicator 生命週期）|
| Pass 4  (AI Slop)    | 7/10（Gate Card 是差異化亮點）             |
| Pass 5  (Design Sys) | 4/10 → 目標 7/10（需建立 DESIGN.md）      |
| Pass 6  (Responsive) | 4/10 → 目標 7/10（12px + hover-only 問題）|
| Pass 7  (Decisions)  | 9 項待決策，均已列出                       |
+--------------------------------------------------------------------+
| NOT in scope         | 4 項（已列出）                               |
| What already exists  | Toggle、色彩系統、AI Gate Card 可重用        |
| TODOS 建議           | 10 項（P0×4, P1×3, P2×3）                  |
| 決策已加入報告        | 9 項（待開發者確認）                         |
| 整體設計評分          | 5/10 → 實施建議後預估 7.5/10               |
+====================================================================+
```

> **結論：** 整體設計有清晰意圖和差異化元素，但空白態設計、可及性基礎、設計系統文件化三個面向需要補強。  
> 建議實施 P0 可及性修復後再進行 /design-review 視覺 QA。

---

*本報告由 GitHub Copilot CLI（Claude Sonnet 4.6）生成，建議開發者逐項確認後採用。*
