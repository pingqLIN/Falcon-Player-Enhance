# Falcon-Player-Enhance — 第三輪審查報告

> 審查日期：2026-03-23  
> 審查者：GitHub Copilot CLI (Claude Opus 4.6)  
> 版本：v4.4.0  
> 上一輪評分：5.8/10（CI & Target Pool 專項）  
> **本輪評分：7.2/10**

---

## 0. 摘要

本輪是對前兩輪審查建議的追蹤驗證。團隊在兩輪之間完成了大量基礎設施補強：

- **P0 全數處理**：`package-lock.json`、`npm ci`、`generatedFrom` 路徑洩漏、Python 測試納入 CI
- **新增 manifest 驗證器**（第二輪 P1 建議）
- **CSS linter 重構**：遞迴掃描、block comment 追蹤
- **Target validator 強化**：URL 格式驗證、絕對路徑攔截

從「CI 從零開始」到「可持續運作的基礎自動化」，這是一個實質且可驗證的進步。

---

## 1. CI 骨架是否足夠穩定？

### 評級：✅ 穩定，可作為擴充基礎

**已達到的水準：**

| 項目 | 狀態 |
|------|------|
| 可重現建置（`npm ci`） | ✅ |
| 超時保護（`timeout-minutes: 5`） | ✅ |
| 快取加速（`cache: 'npm'`） | ✅ |
| 雙語言平行 Job（Node + Python） | ✅ |
| 觸發條件（push + PR） | ✅ |
| 統一入口（`npm run check`） | ✅ |
| 檢查順序確定性（manifest → syntax → css → targets） | ✅ |

**仍可改進（P2，不影響穩定性）：**

1. **缺少 Node 版本矩陣**  
   目前鎖定 `node-version: '20'`，建議保留單版本但加上 `node-version-file: '.nvmrc'` 或 `engines` 欄位，確保本地 / CI 版本一致。

2. **缺少 `concurrency` 設定**  
   同一 branch 多次 push 會排隊而非取消舊的。建議加入：
   ```yaml
   concurrency:
     group: ci-${{ github.ref }}
     cancel-in-progress: true
   ```

3. **Python job 缺少 `pip install` 步驟**  
   目前 `test_browser_judge.py` 和 `test_import_bookmarks.py` 只用 stdlib，但若未來加入 `playwright` 或 `requests` 等依賴，CI 會直接壞掉。建議加入條件式安裝：
   ```yaml
   - name: Install Python dependencies
     run: |
       if [ -f tests/live-browser/requirements.txt ]; then
         pip install -r tests/live-browser/requirements.txt
       fi
   ```

4. **沒有 CI 狀態徽章**  
   `README.md` 未顯示 CI 狀態，外部審查者無法一眼看出 pipeline 是否健康。

**結論：目前骨架 ≈ 7.5/10。作為後續擴充基礎完全夠用。上述 P2 都不影響日常運作。**

---

## 2. Manifest 驗證是否還有缺漏？

### 評級：✅ 覆蓋面優秀，有一個 P1 Bug 待修

> **注意**：`check-manifest.js` 比初始探索階段觀察到的版本更完整。團隊持續迭代中。

**`check-manifest.js` 目前驗證的項目（共 10 類）：**

| 驗證項 | 狀態 |
|--------|------|
| `manifest_version === 3` | ✅ |
| `version` 非空 + Chrome 格式（`/^\d+(\.\d+){0,3}$/`） | ✅ |
| `background.service_worker` 定義且檔案存在 | ✅ |
| `default_locale` 有對應 `messages.json` | ✅ |
| `icons` + `action.default_icon` 檔案存在 | ✅ |
| `permissions` 白名單（10 個允許 + 3 個必要） | ✅ |
| `declarative_net_request.rule_resources` 檔案存在 + JSON 合法 + 規則結構 | ✅ |
| `web_accessible_resources` 檔案存在性 | ✅ |
| `__MSG_xxx__` placeholder 解析 | ⚠️ 有 Bug |

**🐛 Bug（P1）：placeholder 驗證靜默跳過 `name` 和 `description`**

第 161 行：
```javascript
const placeholderFields = ['name', 'description', manifest.action?.default_title];
```

傳入的是字面字串 `'name'` 和 `'description'`，**而非** `manifest.name`（`"__MSG_extName__"`）和 `manifest.description`（`"__MSG_extDescription__"`）。

