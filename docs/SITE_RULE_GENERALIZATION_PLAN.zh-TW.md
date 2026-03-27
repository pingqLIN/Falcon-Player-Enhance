# 站點特化邏輯通用化重構計畫

> **版本：** v1.1  
> **日期：** 2026-03-24  
> **目標：** 將 Extension 內散落於多個 content script / background 的特定網站永久邏輯，重構為「通用引擎 + 文本規則」架構，降低回歸風險與維護成本。

---

## 一、背景與動機

目前專案已經累積多層播放器保護能力，但也逐漸出現下列現象：

- 不同模組各自維護站點白名單、相容模式、播放器 host hints、廣告網路關鍵字
- 部分 workaround 直接寫成 `if (hostname.includes(...))` 或特定站族函式
- 同一組站點知識散落在 `anti-antiblock`、`inject-blocker`、`overlay-remover`、`player-detector`、`player-enhancer` 等多個檔案
- 修復某一站問題時，容易不小心把通用頁面或其他站點互動一起打壞

這次 `vidboys.com` 右側連結失效就是一個典型訊號：

- 問題表面上發生在單一網站
- 真正根因卻是「通用清理流程誤判 hidden / blank iframe 為播放器」
- 如果用新的站點特例去補，短期可解，但長期只會讓規則更分散、更難維護

因此本次方向不是再增加更多站點特例，而是建立：

- 通用判斷邏輯
- 統一的文本規則來源
- 明確的分類與責任邊界

---

## 二、重構目標

### 2.1 核心目標

1. 停止在 runtime code 中新增針對特定網站的永久分支邏輯
2. 將現有站點知識集中到規則檔，而不是散落在多個 JS 檔案
3. 讓內容腳本改為讀取規則並套用通用引擎
4. 把「站點知識」與「判斷演算法」分離
5. 建立可驗證、可遷移、可回歸測試的重構路徑

### 2.2 非目標

- 這一輪不處理 Windows `DPAPI` / native host
- 這一輪不重寫整個 AI policy gate
- 這一輪不追求一次移除所有 domain 名稱
- 這一輪不移除必要的威脅情資名單與平台 registry

---

## 三、目前發現的站點特化類型

### 3.1 可以接受的資料層硬編碼

這類資訊本質上就是資料，重點是要集中管理，不必強行刪除：

- DNR / ad list / filter rules
- AI 高風險廣告網路關鍵字
- provider endpoint 預設值
- 受支援播放器平台 registry

代表檔案：

- `extension/rules/filter-rules.json`
- `extension/rules/ad-list.json`
- `extension/rules/site-registry.json`
- `extension/background.js`

### 3.2 需要抽象化的 runtime 特化邏輯

這類邏輯目前直接綁在 script 行為上，最需要重構：

- `extension/content/anti-antiblock.js`
- `extension/content/cosmetic-filter.js`
- `extension/content/overlay-remover.js`
- `extension/content/inject-blocker.js`
- `extension/content/player-detector.js`
- `extension/content/player-enhancer.js`
- `extension/content/anti-popup.js`
- `extension/background.js`

常見問題型態：

- 站點白名單或相容模式直接寫死在 JS 常數
- 站族專用 selector 直接混在通用邏輯
- redirect trap / safe media host / popup allowlist 各自維護
- 同一組站點知識同時出現在 DNR allow 規則與 runtime JS 常數
- 某站 workaround 被做成函式而非規則資料
- 以 `String.includes()` 模糊比對 domain / token，誤傷風險偏高

### 3.3 目前最明顯需要重構的例子

| 類型 | 現況 | 問題 |
|------|------|------|
| 站族專用 workaround | `handleJavboysPlayer()` | 約 225 行，含 CVP / ExoLoader / VAST / VPAID 偽造，複雜度最高 |
| CSS 規則依站名分流 | `PLAYER_SITE_RULES` | selector 分散且難驗證 |
| 安全媒體 host 白名單 | `SAFE_MEDIA_HOST_PATTERNS` + `filter-rules.json` allow rules | 同類知識重複出現在多檔與 DNR |
| 相容模式站點 | `COMPATIBILITY_MODE_SITES` | 已知至少 3 處，若分批遷移容易失同步 |
| popup / iframe 允許站點 | `DIRECT_POPUP_IFRAME_HOSTS` 等多處常數 | background 與 content 對路由認知可能分裂 |
| redirect trap 清單 | `L3_REDIRECT_TRAP_DOMAINS` | 不只是資料，還混入站族恢復邏輯 |
| 惡意網域判斷 | `MALICIOUS_DOMAINS` + `includes()` | 模糊比對易誤殺合法頁面或第三方資源 |

