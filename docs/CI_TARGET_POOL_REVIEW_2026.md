# 🔍 Falcon-Player-Enhance — CI 基礎設施 & Target Pool 聚焦審查報告

> **審查日期**: 2026-03-23  
> **審查範疇**: CI 管線、live-browser target pool、與上次戰略審查的對照  
> **前次審查**: 總分 6.2/10（CI 為 0 分）

---

## 一、四個具體問題的逐一回答

### Q1: 這個 CI 入口是否足夠作為後續擴充的基礎？

**判定：⚠️ 堪用但有結構性缺陷需先修**

**優點：**
- 觸發策略正確（`push: main/master` + 所有 PR），覆蓋了最核心的保護場景
- `npm run check` 作為單一入口、背後串接三個獨立驗證器的設計，擴充性好——未來加 `check:manifest`、`check:urls` 只需在 `package.json` 加一行
- 三個驗證器全部使用 Node.js 內建模組（`fs`、`path`、`vm`），零外部依賴，啟動快、不易因套件版本而壞

**必須修正的問題：**

| # | 問題 | 嚴重度 | 說明 |
|---|------|--------|------|
| 1 | **缺少 `package-lock.json`** | 🔴 Critical | CI 設定了 `cache: 'npm'`，但專案根目錄不存在 `package-lock.json`。`actions/setup-node@v4` 會嘗試用 lockfile 計算快取鍵，找不到時會輸出警告甚至導致快取失效。應執行 `npm install --package-lock-only` 產生並 commit lockfile |
| 2 | **缺少 `npm ci` 步驟** | 🟡 High | 目前三個腳本都只用內建模組，碰巧不需要 `node_modules`。但這讓管線極度脆弱：任何人在未來腳本中 `require('glob')` 就會靜默失敗。應在 `Run project checks` 前加 `npm ci` |
| 3 | **缺少 `fail-fast` 和超時設定** | 🟡 Medium | 建議加 `timeout-minutes: 5` 防止掛起 |

**建議的修正版 `ci.yml`：**
```yaml
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci          # ← 補上
      - run: npm run check
```

**結論：** 骨架方向正確，是合格的擴充基礎，但 lockfile 缺失和 `npm ci` 遺漏應在合併下一個 PR 前修正。

---

### Q2: Live-browser target pool 的分層方式是否合理？

**判定：✅ 分層邏輯清楚，有兩個需要收斂的邊界問題**

```
                    ┌─────────────────────────────┐
                    │   targets.example.json       │  ← 格式參考（不參與測試）
                    └─────────────────────────────┘

    AI 策展管線                                書籤匯入管線
┌─────────────────┐                    ┌─────────────────────┐
│ curated (5筆)   │                    │ bookmarks.json (20筆)│
│ 完整 source +   │                    │ 原始匯入             │
│ reproSteps      │                    └──────────┬──────────┘
└────────┬────────┘                               │
         │                             ┌──────────┴──────────┐
         │                             │ filtered (10筆)     │ ← 定位模糊
         │                             │ + playbackLikelihood │
         │                             └──────────┬──────────┘
         │                                        │
┌────────┴────────┐                    ┌──────────┴──────────┐
│ smoke (3筆)     │                    │ smoke (3筆)         │
│ 快跑子集        │                    │ 快跑子集             │
└─────────────────┘                    └─────────────────────┘
```

**合理的部分：**
- 兩條平行管線（`external-ai` vs `from-bookmarks`）反映不同資料來源，分開管理正確
- curated → smoke 的遞減設計讓 CI 快跑有小集合、深度除錯有完整集合
- `example.json` 獨立存在作為格式參考，validator 正確豁免

**需要收斂的問題：**

| # | 問題 | 建議 |
|---|------|------|
| 1 | `filtered` 在層級中的定位模糊 | 如果是管線中間產物，應改名為 `_pipeline-*` 或移到子目錄；如果是正式集合，應在命名中體現策略 |
| 2 | 命名慣例不統一 | AI 管線有 curated/smoke 兩層，書籤管線有原始/filtered/smoke 三層。建議統一或文件化差異 |

---