結果：
- `'name'.match(/^__MSG_(.+)__$/)` → `null` → `return`（跳過）
- `'description'.match(/^__MSG_(.+)__$/)` → `null` → `return`（跳過）
- 只有 `manifest.action?.default_title`（`"__MSG_actionTitle__"`）被正確驗證

**修正建議**：
```javascript
const placeholderFields = [
  { label: 'name', value: manifest.name },
  { label: 'description', value: manifest.description },
  { label: 'action.default_title', value: manifest.action?.default_title },
];
placeholderFields.forEach(({ label, value }) => {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string`);
    return;
  }
  const match = value.match(/^__MSG_(.+)__$/);
  if (!match) return;
  // ... 現有的 messages.json 查詢邏輯
});
```

**其他缺漏（P2-P3）：**

1. **`options_ui.page` 檔案存在性**（P3）— `dashboard/dashboard.html` 未驗證
2. **`side_panel.default_path` 檔案存在性**（P3）— 需 strip query string 後驗證
3. **`package.json` ↔ `manifest.json` 版本同步**（P2）— 目前都是 `4.4.0`，但無自動保證

**正面評價**：permissions 白名單 + DNR 規則結構驗證 + web_accessible_resources 驗證都已到位，這三個在第二輪都是 P1/P2 建議，現已全部實作且品質好。

---

## 3. CSS Safety Lint 策略是否合理？

### 評級：✅ 合理，策略方向正確

**目前策略：**
- 掃描 `extension/` 下所有 CSS（遞迴）
- 偵測 6 種危險的全域 attribute selector（`[class*=`, `[id*=`, `^=`, `$=`）
- 23 個白名單例外（已確認安全或僅注入播放器站點）
- Block comment 感知（`/* ... */` 內的規則不報警）
- 有警告即 exit 1（零容忍策略）

**正面評價：**

1. **白名單策略精準**：23 個例外覆蓋了已知的廣告 SDK class、自身元素標記、以及 Shadow DOM 標記。命名清晰，每個例外都有中文註解說明用途。

2. **遞迴掃描**：不再只限 `content/`，避免其他子目錄的 CSS 逃過檢查。

3. **零容忍策略適合這個專案**：因為 content script 注入至 `<all_urls>`，任何全域 selector 都有影響非目標站點的風險。

**可改進項目（P2-P3）：**

1. **mid-line block comment 處理不完整**  
   第 83 行 `if (trimmed.startsWith('/*'))` 只處理行首 `/*`。如果一行是 `color: red; /* [class*="foo"] */`，後面的註解內容仍會被掃描。不過考慮到實際 CSS 寫法，這種情況極少，屬於 P3。

2. **不偵測 `*` 萬用選擇器**  
   例如 `* { margin: 0 }` 不會被偵測。對於注入至第三方站點的 CSS，bare `*` selector 同樣危險。建議加入 `/^\*\s*\{/` 偵測。

3. **不偵測 `!important` 濫用**  
   `!important` 在注入式 CSS 中是覆蓋衝突的常用手段，但過度使用會影響宿主頁面的 CSS 優先級。可考慮加入頻率統計（非硬擋，而是超過閾值時發出 advisory）。

4. **白名單沒有版本控制語義**  
   23 個例外都是扁平列表。如果未來需要移除某個已棄用的例外，沒有「這個例外從何時開始、由誰加入、對應哪個 content script」的追溯。建議加入結構化註解。

**結論：策略方向完全正確。作為第一版 safety lint，覆蓋了最主要的風險面。P2 改進可以在後續迭代中逐步加入。**

---

## 4. Target Pool Tier 邊界是否清楚？

### 評級：⚠️ 大致清楚，但 `filtered` 定位模糊

**目前的 Tier 結構：**

```
targets.example.json                          ← 格式範本（不含 generatedFrom）
targets.external-ai.single-page.curated.json  ← 外部 AI 篩選的完整迴歸樣本
targets.external-ai.single-page.smoke.json    ← 從 curated 縮減的快速驗證子集
targets.from-bookmarks.json                   ← 書籤匯入的完整資料
targets.from-bookmarks.filtered.json          ← 加入 playbackLikelihood 評分的子集
targets.from-bookmarks.smoke.json             ← 從 bookmarks 縮減的快速驗證子集
```

**Tier 邊界分析：**

| 邊界 | 清晰度 | 說明 |
|------|--------|------|
| example vs 其他 | ✅ 清楚 | 格式範本，無 `generatedFrom`，`requiresManualReview: false` |
| curated vs smoke (external-ai) | ✅ 清楚 | smoke 有 `selectionPolicy` 說明篩選依據，URL 是 curated 的子集 |
| curated 的入選標準 | ⚠️ 隱含 | `reproSteps` + 詳細 `source.notes`，但沒有文件定義「什麼條件才能成為 curated」 |
| from-bookmarks vs filtered | ❌ 不清楚 | `filtered` 加了 `playbackLikelihood` 但沒有 `selectionPolicy`。`generatedFrom` 和原檔相同。邊界只能從內容推斷。 |
| from-bookmarks.smoke 的篩選依據 | ⚠️ 隱含 | 沒有 `selectionPolicy` 欄位說明為何選這 3 個 |

**具體問題：**

1. **`targets.from-bookmarks.filtered.json` 的角色模糊**  
   - 它有 `playbackLikelihood` 評分（69-101），但 validator 不驗證這個欄位
   - 它和 `targets.from-bookmarks.json` 使用相同的 `generatedFrom`（`../bookmarks_2026_3_13.html`）
   - 沒有 `selectionPolicy` 說明篩選邏輯
   - **建議**：加入 `selectionPolicy` 或 `filterCriteria` 欄位，明確說明「playbackLikelihood >= N 才納入」

2. **缺少正式的 Tier 規格文件**  
   目前 tier 邊界散布在各檔案的 `selectionPolicy` 和 README 說明中。建議在 `tests/live-browser/README.md` 加入一張 Tier 定義表：

   ```markdown
   ## Target Tiers

   | Tier     | 用途              | 必要欄位                    | 來源                |
   |----------|-------------------|-----------------------------|---------------------|
   | example  | 格式範本           | name, url, tags             | 手動建立             |
   | curated  | 完整迴歸樣本       | + source, reproSteps        | 外部 AI / 人工審查    |
   | filtered | 評分過濾中間產物   | + playbackLikelihood        | import_bookmarks.py  |
   | smoke    | 快速驗證子集       | 同 example + selectionPolicy | 從 curated/filtered 縮減 |
   ```

3. **Validator 的 tier 感知不完整**  
   - `source` 對 smoke 和 example 是可選的 ✅
   - 但 `reproSteps` 對 curated 沒有強制要求 ❌
   - `selectionPolicy` 對 smoke 沒有強制要求 ❌
   - `playbackLikelihood` 對 filtered 沒有驗證 ❌

**結論：兩條 pipeline（external-ai vs from-bookmarks）的大方向清楚，curated → smoke 的縮減邏輯也合理。但 `filtered` 的定位需要明確，tier-specific 的欄位驗證需要加強。**

---

## 5. 下一步最值得優先補的測試保護

### 按優先級排列：

#### P0 — 立即可做，效益最高

1. **修正 `check-manifest.js` 第 161 行的 placeholder bug**  
   `name` / `description` 的 `__MSG_xxx__` 驗證被靜默跳過。修正只需改兩個字面字串為 `manifest.name` / `manifest.description`。

2. **`background.js` 的 smoke 級單元測試**
   4430 行、323 個函數、零測試。不需要一次全覆蓋，但建議先為以下核心函數寫 3-5 個測試：
   - `normalizeAction()`（AI 動作正規化）
   - URL 匹配邏輯（`SITE_REGISTRY` 相關）
   - Policy Gate 決策邏輯（T0 規則判定）

#### P1 — 本輪或下輪優先

4. **Content script 的隔離測試**  
   14 個 content script 目前零測試。建議先為風險最高的兩個寫測試：
   - `inject-blocker.js`（1315 行，核心阻擋邏輯）
   - `player-detector.js`（播放器偵測，所有後續邏輯的入口）

5. **Target pool 跨檔重複 URL 偵測**  
   同一 URL 出現在 curated 和 smoke 是正常的（smoke 是子集），但出現在不同 pipeline 的 curated 中可能是問題。  
   建議在 validator 加入跨檔 URL 報告（warning 而非 error）。

6. **CSS selector scope 驗證**  
   確認所有注入式 CSS 是否都被限制在目標站點的特定 DOM 範圍內，而非全域套用。

#### P2 — 中期補強

7. **`permissions` 白名單快照**  
   鎖定目前的 9 個權限 + `<all_urls>`，任何變動都在 CI 中報警。

8. **manifest `version` 與 `package.json` `version` 一致性檢查**  
   目前兩者都是 `4.4.0`，但沒有自動化保證。

9. **`_locales` 完整性驗證**  
   確認所有 `__MSG_xxx__` placeholder 都能在每個支援的 locale 中解析。

---

## 6. 進步追蹤：第二輪 → 第三輪

| 第二輪發現 | 嚴重度 | 第三輪狀態 |
|-----------|--------|------------|
| 缺少 `package-lock.json` | P0 | ✅ 已修正 |
| CI 沒有 `npm ci` | P0 | ✅ 已修正 |
| `generatedFrom` 洩漏 Windows 絕對路徑 | P0 | ✅ 已修正（改為相對路徑 + validator 攔截） |
| Python 測試未納入 CI | P0 | ✅ 已修正（獨立 job） |
| README 宣稱「rejects duplicate URLs」但未實作 | P0 | ✅ 已修正（README 已更新描述） |
| 缺少 manifest 驗證 | P1 | ✅ 已新增 `check-manifest.js`（覆蓋 MV3 + permissions + DNR + WAR） |
| CSS linter 只掃 `content/` 子目錄 | P1 | ✅ 已改為遞迴掃描 `extension/` |
| CSS linter 不處理 block comment | P1 | ✅ 已加入 `inBlockComment` 追蹤 |
| 缺少 `timeout-minutes` | P1 | ✅ 已加入（5 分鐘） |
| URL 格式未驗證 | P1 | ✅ 已加入 `new URL()` 驗證 |
| 缺少 URL 跨檔重複偵測 | P2 | ⏳ 未處理（README 已不再宣稱此功能） |
| 缺少 Target Tier 規格表 | P2 | ⏳ 未處理 |
| `selectionPolicy` smoke 未強制 | P2 | ⏳ 未處理（external-ai smoke 有，from-bookmarks smoke 無） |
| `reproSteps` curated 未強制 | P2 | ⏳ 未處理 |
| `filtered` 檔定位不明 | P2 | ⏳ 未處理 |

**已處理率：10/15（67%），所有 P0 和大部分 P1 已解決。**

---

## 7. 整體評分

| 維度 | 第一輪 | 第二輪 | 第三輪 | 趨勢 |
|------|--------|--------|--------|------|
| CI/CD 基礎設施 | 1/10 | 4/10 | 7.5/10 | 📈 |
| 程式碼品質保障 | 3/10 | 4/10 | 5/10 | 📈 |
| 安全驗證 | 5/10 | 5/10 | 6/10 | 📈 |
| 測試覆蓋率 | 2/10 | 3/10 | 3.5/10 | → |
| 文件與規格清晰度 | 6/10 | 5/10 | 6.5/10 | 📈 |
| 可維護性 | 4/10 | 4/10 | 5/10 | 📈 |
| **綜合** | **6.2/10** | **5.8/10** | **7.2/10** | **📈** |

**評分說明：**

- CI 從 1 分跳到 7.5 是本輪最大進步
- 測試覆蓋率進步有限（Python 測試納入 CI 是好事，但核心模組仍零測試）
- 第二輪 5.8 低於第一輪 6.2 是因為第二輪是 CI 專項，用更嚴格的標準評分
- 第三輪 7.2 反映了基礎設施的實質改善

---

## 8. 建議的下一輪開發優先順序

```
1. [P0] check-manifest.js 第 161 行 → 修正 placeholder bug（字面字串 → manifest 值）
2. [P0] background.js → 寫 3-5 個核心函數的單元測試
3. [P1] inject-blocker.js → 至少 2 個關鍵路徑測試
4. [P1] Target Tier 規格表 → 寫入 README
5. [P1] filtered 檔定位 → 加入 selectionPolicy 或 filterCriteria
6. [P2] package.json ↔ manifest.json 版本同步檢查
7. [P2] CI concurrency 設定
8. [P2] options_ui.page + side_panel.default_path 檔案存在性驗證
```

---

## 9. 風險提醒（從第一輪延續）

以下風險在前兩輪已識別，本輪未觀察到改善動作：

1. **`background.js` 4430 行巨石**：仍是最大的可維護性風險。任何重構都應從這裡開始。
2. **`tests/bookmarks_2026_3_13.html` 個人資料**：仍在 git 歷史中。需要 `git filter-repo` 清理。
3. **`SITE_REGISTRY` 硬編碼成人網域**：CWS 上架風險。建議改為使用者自行匯入。
4. **Bus factor = 1**：專案只有單一開發者。CI 的建立正在降低這個風險，但仍需要更完善的文件。

---

*本報告為 Falcon-Player-Enhance 第三輪外部審查的完整記錄。*