---

## 四、目標架構

### 4.1 設計原則

- 演算法與站點知識分離
- 規則集中，載入方式一致
- 預設走通用邏輯，規則只提供提示，不直接接管主流程
- 規則可被測試、序列化、審查、比對
- 單一站點的例外行為必須能被文件化與淘汰

### 4.2 目標分層

```text
Runtime Engine
├── 通用判斷函式
├── 通用 selector / overlay / navigation heuristics
├── 規則載入器
├── profileMatcher()
└── 規則套用器

Rules Layer
├── player-platform-registry.json
├── site-behaviors.json
├── ad-network-signatures.json
└── compatibility-profiles.json
```

### 4.3 建議新增規則檔

建議新增：

- `extension/rules/site-behaviors.json`

建議 schema：

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "generic-player-host-family",
      "match": {
        "hostSuffixes": ["example.com"],
        "iframeSrcIncludes": ["embed", "player"]
      },
      "capabilities": {
        "compatibilityMode": false,
        "forcePopupDirect": false,
        "popupMode": "standard",
        "antiAntiBlockProfile": "core-video-player",
        "safeMediaHosts": ["player.example.com"]
      },
      "selectors": {
        "cosmeticHide": [".ad-overlay"],
        "overlayIgnore": [".site-main", ".sidebar"],
        "playerHints": [".video-player", "#mediaplayer"]
      },
      "navigation": {
        "redirectTrapHosts": ["redirect.example.com"],
        "redirectRecoveryEnabled": false
      },
      "antiAntiBlock": {
        "fakeGlobals": [],
        "suppressErrors": true,
        "errorSelectors": []
      },
      "dnrAllowRules": ["player.example.com"],
      "notes": "Human-readable rationale"
    }
  ]
}
```

---

## 五、模組重構策略

### 5.1 `anti-antiblock.js`

現況：

- 含有站族專用 anti-adblock bypass
- 包含特定播放器 iframe 相關假 API

改法：

- 保留通用 anti-adblock engine
- 站族特定注入行為移到 `site-behaviors.json` 的 profile
- 若純 JSON 無法完整表達行為，允許以 `antiAntiBlock.profile` 半資料化對應到受控的 JS strategy
- JS 只負責：
  - 識別命中的 profile
  - 套用 profile 宣告的 fake globals / selector cleanup / iframe sibling policy

### 5.2 `cosmetic-filter.js`

現況：

- `PLAYER_SITE_RULES` 用站名切分 selector

改法：

- 移除站名分流 object
- 改由規則檔提供 `selectors.cosmeticHide`
- `cosmetic-filter.js` 只組合：
  - 通用廣告 selector
  - 命中 profile 的 selector
  - 使用者自訂 hidden elements

### 5.3 `overlay-remover.js`

現況：

- `SAFE_MEDIA_HOST_PATTERNS` 等 host 資訊內嵌

改法：

- safe media host 轉入 profile capability
- overlay ignore / preserve navigation container 規則統一由 profile 或通用 heuristic 處理

### 5.4 `inject-blocker.js`

現況：

- 含 redirect trap host、safe iframe host、特定 player iframe selector

改法：

- `redirectTrapHosts` 移入規則檔
- safe media iframe hints 移入 profile
- `MALICIOUS_DOMAINS` 由模糊 `includes()` 改為精確 host / suffix / token 規則
- 保留通用 clickjacking / dangerous navigation engine
- 移除對站名的直接判斷，改成 `matchedProfile.capabilities`

### 5.5 `player-detector.js`

現況：

- `PLAYER_PATTERNS` 混合平台支援、站點支援、特定 host hints

改法：

- 拆成兩層：
  - `player-platform-registry.json`：平台特徵
  - `site-behaviors.json`：站點補充 hints
- `player-detector.js` 保留通用 detector 與 scoring
- 對特殊容器、特殊 iframe 來源的補充判斷改讀規則

### 5.6 `player-enhancer.js`

現況：

- `COMPATIBILITY_MODE_SITES`
- direct popup 相關 host 特化

改法：

- compatibility mode 由 profile capability 提供
- popup direct / source preference 改由 capability flag 決定
- overlay cleanup 只依據：
  - 是否為可見媒體目標
  - 是否具備有效來源
  - profile 是否允許 aggressive cleanup

### 5.7 `background.js`

現況：

- 部分 popup routing、host allowlist、site registry 在 background 維護

改法：

- 背景程序僅保留：
  - 全域設定
  - 規則讀取與快取
  - popup routing engine
- host allow / compatibility / direct popup iframe routing 來源改為規則快取

---

## 六、分階段實作計畫

### Phase 0：建立邊界

目標：

- 在開發規範中明確寫入「不要新增特定網站永久邏輯」
- 這一輪先凍結新增 runtime site-specific branch

工作：

1. 新增本計畫文件
2. 在相關 handoff / progress doc 記錄此方向
3. 之後若需站點 workaround，先以一次性 debug 或測試腳本處理，不落永久碼

### Phase 1：完成清單盤點

目標：

- 建立 site-specific inventory

工作：

1. 掃描 runtime 內所有 domain / host / site-name 字串
2. 分類為：
   - threat intelligence
   - platform support
   - compatibility exception
   - workaround logic
3. 輸出 inventory 文件或 JSON

交付物：

- `docs/SITE_SPECIFIC_LOGIC_INVENTORY.zh-TW.md` 或同等資料表

### Phase 2：定義規則 schema

目標：

- 建立可被多模組共用的規則格式與匹配基礎設施

工作：

1. 建立 `extension/rules/site-behaviors.json`
2. 決定欄位：
   - `match`
   - `capabilities`
   - `selectors`
   - `navigation`
   - `antiAntiBlock`
   - `dnrAllowRules`
   - `notes`
3. 建立規則載入與驗證器
4. 建立共用 `profileMatcher(hostname, url, frameContext)`，供 content / background 共用

交付物：

- `extension/rules/site-behaviors.json`
- `scripts/validate-site-behaviors.js`
- `extension/shared/profile-matcher.js` 或同等模組

### Phase 3：先遷移低風險模組

目標：

- 先處理最容易資料化的模組

優先順序：

1. `cosmetic-filter.js`
2. `overlay-remover.js`
3. `anti-popup.js`

原因：

- 這三支多為 selector / host hints / capability flag
- 改成文本規則的風險低於 click interception 與 anti-antiblock
- `COMPATIBILITY_MODE_SITES` 至少出現在 3 個檔案，`anti-popup.js` 的遷移不可單獨落地，必須與其餘兩處同步收斂

### Phase 4：遷移高風險核心模組

目標：

- 將站族 workaround 從核心 runtime 中拔掉

優先順序：

1. `player-enhancer.js`
2. `player-detector.js`
3. `inject-blocker.js`
4. `background.js`

原因：

- `player-enhancer.js` 相對聚焦於 capability 套用，先遷移較容易驗證
- `inject-blocker.js` 牽涉 redirect trap 與安全攔截，必須等 schema 與 matcher 穩定後再動
- `background.js` 需與 popupMode / direct popup routing 一起收斂

### Phase 5：獨立處理 `anti-antiblock.js`

目標：

- 針對最複雜的單站 workaround 做獨立抽象化，不和其他模組混在同一波遷移

工作：

1. 盤點 `handleJavboysPlayer()` 依賴的假 API、錯誤壓制與 DOM 清理行為
2. 判斷哪些可資料化、哪些應保留為 profile strategy
3. 建立 `antiAntiBlock.profile` 對應層
4. 補充專用 core / live-browser 測試

### Phase 6：清理與收斂

目標：

- 移除已被規則化的舊常數與硬編碼分支

工作：

1. 移除重複 host list
2. 合併重複 ad network signature
3. 刪除不再需要的站點專用函式
4. 補文件與 migration note

---

## 七、測試與驗收

### 7.1 必要測試層

1. Core tests
2. 規則檔 schema 驗證
3. 站點命中測試
4. live-browser smoke tests
5. `profileMatcher` 自動化測試
6. DNR allow 規則一致性檢查

### 7.2 這次重構新增的最低測試要求

- hidden / blank iframe 不可被誤判為有效播放器
- aggressive overlay cleanup 不可對無效 player 執行
- sidebar / widget / content card navigation 不可被設成 `pointer-events: none`
- 規則檔缺漏時必須安全降級
- `profileMatcher()` 對 hostname / iframe / frame context 的映射結果必須可預測
- `dnrAllowRules` 與 `filter-rules.json` 白名單必須自動比對

### 7.3 驗收標準

| 項目 | 驗收條件 |
|------|----------|
| Runtime code | 不再新增 `if host includes site-name` 類型 workaround |
| 規則來源 | 站點特化資訊集中於規則檔 |
| 回歸控制 | 既有核心測試與新測試皆通過 |
| 功能穩定 | 常見播放器站點不因重構而失效 |
| 文件完整 | inventory、schema、migration note 齊備 |
| 重複度收斂 | 同一組站點知識不再同時散落於多個 JS 常數與 DNR 規則 |
| 匹配可驗證 | `profileMatcher()` 有獨立測試覆蓋 |
| 規則一致性 | `dnrAllowRules` 與 `filter-rules.json` 檢查納入 `npm run check` |

---

## 八、風險與應對

| 風險 | 說明 | 應對方式 |
|------|------|----------|
| 規則 schema 過早定死 | 之後擴充欄位困難 | 先做最小可用 schema |
| 遷移過程雙軌邏輯重疊 | 新舊規則同時生效 | 每一 phase 完成後刪舊常數 |
| 過度抽象導致難讀 | 規則太泛，不易理解 | 每個 profile 保留 `notes` 與用途說明 |
| 測試覆蓋不足 | 某站點功能靜默壞掉 | 補 core + live-browser smoke |
| 把威脅名單誤當站點特化刪掉 | 失去防護能力 | 明確區分資料層與 workaround 層 |
| `antiAntiBlock` 無法純資料化 | 偽造播放器 API 屬行為邏輯 | 允許 profile 對應到受控 strategy，不強求 100% JSON |
| DNR 白名單失同步 | runtime 規則與 `filter-rules.json` 分離後可能互相漂移 | 驗證器內建一致性檢查 |
| `profileMatcher()` 效能退化 | 若每次都逐條掃 profile，載入成本會上升 | 以 hostname map / suffix index 預編譯規則 |
| `COMPATIBILITY_MODE_SITES` 分批遷移 | 三處常數只改一處會出現半套行為 | 綁定同一 PR 一次完成 |

---

## 九、建議實作順序

最建議的落地順序如下：

1. 先做 inventory
2. 再做 `site-behaviors.json` schema + validator + `profileMatcher()`
3. 先遷移 `cosmetic-filter.js` / `overlay-remover.js` / `anti-popup.js`
4. 再遷移 `player-enhancer.js` / `player-detector.js`
5. 然後處理 `inject-blocker.js` / `background.js`
6. 最後獨立處理 `anti-antiblock.js`

理由：

- 低風險模組先規則化，可先驗證 schema 是否合理
- `profileMatcher()` 若先統一，後續每個模組都不必重寫命中邏輯
- `anti-antiblock.js` 複雜度遠高於其他模組，獨立成最後一波比較安全

---

## 十、近期可直接開工的工作單

### Task A：產出 inventory

- 掃描所有 runtime 檔案中的站點字串
- 建立「來源檔案 / 類型 / 是否可資料化 / 風險」表

### Task B：建立規則檔與驗證器

- 新增 `extension/rules/site-behaviors.json`
- 新增 `scripts/validate-site-behaviors.js`
- 建立 `profileMatcher()` 共用模組
- 納入 `dnrAllowRules` 一致性檢查

### Task C：遷移 `cosmetic-filter.js`

- 移除 `PLAYER_SITE_RULES`
- 改為讀取 `site-behaviors.json`

### Task D：遷移 `overlay-remover.js`

- 移除 `SAFE_MEDIA_HOST_PATTERNS`
- 改為讀取 profile capability

### Task E：同步遷移 compatibility / popup routing

- 將 `COMPATIBILITY_MODE_SITES` 三處常數在同一 PR 內收斂
- 將 `popupMode` / `DIRECT_POPUP_IFRAME_HOSTS` 移入規則檔

### Task F：獨立拆解 `anti-antiblock.js`

- 盤點 `handleJavboysPlayer()` 的 fake globals / suppressions / DOM cleanup
- 設計 `antiAntiBlock.profile` 與必要的 strategy mapping

---

## 十一、決策摘要

- `vidboys` 問題已用通用邏輯修正，不新增該站永久碼
- 接下來的方向不是繼續堆特例，而是做規則化重構
- 站點知識可以存在，但應該存在於規則檔，不應散落在 runtime script
- 高風險核心模組的重構必須晚於 schema、validator 與 `profileMatcher()`
- `anti-antiblock.js` 應視為獨立子任務，不與其他模組混遷
- 本計畫與 `docs/ARCHITECTURE_COMPARISON_AND_RECOMMENDATIONS.md` 的方向一致：匹配精確化、規則集中化、逐步降低 polling / 模糊判斷

---

## 十二、下一步

完成本計畫文件後，下一個最合理的動作是：

1. 先做 inventory 文件
2. 接著建立 `site-behaviors.json` 初版 schema + validator + `profileMatcher()`
3. 先把 `COMPATIBILITY_MODE_SITES` 三處整合同步規則化
4. 再開始第一個低風險模組遷移

---

## 附錄 A：架構審查意見（2026-03-24）

> 以下為針對本計畫文件的技術審查，基於實際程式碼比對驗證。

### A.1 整體評價

本文件**方向正確、結構清晰**，是一份高品質的重構計畫。
「通用引擎 + 文本規則」的方向完全符合業界最佳實踐（uBlock Origin 的 SNFE + filter list 就是這個模式）。
以下補充經程式碼驗證後發現的**遺漏、風險與可強化之處**。

---

### A.2 程式碼驗證結果：文件描述 vs 實際狀況

#### ✅ 文件描述正確的部分

| 文件描述 | 程式碼實證 |
|---------|-----------|
| `PLAYER_SITE_RULES` 依站名分流 | ✅ cosmetic-filter.js L11-42，8 個站點硬編碼 |
| `SAFE_MEDIA_HOST_PATTERNS` 內嵌 | ✅ overlay-remover.js L119-125，5 個域名 |
| `COMPATIBILITY_MODE_SITES` 不集中 | ✅ **出現 3 次**：inject-blocker.js、player-enhancer.js、anti-popup.js |
| `handleJavboysPlayer()` 站族耦合 | ✅ anti-antiblock.js L426-650+，~225 行專用邏輯 |
| 多檔各自維護 popup/iframe 允許清單 | ✅ boyfriendtv.com **出現 5 次**跨 5 個檔案 |

#### ⚠️ 文件遺漏或低估的部分

| 遺漏項目 | 實際狀況 | 影響 |
|---------|---------|------|
| **`L3_REDIRECT_TRAP_DOMAINS`** | inject-blocker.js L30-41，10 個域名，含 javboys 專用恢復邏輯 (L617-625) | 這不是純資料，含 `if isDomainOrSubdomain(refHost, 'javboys.com')` 的行為分支，屬 workaround-logic |
| **`DIRECT_POPUP_IFRAME_HOSTS`** | background.js L32-34，boyfriendtv.com 的彈出視窗路由 | 文件第 3.3 節的表格未列出此常數 |
| **`MALICIOUS_DOMAINS` 的模糊比對** | inject-blocker.js L62-76 使用 `urlStr.includes(domain)`，`'casino'` 等通用詞會誤殺 | 本計畫未觸及此問題，但屬同類「站點知識散落」議題 |
| **filter-rules.json 白名單規則** | rules 1095-1099 專門 allow javboys 播放器域名 | 與 `SAFE_MEDIA_HOST_PATTERNS` 是同一份知識的另一個副本 |
| **handleJavboysPlayer() 的規模** | ~225 行，偽造 CVP/ExoLoader/VAST/VPAID 四套 API | 這是整個專案中最大的單站 workaround，遷移複雜度被低估 |

---

### A.3 重複度實測（交叉比對）

以下是經程式碼驗證的**跨檔案重複熱點**：

| 域名/常數 | 出現檔案數 | 嚴重度 |
|-----------|-----------|--------|
| `boyfriendtv.com` | **5 個檔案** (inject-blocker, player-enhancer, anti-popup, background, site-registry) | 🔴 最高 |
| `javboys` 生態系 | **6 個檔案** (cosmetic-filter, overlay-remover, player-detector, anti-antiblock, site-registry, filter-rules) | 🔴 最高 |
| `COMPATIBILITY_MODE_SITES` | **3 個檔案** (inject-blocker, player-enhancer, anti-popup) | 🟡 中等 |
| `MALICIOUS_DOMAINS` vs filter-rules.json | **2 處** (JS 陣列 + DNR 規則) | 🟡 中等 |
| `SAFE_MEDIA_HOST_PATTERNS` vs site-registry | **2 處** (overlay-remover + JSON) | 🟡 中等 |

**建議**：Phase 1 inventory 應以此表為基線，逐檔掃描補充。

---

### A.4 Schema 建議補強

文件 §4.3 的 schema 設計方向正確，但建議補充以下欄位：

```jsonc
{
  "version": 1,
  "profiles": [
    {
      "id": "javboys-family",
      "match": {
        "hostSuffixes": ["javboys.com", "javboys.online"],
        "iframeSrcIncludes": ["myvidplay", "luluvdoo", "streamtape"]
      },
      "capabilities": {
        "compatibilityMode": false,
        "forcePopupDirect": false,
        "popupMode": "standard",           // ← 新增：standard | remote-control | iframe-direct
        "antiAntiBlockProfile": "javboys-cvp",
        "safeMediaHosts": ["player.javboys.online", "luluvdoo.com", "myvidplay.com"]
      },
      "selectors": {
        "cosmeticHide": [".ad-zone", ".banner-zone", "[class*=\"sponsor\"]"],
        "overlayIgnore": [],
        "playerHints": []
      },
      "navigation": {
        "redirectTrapHosts": ["sfnu-protect.sbs", "xsotrk.com"],
        "redirectRecoveryEnabled": true     // ← 新增：是否啟用 redirect trap 恢復
      },
      "antiAntiBlock": {                    // ← 新增：整個區塊
        "fakeGlobals": ["CVP", "ExoLoader", "adblock_detected"],
        "suppressErrors": true,
        "errorSelectors": [".player-error", ".adblock-message"]
      },
      "dnrAllowRules": [                    // ← 新增：對應 filter-rules.json 白名單
        "player.javboys.online",
        "myvidplay.com"
      ],
      "notes": "Javboys 播放器家族，使用 CVP + ExoLoader，需偽造廣告 API"
    }
  ]
}
```

**新增欄位理由**：

| 新欄位 | 理由 |
|--------|------|
| `popupMode` | boyfriendtv 需要 `remote-control`，其他站用 `standard`，目前散落在 background.js |
| `redirectRecoveryEnabled` | inject-blocker.js L617-625 有 javboys 專用恢復邏輯，需可宣告化 |
| `antiAntiBlock` 區塊 | `handleJavboysPlayer()` 225 行的核心是偽造 API，需結構化描述 |
| `dnrAllowRules` | filter-rules.json 1095-1099 的白名單與 `safeMediaHosts` 是同一份知識 |

---

### A.5 遷移順序建議修正

文件 §九的順序大致合理，但建議調整：

**原定順序**：
1. cosmetic-filter → 2. overlay-remover → 3. player-detector → 4. player-enhancer → 5. inject-blocker → 6. anti-antiblock

**建議調整**：

```
Phase 1: Inventory + Schema
  └── 輸出 site-specific inventory（建議同時產出本審查的重複度表格）

