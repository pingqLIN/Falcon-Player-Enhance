# Rebuild 檔案地圖

這份地圖定義目前 Falcon-Player-Enhance 重新整理、重新建置、審查與維護時需要優先保留的檔案。完整歷史計畫與舊審查資料已保留在 ignored 本機備份 `local/rebuild-backup-2026-06-05/development-history/`；公開文件只保留精簡 archive 索引。

## 主要執行面

| 路徑 | 保留理由 |
|---|---|
| `extension/manifest.json` | Chrome MV3 manifest、權限、web-accessible resources 與入口設定 |
| `extension/background.js` | Service worker：狀態、DNR、視窗、AI policy、候選規則治理、telemetry 與救援紀錄 |
| `extension/content/` | 播放器偵測、overlay 清理、popup/redirect 防護、AI runtime、狀態橋接與播放控制 |
| `extension/popup/` | 工具列 popup 與 pinned side-panel shell |
| `extension/popup-player/` | 無干擾播放器視窗 |
| `extension/dashboard/` | 設定、站點清單、AI provider profile、候選審查、封鎖元素與救援管理 |
| `extension/rules/` | DNR filter rules、ad-list、site registry 與 no-op redirect helper |
| `extension/security/` | URL 安全輔助邏輯 |
| `extension/shared/` | Protection status contract 共用 helper |
| `extension/_locales/` | 英文與繁體中文 UI 字串 |
| `extension/assets/` | icon 與入門導覽圖 |

## 測試與驗證面

| 路徑 | 保留理由 |
|---|---|
| `tests/ai/` | AI provider、候選審查、promotion、Chrome Built-in 與 privacy regression |
| `tests/ai-eval/` | 離線與 provider-backed 評估 harness |
| `tests/anti-popup/` | Popup 與 redirect guard regression |
| `tests/content-scripts/` | 動態 content-script 註冊與排除合約 |
| `tests/inject-blocker/` | MAIN-world injection 與 overlay guard regression |
| `tests/interaction-safety/` | 誤判救援、clickability、picker 與 public-surface safety |
| `tests/live-browser/` | 選用 live browser workflow 與 judge tooling |
| `tests/player-detection/` | 播放器偵測與 iframe source privacy |
| `tests/popup-smoke/` | Popup 與 popup-player smoke tests |
| `tests/release-gate/` | Phase/release acceptance gate wrapper |
| `tests/rules/`, `tests/site-registry/`, `tests/site-state/`, `tests/protection-status/` | Rules、state、registry 與 status contract tests |

## 文件面

| 路徑 | 保留理由 |
|---|---|
| `README.md` / `README.zh-TW.md` | 公開產品總覽與主要入口 |
| `INSTALL.md` | 安裝、provider 設定、疑難排解與 privacy notes |
| `docs/FEATURE_GUIDE.md` / `docs/FEATURE_GUIDE.zh-TW.md` | 使用者功能地圖與完整圖文導覽 |
| `docs/ADVANCED_AI_POLICY_GUIDE.md` / `docs/ADVANCED_AI_POLICY_GUIDE.zh-TW.md` | Provider profiles、Policy Gate、candidate review 與 privacy boundary 教學 |
| `POLICY-GATE.md` | 維護者用 Policy Gate compact contract |
| `ARCHITECTURE.md` | 目前架構流程圖 |
| `DESIGN.md` | 目前 UI/design baseline |
| `SELF-LEARNING.md` | Live-browser validation loop 操作者指南 |
| `docs/archive/` | 公開 archive 索引，說明完整歷史資料已轉入本機備份 |

## 本機-only 面

被 `.gitignore` 排除的本機檔案不屬於 rebuild 主面。PSD 草稿、packed extension、browser profiles、generated reports、temporary output 與完整 development-history snapshots 可集中到 `local/rebuild-backup-2026-06-05/` 作為可復原備份。
