<p align="center">
  <img src="docs/banner.png" alt="Falcon-Player-Enhance Banner" width="100%">
</p>

<p align="center">
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome" alt="Manifest V3"></a>
  <img src="https://img.shields.io/badge/Version-4.4.0-green" alt="Version 4.4.0">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Extension">
</p>

<p align="center">
  <b>專為播放器保護打造的 Chrome 擴充功能 — 覆蓋層移除、彈窗攔截、播放器增強、AI 輔助分析、快捷鍵控制。</b>
</p>

<p align="center">
  <a href="#-快速開始">快速開始</a> •
  <a href="#-功能特色">功能特色</a> •
  <a href="#-截圖預覽">截圖預覽</a> •
  <a href="#%EF%B8%8F-鍵盤快捷鍵">快捷鍵</a> •
  <a href="#-架構">架構</a> •
  <a href="#-開發">開發</a> •
  <a href="README.md">English</a> •
  <a href="docs/FEATURE_GUIDE.zh-TW.md">完整功能指南</a>
</p>

---

## 概述

**Falcon-Player-Enhance** 是一款專注於**影片播放器保護**的 Chrome 擴充功能。它的設計目標是與 uBlock Origin Lite 這類通用型 blocker 互補，同時在未安裝 blocker 時仍提供最小可用的基礎防護。

| 能力 | 說明 |
|------|------|
| 🛡️ **覆蓋層移除** | 自動偵測並移除影片上方的廣告覆蓋層、點擊劫持層 |
| 🚫 **彈窗攔截** | 阻擋惡意彈出視窗和重新導向 |
| 🎬 **播放器增強** | 自動偵測播放器、加入控制按鈕與彈出播放功能 |
| ⌨️ **鍵盤快捷鍵** | 14+ 組快捷鍵控制播放、音量、速度、截圖 |
| 🖥️ **無干擾播放器** | 獨立視窗播放，支援畫面調整（亮度/對比/色調/色溫） |
| 🤖 **AI 輔助分析** | 串接 OpenAI / Gemini / LM Studio，即時風險評估 |
| 🌐 **最小基礎防護** | 以高信心 DNR 與網域守門規則處理惡意導流與播放器周邊陷阱 |

> 💡 **建議：** 搭配 [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) 使用，讓 uBOL 處理廣域廣告/追蹤阻擋，Falcon 專注於播放器保護、彈窗修復、覆蓋層清理與 hostile player site 修復。

---

## 🚀 快速開始

### 安裝

```
1. Clone 此 Repository
2. 在 Chrome 開啟 chrome://extensions/
3. 啟用右上角的「開發人員模式」
4. 點擊「載入未封裝項目」→ 選擇 extension/ 目錄
```

### 選用：AI 服務商設定

擴充功能支援多種 AI 服務商，提供進階廣告偵測能力：

| 服務商 | 類型 | 設定方式 |
|--------|------|----------|
| **OpenAI** | 雲端 API | Dashboard → AI 分頁 → 輸入 API Key |
| **Gemini** | 雲端 API | Dashboard → AI 分頁 → 輸入 API Key |
| **LM Studio** | 本地模型 | 啟動 LM Studio 伺服器 → Dashboard → AI 分頁 → Health check |
| **Gateway** | 自訂端點 | Dashboard → AI 分頁 → 輸入自訂 URL |

詳細安裝說明請參閱 [INSTALL.md](INSTALL.md)。

---

## ✨ 功能特色

### 🛡️ 多層防護系統

| 層級 | 功能 | 說明 |
|------|------|------|
| **網路層** | 基線 DNR 守門 | 以高信心規則處理惡意導流、trap popup 與播放器周邊高風險域 |
| **DOM 層** | 覆蓋層移除 | 移除覆蓋在播放器上的廣告與點擊劫持層 |
| **DOM 層** | 假影片移除 | 辨識並移除誘騙用的假影片元素 |
| **腳本層** | 反偵測繞過 | 在 MAIN world 注入，做播放器場景導向的相容性修復 |
| **腳本層** | 注入攔截器 | 即時阻擋惡意腳本注入 |
| **CSS 層** | 外觀過濾 | 以播放器周邊為主的保守清理，而非全頁廣告覆蓋競賽 |
| **視窗層** | 反彈窗 | 攔截未授權彈窗，同時保留正常功能 |

### 🎬 播放器增強

| 功能 | 說明 |
|------|------|
| **自動偵測** | 掃描 HTML5 `<video>`、`<iframe>` 及自訂播放器框架 |
| **無干擾播放器** | 在獨立視窗中開啟影片，完全無廣告干擾 |
| **畫面調整** | 亮度、對比、飽和度、色調、銳化、色溫 |
| **主題切換** | 暗色 / 明亮主題，偏好自動儲存 |
| **子母畫面 (PiP)** | 小視窗浮動播放，邊工作邊看 |
| **視窗釘選** | 保持播放器視窗置頂，切換分頁不關閉 |
| **播放器同步** | 跨視窗同步播放狀態 |
| **自動適配** | 視窗自動調整為影片原始比例 |