Phase 2: 集中化基礎設施
  ├── 建立 site-behaviors.json + 載入器 + 驗證器
  └── 建立共用的 profileMatcher(hostname) 函式（所有模組共用）

Phase 3: 低風險模組遷移（順序不變）
  ├── cosmetic-filter.js   ← PLAYER_SITE_RULES 移入 selectors.cosmeticHide
  ├── overlay-remover.js   ← SAFE_MEDIA_HOST_PATTERNS 移入 capabilities.safeMediaHosts
  └── anti-popup.js        ← COMPATIBILITY_MODE_SITES 移入 capabilities.compatibilityMode

Phase 4: 高風險模組遷移（建議先 enhancer 後 blocker）
  ├── player-enhancer.js   ← compatibilityMode + popupMode（影響範圍較小）
  ├── player-detector.js   ← PLAYER_PATTERNS 拆為 platform-registry + site hints
  ├── inject-blocker.js    ← redirectTrapHosts + MALICIOUS_DOMAINS（核心防護，最後動）
  └── background.js        ← DIRECT_POPUP_IFRAME_HOSTS 移入 capabilities

Phase 5: anti-antiblock.js（獨立處理）
  └── handleJavboysPlayer() 225 行，需設計 antiAntiBlock schema 後才能遷移
      這是整個計畫中最複雜的單點，建議作為獨立子任務
