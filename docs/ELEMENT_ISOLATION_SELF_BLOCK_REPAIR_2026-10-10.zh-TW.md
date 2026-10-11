# 網站元素隔離與自我阻擋修復紀錄

日期：2026-10-10（台北時間）
專案：Falcon-Player-Enhance
範圍：Content scripts 的 DOM 元素選取、覆蓋層偵測、靜態／動態 CSS 隱藏規則、原生網站 UI 誤判。
目的：防止 Falcon 的控制元件被自己封鎖，亦避免通用覆蓋層特徵直接隱藏正常網站內容。原有已知廣告覆蓋層攔截應保留。

## 原始路徑／根因

1. `element-picker.js` 的 `isPickerNode()` 把 `__falcon_picker_target__`（加在**網站反白目標**上的 class）視為 Falcon 內部 UI；因此點擊反白元素時，`elementsFromPoint()` 可能跳過真正目標、改選其父層，隨後永久寫入錯誤的隱藏選擇器。
2. 選取器 UI 原先掛在 `document.body`，會受網站容器樣式與其他內容腳本掃描干擾；子元素也未一致使用 `data-shield-internal=true`。
3. `cosmetic-filter.js` 在動態生成 `display:none!important` CSS 時僅考慮 `data-shield-rescued`，未統一保護 Falcon 內部元素、`html`、`body`。
4. `overlay-remover.js`、`player-enhancer.js` 和 `anti-popup.js` 自我保護判斷不一致，深層後代與含有內部 UI 的容器存在誤刪可能。
5. `player-overlay-fix.css` 曾以 `div[id^=preact]`、`[id*=shadow-host]`、`[class*=popup-overlay]`、`[class*=interstitial]` 和一般燈箱 selector 強制隱藏，可能誤傷 Preact 根容器、網站對話框或合法燈箱。
6. `anti-popup.js` 曾把 `fixed + inset-0` 視為足以移除 DOM 的證據；正常網站彈窗也可能滿足這組布局條件。

## 本次完成

- 元素選取器：`isPickerNode()` 以內部節點／祖先標記判斷；反白 class 不再被視為內部 UI。選取器的四個 UI 根節點均加 `data-shield-internal=true`，並掛在 documentElement、位於網站 body 子樹之外。無法產生安全持久化 selector 時不再直接 `target.remove()`。
- 動態 Cosmetic Filter：每個規則以 CSS `:not()` 排除 `html`、`body`、標記為 Falcon 內部的元素及其後代；收集封鎖紀錄時亦略過內部節點。
- 其他掃描器：Overlay Remover 和 Player Enhancer 使用同一個內部節點祖先判斷；Anti-Popup 不移除包含內部控制節點的容器。
- Anti-Popup：不再僅憑 `fixed/inset-0` 就刪除元素；必須具有明確廣告語意且不含表單／對話框／影片／內部控制 UI。單純 `popup` 字樣不視為廣告證據，`popup-ad` 等明確廣告標記仍可攔截。
- 靜態 CSS：移除過寬的通用 Preact／Shadow host 選擇器及通用 popup、interstitial、fancybox／lightbox 強制隱藏；保留已知廣告層如 `.cvpboxOverlay` 及特定 click/ad-overlay 規則。

## 驗證紀錄

- `npm run test:element-isolation`：PASS。以 VM 執行實際 Element Picker 與 Cosmetic Filter 函式，測試反白目標、內部 UI 排除、廣告 selector、Anti-Popup 正常表單／網站彈窗保護、明確廣告刪除，以及特定靜態 CSS 安全限制。
- `npm run test:ai:element-classification:behavior`：PASS。
- `npm run test:popup-reliability`：PASS。
- 五個修改過的 JavaScript 檔案 `node --check`：PASS。
- `git diff --check`：PASS。
- Chrome Dev 157 headless synthetic test：Element Picker 原始程式在真實 DOM 中反白再點擊，選取到 `#ad-target`，PASS。
- Chrome Dev 157 headless synthetic tests：動態 Cosmetic CSS 保留 Falcon 內部 UI、封鎖廣告；靜態 CSS 保留 Preact app、一般 popup、Fancybox 同時隱藏 `.cvpboxOverlay`，均 PASS。

## 尚未完成與邊界

- 現有 Python Playwright 互動測試（`test:interaction-safety`、`test:interaction-safety:flow`、`test:anti-popup:compat`、`test:site-registry:contract`）無法啟動：本機 Python 缺少 `playwright` 套件。這是測試環境阻塞，**不是相關案例測試成功或功能回歸失敗的證據**。
- 尚未在使用者日常安裝的 Chrome Extension + 真實站點進行完整 E2E 驗收。此次 Chrome Dev 測試為合成頁面，不能取代多站點／跨 iframe 測試。
- `data-shield-internal` 能保護受 Falcon 控制的子樹，但網站 CSS 仍可能對 documentElement 的一般子節點施加強制規則。更強隔離可考慮 dedicated Shadow Root，但會影響 picker 的 hit testing、定位、焦點與多模組共用，需獨立評估，避免大改。
- 本次修改與既有未提交的 Chrome Built-in AI／Provider 工作樹變更並存；**未執行 Git commit、push、reset 或覆蓋既有變更**。

## 回退

本次修改限定在 `extension/content/` 的相關檔案、`package.json` 的新增測試腳本及新回歸測試；回退時應僅反轉這些明確 diff，不得直接對整個工作樹使用 `git reset --hard`，以免刪除同時存在的其他未提交修正。
