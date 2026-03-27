# 站點特化永久邏輯 Inventory

> **版本：** v1.1  
> **日期：** 2026-03-24  
> **目的：** 盤點目前專案內與特定網站、站族、平台、廣告網路直接綁定的永久邏輯，作為後續「通用引擎 + 文本規則」重構的拆帳依據。

---

## 一、盤點範圍

本次盤點以 **runtime code 為主**，涵蓋：

- `extension/background.js`
- `extension/content/*.js`
- `extension/rules/site-registry.json`

並補充少量 **支援工具 / UI 表現層**：

- `extension/popup/popup.js`
- `scripts/lint-css-safety.js`

不列入本次主盤點：

- 一般文件
- 測試資料中的假站名
- AI provider API endpoint
- 純示例字串 `example.com`

---

## 二、總結

### 2.1 目前判斷

目前專案中確實存在不少「針對特定網站或站族的永久邏輯」，但性質不完全相同，需分開處理：

1. **資料層 / 平台支援**
   - 可保留，但應集中管理
2. **廣告 / 威脅情資**
   - 可保留，但應統一來源
3. **相容模式與 workaround**
   - 最需要重構，優先搬到規則檔
4. **UI 顯示層的站名映射**
   - 風險低，可最後整理

### 2.2 重要觀察

- 目前 **沒有發現 `vidboys` 的永久硬編碼**
- 這次 `vidboys` 問題已用通用邏輯修正，不需新增該站特例
- 主要技術債集中在：
  - `anti-antiblock.js`
  - `inject-blocker.js`
  - `overlay-remover.js`
  - `cosmetic-filter.js`
  - `player-detector.js`
  - `player-enhancer.js`
- `boyfriendtv.com` 類型的 capability / compatibility 邏輯至少散落 **5 個檔案**
- `javboys` 生態系相關知識至少散落 **6 個檔案**

### 2.3 跨檔重複度熱點

| 熱點 | 目前分布 | 說明 |
|------|----------|------|
| `boyfriendtv.com` | `background.js`、`anti-popup.js`、`inject-blocker.js`、`player-detector.js`、`player-enhancer.js` | popup routing、compatibility mode、inline parser 分散 |
| `javboys` / `myvidplay` / `luluvdoo` / `upn.one` | `site-registry.json`、`anti-antiblock.js`、`inject-blocker.js`、`overlay-remover.js`、`player-detector.js`、`player-enhancer.js` | safe media hosts、iframe hints、anti-adblock workaround 重複 |
| ad network signatures | `background.js`、`inject-blocker.js`、`overlay-remover.js`、`anti-antiblock.js`、`cosmetic-filter.js` | 情資來源分散 |
| DNR allowlist vs safe media hosts | `filter-rules.json`、`overlay-remover.js`、未來 schema | 同一份站族知識已有多份副本 |

---

## 三、分類規則

| 分類 | 說明 | 建議處置 |
|------|------|----------|
| A. 平台支援 Registry | 為了辨識播放器或網站平台所需的資料 | 保留，但集中到規則檔 |
| B. 威脅 / 廣告情資 | 廣告網路、惡意導流域名、DNR seed | 保留，但統一來源 |
| C. 相容模式 | 某些站需要停用侵入式功能或改走特殊流程 | 搬到規則檔 capability |
| D. 站族 workaround | 直接寫在 JS 裡的特別處理分支 | 優先移除或資料化 |
| E. UI / Tooling 映射 | 圖示、lint 例外、輔助腳本 | 可後移，非優先 |

---

## 四、Inventory 明細

## 4.1 `extension/rules/site-registry.json`

**分類：** A. 平台支援 Registry  
**性質：** 可保留  
**現況：**

