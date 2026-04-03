# Falcon-Player-Enhance Phase 5 Release Gate Checkpoint

> 更新日期: 2026-04-01
> 狀態: Track A/B/C/D groundwork + Track E v1/v2 + interaction safety verified
> 關聯文件:
> - `docs/PHASE_5_EXECUTION_PLAN_2026-03-31.zh-TW.md`
> - `docs/PHASE_5_ACCEPTANCE_MATRIX_2026-03-31.zh-TW.md`
> - `docs/PHASE_5_TRACK_E_CANDIDATE_GOVERNANCE_CHECKPOINT_2026-03-31.zh-TW.md`
> - `tests/release-gate/run_phase5_acceptance_gate.py`

## 1. 本輪完成項目

本輪 Phase 5 完成七個可交付成果：

1. `Track A / B` groundwork 落地
- `anti-popup.js` 補上 compatibility fallback 預設值與缺值保底
- 新增 `getSiteRegistry` contract regression
- 新增 anti-popup compatibility fallback regression

2. `Track D` 由文件規範轉成可執行 gate
- 新增 unified runner:
  - `tests/release-gate/run_phase5_acceptance_gate.py`
- 新增 package script:
  - `npm run test:phase5:gate -- --headless`

3. 測試衛生修補
- `tests/player-detection/run_player_detection_regression.py` 改為使用系統暫存 profile，不再污染 repo 內 `.tmp`
- release gate runner 已處理 Windows console / child process UTF-8 證據輸出

4. `Track C` groundwork 落地
- 新增 `extension/content/site-state-helper.js`
- 新增 `tests/site-state/run_site_state_bridge_regression.py`
- `background.js` 已將 helper 納入 `document_idle / ISOLATED` content script 鏈
- `player-enhancer.js`、`overlay-remover.js`、`fake-video-remover.js` 改為優先讀取 canonical helper
- 新增 `tests/site-state/run_site_state_helper_regression.py`
- 已完成 residual consumer audit，`player-detector.js`、`player-controls.js` 與三個 cleanup consumer 在 helper 缺席時改為 fail-closed，不再回退到 whitelist-only fallback
- 新增 `tests/site-state/run_site_state_consumer_contract_regression.py`

5. `Track E` candidate governance v1 落地
- background 已可記錄 candidate review decision（accept/reject + reason）
- dashboard generated candidates 可手動審核
- 新增 `tests/ai/run_candidate_review_regression.py`
- 新增 package script: `npm run test:ai:candidate-review -- --headless`
- `G-07` 已併入 unified gate 自動化執行

6. `Track E v2` 與 lovable safe-domain exemption 落地
- background 已可執行 controlled promotion / rollback，並匯出 promotion / rollback evidence chain
- dashboard generated candidates 已可手動 promotion / rollback
- 新增 `tests/ai/run_candidate_promotion_regression.py`
- 新增 `tests/content-scripts/run_basic_content_script_exclusion_regression.py`
- 新增 `tests/rules/run_filter_rules_contract.py`
- `lovable.dev` / `auth.lovable.dev` 已加入 basic content script exclusion 與 DNR allow contract
- `G-08` 已併入 unified gate 自動化執行

7. `Track F` interaction safety guard 落地
- `site-state-helper.js` 已可輸出 `interactionSafety` 與 `shouldRunMediaAutomation()`
- `player-detector`、`fake-video-remover`、`overlay-remover`、`player-enhancer`、`player-controls` 已對齊 interaction safety guard
- 新增 `tests/interaction-safety/run_interaction_safety_regression.py`
- 新增 `tests/interaction-safety/run_labs_flow_cta_regression.py`
- `G-09` 已併入 unified gate 自動化執行

## 2. 驗證結果

本輪 fresh verification：

- `python tests/release-gate/run_phase5_acceptance_gate.py --headless`
  - `G-00` PASS
  - `G-01` PASS
  - `G-02` PASS
  - `G-03` PASS
  - `G-04` PASS
  - `G-05` PASS
  - `G-06` PASS
  - `G-07` PASS
  - `G-08` PASS
  - `G-09` PASS
- `python tests/site-state/run_site_state_bridge_regression.py --headless`
- `python tests/site-state/run_site_state_helper_regression.py --headless`
- `python tests/site-state/run_site_state_consumer_contract_regression.py` PASS
- `python tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py --headless`
- `python tests/ai/run_candidate_review_regression.py --headless` PASS
- `python tests/ai/run_candidate_promotion_regression.py --headless` PASS
- `python tests/site-registry/run_site_registry_contract_regression.py --headless` PASS
- `python tests/content-scripts/run_basic_content_script_exclusion_regression.py --headless` PASS
- `python tests/rules/run_filter_rules_contract.py` PASS
- `python tests/interaction-safety/run_labs_flow_cta_regression.py --headless` PASS

