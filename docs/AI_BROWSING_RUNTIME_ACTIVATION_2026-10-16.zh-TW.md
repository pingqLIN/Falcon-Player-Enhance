# Falcon — 一般網頁 AI Runtime 與 Gemini Nano 觸發鏈修正

日期：2026-10-16；分支：fix/chrome-builtin-document-host-20261016
專案：D:\projects\Falcon-Player-Enhance；Chrome Dev 157 測試隔離 Profile

## 根因

1. shield-ai-runtime 原本僅註冊於 Enhanced Sites；一般網站缺少主要 AI 風險監控、runtime_bootstrap 及 Policy 回饋。
2. AI 為事件驅動。預設 minRiskScore=8，普通無風險網頁不會主動呼叫 Gemini Nano，這是既有安全政策。
3. 原版模型 unavailable 後設有 30 分鐘 backoff，但後續 Health Check 通過仍不會清除，造成 Online 但瀏覽時拒絕推論。
4. 每次 aiProviderState 更新，Dashboard 都重新載入整份表單，可能覆蓋未儲存的 Advanced 設定。

## 修正

- 新增 shield-ai-baseline-runtime：一般網頁全域匹配但僅頂層 frame、document_start，並保留原基礎排除名單。Enhanced Sites 沿用既有 allFrames 監控，兩種註冊不重疊。
- 保留模型風險門檻、cooldown 和候選規則審核，不將單純瀏覽視為風險事件。
- Background 增加 skipped_threshold（risk/threshold）與 skipped_backoff（剩餘時間）診斷。
- 模型 Health Check 確實成功完成 create、prompt、destroy 後清除過期 backoff；明確變更 Chrome 模型組態時也允許重新嘗試。
- Dashboard 將即時診斷刷新與 Provider 表單載入分開，保留未存檔草稿；Operation Log 顯示 host、跳過原因與模型退避狀態。
- AI 關閉時，新網頁 runtime 不得繼續保留監控事件；後到的 blocking-level 訊息不得恢復已停止狀態。

## 驗證

實機 E2E：npm run test:ai:chrome-builtin-host:browser
- Chrome Dev 157 隔離 Profile 成功安裝 Falcon，正常 HTTP 網頁實際注入 runtime。
- runtime_bootstrap 進入 Background，DOM 新增測試遮罩後風險由 0 升至 3.46。
- 低於 8 分，Operation Log 正確顯示 skipped_threshold，不進行無必要的模型推論。
- 合成 blocked_popup 受控事件將風險提升到 12.46，確認開始 Chrome Built-in provider 請求；隔離 Profile 模型 unavailable，所以只驗證請求路由，不宣稱實際模型推論成功。
- 模型 unavailable 後記錄 failed，下一事件顯示 skipped_backoff；30 分鐘內不反覆嘗試。
- 關閉 AI 並開啟新頁，不增加已接受的遙測；重新啟用正常。
- Advanced settings：設定儲存／Provider 切換隔離，未儲存 temperature=0.9 在即時事件與切換後仍保留。
- 更新 Chrome 模型組態清除先前 backoff，Operation Log 即時顯示新事件及 host。

健康檢查回復：npm run test:ai:chrome-health-recovery
- VM 模擬模型成功時，清除 backoff；模型 unavailable 時不得清除。
- 這是模擬，不等於 Chrome 原生模型實際成功推論。

## 留待日常 Profile 驗收

1. Chrome Dev Default Profile 重新載入 Falcon，重新整理目標網頁。
2. AI Dashboard Operation Log 應出現站點及 skipped_threshold，達標時出現 started／completed 或具體 failed 原因。
3. 真實 Gemini Nano 的 available → create → prompt → destroy 與實際 Policy Advisory 結果仍待驗證。
4. Chrome Stable/Dev 模型資產共用治理屬獨立工作，未在此變更。

診斷報告：.falcon-observability/chrome-document-host-e2e/report.json（不提交）
安全界線：普通無風險頁不會保證有可見 AI 操作；如需每頁主動推論，應額外規劃明確選擇加入及效能政策。
