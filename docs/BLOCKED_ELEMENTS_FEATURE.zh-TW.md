# Blocked Elements Feature / 封鎖元素功能說明

## 目的

`封鎖元素` 功能讓使用者可以在頁面上直接點選不想看到的干擾元件，儲存為 host-scoped 規則，後續由 cosmetic filter 重新套用。

本輪修正後，功能鏈已補齊到以下狀態：

- popup 可啟動 element picker
- 頁面上的目標元素會出現可視化高亮
- 使用者確認後會寫入 `hiddenElements`
- 已啟用 cosmetic filter 的頁面會在規則變更後即時刷新隱藏樣式
- Dashboard 清除全部規則時，已啟用 cosmetic filter 的頁面也會同步刷新

## 目前操作流程

1. 在 popup 點擊 `封鎖元素` 按鈕。
2. background 會按需注入 [element-picker.js](../extension/content/element-picker.js)。
3. page 進入 picker mode：
   - cursor 變成 `crosshair`
   - 目標元素會套用 `.__falcon_picker_target__` halo class
   - tooltip 會顯示 selector 與尺寸
   - 所有一般連結、導流 click、pointer/touch 啟動事件都會被暫時鎖住
4. 左鍵點擊目標元素後，會跳出確認視窗。
5. 確認後會送出 `hideElement` 訊息到 background。
6. background 把規則寫入 `chrome.storage.local.hiddenElements`。
7. cosmetic filter 讀取規則並套用 `display: none !important`。

## 主要邏輯位置

- Picker UI 與選取流程：
  - [extension/content/element-picker.js](../extension/content/element-picker.js)
- 規則持久化與廣播刷新：
  - [extension/background.js](../extension/background.js)
- 規則套用與樣式注入：
  - [extension/content/cosmetic-filter.js](../extension/content/cosmetic-filter.js)
- Dashboard 規則清單：
  - [extension/dashboard/dashboard.js](../extension/dashboard/dashboard.js)
- Popup 入口：
  - [extension/popup/popup.js](../extension/popup/popup.js)

## 本輪修正重點

### 1. 補回可視高亮

先前 picker 進入後只有 cursor 與 tooltip，缺少明顯的元素 halo，使用上像是「功能啟動了，但不知道目前選到什麼」。

現在改為雙層策略：

- 保留原本 overlay 路徑
- 新增直接套在目標元素上的 `.__falcon_picker_target__` class

實際上就算 overlay 在某些頁面沒有落到 DOM，目標元素本身仍會有高亮外框與 glow，不再出現完全沒有視覺標記的情況。

### 2. 改善目標元素命中

先前 `mousemove` 直接吃 `event.target`，容易選到過大的根節點或不穩定節點。

現在改為：

- 優先使用 `document.elementsFromPoint()`
- 排除 `html` / `body`
- 排除 picker 自己的 UI 元件
- 排除太小、不適合當實際封鎖目標的節點

### 3. 補齊規則變更後刷新

先前只有 background 的 `hideElement` 會主動廣播 `refreshCosmeticRules`。

但如果使用者在 Dashboard 中直接刪除或清空規則，只會改到 storage，不一定會讓頁面即時同步。

現在：

- `cosmetic-filter.js` 會監聽 `chrome.storage.onChanged`
- `clearHiddenRules` 也會主動通知所有 tabs 刷新

這樣在有載入 cosmetic filter 的頁面上，規則變更後不必手動重整才能看到結果。

### 4. Picker mode 期間鎖定連結啟動

為了避免使用者在挑選封鎖目標時誤觸外跳、popup 或站內導流，picker 現在會在 capture phase 攔截以下事件：

- `mousedown` / `mouseup`
- `pointerdown` / `pointerup`
- `auxclick`
- `dragstart`
- `touchstart` / `touchend`
- 最終 `click`

確認視窗內的按鈕不會被鎖住，所以 `取消 / 確認封鎖` 仍可正常操作。

### 5. 避免重複寫入相同規則

background 現在對 `selector + hostname` 做重複檢查，避免連續點同一個元素時一直堆疊相同規則。

## 目前能力邊界

### 已具備

- 互動式選取封鎖目標
- selector 產生與 host-scoped 儲存
- Dashboard 檢視與清除已存規則
- 已啟用 cosmetic filter 的頁面即時刷新

### 尚未做到

- 還沒有 selector 品質評分或風險提示
- 還沒有「預覽規則命中範圍」功能
- 還沒有單筆規則回滾提示與批次編輯工具
- 不保證每一個陌生網站都會載入相同強度的 cosmetic chain

## 已完成驗證

本輪已完成以下驗證：

- `node --check`：
  - `extension/content/element-picker.js`
  - `extension/content/cosmetic-filter.js`
  - `extension/background.js`
- `npm run test:ai`
- `npm run test:e2e-replay`
- headless browser smoke：
  - picker 啟動後可命中 `h1`
  - tooltip 會顯示
  - 目標元素會被套用 `.__falcon_picker_target__`

## 建議下一步

1. 在 Dashboard 的 `封鎖元素` 區塊增加「這些規則只會在對應 host 套用」的說明。
2. 在確認視窗加入 selector 預覽與 host 資訊。
3. 後續 UI/UX 重建時，把這份文件納入 AI / Advanced / Sites 文件導覽。


