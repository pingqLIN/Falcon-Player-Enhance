# 第二輪技術與設計審查報告

> **審查版本：** Round 2  
> **審查日期：** 2026-03-20  
> **審查方法：** 直接原始碼比對（background.js、popup.html、popup.js、popup.css、manifest.json、.gitignore）  
> **審查範圍：** 安全分發、AI 功能設計、Popup/Dashboard UX 實作一致性、測試 QA 能力  
> **審查人：** GitHub Copilot CLI（Claude Sonnet 4.6）

---

## 一、首先更正第一輪報告的事實錯誤

> **⚠️ 書籤檔案從未進入 git 歷史**

執行 `git log --oneline --all -- "tests/bookmarks_2026_3_13.html"` 輸出為**空**。  
兩個書籤檔案（`.html` / `.html.bak`）存在於 working directory，但從未 commit。  
`.gitignore` 已有 `tests/bookmarks_*.html` 與 `tests/bookmarks_*.html.bak`，已完整受保護。

**結論：第一輪報告的「P0：書籤檔提交 git」為誤報。** 嚴重度降為中，本機刪除即可，不需要 `git filter-repo`。

---

## 二、確認已修復項目（自第一輪以來）

以下項目透過直接比對原始碼確認**已修復**，不再列為問題。

| 項目 | 來源位置 | 修復確認 |
|------|---------|---------|
| `declarativeNetRequestFeedback` 多餘權限 | `manifest.json` | ✅ 已移除 |
| `inject-blocker.js` 暴露至 `<all_urls>` | `manifest.json` `web_accessible_resources` | ✅ 已清除 |
| `--text-secondary: #999` 對比不足 | `popup.css` line 9 | ✅ 改為 `#767676`（4.54:1） |
| Base font 12px | `popup.css` line 62 | ✅ 改為 `13px` |
| 無 DESIGN.md 設計系統 | `DESIGN.md` | ✅ 已建立完整 token + 組件規範 |
| POLICY-GATE.md 絕對路徑 | `docs/POLICY-GATE.md` | ✅ 改為相對路徑 `extension/background.js` |
| Stats Grid 空狀態缺失 | `popup.html` line 115 | ✅ `stats-empty-state` div 已存在，含 i18n key |
| Header 按鈕無 aria-label | `popup.html` | ✅ 所有 header 按鈕已加 aria-label |
| Shortcut popover 僅 hover | `popup.js` lines 1264–1288 | ✅ click + focusin + keydown (Enter/Space/Escape) 全部實作 |
| Whitelist toggle aria-label 靜態 | `popup.js` line 436–444 | ✅ `updateWhitelistEnhanceOnlyLabel()` 動態更新 |
| AI Gate evidence 冷語氣 | `popup.html` | ✅ 改為 "This site looks clean so far." |
| Popup 無 tagline | `popup.html` | ✅ 加入 "Clean video. No interference." |

---

## 三、Findings（按嚴重度排序）

---

### 🔴 F1 — SITE_REGISTRY 成人網域硬編碼

| 屬性 | 值 |
|------|---|
| **Severity** | CRITICAL（若有 CWS 提交計畫） / HIGH（側載模式） |
| **File** | `extension/background.js` 行 40–70 |

**問題描述**

`SITE_REGISTRY.domains` 明確列出：

```
pornhub.com, xvideos.com, xhamster.com, redtube.com, youporn.com,
spankbang.com, eporner.com, txxx.com, hqporner.com, ...
```

這些名稱直接出現在 JavaScript 原始碼中，屬於 CWS 審查規範禁止的靜態成人網站清單。

**可能風險**

- 提交 CWS 時直接拒審
- 若 repo 轉為公開，原始碼中含有成人平台清單，增加品牌聲譽疑慮
- 清單本身是維護瓶頸：每次新增網站都需要修改核心 JS 檔

**建議修法**

- **短期**：將網域清單移至 `rules/site-registry.json`，由 `background.js` 在 runtime 讀入
- **中期**：提供 Dashboard 介面讓使用者自行匯入與管理
- CWS build 版本預設不含任何成人網站，改由使用者自訂安裝後設定

---

### 🔴 F2 — `getAiProviderSettings` 將 API Key 完整傳回

| 屬性 | 值 |
|------|---|
| **Severity** | HIGH |
| **File** | `extension/background.js` 行 3374–3381 |

**問題描述**

```js
if (request.action === 'getAiProviderSettings') {
  sendResponse({
    success: true,
    settings: normalizeAiProviderSettings(aiState.providerSettings || {})
  });
}
```

