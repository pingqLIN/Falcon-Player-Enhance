<p align="center">
  <img src="extension/assets/icons/icon.svg" width="128" alt="Falcon-Player-Enhance Logo">
</p>

<h1 align="center">Falcon-Player-Enhance</h1>

<p align="center">
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome" alt="Manifest V3"></a>
  <img src="https://img.shields.io/badge/Version-4.4.0-green" alt="Version 4.4.0">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License"></a>
</p>

<p align="center">
  <b>專為播放器保護打造的 Chrome 擴充功能 — 覆蓋層移除、彈窗攔截、播放器增強、快捷鍵控制。</b>
</p>

<p align="center">
  <a href="#安裝">安裝</a> •
  <a href="#功能特色">功能特色</a> •
  <a href="#使用方式">使用方式</a> •
  <a href="#架構">架構</a> •
  <a href="#開發">開發</a> •
  <a href="README.md">English</a>
</p>

---

## 概述

Falcon-Player-Enhance 是一款專注於**播放器保護**的 Chrome 擴充功能。有別於通用型廣告攔截器，它專注於確保您的影片播放器乾淨且正常運作。

- **🛡️ 播放器專屬防護** — 移除覆蓋在播放器上的廣告、假影片與干擾元素
- **🎬 智慧增強** — 自動偵測播放器、加入快捷鍵控制、支援彈窗播放
- **🤖 本地 AI 輔助** — 可選接入 LM Studio，在本機做風險微調與候選規則生成
- **⚡ 搭配 uBlock Origin Lite** — 設計為互補工具，而非取代品

> 💡 **建議：** 搭配 [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) 使用，獲得最完整的廣告攔截效果。

---

## 安裝

```text
1. Clone 此 Repository
2. 在 Chrome 開啟 chrome://extensions/
3. 啟用右上角的「開發人員模式」
4. 點擊「載入未封裝項目」並選擇 `extension/` 目錄
```

### 選用: 啟用 LM Studio

若要啟用本地模型輔助偵測:

1. 啟動 LM Studio local server
2. 在 LM Studio 載入模型
3. 開啟擴充功能 dashboard
4. 進入 `Security settings` → `Local AI provider (LM Studio)`
5. 使用預設端點 `http://127.0.0.1:1234/v1/chat/completions`
6. 執行 `Health check`

---

## 功能特色

### 🛡️ 防護功能

| 功能 | 說明 |
|------|------|
| 覆蓋層移除 | 移除覆蓋在播放器上的廣告與干擾元素 |
| 彈窗攔截 | 阻擋未授權的彈出視窗與重新導向 |
| 反偵測繞過 | 繞過播放器網站的反廣告攔截偵測 |
| 假影片偵測 | 辨識並移除誘騙用的假影片元素 |
| 腳本注入攔截 | 即時阻擋惡意腳本注入 |

### 🎬 播放器增強

| 功能 | 說明 |
|------|------|
| 自動偵測 | 智慧辨識頁面中的 HTML5 video 與 iframe 播放器 |
| 彈窗播放器 | 將偵測到的影片在獨立彈窗視窗中開啟 |
| 快捷鍵控制 | 自訂鍵盤快捷鍵操控播放器 |
| 層級優化 | 自動將播放器 z-index 調至最高層 |
| 視覺標示 | 為偵測到的播放器加上醒目標記 |
| 多視窗支援 | 同時開啟多個彈窗播放器視窗 |

### 🔧 工具

| 功能 | 說明 |
|------|------|
| 元素選取器 | 互動式元素選擇器，自訂攔截規則 |
| 儀表板 | 進階設定面板與統計資訊 |
| 播放器同步 | 跨視窗同步播放器狀態 |

---

## 使用方式

安裝完成後，Falcon-Player-Enhance 會自動在支援頁面上運行：

1. **自動防護** — 覆蓋層、假影片與彈窗會自動被攔截
2. **彈窗播放器** — 將滑鼠移到偵測到的播放器上，點擊 🎬 按鈕即可在新視窗開啟
3. **元素選取器** — 右鍵選擇「選取元素」可手動攔截頁面元素
4. **儀表板** — 點擊擴充功能圖示 → 設定，進入進階設定

### 快捷鍵

當頁面偵測到播放器時，Falcon-Player-Enhance 會自動啟用鍵盤快捷鍵。

