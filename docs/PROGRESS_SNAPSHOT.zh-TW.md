# Falcon-Player-Enhance 進度快照

> 更新日期：2026-03-27  
> 分支：`chore/commit-cleanup-20260327`  
> 用途：提供目前專案完成度、已落地項目、進行中工作與未完成風險的快速盤點。  
> 範圍：主程序、品質基礎設施、popup-player 支線、規則化重構、文件與審查輸出。

---

## 一、目前整體判斷

目前專案已從「大量混雜變更的開發中 worktree」整理成「可審查、可持續推進」的狀態，但尚未達到整體完成。

可用一句話總結：

> 核心功能與工程整潔度已經到可審查、可繼續推進的階段；真正還沒完成的是通用化收尾、安全儲存硬化，以及文件國際化。

目前分支狀態：

- 已整理成多個可審查 commit
- 已推送至 GitHub
- worktree 幾乎乾淨，僅剩未追蹤的 `TODOS.md`

---

## 二、完成度評估

### 2.1 依工作線粗估

| 工作線 | 完成度 | 說明 |
|--------|--------|------|
| 主程序核心功能 | 80-85% | Dashboard、Block Element、獨立 protection toggles、穩定性修正已落地 |
| 品質基礎設施 | 85-90% | `npm run check`、validator、core smoke tests、CI workflow 已建立 |
| popup-player / 無干擾播放器 | 70-80% | 已拆成獨立 commit，但仍需要更多真實情境驗證 |
| site-specific 通用化重構 | 40-50% | 已完成 Phase 1 骨架，但高耦合 runtime 邏輯仍未收斂 |
| secret storage 硬化 | 10-20% | 文件策略與儲存模型已就位，DPAPI / native host 尚未實作 |
| 多語說明文件擴充 | 0-10% | 尚未正式開始 |

### 2.2 當前結論

- 專案不是半成品，也不是可直接宣稱全部完成
- 已完成的是核心功能與工程整理
- 未完成的是中長期收斂工作與安全硬化

---

## 三、這輪已落地的主要成果

### 3.1 主程序穩定性與設定流程

已完成：

- 修正 extension 無法載入的 locale placeholder 問題
- 修正右鍵 action context menu duplicate id 問題
- 修正 `anti-antiblock.js` 在 MAIN world 直接碰 `chrome.runtime` / `chrome.storage` 的崩潰風險
- Dashboard provider key 改為每 provider 分開保存
- API key draft 會保留，不會因切換 provider / mode / endpoint 被立即清空
- autosave 已補上，且 secret 與一般設定已分流

### 3.2 `Block Element` 已實用化

已完成：

- 使用者確認後立即隱藏目標元素
- 保存多組 selector candidates
- `background + cosmetic-filter` 的持久化資料流已接通
- 重整頁面後仍可持續套用規則

### 3.3 保護功能已可獨立控制

Overview 中原本同步切換的功能，現在已改為各自獨立開關：

- `Auto overlay removal`
- `Popup blocking`
- `Fake video removal`
- `Playback progress sync`

### 3.4 popup-player / 無干擾播放器支線已拆包

已完成：

- `direct-popup-overlay.js`
- `popup-player.html`
- `popup-player.js`

這條線已整理成獨立 commit，避免與主程序和文件變更混在一起。

### 3.5 品質檢查與 CI 已接通

已建立：

- `scripts/check-manifest.js`
- `scripts/check-js-syntax.js`
- `scripts/validate-site-behaviors.js`
- `scripts/validate-live-browser-targets.js`
- `tests/core/run-core-tests.js`
- `.github/workflows/ci.yml`

`package.json` 已接上：

- `check:manifest`
- `check:syntax`
- `check:css`
- `check:site-behaviors`
- `check:targets`
- `test:core`
- `check`

### 3.6 規則化重構已從文件進入實作

已落地：

- `extension/rules/site-behaviors.json`
- `extension/content/site-profile.js`
- `scripts/validate-site-behaviors.js`

已接上第一批 runtime 消費者：

- `background.js`
- `anti-popup.js`
- `overlay-remover.js`

這代表目前不是只有文件規劃，而是：