### Q3: curated / smoke / example 三類樣本的邊界是否清楚？

**判定：⚠️ 大方向清楚，但有兩個邊界模糊點和一個文件化缺口**

| 類別 | 語意 | 必備欄位 | Validator 行為 |
|------|------|----------|---------------|
| **example** | 格式骨架，教人怎麼寫 | name, url, tags, requiresManualReview | 豁免 generatedFrom 和 source |
| **curated** | 完整版測試資料 | 上述 + generatedFrom, source, 建議有 reproSteps | 全部驗證 |
| **smoke** | 快跑子集 | 上述但 source 選填 | source 選填 |

**邊界模糊點：**

1. **smoke 的挑選標準未文件化** — `external-ai.smoke` 有 `selectionPolicy` 欄位，但 `from-bookmarks.smoke` 完全沒有。建議統一要求或在 README 說明。
2. **`reproSteps` 的定位不清** — curated 有 reproSteps 但 validator 不驗證。若此欄位是 curated 的區分特徵，應加入驗證。
3. **文件化缺口** — 三個類別的語意定義散落在 README 各處，缺少集中的「Target Tiers」規範表。

---

### Q4: 還有哪些核心模組應該盡快補上測試或驗證？

**判定：⚠️ 有多個高價值模組缺乏 CI 保護**

| 優先級 | 模組/檢查 | 理由 | 建議方式 |
|--------|-----------|------|----------|
| **P0** | `extension/manifest.json` 驗證 | manifest 語法錯誤 = 擴充完全無法載入，目前 CI 不檢查 | 加 `check:manifest` 驗證 JSON 語法 + MV3 必要欄位 |
| **P0** | Python 單元測試 | `test_browser_judge.py`, `test_import_bookmarks.py` 已存在但 CI 不跑，形同虛設 | CI 加 Python job |
| **P1** | 核心 JS 功能測試 | 21 個 JS 檔只有語法檢查，無行為驗證 | 用 jsdom 或 Playwright 為 player-detector、overlay-remover、anti-popup 加測試 |
| **P1** | CSS linter 覆蓋範圍 | 只掃 `extension/content/`，遺漏 dashboard.css 和 popup.css | 擴大到整個 `extension/` |
| **P2** | URL 格式驗證 | validator 只檢查非空字串，`"not-a-url"` 也會通過 | 加 `new URL()` 驗證 |
| **P2** | Target URL 去重 | **README 聲稱 validator「rejects duplicate URLs」但實際程式碼完全沒有去重邏輯** | 實作跨檔案 URL 去重 |

---

## 二、CI 管線深度評估

### 安全性 ✅

| 面向 | 狀態 |
|------|------|
| Action 版本釘選 | ✅ `@v4` major tag，符合 GitHub 建議 |
| Secrets 暴露風險 | ✅ 純靜態分析，不需要任何 secret |
| 供應鏈攻擊面 | ✅ 零外部 npm 依賴 |
| 第三方 action | ✅ 只用 GitHub 官方 actions |

### 完整性 ⚠️

| 面向 | 狀態 |
|------|------|
| JS 語法檢查 | ✅ 使用 `vm.Script` 原生 parser |
| CSS 安全掃描 | ⚠️ 只掃 `extension/content/`，遺漏其他 CSS |
| Target 驗證 | ⚠️ 結構驗證充分，但缺 URL 格式和去重 |
| Python 測試 | ❌ 2 個測試檔存在但不在 CI 中 |
| Manifest 驗證 | ❌ 最關鍵的檔案不在 CI 保護範圍 |

### CSS Linter 技術問題

**Bug — 多行註解處理不完整：**
```css
/*
[class*="something-dangerous"]   ← 會被誤判為危險選擇器
*/
```

目前的註解跳過邏輯只檢查行首，建議加入區塊註解狀態追蹤：
```javascript
let inBlockComment = false;
lines.forEach((line, idx) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('/*')) inBlockComment = true;
  if (inBlockComment) {
    if (trimmed.includes('*/')) inBlockComment = false;
    return;
  }
  if (trimmed.startsWith('//')) return;
  // ...原有邏輯
});
```

