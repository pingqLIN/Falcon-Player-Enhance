# Advanced Ad & Malware Blocker with Player Enhancer

一款強大的 Chrome 擴充功能，提供全方位的網頁防護與媒體播放器優化體驗。

## 功能特色

### 🛡️ 安全防護

- **廣告攔截** - 自動阻擋彈出式廣告與侵入式廣告
- **惡意程式防護** - 即時偵測並阻擋惡意腳本執行
- **追蹤碼移除** - 保護您的隱私，移除追蹤代碼
- **彈出視窗攔截** - 防止未經授權的彈出視窗

### 🎬 播放器增強

- **自動偵測** - 智慧識別頁面中的媒體播放器
- **視覺標示** - 為播放器添加醒目的視覺標記
- **層級優化** - 自動調整播放器 z-index 至最高層級
- **障礙移除** - 移除覆蓋在播放器上的廣告與元件

## 技術架構

- **Manifest Version**: V3
- **權限**: declarativeNetRequest, scripting, storage, tabs
- **核心模組**:
  - Background Service Worker - 協調攔截規則
  - Content Script - 頁面分析與 DOM 操作
  - Popup UI - 使用者控制介面

## 專案結構

```
ad-blocker-player-enhancer/
├── manifest.json           # 擴充功能配置
├── background.js          # 背景服務
├── content/
│   ├── blocker.js        # 廣告/惡意程式攔截邏輯
│   └── player-enhancer.js # 播放器優化邏輯
├── popup/
│   ├── popup.html        # 控制面板
│   ├── popup.js
│   └── popup.css
├── rules/
│   └── filter-rules.json # declarativeNetRequest 規則
├── assets/
│   └── icons/           # 圖示資源
└── README.md
```

## 開發與測試

本擴充功能使用 Chrome Manifest V3 標準開發。

## 授權

MIT License
