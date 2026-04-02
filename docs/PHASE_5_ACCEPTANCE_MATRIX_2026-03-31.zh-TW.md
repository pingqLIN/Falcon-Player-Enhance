# Falcon-Player-Enhance Phase 5 驗收矩陣

> 更新日期: 2026-04-01
> 狀態: Track E v1/v2 + Interaction Safety Gate Automated
> 參照: `PHASE_5_EXECUTION_PLAN_2026-03-31.zh-TW.md`

## 1. 驗收原則

- 每個驗收項目必須對應至少一個模式：`Companion`、`Basic Standalone`、`AI-Expanded`
- 每個驗收項目必須對應至少一個風險主題：
  - compatibility fallback
  - getSiteRegistry contract
  - whitelist-state divergence
  - release gate unification
  - interaction safety
- 驗收證據以 fresh run 為準，不引用過期結果

## 2. Gate Matrix

統一執行入口：

- `python tests/release-gate/run_phase5_acceptance_gate.py --headless`
- `npm run test:phase5:gate -- --headless`

| Gate ID | 類型 | 模式 | 風險主題 | 驗證方式 | 通過標準 |
|---|---|---|---|---|---|
| G-00 | Static | Companion / Standalone / AI-Expanded | release gate unification | `node --check`（background/content/popup-player）+ `python -m py_compile`（runner）+ `site-registry.json` parse | 全數成功，無 syntax/parse error |
| G-01 | Contract | Companion / Standalone / AI-Expanded | getSiteRegistry contract | runtime 取得 `getSiteRegistry` 回傳並核對必要欄位 + `shield-basic-docidle` excludeMatches contract + `filter-rules.json` lovable allow rule contract | 必要欄位皆存在，缺值時 fallback 符合規格；`lovable.dev` 與 `auth.lovable.dev` 不再吃到全站基礎腳本與錯誤 DNR 阻擋 |
| G-02 | Player Detection | Companion / Standalone | release gate unification | `python tests/player-detection/run_player_detection_regression.py --headless` | case matrix 全 PASS |
| G-03 | Popup Reliability | Companion / Standalone | compatibility fallback, release gate unification | `python tests/popup-smoke/run_popup_smoke.py --headless --cases popup-open-local-video pin-close-reopen popup-player-state-restore` + `--cases multi-popup-distinct-windows` | 兩批 case 全 PASS；已知視窗尺寸殘留可列 Warning 但不可 Blocker |
| G-04 | Cosmetic Filter | Companion / Standalone | getSiteRegistry contract | `python tests/cosmetic-filter/run_cosmetic_filter_regression.py --headless` | global + site-specific selector 行為正確，無跨站外溢 |
| G-05 | Inject Overlay | Companion / Standalone | compatibility fallback, getSiteRegistry contract | `python tests/inject-blocker/run_inject_blocker_overlay_regression.py --headless` | overlay 移除成功且安全內容可見 |
| G-06 | Whitelist Consistency | Companion / Standalone | whitelist-state divergence | `python tests/site-state/run_site_state_bridge_regression.py --headless` + `python tests/site-state/run_site_state_helper_regression.py --headless` + `python tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py --headless` | MAIN-world bridge、canonical helper 與 anti-antiblock 行為一致；bridge payload 必須輸出 `siteStateHydrated`；non-whitelist / whitelist / strict-mode 與 whitelist restore（strict -> whitelist）切換皆符合預期，且白名單首頁不可被 stale pre-hydration state 提前 bootstrap cleanup |
| G-07 | AI Candidate Governance | AI-Expanded | release gate unification | `python tests/ai/run_candidate_review_regression.py --headless`（或 `npm run test:ai:candidate-review -- --headless`） | accept/reject 決策與 reason 皆可追溯；dashboard candidate 可手動審核；`baseline/confirmedPatterns` 不可被 candidate review 流程直接改寫 |
| G-08 | AI Controlled Promotion | AI-Expanded | release gate unification | `python tests/ai/run_candidate_promotion_regression.py --headless`（或 `npm run test:ai:candidate-promotion -- --headless`） | 只允許已接受 decision 的 candidate promotion；decision schema v2 必要欄位完整；promotion 必須附 evidence linkage；rollback 依 `promotionId` 可還原 baseline |
| G-09 | Interaction Safety | Companion / Standalone | interaction safety, release gate unification | `python tests/interaction-safety/run_interaction_safety_regression.py --headless` + `python tests/interaction-safety/run_labs_flow_cta_regression.py --headless`（或 `npm run test:interaction-safety -- --headless` + `npm run test:interaction-safety:flow -- --headless`） | 互動敏感頁必須停用 media automation；auth overlay / OAuth button / form submit / keydown 不可被全站 media chain 誤傷；互動敏感頁與 `labs.google/flow` 類型 hero 上都不可偷掛 speed control UI；`labs.google/flow` 類型的中央 CTA hero 不可被 player detection / popup overlay 接管 |

## 3. 阻斷規則

- Blocker（必須修復）
- G-00~G-09 任一失敗
- contract 缺值導致 consumer crash 或 fallback 不一致
- whitelist state 漂移導致 non-whitelist/whitelist 行為反轉

- Warning（可先記錄再進下一里程碑）
  - 非核心視窗尺寸回報差異（功能正確但環境差異）
  - 舊文件未同步但不影響實際行為與測試

## 4. 證據格式

每次 Gate 執行紀錄至少包含：

- `timestamp`
- `commit`
- `gate id`
- `command`
- `result`（PASS/FAIL）
- `notes`（若 FAIL，需附 root cause 與修復追蹤）
- `decision_id`（若涉及 G-07/G-08）
- `promotion_id`（若涉及 G-08）
- `rollback_id`（若涉及 G-08 rollback）
- `interaction_signals`（若涉及 G-09）
- `evidence_refs`（gate output / dataset / dashboard action trace）
- `schema_version`（decision schema 版本）

建議優先保存 unified gate runner 的 JSON 輸出，作為每輪交付的主證據。

## 5. 退出條件（Phase 5 本階段）

本階段可進入下一階段需滿足：

- G-00~G-09 連續兩輪 PASS
- G-08 連續兩輪 PASS（Track E v2）
- G-09 連續兩輪 PASS（interaction safety）
- roadmap 與 execution book 已同步標記 Phase 5 kickoff 與 gate 規範
