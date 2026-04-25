# Stage Report - Architecture Loop

> 日期：2026-04-25
> Loop：`project-development-loop` Pattern B / Architecture 5HR
> 階段：Batch A/C reviewed milestone

## 完成項目

- 建立架構開發計畫：`docs/ARCHITECTURE_DEVELOPMENT_PLAN_2026-04-25.zh-TW.md`
- 將 UX/UI findings 中與架構相關的項目合併為 contract/gate：
  - Protection Status 狀態模型
  - whitelist / enhanced site / strict mode 語義
  - AI Monitor governance
  - interaction safety 與可及性 contract
- 外部 reviewer 已審核計畫，准許 Batch A/C，並限制不得擴權、發布、外部 telemetry、AI 自動處置或廣域 blocking 擴張。
- 建立 release architecture gate checklist：`docs/RELEASE_ARCHITECTURE_GATE_CHECKLIST_2026-04-25.zh-TW.md`
- 擴充 managed external navigation regression，新增：
  - `document.location = externalUrl`
  - `window.top.document.location = externalUrl`
- 外部 reviewer 准許進入 Batch B 最小切片後，新增 Protection Status contract MVP：
  - `extension/shared/protection-status.js`
  - `docs/PROTECTION_STATUS_CONTRACT_2026-04-25.zh-TW.md`
  - `tests/protection-status/run_protection_status_contract_regression.js`

## 驗證

- `python tests\inject-blocker\run_managed_external_navigation_guard_regression.py --headless`
  - 結果：PASS
  - 備註：一般 sandbox 因 Playwright `WinError 5` 失敗，已用 escalation 跑過。
  - 後續補測：same-origin iframe 呼叫 `window.top.document.location` 可重現 enabled guard 未阻擋的缺口；目前列為 known gap evidence，不納入 pass 條件，避免在未完成更高風險審查前引入侵入式 monkey patch。
- `python tests\rules\run_filter_rules_contract.py`
  - 結果：PASS
- `python tests\site-registry\run_site_registry_contract_regression.py --headless`
  - 結果：PASS
  - 備註：一般 sandbox 因 Playwright `WinError 5` 失敗，已用 escalation 跑過。
- `node tests\protection-status\run_protection_status_contract_regression.js`
  - 結果：PASS
  - 覆蓋：disabled、whitelist-only、strict、AI advisory、standalone、standalone + AI advisory precedence
- `node --check extension\shared\protection-status.js`
  - 結果：PASS
- `node --check tests\protection-status\run_protection_status_contract_regression.js`
  - 結果：PASS

## 判斷

- 目前不需要擴張 MAIN world hook。既有 `location.href` setter wrapper 已可涵蓋 `document.location` 與 `top.document.location` 形式。
- 本輪最重要的收益是把原本只存在於研究結論的 popunder/old-window redirect 風險變成可重跑 regression。
- 架構 gate 已明確禁止在一般開發批次中默默做權限擴張、AI durable mutation、telemetry export 或 generic blocker 擴張。
- Protection Status 目前只落在 contract/純函式層，未接入 popup/dashboard，因此不改變使用者可見行為，也不擴張權限面。
- 外部 reviewer 最終審查無阻斷問題；已補 standalone / AI-expanded 優先序 regression 回應其非阻斷建議。

## 剩餘風險

- 目前只驗證本機 synthetic browser fixture，尚未重跑外部 live target。
- same-origin iframe 以 `window.top.document.location` 導走 top window 的案例仍是 known gap；嘗試補 `Document/HTMLDocument.prototype.location` setter 未修復，下一輪若要處理需另審更侵入式攔截或 background-level navigation 策略。
- `Protection Status` contract 尚未接入 popup/dashboard UI 狀態來源。
- `.gstack` durable state 目前被 `.gitignore` 排除，適合本機恢復，但不會隨 commit 進入 repo。

## 下一步

下一步可做 popup/dashboard 的非侵入式 adapter 設計審查，但在另一次 reviewer gate 前，不應直接改 UI 版面或新增 content script。