`normalizeAiProviderSettings()` 包含 `apiKey` 欄位，完整傳回給任何呼叫此 action 的 extension code。  
Handler 目前**沒有驗證 sender 來源**。此外，`chrome.storage.local` 本身可被 extension 所有 content script 直接存取，無需通過 background。

**可能風險**

- 若未來任何 content script 被以任何方式引導去呼叫 `getAiProviderSettings`，使用者的 OpenAI API key 會完整暴露
- 更實際的風險：content script 可直接 `chrome.storage.local.get(['aiProviderSettings'])` 取得完整 key，**無需通過 background**

**建議修法**

1. `getAiProviderSettings` handler 加入 sender 驗證：僅允許來自 extension 自身 origin 的請求（比對 `chrome.runtime.id`）
2. 返回時遮罩 apiKey：`{ ...settings, apiKey: settings.apiKey ? '***' : '' }`
3. Dashboard 顯示「已設定」狀態即可；使用者若需更新 key，整個重新提交，不從 storage 讀回

---

### 🔴 F3 — `normalizeRecommendedActionTokens` 模糊匹配過寬

| 屬性 | 值 |
|------|---|
| **Severity** | HIGH |
| **File** | `extension/background.js` 行 1397–1448 |

**問題描述**

當前 token 正規化使用 `.includes()` 子字串比對：

```js
if (source.includes('redirect'))           → tokens.add('guard_external_navigation')
if (source.includes('popup strict') || source.includes('popup guard'))  → tokens.add('tighten_popup_guard')
if (source.includes('overlay scan') || source.includes('scan frequency')) → tokens.add('tune_overlay_scan')
if (source.includes('blocklist'))          → tokens.add('apply_extra_blocked_domains')
```

這意味著：
- 模型輸出 `"Do not redirect users to external sites"` → 誤觸發 `guard_external_navigation`
- 模型輸出 `"The site uses overlay scan-like behavior"` → 誤觸發 `tune_overlay_scan`
- 語義否定句和純描述句都可能觸發 action

**可能風險**

- 對 T2 站點，錯誤觸發 `guard_external_navigation` 會攔截合法導航（付款頁、OAuth 回調）
- 此類誤判難以復現與調試，屬於隱性 bug

**建議修法**

- 嚴格模式優先：若 AI 輸出精確 enum token，完整字串比對直接採用；只有在嚴格比對失敗時才進入 fuzzy 層
- 收緊 `redirect` 規則：改為 `source.includes('guard external') || source.includes('navigation guard') || source === 'guard_external_navigation'`
- 在 AI prompt 中強化 enum 指示，減少對 fuzzy fallback 的依賴

---

### 🟡 F4 — Falcon-Player-Enhance 品牌殘留（9 處原始碼）

| 屬性 | 值 |
|------|---|
| **Severity** | MEDIUM |
| **Files** | 見下表 |

**問題描述（直接列舉）**

| File | 類型 | 具體內容 |
|------|------|---------|
| `extension/assets/icons/icon.svg` | aria-label | `aria-label="Falcon-Player-Enhance logo"` |
| `extension/content/anti-popup.js` | header + log | `// Falcon-Player-Enhance - Anti-Popup` + `[Falcon-Player-Enhance] 相容模式啟用` |
| `extension/content/cosmetic-filter.js` | header + log | `// Falcon-Player-Enhance - Cosmetic Filter` + `[Falcon-Player-Enhance] 已啟動` |
| `extension/content/fake-video-remover.js` | 行內 comment | `// 已被 Falcon-Player-Enhance 偵測為播放器` |
| `extension/sandbox/sandbox.js` | header | `// Falcon-Player-Enhance - Sandbox Page Controller` |
| `extension/content/overlay-remover.js` | 行內 comment | `// Falcon-Player-Enhance 內部元素` |
| `extension/rules/noop.js` | header + **MAIN world log** | `console.log('Falcon-Player-Enhance: Anti-Adblock variables mocked.')` |
| `extension/security/url-checker.js` | header | `// Falcon-Player-Enhance - URL Security Checker` |
| `extension/content/player-overlay-fix.css` | comment | `Falcon-Player-Enhance - Player Overlay Fix CSS` |

**可能風險**

- `noop.js` 的 `console.log('Falcon-Player-Enhance...')` 在**目標網站 MAIN world** 執行，開啟 devtools 即可見，是唯一的「對外公開」品牌殘留
- `icon.svg` 的 `aria-label` 讓螢幕閱讀器報出舊品牌名稱
- 程式碼內部與 manifest / DESIGN.md 品牌不一致，增加未來貢獻者的混亂

**建議修法**

