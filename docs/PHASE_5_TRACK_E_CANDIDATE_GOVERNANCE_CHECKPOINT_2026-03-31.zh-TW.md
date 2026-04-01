# Falcon-Player-Enhance Phase 5 Track E Candidate Governance Checkpoint

> 更新日期: 2026-04-01
> 狀態: Track E v1/v2 landed and gate-automated
> 關聯:
> - `docs/PHASE_5_EXECUTION_PLAN_2026-03-31.zh-TW.md`
> - `docs/PHASE_5_ACCEPTANCE_MATRIX_2026-03-31.zh-TW.md`
> - `docs/PHASE_5_RELEASE_GATE_CHECKPOINT_2026-03-31.zh-TW.md`
> - `tests/ai/run_candidate_review_regression.py`
> - `tests/ai/run_candidate_promotion_regression.py`

## 1. 本輪落地事實

- background 已可記錄 AI candidate review decision（`accepted` / `rejected` + `reason`）。
- dashboard generated candidates 可手動審核。
- background 已可執行 controlled promotion / rollback，並輸出 `candidatePromotionLog` / `candidateRollbackLog`。
- dashboard generated candidates 已可手動 promotion / rollback。
- 新增 extension-backed regression：`tests/ai/run_candidate_review_regression.py`。
- 新增 extension-backed regression：`tests/ai/run_candidate_promotion_regression.py`。
- `package.json` 已提供 `test:ai:candidate-review`。
- `package.json` 已提供 `test:ai:candidate-promotion`。
- `G-07` / `G-08` 已由手動抽查升級為 release gate 自動化步驟。

## 2. v1 邊界（明確不做）

- candidate review 流程僅負責治理證據與決策記錄。
- 不在 v1 直接寫入 baseline。
- `confirmedPatterns` 不因 candidate review 流程直接變更。

## 3. 驗收證據

- `python tests/ai/run_candidate_review_regression.py --headless`
- `python tests/release-gate/run_phase5_acceptance_gate.py --headless`（含 `G-07`）

通過標準：

- accept/reject 決策與 reason 皆可追溯。
- export dataset 可包含 candidate review log。
- baseline/confirmedPatterns 在 candidate review 流程中保持不變。

## 4. Track E v2 落地事實

1. controlled candidate promotion
- 只允許 `accepted` decision 的 candidate 進入 promotion。
- promotion 需保留 `promotionId`，並關聯來源 `decisionId`。

2. evidence linkage
- decision、promotion、rollback 必須有共同關聯鍵，可形成單向追溯鏈。
- `evidenceRefs` 需可對應 gate 輸出、dashboard 操作紀錄、dataset 匯出紀錄。

3. decision schema hardening
- v2 最低欄位：
  - `decisionId`
  - `candidateId`
  - `reviewer`
  - `reason`
  - `evidenceRefs`
  - `schemaVersion`
  - `createdAt`

4. rollback path
- rollback 以 `promotionId` 為唯一入口。
- rollback 需記錄 `rollbackId`、原因、觸發者與還原前後版本關聯，且只移除該 promotion 新增的 pattern，不碰既有 baseline。

## 5. Track E v2 驗收與 Gate 變更

- 現有 `G-07` 保留作為 candidate review v1 基線。
- `G-08` 已驗證 controlled promotion 與 rollback：
  - `python tests/ai/run_candidate_promotion_regression.py --headless`
- `G-08` 通過條件：
  - 未經 `accepted decision` 不可 promotion。
  - decision schema v2 欄位完整。
  - evidence linkage 完整。
  - rollback 可還原 baseline，且不會誤刪 promotion 前已存在的 `confirmedPatterns`。

## 6. 本輪輸出邊界

- 本輪已完成 runtime promotion/rollback 程式碼、dashboard 操作、dataset 匯出與 gate 自動化。
- 目前仍維持安全邊界：`candidate review` 不直接改寫 baseline；只有人工 accepted 後的 controlled promotion 會寫入 `confirmedPatterns`。
- rollback 仍以 `promotionId` 為唯一入口，避免未關聯變更直接碰 baseline。