- 內含多組內建 enhanced domains，例如：
  - `javboys.com`
  - `javboys.online`
  - `luluvdoo.com`
  - `myvidplay.com`
  - `upn.one`
  - `missav.com`
  - `missav.ws`
  - `supjav.com`
  - `jable.tv`
  - `avgle.com`
  - `netflav.com`
  - `pornhub.com`
  - `xvideos.com`
  - `boyfriendtv.com`
  - `x.com`
  - `twitter.com`
  - `istreameast.is`
  - `gogoanime.by`
  - `gogoanime.gg`
  - `tw.news.yahoo.com`
  - `news.yahoo.com`
  - `poapan.xyz`

**問題：**

- 它目前只是 enhanced sites 的來源之一，不是完整的站點能力模型
- 與其他檔案中的 host list 並未完全整合

**重構建議：**

- 保留為資料來源
- 長期應合併或關聯到 `site-behaviors.json`

---

## 4.2 `extension/rules/filter-rules.json`

### 條目 A：DNR allowlist 規則（1095-1099）

**分類：** B / C 混合  
**內容：**

- `||player.javboys.online^`
- `||player.javboys.com^`
- `||myvidplay.com^`
- `||javboys.online^`
- `initiatorDomains: [player.javboys.online, player.javboys.com, myvidplay.com]`

**問題：**

- 這其實是 `safeMediaHosts` / `dnrAllowRules` 的第三份副本
- 目前不在主 inventory 與主計畫 schema 的主文中

**建議：**

- 在未來 schema 中新增：
  - `capabilities.safeMediaHosts`
  - `dnrAllowRules`
- 並建立自動一致性檢查，避免 `filter-rules.json` 與 profile 脫鉤

---

## 4.3 `extension/background.js`

### 條目 A：`DEFAULT_WHITELIST`

**分類：** A. 平台支援 / 全域預設  
**內容：**

- `youtube.com`
- `youtu.be`
- `netflix.com`
- `disneyplus.com`
- `hulu.com`
- `primevideo.com`
- `max.com`
- `hbomax.com`
- `tv.apple.com`
- `peacocktv.com`
- `paramountplus.com`

**評估：**

- 合理存在
- 不屬於 workaround
- 未來可改由統一預設設定檔提供

### 條目 B：`DIRECT_POPUP_IFRAME_HOSTS`

**分類：** C. 相容模式  
**內容：**

- `boyfriendtv.com`

**評估：**

- 屬於明確的 host-specific capability
- 不應長期留在 runtime 常數

**建議：**

- 搬到 `site-behaviors.json > capabilities.forcePopupDirect`

### 條目 C：DNR / 高風險情資 seed

**分類：** B. 威脅 / 廣告情資  
**內容：**

- `exoclick-adb.com`
- `exoclick.com`
- `magsrv.com`
- `popads.net`
- `exoclick`
- `trafficjunky`
- `juicyads`
- `popads`
- `magsrv`
- `clickadu`
- `adsterra`

**評估：**

- 合理存在
- 應與其他模組內的 ad network signatures 收斂到單一資料源

---

## 4.4 `extension/content/anti-popup.js`

### 條目 A：`COMPATIBILITY_MODE_SITES`

**分類：** C. 相容模式  
**內容：**

- `boyfriendtv.com`

**評估：**

- 與 `background.js`、`player-enhancer.js` 的相容模式概念重複

**建議：**

- 改由 profile capability 控制是否停用侵入式 overlay cleanup

### 條目 B：`protectPlayerIframes()` 的 host hint

**分類：** A / C 混合  
**內容：**

- `src.includes('player')`
- `src.includes('myvidplay')`
- `src.includes('embed')`
- `src.includes('video')`

**評估：**

- 這裡混合了通用 hint 與特定站族字串
- `myvidplay` 不應直接硬編碼在 runtime

**建議：**

- 通用字串保留
- `myvidplay` 轉移到規則檔中的 iframe source hints

---

## 4.5 `extension/content/cosmetic-filter.js`

### 條目 A：`PLAYER_SITE_RULES`

**分類：** D. 站點特化 selector workaround  
**內容：**

