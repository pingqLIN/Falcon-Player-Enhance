# Release Architecture Gate Checklist

> 日期：2026-04-25
> 目的：把 Falcon-Player-Enhance 的架構風險面轉成每輪 release / 5HR batch 可審查的 gate。
> 適用範圍：MV3 extension、player-centric protection、uBOL companion 路線。

## 1. 不可默默執行的變更

以下變更必須另開審查，不得在一般 5HR batch 內直接落地：

- 擴大 `manifest.json` permissions 或 `host_permissions`
- 擴大 `web_accessible_resources.matches`
- 新增或擴大 MAIN world content script 注入範圍
- 將 AI advisory 轉成自動永久規則、永久封鎖或不可回退行為
- 匯出 telemetry、使用者瀏覽資料、AI dataset 到外部位置
- 站點 registry promotion 到更廣泛或更高風險保護鏈
- Chrome Web Store、side-loaded package、production 發布或對外分發
- 從 player-centric protection 擴張成 generic ad blocker / tracker blocker

## 2. Manifest / 權限 gate

檢查項：

- `host_permissions` 是否仍維持現有範圍，未在本批擴張。
- 新功能是否真的需要 `tabs`、`scripting`、`activeTab`、`unlimitedStorage`。
- 若變更 DNR 權限或規則，是否仍屬 player-adjacent / high-confidence risk scope。
- `web_accessible_resources` 是否只暴露必要 extension resource，且未把 MAIN world 腳本暴露給所有頁面。

Pass 條件：

- 沒有新增權限擴張；或已另開專門審查與使用者批准。
- 文件能說明每個高風險權限對 player-centric use case 的必要性。

## 3. MAIN world / content script gate

檢查項：

- MAIN world hook 是否只用於必要的 popup / navigation / anti-antiblock 防護。
- 任何新 hook 都必須有 false-positive regression。
- 不得為了通用廣告清理新增廣域 hook。
- Interaction safety guard 不得干擾 auth、form、payment、OAuth、主要 CTA。

Pass 條件：

- 測試覆蓋合法互動與惡意導流兩側。
- 若無法自動化，stage report 必須列出 manual review evidence。

## 4. Navigation / popunder gate

檢查項：

- 同站、文字型外部連結、低意圖圖片/卡片、`window.open(..., "_self")`、`location.assign`、`document.location`、`top.document.location` 都要有明確行為。
- Guard enabled 時，低意圖外站導流應被阻擋，合法 same-site 與文字連結應保留。
- Guard disabled 時，至少一條外部導流應允許，以驗證不是測試環境假陽性。
- 不得以破壞 back-stack 或強制 redirect 作為正常控制手段。
- same-origin iframe 呼叫 `window.top.document.location` 目前列為 known gap evidence；處理前需另開審查，避免引入更侵入式 monkey patch 或新增權限面。

Pass 條件：

- `python tests\inject-blocker\run_managed_external_navigation_guard_regression.py --headless` 通過。
- 若測試需 escalation，stage report 需記錄原因與結果。

## 5. AI / telemetry gate

檢查項：

- AI 只能產生 advisory、candidate、reversible runtime action。
- `allowDurableMutation` 不得在未審查情況下開啟。
- candidate promotion 必須保留 decision / promotion / rollback evidence chain。
- UI 顯示應說明 AI 是選用增強，不是黑箱自動永久封鎖。

Pass 條件：

- candidate review / promotion regression 通過，或本批未觸及 AI pipeline。
- 沒有新增外部 telemetry export。

## 6. UX/UI architecture gate

檢查項：

- Popup / dashboard 是否使用一致的 protection status vocabulary。
- Whitelist、enhanced site、strict mode、AI-expanded mode 是否語義一致。
- Icon-only control 是否有 `aria-label`。
- Shortcut / help / advanced AI panel 是否可用鍵盤或明確入口操作。
- 空白態是否區分「尚未發生事件」與「保護未啟用」。

Pass 條件：

- UI 變更有對應 state contract 或 regression。
- 純視覺 polish 不得阻塞安全 release gate，但會進 UX backlog。

## 7. 本輪 evidence

- 外部 reviewer：准許 Batch A/C 開始，限制不得擴權、發布、外部 telemetry、AI 自動處置或廣域 blocking 擴張。
- Browser regression：
  - 指令：`python tests\inject-blocker\run_managed_external_navigation_guard_regression.py --headless`
  - 結果：PASS
  - 覆蓋新增案例：top-level `document.location` 與 `top.document.location`
  - Known gap evidence：same-origin iframe `window.top.document.location` 可導向外站，已由測試輸出 `childTopDocumentLocationKnownGap: true` 固定紀錄
  - sandbox 備註：Playwright 在一般 sandbox 遇到 `WinError 5`，已用 escalation 執行。
