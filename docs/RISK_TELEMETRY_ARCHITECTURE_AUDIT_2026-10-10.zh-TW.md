# 網頁風險評分與遙測計算架構稽核

日期：2026-10-10（台北時間）
專案：Falcon-Player-Enhance

## 現行資料流

ISOLATED content scripts（ai-runtime、overlay-remover）／MAIN world（inject-blocker） → chrome.runtime.sendMessage(aiTelemetry) → background processAiTelemetry → normalizeAiEvent → updateRiskProfile(hostname) → buildResolvedPolicy／Policy Gate → aiProfiles、aiTelemetryLog、aiPolicyCache → Popup／Dashboard。

目前計算單位是 **frame document 的 hostname**，並非完整頁面 URL 或頂層 tab 的網站綜合風險。跨域 iframe 會按自己的來源網域計分；頂層聚合視圖尚未實作，不應將某個 frame 的分數直接稱為整頁分數。

## 本次已修復

1. **可信時間與有限數值**：原先 input.ts 直接推進 lastUpdatedAt，未來／過去時間戳可能污染衰減；現在由背景服務接收時鐘產生計分事件時間，NaN／Infinity 以安全預設正規化。
2. **權重白名單**：未知事件預設權重由 1 改為 0。runtime_bootstrap 與 managed_redirect_listener_candidate 為診斷事件，權重設 0；純觀察不再視為惡意證據。
3. **低特異性重複計分**：suspicious_dom_churn 每 host 最快每 20 秒計分一次，原始事件數仍累加，另以 scoredEvents 區分真正計分事件；evidence.topSignals 依計分事件生成。
4. **查詢時衰減**：以 getDecayedRiskScore 將分數投影至現在，Policy Cache 逾 30 秒或跨分級門檻後重建；Dashboard 高風險 host 清單按投影風險篩選排序，不因網站長期無新事件而保持歷史高分。
5. **事件歸屬驗證**：若是 content script 訊息，依 browser sender.url／documentUrl 的網域入帳，不信任訊息 payload 自報 hostname；擴充功能 Popup 仍可明確指定正在操作的網站。
6. **手動降級權限**：user_override、false_positive_signal 與 activateHostFallback 僅允許可信擴充功能 UI 發起；aiPolicyApplied 也優先以瀏覽器驗證的 frame URL 決定主機。
7. **訊息與記錄容量**：每批最多收 50 個正規化事件；aiTelemetryLog 持續維持最近 1500 筆。
8. **Policy Gate 佐證**：只有 DOM churn 等弱訊號，即使數值超過 HIGH／CRITICAL，也不可進入 T2 reversible-actions。過去五分鐘內必須有 blocked_popup、blocked_malicious_navigation 或 clickjacking_detected 且分數增量為正的確認事件；沒有時原因碼 uncorroborated_heuristic_risk，維持 T1／advisory-only。Provider advisory 同樣不得繞過此邊界。
9. **模擬／回放同步**：tests/ai-eval/lib/policy-engine.js 使用相同的零權重規則與 DOM churn 冷卻，避免測試與正式服務的公式分岐。

## 計分合約

| 事件 | 權重 | 備註 |
|---|---:|---|
| runtime_bootstrap | 0 | 啟動診斷 |
| blocked_popup | +6 | 確認阻擋 |
| blocked_malicious_navigation | +7 | 確認阻擋 |
| overlay_removed | +4 | 覆蓋層移除 |
| clickjacking_detected | +8 | 點擊劫持 |
| suspicious_dom_churn | +3 | 20 秒計分冷卻，無單獨升級權 |
| false_positive_signal | −5 | 僅可信 UI |
| user_override | −2 | 僅可信 UI |
| managed_redirect_listener_candidate | 0 | 候選訊號 |
| 其他未定義事件 | 0 | 僅診斷 |

每個加權事件的分數增量 = weight × severity × confidence；最後 clamp 到 [0, 200]。時間衰減為 riskScore × 0.96^(elapsedMinutes)。分級 LOW <8、MEDIUM ≥8、HIGH ≥18、CRITICAL ≥30。高風險數值不等於自動允許高強度操作，另須通過 Policy Gate。

## 測試與證據

- npm run test:ai:risk-telemetry：虛擬時鐘測試未知事件零加分、未來時間戳、NaN／Infinity、DOM churn 冷卻、5 分鐘佐證時效、Policy Cache 降級、frame host 歸屬、禁止跨網域冒用、限批、僅可信 UI 降級。
- npm run test:ai：合成站點模型評估。
- npm run test:e2e-replay：離線升級、降級與 fallback 路徑。
- npm run test:ai:element-classification:behavior、test:popup-reliability、test:element-isolation、test:ai:provider-profiles、test:ai:chrome-builtin-contract：關聯回歸。

## 策略版本一致性補強

ai-runtime 原本雖能以 dispatchIssuedAt、generatedAt、policyVersion 偵測較舊 Policy，但仍直接套用。已修改為：偵測到 conflict 時只回傳 stale_policy_rejected 遙測，不套用／不發布舊 Policy；background 收到衝突回報時記錄 policy_conflict_count，不能將其 appliedAt／source 覆寫到成功生效的 Policy Cache。`test:ai:risk-telemetry` 已增加過期與新版本 Policy 的行為驗證。

## 尚未解決的架構缺口

**MAIN world 遙測**：background 動態註冊 inject-blocker.js 為 world=MAIN。程式的 emitAiEvent() 嘗試直接使用 chrome.runtime.sendMessage；Chrome MAIN world 共用網站 JavaScript 執行環境，不能假設擴充功能 API 可用。既有 ai-runtime 明確忽略一般 window.postMessage 偽造的風險訊號。須以實際安裝的 Chrome 驗證 MAIN world 事件到達率，並設計可信的 ISOLATED ／ background 驗證或由 browser API 獨立交叉佐證；**不得為了補資料而直接信任頁面可偽造的 postMessage 並計分**。

**頂層頁面聚合**：現有記錄按 frame hostname 分開，缺少以 tabId/documentId 關聯頂層網頁和第三方 iframe 的觀測視角。日後若需要「當前頁面總風險」，應新增獨立的 page/session aggregation，不可直接把第三方 iframe 分數覆寫主網站長期 reputation。

**主動下調策略**：分數讀取會正確衰減，但本次沒有新增週期性 alarm 去通知長時間未產生任何新事件的已開啟分頁。分頁下次請求策略／收到新遙測時才重新套用；若要求持續自動降級，需設計低成本、可靠的 MV3 alarm 與 versioned dispatch。

**既有資料**：不清除／重設過去 aiProfiles、aiTelemetryLog 或其他使用者資料。歷史舊版已累加的分數不會立即消失，但新算法在讀取時對其持續衰減。scoredEvents 缺失的舊資料採相容性備援。

**真實網站驗收**：仍需於 Chrome Dev/Stable 的擴充功能模式測試跨 iframe、複數阻擋事件、誤判 UI 和狀態恢復；本次離線 regression 並非端到端瀏覽器驗收。

官方 Chrome content script 執行世界參考：https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts

所有修正目前在本機工作目錄，未 commit／push，且保留其他並行未提交變更。