#### 播放控制

| 按鍵 | 功能 |
|------|------|
| `Space` / `K` | 播放 / 暫停 |
| `←` / `→` | 快轉 ±5 秒 |
| `J` / `L` | 快轉 ±10 秒 |
| `Home` / `End` | 跳到開頭 / 結尾 |
| `0`–`9` | 跳轉 0%–90%（單按） |
| `0`–`9` `0`–`9` | 跳轉 00%–99%（500ms 內連按兩位數） |

#### 音量與速度

| 按鍵 | 功能 |
|------|------|
| `↑` / `↓` | 音量 ±10% |
| `M` | 靜音切換 |
| `Shift` + `<` | 降低播放速度 |
| `Shift` + `>` | 提高播放速度 |

#### 其他

| 按鍵 | 功能 |
|------|------|
| `F` | 全螢幕切換 |
| `S` | 截圖 |

> 速度階段：0.25x → 0.5x → 0.75x → 1x → 1.25x → 1.5x → 1.75x → 2x → 2.5x → 3x

---

## 架構

```text
Falcon-Player-Enhance/
├── manifest.json              # 擴充功能配置 (Manifest V3)
├── background.js              # 背景服務工作者
├── content/
│   ├── anti-antiblock.js      # 反偵測繞過 (MAIN world)
│   ├── inject-blocker.js      # 腳本注入攔截 (MAIN world)
│   ├── cosmetic-filter.js     # 外觀元素過濾
│   ├── anti-popup.js          # 彈窗與重新導向攔截
│   ├── element-picker.js      # 互動式元素選取器
│   ├── player-detector.js     # 媒體播放器偵測
│   ├── fake-video-remover.js  # 假影片元素移除
│   ├── overlay-remover.js     # 覆蓋層移除引擎
│   ├── player-enhancer.js     # 播放器增強與彈窗按鈕
│   ├── player-controls.js     # 快捷鍵控制
│   └── player-sync.js         # 播放器狀態同步
├── popup/                     # 擴充功能彈出 UI
├── popup-player/              # 獨立彈窗播放器視窗
├── dashboard/                 # 設定與統計儀表板
├── rules/
│   └── filter-rules.json      # declarativeNetRequest 規則
├── sandbox/                   # 沙箱執行環境
├── security/                  # URL 檢查工具
└── tests/                     # 測試頁面與 AI 評估套件
```

### 核心模組

| 模組 | 執行環境 | 職責 |
|------|----------|------|
| `background.js` | Service Worker | 協調規則、處理訊息、管理彈窗視窗 |
| `anti-antiblock.js` | MAIN | 在播放器網站繞過反廣告攔截偵測 |
| `inject-blocker.js` | MAIN | 攔截惡意腳本注入，含內部白名單機制 |
| `player-detector.js` | ISOLATED | 偵測頁面上的 HTML5 video 與 iframe 播放器 |
| `player-enhancer.js` | ISOLATED | 加入視覺標記、彈窗按鈕與層級優化 |
| `overlay-remover.js` | ISOLATED | 移除覆蓋在播放器上的廣告與干擾元素 |
| `anti-popup.js` | ISOLATED | 攔截未授權彈窗，同時允許內部彈窗 |

---

## 開發

### 測試指令

```bash
npm run test:ai
npm run test:e2e-replay
npm run test:lmstudio
npm run check:lmstudio
```

本擴充功能基於 **Chrome Manifest V3** 標準開發。

安裝與使用說明請參閱 [INSTALL.md](INSTALL.md)。

### 技術棧

- **平台：** Chrome Extension (Manifest V3)
- **API：** declarativeNetRequest, Scripting, Storage, Tabs, SidePanel
- **語言：** JavaScript, HTML, CSS

---

## 貢獻

歡迎貢獻！請先開 Issue 討論您想要的變更。

---

## 授權

[MIT License](https://opensource.org/licenses/MIT)

---

## 🤖 AI 輔助開發

本專案使用 AI 輔助開發。

**使用的 AI 模型/服務：**

- Gemini 2.5 Pro (Google DeepMind)
- Claude (Anthropic)

> ⚠️ **免責聲明：** 作者已盡力審查與驗證 AI 生成的程式碼，但無法保證其正確性、安全性或適用於任何特定用途。使用風險自負。