### 🤖 AI 整合

| 功能 | 說明 |
|------|------|
| **多服務商** | OpenAI、Gemini、LM Studio、自訂 Gateway |
| **風險評估** | 即時風險評分：LOW / MEDIUM / HIGH / CRITICAL |
| **政策閘門** | 執行時期政策引擎，約束 AI 行為 |
| **建議 / 混合模式** | 可選 AI 純建議模式或 AI 自主模式 |
| **遙測紀錄** | 動作證據紀錄（上限 1,500 筆） |

### 🔧 工具

| 功能 | 說明 |
|------|------|
| **元素選取器** | 點擊任何頁面元素建立自訂封鎖規則 |
| **AI 教學模式** | 點擊元素讓 AI 學習判斷處理方式 |
| **保護模式** | Companion-first 模式與 basic standalone fallback |
| **儀表板** | 完整設定面板，4 個分頁：總覽 / 站點 / AI / 進階 |
| **白名單 / 黑名單** | 依站點自訂保護策略 |

---

## 📸 截圖預覽

### 無干擾播放器

<p align="center">
  <img src="docs/screenshots/01-player-dark-full.png" width="80%" alt="播放器 — 暗色主題">
</p>
<p align="center"><em>無干擾播放器（暗色主題）— 頂部資訊列 + 影片舞台 + 控制面板</em></p>

<p align="center">
  <img src="docs/screenshots/03-player-light-full.png" width="80%" alt="播放器 — 明亮主題">
</p>
<p align="center"><em>無干擾播放器（明亮主題）— 毛玻璃面板效果</em></p>

### 設定面板

<p align="center">
  <img src="docs/screenshots/05-dashboard-overview.png" width="45%" alt="Dashboard — 總覽">&nbsp;&nbsp;
  <img src="docs/screenshots/07-dashboard-ai.png" width="45%" alt="Dashboard — AI 設定">
</p>
<p align="center"><em>左：總覽（統計 + 保護開關）· 右：AI 服務商設定</em></p>

<p align="center">
  <img src="docs/screenshots/06-dashboard-sites.png" width="45%" alt="Dashboard — 站點">&nbsp;&nbsp;
  <img src="docs/screenshots/08-dashboard-advanced.png" width="45%" alt="Dashboard — 進階">
</p>
<p align="center"><em>左：站點管理（白名單/黑名單）· 右：進階設定（政策閘門、封鎖元素）</em></p>

### 擴充功能彈窗

<p align="center">
  <img src="docs/screenshots/09-popup-main.png" width="35%" alt="擴充功能 Popup">
</p>
<p align="center"><em>瀏覽器彈窗 — 三步驟流程指引、播放器偵測、統計數據、封鎖等級</em></p>

> 📖 完整功能導覽（含每個控制項的詳細說明），請參閱 **[FEATURE_GUIDE.zh-TW.md](docs/FEATURE_GUIDE.zh-TW.md)**。

---

## ⌨️ 鍵盤快捷鍵

當頁面偵測到播放器時，以下快捷鍵自動啟用：

### 播放控制

| 按鍵 | 功能 |
|------|------|
| `Space` / `K` | 播放 / 暫停 |
| `←` / `→` | 快轉 ±5 秒 |
| `J` / `L` | 快轉 ±10 秒 |
| `Home` / `End` | 跳到開頭 / 結尾 |
| `0`–`9` | 跳轉 0%–90%（單按） |
| 500ms 內連按兩位數 | 跳轉 00%–99%（如 `2` `5` → 25%） |

### 音量與速度

| 按鍵 | 功能 |
|------|------|
| `↑` / `↓` | 音量 ±10% |
| `M` | 靜音切換 |
| `Shift` + `<` | 降低播放速度 |
| `Shift` + `>` | 提高播放速度 |

> 速度階段：0.25× → 0.5× → 0.75× → 1× → 1.25× → 1.5× → 1.75× → 2× → 2.5× → 3×

### 其他

| 按鍵 | 功能 |
|------|------|
| `F` | 全螢幕切換 |
| `S` | 截取畫面 (PNG) |
| `L` | 循環播放切換 |
| `[` / `]` | 設定 AB 循環起點 / 終點 |

---

## 🏗 架構

