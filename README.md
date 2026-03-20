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
  <b>A Chrome extension specialized in player protection — overlay removal, popup blocking, player enhancement, and keyboard shortcuts.</b>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#development">Development</a> •
  <a href="README.zh-TW.md">中文版</a>
</p>

---

## Overview

Falcon-Player-Enhance is a Chrome extension purpose-built for **player protection** on media websites. Unlike general-purpose ad blockers, it focuses on keeping your video player clean and functional.

- **🛡️ Player-Focused Protection** — Removes overlays, fake videos, and ads covering the player
- **🎬 Smart Enhancement** — Auto-detects players, adds keyboard shortcuts, and supports popup playback
- **🤖 Local AI Advisory** — Optional LM Studio integration for local risk refinement and candidate rule generation
- **⚡ Works with uBlock Origin Lite** — Designed as a companion, not a replacement

> 💡 **Recommended:** Use Falcon-Player-Enhance alongside [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh) for comprehensive ad blocking.

---

## Installation

```text
1. Clone this repository
2. Open chrome://extensions/ in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `extension/` directory
```

### Optional: Enable LM Studio

If you want local-model-assisted ad detection:

1. Start the LM Studio local server
2. Load a model in LM Studio
3. Open the extension dashboard
4. Go to `Security settings` → `Local AI provider (LM Studio)`
5. Use the default endpoint `http://127.0.0.1:1234/v1/chat/completions`
6. Run `Health check`

---

## Features

### 🛡️ Protection

| Feature | Description |
|---------|-------------|
| Overlay Removal | Removes ads and overlays covering the video player |
| Pop-up Blocking | Prevents unauthorized pop-ups and redirects |
| Anti-Adblock Bypass | Circumvents anti-adblock detection on player sites |
| Fake Video Detection | Identifies and removes decoy video elements |
| Script Injection Blocking | Blocks malicious script injections in real time |

### 🎬 Player Enhancement

| Feature | Description |
|---------|-------------|
| Auto Detection | Smart identification of HTML5 video and iframe players |
| Popup Player | Open any detected video in a dedicated popup window |
| Keyboard Shortcuts | Custom keyboard controls for player interaction |
| Layer Optimization | Automatically raises player z-index to the top |
| Visual Indicators | Adds prominent visual markers to detected players |
| Multi-Window Support | Open multiple popup player windows simultaneously |

### 🔧 Tools

| Feature | Description |
|---------|-------------|
| Element Picker | Interactive element selector for custom blocking |
| Dashboard | Advanced settings panel with statistics |
| Player Sync | Synchronizes player state across windows |

---

## Usage

Once installed, Falcon-Player-Enhance runs automatically on supported pages:

1. **Automatic Protection** — Overlays, fake videos, and pop-ups are blocked without any action
2. **Popup Player** — Hover over a detected player and click the 🎬 button to open it in a popup window
3. **Element Picker** — Right-click and select "Pick Element" to manually block page elements
4. **Dashboard** — Click the extension icon → Settings to access advanced configuration

### Keyboard Shortcuts

Falcon-Player-Enhance adds keyboard shortcuts when a player is detected on the page.

#### Playback

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `←` / `→` | Seek ±5 seconds |
| `J` / `L` | Seek ±10 seconds |
| `Home` / `End` | Jump to start / end |
| `0`–`9` | Jump to 0%–90% (single press) |
| `0`–`9` `0`–`9` | Jump to 00%–99% (double press within 500 ms) |

#### Volume & Speed

| Key | Action |
|-----|--------|
| `↑` / `↓` | Volume ±10% |
| `M` | Toggle mute |
| `Shift` + `<` | Decrease playback speed |
| `Shift` + `>` | Increase playback speed |

#### Other

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |
| `S` | Capture screenshot |

> Speed steps: 0.25x → 0.5x → 0.75x → 1x → 1.25x → 1.5x → 1.75x → 2x → 2.5x → 3x

---

## Architecture

```text
Falcon-Player-Enhance/
├── manifest.json              # Extension config (Manifest V3)
├── background.js              # Background service worker
├── content/
│   ├── anti-antiblock.js      # Anti-adblock bypass (MAIN world)
│   ├── inject-blocker.js      # Script injection blocker (MAIN world)
│   ├── cosmetic-filter.js     # Cosmetic element filtering
│   ├── anti-popup.js          # Pop-up & redirect blocker
│   ├── element-picker.js      # Interactive element selector
│   ├── player-detector.js     # Media player detection
│   ├── fake-video-remover.js  # Fake video element removal
│   ├── overlay-remover.js     # Overlay removal engine
│   ├── player-enhancer.js     # Player enhancement & popup button
│   ├── player-controls.js     # Keyboard shortcut controls
│   └── player-sync.js         # Player state synchronization
├── popup/                     # Extension popup UI
├── popup-player/              # Detached popup player window
├── dashboard/                 # Settings & statistics dashboard
├── rules/
│   └── filter-rules.json      # declarativeNetRequest rules
├── sandbox/                   # Sandboxed execution environment
├── security/                  # URL checking utilities
└── tests/                     # Test pages & AI evaluation suite
```

### Core Modules

| Module | World | Role |
|--------|-------|------|
| `background.js` | Service Worker | Coordinates rules, handles messages, manages popup windows |
| `anti-antiblock.js` | MAIN | Bypasses anti-adblock detection on player sites |
| `inject-blocker.js` | MAIN | Blocks malicious script injections with internal whitelist |
| `player-detector.js` | ISOLATED | Detects HTML5 video and iframe players on the page |
| `player-enhancer.js` | ISOLATED | Adds visual markers, popup button, and layer optimization |
| `overlay-remover.js` | ISOLATED | Removes ads and overlays covering the player |
| `anti-popup.js` | ISOLATED | Blocks unauthorized pop-ups while allowing internal ones |

---

## Development

### Test Commands

```bash
npm run test:ai
npm run test:e2e-replay
npm run test:lmstudio
npm run check:lmstudio
```

This extension is built on the **Chrome Manifest V3** standard.

See [INSTALL.md](INSTALL.md) for installation and usage instructions.

### Tech Stack

- **Platform:** Chrome Extension (Manifest V3)
- **API:** declarativeNetRequest, Scripting, Storage, Tabs, SidePanel
- **Languages:** JavaScript, HTML, CSS

---

## Contributing

Contributions are welcome! Please open an Issue first to discuss proposed changes.

---

## License

[MIT License](https://opensource.org/licenses/MIT)

---

## 🤖 AI-Assisted Development

This project was developed with AI assistance.

**AI Models/Services Used:**

- Gemini 2.5 Pro (Google DeepMind)
- Claude (Anthropic)

> ⚠️ **Disclaimer:** While the author has made every effort to review and validate the AI-generated code, no guarantee can be made regarding its correctness, security, or fitness for any particular purpose. Use at your own risk.