**另一問題 — `readdirSync` 不遞迴：** 未來子目錄中的 CSS 不會被掃描，建議復用 `check-js-syntax.js` 的 `walk()` 函式。

---

## 三、Target Pool 深度評估

### 隱私風險 🔴

三個檔案的 `generatedFrom` 包含本機絕對路徑：

| 檔案 | 洩漏內容 |
|------|---------|
| `targets.external-ai.single-page.smoke.json` | `Q:\\Projects\\...\\curated.json` |
| `targets.from-bookmarks.smoke.json` | `Q:\\Projects\\...\\bookmarks_2026_3_13.html` |
| `targets.from-bookmarks.filtered.json` | `Q:\\Projects\\...\\bookmarks_2026_3_13.html` |

**洩漏：** 磁碟代號、完整路徑、書籤檔案名稱和日期

**修正建議：**
1. 立即將絕對路徑改為相對路徑
2. 在 validator 加入路徑格式防護（偵測 `[A-Z]:\\` 和 `/Users/`）
3. 在 `import_bookmarks.py` 中自動轉為相對路徑

---

## 四、與上次戰略審查的對照

| 上次建議 | 狀態 | 本次評估 |
|----------|------|----------|
| **P0: 建立基礎 CI/CD** | ✅ 已落實 | 管線已建立，方向正確，有 lockfile 技術債 |
| **P0: 核心功能回歸測試** | ⚠️ 部分 | Target pool 建立了 live-browser 基礎，但核心模組仍無單元測試 |
| **P1: CSS 安全護欄** | ✅ 已落實 | 白名單機制合理，有兩個技術 bug 待修 |
| **Manifest 驗證** | ❌ 未處理 | 擴充功能生死線仍不在 CI 保護範圍 |
| **自動化發布流程** | ❌ 未處理 | 預期中——CI 穩定後再做 |

**新發現問題：**
1. **README 與實作不一致** — README 聲稱 validator「rejects duplicate URLs」但程式碼無此邏輯
2. **Python 測試孤島** — 存在但不在 CI 中，比「沒有測試」更危險（給人錯誤的安全感）
3. **`_tmp` 檔案** — 7 個暫存檔建議定期清理

---

## 五、下一步具體建議

### 🔴 P0 — 本週內完成

1. **修正 lockfile 問題** — `npm install --package-lock-only` 並 commit，CI 加 `npm ci`
2. **清除絕對路徑** — 所有 `generatedFrom` 改為相對路徑，validator 加路徑格式防護
3. **實作 URL 去重** — 兌現 README 承諾的跨檔案去重邏輯

### 🟡 P1 — 兩週內完成

4. **Python 測試加入 CI** — 新增 Python job 跑 `pytest tests/live-browser/test_*.py`
5. **加入 `check:manifest`** — 驗證 JSON 語法 + MV3 必要欄位
6. **修正 CSS linter** — 多行註解狀態追蹤 + 擴大掃描範圍到整個 `extension/`
7. **文件化 Target Tiers** — README 加集中的分層規範表

### 🟢 P2 — 一個月內完成

8. **核心模組最小測試** — player-detector、overlay-remover、anti-popup
9. **URL 格式驗證** — validator 加 `new URL()` 檢查
10. **釐清 `filtered` 定位** — 管線中間產物改名 `_pipeline-*` 或正式化命名

---

## 總結評分

| 面向 | 分數 | 趨勢 |
|------|------|------|
| CI 管線完整度 | 5.5/10 | 📈 從 0 到有 |
| CI 管線可靠性 | 4/10 | ⚠️ lockfile 缺失是硬傷 |
| Target Pool 設計 | 7/10 | ✅ 分層邏輯清楚 |
| Target Pool 隱私 | 3/10 | 🔴 絕對路徑洩漏 |
| 文件一致性 | 5/10 | ⚠️ README 與實作有落差 |
| 測試覆蓋率 | 4/10 | ⚠️ Python 測試孤島 |
| **整體（CI + Targets 聚焦）** | **5.8/10** | **📈 大幅進步，P0 修完可到 7.5** |

---

*🔍 Falcon-Player-Enhance CI & Target Pool 聚焦審查 — 2026-03-23*