```
extension/
├── manifest.json                 # MV3 設定檔
├── background.js                 # Service Worker — 狀態、規則、視窗、訊息
├── content/
│   ├── player-detector.js        # 播放器偵測 (ISOLATED)
│   ├── player-enhancer.js        # 播放器增強 + 彈出按鈕 (ISOLATED)
│   ├── player-controls.js        # 鍵盤快捷鍵 (ISOLATED)
│   ├── player-sync.js            # 跨視窗同步 (ISOLATED)
│   ├── overlay-remover.js        # 覆蓋層移除 (ISOLATED)
│   ├── fake-video-remover.js     # 假影片移除 (ISOLATED)
│   ├── anti-antiblock.js         # 反偵測繞過 (MAIN world)
│   ├── inject-blocker.js         # 腳本注入攔截 (MAIN world)
│   ├── cosmetic-filter.js        # CSS 外觀過濾 (ISOLATED)
│   ├── anti-popup.js             # 反彈窗 (ISOLATED)
│   ├── element-picker.js         # 手動元素選取器
│   └── ai-runtime.js             # AI 執行橋接
├── popup/                        # 瀏覽器動作彈窗 UI
├── popup-player/                 # 無干擾播放器視窗
├── dashboard/                    # 設定儀表板（4 個分頁）
├── rules/
│   ├── filter-rules.json         # declarativeNetRequest 規則
│   ├── ad-list.json              # 已知廣告網域清單
│   └── site-registry.json        # 增強站點定義
├── sandbox/                      # 沙箱執行環境
└── security/                     # URL 檢查工具
```

### 核心模組

| 模組 | 執行環境 | 職責 |
|------|----------|------|
| `background.js` | Service Worker | 狀態管理、規則引擎、AI 管線、視窗管理 |
| `anti-antiblock.js` | MAIN | 偽造廣告 API（AdSense、DFP、IMA SDK）以繞過偵測 |
| `inject-blocker.js` | MAIN | Hook XHR/fetch/DOM 攔截惡意注入 |
| `player-detector.js` | ISOLATED | 掃描 video/iframe 播放器，產生穩定 ID |
| `player-enhancer.js` | ISOLATED | 加入視覺標記、彈窗按鈕、z-index 優化 |
| `overlay-remover.js` | ISOLATED | 移除點擊劫持與廣告覆蓋層 |
| `cosmetic-filter.js` | ISOLATED | 站點專屬 CSS 隱藏規則 |
| `anti-popup.js` | ISOLATED | 攔截彈窗，同時保留年齡驗證對話框 |

### 訊息流

```
Content Scripts ──playerDetected──▶ background.js ──▶ chrome.windows.create()
                                         │                     │
popup.js ──controlCommand──▶ background.js ──▶ content script (來源分頁)
                                         │
popup-player.js ◀──playerSync──▶ content script (透過 sourceTabId)
                                         │
所有腳本 ──statsUpdate──▶ background.js ──aipolicyUpdate──▶ 所有腳本
```

---

## 🧪 開發

### 測試指令

```bash
npm run test:ai              # AI 評估套件
npm run test:e2e-replay      # 端對端回放測試
npm run test:popup:smoke     # 3-case popup smoke 測試
npm run test:popup:state-restore # popup 狀態還原驗證
npm run test:lmstudio        # LM Studio 整合測試
npm run check:lmstudio       # LM Studio 健康檢查
```

### 技術棧

- **平台：** Chrome Extension (Manifest V3)
- **API：** declarativeNetRequest · Scripting · Storage · Tabs · SidePanel · Windows
- **語言：** JavaScript · HTML · CSS
- **AI：** OpenAI API · Gemini API · LM Studio（本地）· 自訂 Gateway

### 重新擷取截圖

```bash
npm run docs:screenshots
```

---

## 📄 文件

| 文件 | 說明 |
|------|------|
| [FEATURE_GUIDE.zh-TW.md](docs/FEATURE_GUIDE.zh-TW.md) | 完整功能指南（含截圖，繁體中文） |
| [PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md](docs/PRODUCT_STRATEGY_UBOL_COMPANION.zh-TW.md) | 與 uBOL 互補的產品邊界與模式策略 |
| [ROADMAP_UBOL_COMPANION.zh-TW.md](docs/ROADMAP_UBOL_COMPANION.zh-TW.md) | 依保留 / 最小防護 / 避免重疊 / AI 擴張拆分的路線圖 |
| [DEVELOPMENT_EXECUTION_BOOK_2026-03-31.zh-TW.md](docs/DEVELOPMENT_EXECUTION_BOOK_2026-03-31.zh-TW.md) | 現行開發主依據與 YOLO mode 執行優先序 |
| [INSTALL.md](INSTALL.md) | 安裝與設定說明 |
| [AI_INTEGRATED_VERSION.zh-TW.md](docs/AI_INTEGRATED_VERSION.zh-TW.md) | AI Edition Fork 開發文件 |

---

## 🤝 貢獻

歡迎貢獻！請先開 Issue 討論您想要的變更。

---

## 📜 授權

本專案使用 [MIT 授權條款](LICENSE)。

---

## 🤖 AI 輔助開發

本專案使用 AI 輔助開發。

**使用的 AI 模型：**
- Gemini 2.5 Pro (Google DeepMind) — 初始開發
- Claude Opus 4.6 (Anthropic) — 架構審查、UI 重設計、文件撰寫

> ⚠️ **免責聲明：** 作者已盡力審查與驗證 AI 生成的程式碼，但無法保證其正確性、安全性或適用於任何特定用途。使用風險自負。
