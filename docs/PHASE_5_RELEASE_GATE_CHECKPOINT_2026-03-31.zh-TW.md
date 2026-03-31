# Falcon-Player-Enhance Phase 5 Release Gate Checkpoint

> 更新日期: 2026-03-31
> 狀態: Track A/B/C/D groundwork verified
> 關聯文件:
> - `docs/PHASE_5_EXECUTION_PLAN_2026-03-31.zh-TW.md`
> - `docs/PHASE_5_ACCEPTANCE_MATRIX_2026-03-31.zh-TW.md`
> - `tests/release-gate/run_phase5_acceptance_gate.py`

## 1. 本輪完成項目

本輪 Phase 5 完成四個可交付成果：

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
- `background.js` 已將 helper 納入 `document_idle / ISOLATED` content script 鏈
- `player-enhancer.js`、`overlay-remover.js`、`fake-video-remover.js` 改為優先讀取 canonical helper
- 新增 `tests/site-state/run_site_state_helper_regression.py`

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
- `python tests/site-state/run_site_state_helper_regression.py --headless`
  - PASS

附帶說明：

- `pin-close-reopen` 的已知視窗尺寸還原差異仍維持 Warning，不升級為 Blocker
- contract / player detection / popup smoke / cosmetic / inject / whitelist regression 已被 unified gate 串成單一入口
- unified gate 對 `extension_content_scripts_not_ready` 已加入受控重試，避免偶發 extension startup 抖動污染正式驗收

## 3. 目前判斷

Phase 5 目前不是整體完成，而是進入以下狀態：

- `Track A` 已有第一版 fallback 規格與驗證
- `Track B` 已有第一版 contract 驗證
- `Track D` 已有可重跑 release gate
- `Track C` 已有第一版 canonical helper、跨模組 consumer 對齊與 regression，但尚未涵蓋所有 consumer
- `Track E` 尚未建立 candidate/review/decision 的正式紀錄流程

換句話說，Phase 5 現在已經具備「每輪交付可統一驗證」的基礎，但仍未完成 whitelist-state 與 AI governance 的主體工作。

## 4. 風險與缺點

- `overlay-remover.js`、`fake-video-remover.js`、`player-enhancer.js` 已優先改讀 canonical helper，但其他 consumer 尚未全部收斂
- unified runner 雖已可聚合證據，但 `G-07` 仍未自動化
- GitHub push 問題目前降級為非阻塞項，先以本地 commit 與驗證鏈為主

## 5. 下一階段建議

下一刀優先順序建議如下：

1. `Track C: Whitelist-State Divergence`
- 盤點剩餘 whitelist state consumer
- 將尚未接 helper 的 consumer 收斂到同一 runtime contract
- 擴充至少一個跨模組 consistency regression

2. `Track E: AI Candidate Governance`
- 建立 candidate/review/decision 記錄格式
- 將 `G-07` 從文件要求推進到最小可驗證流程

3. `Release Evidence Export`
- 讓 unified gate 支援輸出 JSON artifact 到指定路徑，方便回填到外部專案與里程碑記錄