```

**調整理由**：
- `anti-antiblock.js` 的 `handleJavboysPlayer()` 不僅是資料遷移，還涉及**行為邏輯的抽象化**（偽造 4 套 API），複雜度遠超其他模組
- `inject-blocker.js` 包含核心安全防護（redirect trap），應在 schema 充分驗證後才動
- 新增 Phase 2 建立共用 `profileMatcher` 可避免各模組各自實作匹配邏輯

---

### A.6 風險補充

文件 §八 列出 5 項風險，建議補充：

| 風險 | 說明 | 應對方式 |
|------|------|----------|
| **handleJavboysPlayer() 無法純資料化** | 偽造 CVP/ExoLoader API 是行為邏輯，不是 selector/host 資料，schema 可能無法完整描述 | 允許 `antiAntiBlock.profile` 指向 JS 函式名稱（半資料化），不強求 100% JSON |
| **filter-rules.json 白名單規則失同步** | 遷移 `safeMediaHosts` 後，DNR 白名單規則 (1095-1099) 若未連動更新會造成不一致 | 在驗證器中檢查 `dnrAllowRules` 與 filter-rules.json 的一致性 |
| **profileMatcher 效能** | 每次頁面載入需匹配 hostname 對所有 profiles | 使用 Map 或 hostname trie 預索引，避免逐條掃描 |
| **遷移期間 COMPATIBILITY_MODE_SITES 三處不同步** | Phase 3 若只改其中一個檔案，另外兩處仍是舊邏輯 | 三個檔案必須同一 PR 內一次遷移完成 |

---

### A.7 驗收標準補充

文件 §7.3 的驗收條件建議新增：

| 項目 | 驗收條件 |
|------|----------|
| 重複度歸零 | 每個域名/常數只在 site-behaviors.json 出現一次 |
| profileMatcher 單元測試 | hostname → profile 的映射有自動化測試覆蓋 |
| Schema 驗證 CI | `npm run check` 包含 `validate-site-behaviors.js` |
| 白名單一致性 | `dnrAllowRules` 與 filter-rules.json 自動比對 |

---

### A.8 總結

| 面向 | 評價 |
|------|------|
| 方向與動機 | ⭐⭐⭐⭐⭐ 完全正確，vidboys 案例說明清楚 |
| 問題盤點 | ⭐⭐⭐⭐ 核心問題都有覆蓋，但遺漏 5 項（見 A.2） |
| Schema 設計 | ⭐⭐⭐⭐ 基礎合理，建議補 4 個欄位（見 A.4） |
| 分階段計畫 | ⭐⭐⭐⭐ 順序合理，建議獨立處理 anti-antiblock（見 A.5） |
| 風險評估 | ⭐⭐⭐ 需補充 4 項風險（見 A.6） |
| 驗收標準 | ⭐⭐⭐ 需補充可量化的重複度與 CI 檢查（見 A.7） |
| **總評** | **⭐⭐⭐⭐ (8/10)** — 高品質計畫，補充上述意見後可直接執行 |