全局搜尋替換（9 處確認清單已列）；特別優先處理 `noop.js` 的 console.log（直接對外可見）

---

### 🟡 F5 — AI Monitor "(In development)" 對所有使用者可見

| 屬性 | 值 |
|------|---|
| **Severity** | MEDIUM |
| **File** | `extension/popup/popup.html` 行 140；`extension/popup/popup.js` `initStorage` |

**問題描述**

```html
<h2 class="section-title">
  <span>AI always-on monitor</span>
  <span class="section-tag-dev">(In development)</span>
</h2>
```

`initStorage` 中 `aiMonitorEnabled` 預設為 `true`，表示新安裝使用者第一次打開 popup 即看到帶有「(In development)」標籤的完整 AI 面板。Dashboard 也沒有對應的「隱藏 AI Monitor」設定選項。

**可能風險**

- 新使用者看到「開發中」標籤，質疑功能穩定性，降低信任度
- "In development" 是內部開發語言，不應作為最終使用者看到的文案

**建議修法**

- **最簡單**：移除 `section-tag-dev` span，或將文案改為 `(Beta)`
- **完整方案**：Dashboard 加入「顯示 AI 監控面板」勾選，預設關閉；`initStorage` 改為 `aiMonitorEnabled: false`

---

### 🟡 F6 — Player Chip List 無空狀態

| 屬性 | 值 |
|------|---|
| **Severity** | MEDIUM |
| **File** | `extension/popup/popup.html` 行 83 |

**問題描述**

```html
<div class="player-chip-list" id="player-chip-list"></div>
```

Stats Grid 已加入 `stats-empty-state` div，但 Player Chip List 在無播放器時完全空白，無任何引導文案。

**可能風險**

使用者開啟 popup 後看到空白的 chip 區域，不知道該執行什麼操作，第一印象欠佳。

**建議修法**

```html
<div class="chip-empty-state" id="chip-empty-state" data-i18n="popupChipEmpty">
  No players detected — click <strong>DETECT</strong> to scan.
</div>
```

透過 popup.js 在 chip 出現時 `hidden` 這個 div。

---

### 🟡 F7 — Flow Indicator 無 lock 後折疊邏輯

| 屬性 | 值 |
|------|---|
| **Severity** | MEDIUM（UX） |
| **File** | `extension/popup/popup.js` |

**問題描述**

`flowIndicator` element 被抓取（line 16），flow-status 文字在部分狀態下更新，但沒有「播放器 lock 之後收起 flow-indicator 卡片組」的邏輯。DESIGN.md Component Rules 明確規定 lock 後 Flow Indicator 應收起以節省空間，目前 3 個步驟卡片永遠占位。

**可能風險**

lock 後 3 個大卡片繼續佔據 popup 上方空間，擠壓 Control Hub 的操作區域；DESIGN.md 規範已存在但實作未跟上。

**建議修法**

在 `setLockMode(true)` 或等效的 lock 事件中：

```js
flowIndicator.classList.add('flow-collapsed'); // CSS: height: 0; overflow: hidden; transition
```

unlock 時重新展開。

---

### 🟡 F8 — live-browser curated targets 含明確成人內容 URL

| 屬性 | 值 |
|------|---|
| **Severity** | MEDIUM（若 repo 轉公開） |
| **File** | `tests/live-browser/targets.external-ai.single-page.curated.json` |

**問題描述**

JSON 中包含 5 個目標 URL，其中 3 個是帶有明確影片標題的成人內容頁面（xhamster、xvideos、eporner）。URL 本身含有可識別的影片標題（例如：`/videos/secretary-fucks-bosss-son-to-get-a-raise-xhburpD`）。此 JSON **未在 `.gitignore` 中**，目前已進入版本歷史。

**可能風險**

repo 轉公開時，此類 URL 直接在程式碼中可見；與 SITE_REGISTRY 問題性質類似，但程度較輕（測試資料，非核心程式碼）。

**建議修法**

- 將 URL 的具體路徑段落替換為遮罩版本：`[video-slug-redacted]`
- 或在 `.gitignore` 新增 `tests/live-browser/targets.external-ai.*.json`（僅保留 `targets.example.json`）

---

### 🟡 F9 — `candidateSelectors` 從 AI 輸出信任過多

| 屬性 | 值 |
|------|---|
| **Severity** | MEDIUM |
| **File** | `extension/background.js` 行 1953 |

**問題描述**

```js
candidateSelectors: sanitizeStringList(raw.candidateSelectors, 16)
```