- `javboys`
- `missav`
- `supjav`
- `jable`
- `avgle`
- `netflav`
- `pornhub`
- `xvideos`

**問題：**

- 直接以站名分流 selector
- 與 `overlay-remover` / `anti-antiblock` 的知識沒有共用資料層

**建議：**

- 優先搬移到 `site-behaviors.json > selectors.cosmeticHide`

### 條目 B：`PLAYER_AD_SELECTORS`

**分類：** B. 廣告 / 威脅情資  
**內容：**

- `[class*="exoclick"]`
- `[class*="trafficjunky"]`
- `[class*="juicyads"]`
- `iframe[src*="exoclick"]`
- `iframe[src*="trafficjunky"]`

**評估：**

- 合理，但應與其他 ad signature 一致化

---

## 4.6 `extension/content/overlay-remover.js`

### 條目 A：`AD_NETWORK_PATTERNS`

**分類：** B. 廣告 / 威脅情資  
**內容：**

- `exoclick`
- `juicyads`
- `trafficjunky`
- `trafficstars`
- `plugrush`
- `popads`
- `popcash`
- `propellerads`
- `adsterra`
- `clickadu`
- `revcontent`
- `outbrain`
- `taboola`
- `mgid`
- `adskeeper`
- `hilltopads`

**評估：**

- 應保留，但要與 `background.js`、`inject-blocker.js`、`anti-antiblock.js` 收斂

### 條目 B：`SAFE_MEDIA_HOST_PATTERNS`

**分類：** C. 相容 / 站族能力  
**內容：**

- `javboys.com`
- `javboys.online`
- `luluvdoo.com`
- `myvidplay.com`
- `upn.one`

**問題：**

- 這是典型的站族能力模型
- 不應散落為模組內常數

**建議：**

- 搬到 `site-behaviors.json > capabilities.safeMediaHosts`

---

## 4.7 `extension/content/inject-blocker.js`

### 條目 A：`MALICIOUS_DOMAINS` / 高風險 token

**分類：** B. 威脅 / 廣告情資  
**內容：**

- `exoclick-adb.com`
- `exoclick.com`
- `nn125.com`
- `exoclick`
- `trafficjunky`
- `juicyads`
- `popads`
- `magsrv`
- `propellerads`
- `popcash`
- `adcash`
- `hilltopads`
- `clickadu`

**評估：**

- 屬於可保留的情資層
- 應避免在多檔案重複維護
- 目前採 `String.includes()` 模糊比對，存在誤判與過度攔截風險

### 條目 B：`COMPATIBILITY_MODE_SITES`

**分類：** C. 相容模式  
**內容：**

- `boyfriendtv.com`

**建議：**

- 統一搬到 profile capability

### 條目 C：`L3_REDIRECT_TRAP_DOMAINS`

**分類：** D. 站族 / 惡意導流恢復 workaround  
**內容：**

- `sfnu-protect.sbs`
- `xsotrk.com`
- `exoclick-adb.com`
- `exoclick.com`
- `cooladblocker.app`
- `cooladblocker.com`
- `cyltor88mf.com`
- `drynvalo.info`
- `nn125.com`
- `playafterdark.com`
- 以及 `javboys.com` referrer 專用恢復邏輯

**問題：**

- 這不是一般廣告情資，而是 redirect recovery policy
- 與一般 `MALICIOUS_DOMAINS` 混在同一支 script 中，但語意不同

**建議：**

- 拆成 `navigation.redirectTrapHosts`
- 增加 `navigation.redirectRecoveryEnabled`

### 條目 D：safe iframe / media hints

**分類：** C / D  
**內容：**

- `iframe[src*="luluvdoo"]`
- `iframe[src*="myvidplay"]`
- `iframe[src*="upn.one"]`
- `iframe[src*="stream"]`

**問題：**

- 與站族邏輯耦合
- 同類知識與 `overlay-remover`、`anti-antiblock` 重複