附帶說明：

- `pin-close-reopen` 的已知視窗尺寸還原差異仍維持 Warning，不升級為 Blocker
- contract / player detection / popup smoke / cosmetic / inject / whitelist regression 已被 unified gate 串成單一入口
- anti-antiblock 已驗證 whitelist -> strict -> whitelist restore 的 live update 行為，且 whitelist 首次載入不會因 stale pre-hydration bridge state 提前 bootstrap full cleanup
- unified release gate 對 browser regressions 新增 extension startup retry 與 step timeout，降低 unattended 執行被 service worker 啟動抖動或單一 case 卡死中斷的風險
- live-browser smoke target manifest 已新增 contract regression，鎖定 curated -> smoke 的 repo-relative lineage、`requiresManualReview` 與 smoke subset 治理，避免舊 repo 路徑或脫鉤 target pool 混入正式驗收脈絡
- `run_site_state_consumer_contract_regression.py` 已驗證 helper-first 注入順序固定，且 audited media automation consumers 不再繞過 canonical helper contract
- candidate governance 已驗證 accept/reject + reason 可追溯，且 `baseline/confirmedPatterns` 不因 candidate review 直接變更
- controlled promotion 已驗證 decision -> promotion -> rollback evidence chain 可追溯，且 rollback 可將 `confirmedPatterns` 還原
- lovable safe-domain exemption 已驗證 runtime contract、registered content script excludeMatches 與 DNR allow rule 三層一致
- interaction safety guard 已驗證互動敏感頁會停用 media automation，且 auth overlay / OAuth button / form submit / keydown 不受干擾
- 互動敏感頁與 `labs.google/flow` 類型 hero 已驗證不會被 `.shield-speed-control` 等 controls UI 提前掛載
- `labs.google/flow` 類型的中央 CTA hero 已驗證不會被 player detection / popup button / overlay cleanup 誤接管
- unified gate 對 `extension_content_scripts_not_ready` 已加入受控重試，避免偶發 extension startup 抖動污染正式驗收

## 3. 目前判斷

Phase 5 目前不是整體完成，而是進入以下狀態：

- `Track A` 已有第一版 fallback 規格與驗證
- `Track B` 已有第一版 contract 驗證
- `Track D` 已有可重跑 release gate
- `Track C` 已完成 canonical helper、residual consumer contract 收斂與 regression，自動化已可覆蓋 helper-first 注入順序與同頁模式切換
- `Track E` 已完成 candidate/review/decision v1 與 controlled promotion / rollback v2，並納入 release gate 自動化
- `Track F` 已完成 interaction safety guard 與 auth/form regression，自動化納入 gate

換句話說，Phase 5 現在已具備「每輪交付可統一驗證」的基礎，也完成 Track E v1/v2 與 interaction safety；下一步重點是治理流程深化與真實站點 smoke 擴充。

## 4. 風險與缺點

- lovable exemption 目前先採 host-level 豁免；若後續確認只需 selector 細粒度例外，可再回頭收窄
- interaction safety 目前先以 auth/form-like heuristics 判定；後續可再補更多真實站點 smoke 驗證來收斂誤判與漏判

## 5. 下一階段建議

下一刀優先順序建議如下：

1. `Track C: Whitelist-State Divergence`
- residual consumer audit 已完成，下一步可轉向 flake hardening 與更細的 real-site smoke，而非再做同類 fallback 收斂
- 已補 `run_site_state_consistency_regression.py`，覆蓋同頁 whitelist -> strict 的跨模組 consistency 行為
- 已補 `run_player_controls_site_state_regression.py`，覆蓋同頁 whitelist / strict / whitelist restore 的 speed UI lifecycle
- 已補 `run_site_state_consumer_contract_regression.py`，覆蓋 helper-first 注入順序與 consumer contract
- 已補 live-browser smoke target contract，將 real-site smoke 先納入靜態治理層，下一步可再擴到更細的 live-browser runtime smoke

2. `Track E: AI Candidate Governance`
- 將 promotion evidence 與 reviewer trace 再補到更完整匯出格式
- 盤點是否需要 promotion queue / multi-reviewer policy

3. `Release Evidence Export`
- unified gate 已支援 `--json-out` 輸出 JSON artifact 到指定路徑
- JSON artifact 目前會附帶 `branch`、`dirty` 與 `dirtyFiles`，方便回填時判讀工作樹脈絡
- gate / step / overall report 目前會附帶 `durationSec`，方便追蹤慢步驟與 flake 熱點
- 下一步可補 artifact 命名規約或外部里程碑回填腳本，而非再實作同一能力