- 規則檔
- schema validator
- content-side matcher / helper
- 第一批讀規則的 runtime 模組

---

## 四、這輪 commit 清理成果

目前分支已整理出以下 commit：

1. `aa6cafe` `chore: ignore local review artifacts`
2. `6d32542` `test: add quality gates and site behavior core checks`
3. `5e64a73` `feat: improve dashboard persistence and control toggles`
4. `a70e19d` `feat: refine distraction-free popup player controls`
5. `3cd7c4f` `docs: add review snapshots and migration planning`
6. `a8dfca6` `chore: refresh live-browser assets and branding prompts`
7. `b93c5b6` `chore: stop tracking generated ruleset metadata`

目前分支狀態比先前明顯改善：

- 不再是大型混雜 worktree
- 主要工作線已拆成可審查單位
- generated metadata 已停止追蹤

---

## 五、已完成的驗證

已跑過並通過：

- `npm run check`
- `npm run check:targets`
- `node --check extension/content/direct-popup-overlay.js`
- `node --check extension/popup-player/popup-player.js`
- `python -m py_compile tests/live-browser/verify_dashboard_provider_autosave.py`

代表目前至少已覆蓋：

- manifest 結構
- JS 語法
- CSS safety lint
- site behavior schema
- live-browser target schema
- core smoke tests
- Dashboard autosave 驗證腳本語法

---

## 六、仍在進行中的項目

### 6.1 site-specific runtime 重構尚未收尾

目前仍殘留高耦合 runtime 邏輯的重點模組：

- `extension/content/inject-blocker.js`
- `extension/content/anti-antiblock.js`
- `extension/content/player-enhancer.js`

已知仍在 code 中的高風險 / 高耦合項目包括：

- `L3_REDIRECT_TRAP_DOMAINS`
- `COMPATIBILITY_MODE_SITES`
- `MALICIOUS_DOMAINS`
- `handleJavboysPlayer()`

其中：

- `anti-antiblock.js` 的 `handleJavboysPlayer()` 仍是最大單點
- `MALICIOUS_DOMAINS` 仍採 `String.includes()` 路徑，仍有誤傷風險
- `inject-blocker.js` 與 `player-enhancer.js` 還沒有完全改成純規則驅動

### 6.2 popup-player 仍需更多真實場景驗證

目前播放器支線已完成拆包與語法檢查，但還不能代表：

- 所有 iframe / remote-control 模式皆已充分驗證
- 所有站點上的可用性都已穩定

比較準確的狀態是：

- 實作層已明顯前進
- 但仍需要真實頁面回測與場景回歸

---

## 七、尚未完成的項目

### 7.1 Windows 原生 secret storage

尚未完成：

- Windows `DPAPI`
- native host secret storage

目前只是先完成：

- 文件策略
- provider 分離儲存模型
- Dashboard 的 draft / autosave / 提交流程

### 7.2 多語說明文件擴充

尚未正式開始：

- `zh-TW`
- `zh-CN`
- `ja`
- `de`
- `fr`
- `es`
- `ko`
- `it`

以及 README 最前方語言入口整合。

### 7.3 backlog / 任務池整理

目前仍有未追蹤 backlog 檔案：

- `TODOS.md`

這份文件要不要納入 repo，仍待決定。

---

## 八、目前最值得優先處理的下一步

建議優先順序：

1. 繼續收斂 `inject-blocker.js` / `anti-antiblock.js` / `player-enhancer.js` 的 site-specific 永久邏輯
2. 決定 `TODOS.md` 是否納入版本控制
3. 補強 popup-player 的真實場景驗證
4. 再決定是否開始做 Windows `DPAPI` / native host
5. 最後進行正式說明文件的多語擴充

---

## 九、補充參考文件

若要快速掌握目前主程序與重構方向，可先看：

- `docs/EXTERNAL_REVIEW_STATUS_NON_PLAYER_2026-03-24.zh-TW.md`
- `docs/SITE_RULE_GENERALIZATION_PLAN.zh-TW.md`
- `docs/SITE_SPECIFIC_LOGIC_INVENTORY.zh-TW.md`
- `docs/SESSION_RECOVERY_POPUP_PLAYER_AUDIT_2026-03-24.md`