**建議：**

- 轉為 profile selectors / capability

---

## 4.8 `extension/content/anti-antiblock.js`

### 條目 A：偽造 ad network globals

**分類：** B. 廣告 / 威脅情資  
**內容：**

- `window.juicyads`
- `window.trafficjunky`

**評估：**

- 仍屬 anti-adblock bypass 技術的一部分
- 但應考慮用 profile 驅動是否需要注入這些 globals

### 條目 B：`handleJavboysPlayer()`

**分類：** D. 站族 workaround  
**內容：**

- `host.includes('javboys')`
- `host.includes('myvidplay')`
- `host.includes('luluvdoo')`
- `host === 'player.javboys.online'`
- `host === 'player.javboys.com'`

**問題：**

- 目前最明顯的站點特化永久邏輯之一
- 直接在 runtime 寫死站族判斷、fake APIs、錯誤訊息移除策略
- 規模大，屬於行為抽象化問題，不只是資料搬移

**重構優先級：** 最高

**建議：**

- 拆為 profile：
  - fake globals
  - blocked text signatures
  - iframe selectors
  - overlay cleanup policy
- 建議獨立成單一子任務處理，不與一般 selector / host list 遷移混在同一階段

### 條目 C：站族專用 iframe selectors

**分類：** D. 站族 workaround  
**內容：**

- `iframe[src*="javboys"]`
- `iframe[src*="player.javboys"]`
- `iframe[src*="myvidplay"]`
- `iframe[src*="upn.one"]`
- `iframe[src*="luluvdoo"]`

**建議：**

- 搬到規則檔 selectors

### 條目 D：`adNetworks` 陣列

**分類：** B. 廣告 / 威脅情資  
**內容：**

- `exoclick`
- `juicyads`
- `trafficjunky`
- `adsterra`
- `popads`

**建議：**

- 收斂到單一 ad signature 資料源

---

## 4.9 `extension/content/player-detector.js`

### 條目 A：`PLAYER_PATTERNS`

**分類：** A. 平台支援 Registry  
**內容：**

- 主流平台：
  - `youtube`
  - `vimeo`
  - `dailymotion`
  - `twitch`
- 成人 / 播放器站族：
  - `javboys`
  - `missav`
  - `supjav`
  - `jable`
  - `avgle`
  - `netflav`
  - `pornhub`
  - `xvideos`
  - `boyfriendtv`
- 其他站型：
  - `dplayer`
  - `streameast`
  - `gogoanime`
  - `yahoo`
  - `bilibili`
  - `x`

**評估：**

- 這是可以存在的「平台知識」
- 但目前把平台支援、站點 hint、hostnames、iframe src 特徵全混在同一常數

**建議：**

- 拆為：
  - `player-platform-registry.json`
  - `site-behaviors.json`

### 條目 B：`parseBoyfriendTvInlinePlayerData()`

**分類：** D. 站點 workaround  
**內容：**

- 直接判斷 `hostname.includes('boyfriendtv.com')`
- 解析該站內嵌 script 結構

**評估：**

- 這是典型的站點結構耦合 workaround
- 若保留，也應明確標為 profile-driven parser

**建議：**

- 後續可改成：
  - profile 指定 parser type
  - parser registry 根據 profile 啟用

---

## 4.10 `extension/content/player-enhancer.js`

### 條目 A：`COMPATIBILITY_MODE_SITES`

**分類：** C. 相容模式  
**內容：**

- `boyfriendtv.com`

**問題：**

- 與 `background.js`、`anti-popup.js`、`inject-blocker.js` 的同類邏輯分散

### 條目 B：ad source signature

**分類：** B. 廣告 / 威脅情資  
**內容：**

- `exoclick`
- `juicyads`
- `trafficjunky`
- `doubleclick`
- `googlesyndication`
- `adservice`
- `adsystem`

**評估：**

- 合理，但應統一資料來源