`sanitizeStringList` 只限制數量（最多 16），但不驗證 CSS selector 本身的結構。若 AI 輸出的 selector 匹配到合法元素（如 `div.player-container` 覆蓋真實播放器），cosmetic filter 可能錯誤隱藏內容。

**可能風險**

AI 幻覺生成的 selector 被套用到播放器本體，導致使用者看到黑屏或播放器被遮蔽。

**建議修法**

加入 selector 結構安全規則：
- 禁止 `:root`, `html`, `body`, `video`, `#player` 等核心元素 selector
- 強制 selector 必須包含 class 或 data-attribute（降低誤中播放器本體的機率）

---

### 🟢 F10 — `host_permissions: <all_urls>` 仍保留（可接受）

| 屬性 | 值 |
|------|---|
| **Severity** | LOW（可接受，有殘餘風險） |
| **File** | `extension/manifest.json` |

`BASIC_GLOBAL_CONTENT_SCRIPT_DEFINITIONS` 以 `<all_urls>` 作為 matches，這需要 `host_permissions: <all_urls>` 支援。在 CWS 審查中會觸發人工審核，但架構上確實必要（player detector 需在任意頁面運行）。

**建議**：在 `INSTALL.md` 或 `README.md` 明確說明此權限的必要原因，方便 CWS 審查時提供說明。

**狀態：可接受，有殘餘風險（CWS 審查成本）。**

---

### 🟢 F11 — 三份架構文件競爭仍未決（可接受）

| 屬性 | 值 |
|------|---|
| **Severity** | LOW（可接受但有維護風險） |
| **Files** | `ARCHITECTURE.md`、`ARCHITECTURE-PROPOSAL.md`、`ARCHITECTURE-ALTERNATIVE.md` |

三份文件並列，無決策記錄。目前是個人/小規模開發，短期影響有限。

**建議**：在非主要文件頭部加一行 `> STATUS: evaluated but not adopted — see ARCHITECTURE.md for current design`

**狀態：可接受，有殘餘維護風險。**

---

## 四、Findings 摘要表

| ID | Severity | File | 核心問題 |
|----|----------|------|---------|
| F1 | 🔴 CRITICAL | `background.js:40–70` | SITE_REGISTRY 成人網域硬編碼 |
| F2 | 🔴 HIGH | `background.js:3374` | API Key 完整暴露，無 sender 驗證 |
| F3 | 🔴 HIGH | `background.js:1397–1448` | normalizeRecommendedActionTokens fuzzy 匹配過寬 |
| F4 | 🟡 MEDIUM | 9 個檔案 | Falcon-Player-Enhance 品牌殘留（含 MAIN world console.log） |
| F5 | 🟡 MEDIUM | `popup.html:140` | AI Monitor "(In development)" 對所有使用者可見 |
| F6 | 🟡 MEDIUM | `popup.html:83` | Player Chip List 無空狀態 |
| F7 | 🟡 MEDIUM | `popup.js` | Flow Indicator 無 lock 後折疊邏輯 |
| F8 | 🟡 MEDIUM | `targets.external-ai.*.json` | 測試目標含明確成人 URL，已進入 git 歷史 |
| F9 | 🟡 MEDIUM | `background.js:1953` | candidateSelectors 無結構驗證 |
| F10 | 🟢 LOW | `manifest.json` | host_permissions all_urls（架構必要，CWS 風險）|
| F11 | 🟢 LOW | 3 份 ARCHITECTURE.md | 文件決策記錄缺失 |

---

## 五、總結

### 現在是否適合進入下一輪實作？

**大致適合，有一個前提**：  
F3（normalizeRecommendedActionTokens fuzzy matching）在進入任何 T2 相關的生產使用之前應先修緊。其他項目可平行處理，不構成實作阻斷。

### 最應優先處理的 3 件事

| 優先 | 項目 | 原因 |
|------|------|------|
| **#1** | **F3 — normalizeRecommendedActionTokens 收緊** | T2 action 觸發錯誤直接影響合法導航；誤判不可見且難調試 |
| **#2** | **F4 — noop.js `console.log('Falcon-Player-Enhance...')` 優先清除** | 唯一在目標網站 MAIN world 公開輸出的舊品牌字串，其餘 8 處影響有限 |
| **#3** | **F1（若有 CWS 計畫）** 或 **F5（若短期無 CWS 計畫）** | F1 是分發硬阻斷；F5 是新使用者第一印象的信任問題，修復成本極低 |

---

*本報告為第二輪審查輸出，基於 2026-03-20 原始碼直接比對結果。*  
*下一步建議：將 F3 修法合併為 PR，其餘 F4/F5/F6 可作為一次 cleanup PR 批次處理。*