### 條目 C：host-specific popup / source preference

**分類：** C. 相容模式  
**內容：**

- `hostname === 'boyfriendtv.com' || hostname.endsWith('.boyfriendtv.com')`

**問題：**

- 這其實是 capability，而不是演算法本身

**建議：**

- 搬到 profile capability

### 條目 D：iframe query hints

**分類：** C / D  
**內容：**

- `iframe[src*="player"]`
- `iframe[src*="embed"]`
- `iframe[src*="myvidplay"]`
- `iframe[src*="javboys.online"]`

**問題：**

- 通用 hint 與站族 hint 混在一起

**建議：**

- 通用 hint 保留
- 站族 hint 改成 profile selectors

---

## 4.11 `extension/popup/popup.js`

### 條目 A：`getPlatformIcon()`

**分類：** E. UI 映射  
**內容：**

- `javboys`
- `missav`
- `pornhub`
- `xvideos`
- `youtube`
- `vimeo`
- `twitch`
- `bilibili`

**評估：**

- 非高風險
- 只是 UI icon map

**建議：**

- 可保留到後期
- 若要收斂，可改為 platform metadata

---

## 4.12 `scripts/lint-css-safety.js`

### 條目 A：`ALLOWED_EXCEPTIONS`

**分類：** E. Tooling 例外  
**內容：**

- `cvpbox`
- `colorbox`
- `exoclick`
- `trafficjunky`
- `juicyads`

**評估：**

- 不屬 runtime
- 但反映目前 CSS 安全 lint 也認知到 javboys 相關例外

**建議：**

- 等 runtime 規則重構後，再回來同步整理 lint exceptions

---

## 五、優先級排序

## P0：最優先處理

1. `extension/content/anti-antiblock.js`
2. `extension/content/player-enhancer.js`
3. `extension/content/inject-blocker.js`
4. `extension/content/overlay-remover.js`
5. `extension/content/cosmetic-filter.js`

原因：

- 這些檔案直接影響頁面互動、點擊、播放器、覆蓋層移除
- 回歸風險最高
- `anti-antiblock.js` 的 `handleJavboysPlayer()` 建議視為獨立單點工程

## P1：第二階段處理

1. `extension/content/player-detector.js`
2. `extension/background.js`

原因：

- 主要是平台能力模型與 capability 來源整理

## P2：最後處理

1. `extension/popup/popup.js`
2. `scripts/lint-css-safety.js`

原因：

- 屬於 UI / tooling，不會直接造成 runtime 回歸

---

## 六、建議保留 vs 建議遷移

## 建議保留為資料層

- `site-registry.json` 內建 enhanced domains
- ad network / malicious redirect seed domains
- player platform registry

## 建議搬到規則檔

- compatibility mode host lists
- safe media host patterns
- redirect trap host lists
- site-family specific iframe selectors
- site-family cosmetic selectors
- anti-adblock fake globals / fake APIs 啟用條件

## 建議從 runtime 移除的型態

- `if (hostname.includes('site-name'))`
- `handleSpecificSiteFamily()`
- 模組內重複維護同一 host list

---

## 七、下一步建議

最合理的後續順序：

1. 以本 inventory 為基礎，建立 `site-behaviors.json` schema
2. 先建立共用 `profileMatcher()` 與 schema 驗證器
3. 先遷移 `cosmetic-filter.js` 與 `overlay-remover.js`
4. 再遷移 `player-enhancer.js` 與 `inject-blocker.js`
5. 最後拆 `anti-antiblock.js` 的 `handleJavboysPlayer()`

---

## 八、結論

目前專案中的站點特化永久邏輯並不少，但真正需要優先清理的，不是所有 domain name，而是：

- 分散在 runtime 中的相容模式
- 直接綁站族的 workaround 分支
- 多模組重複維護的 host / iframe / ad signature 知識

這份 inventory 可直接作為下一階段規則化重構的拆帳基礎。
