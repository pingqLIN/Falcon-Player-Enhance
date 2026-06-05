[![Falcon-Player-Enhance banner](docs/banner.png)](docs/banner.png)

# Falcon-Player-Enhance

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome)
![Version 4.4.0](https://img.shields.io/badge/Version-4.4.0-green)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
[![License MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

> AI-assisted, reversible player defense for hostile player pages.

[Quick Start](#-quick-start) · [Features](#-features) · [Screenshots](#-screenshots) · [Shortcuts](#-keyboard-shortcuts) · [Architecture](#-architecture) · [Development](#-development) · [Documentation](#-documentation) · [繁體中文](README.zh-TW.md)

---

## 🎯 Overview

**Falcon-Player-Enhance** is built specifically for the video player experience. Unlike general ad blockers, Falcon focuses on the messy edge cases around player surfaces: overlays, popups, redirects, fake players, click traps, and reversible false-positive rescue.

It combines Chrome MV3 rules, player detection, reversible DOM cleanup, popup and redirect protection, and AI-assisted policy review so player defense stays precise, inspectable, and recoverable.

| Capability | Description |
|---|---|
| 🛡️ **Player-Centered Cleanup** | Removes overlays, fake videos, and click-hijack layers near the active player |
| 🚫 **Popup and Redirect Guard** | Blocks suspicious spawned tabs and same-tab redirects from managed player pages |
| 🧯 **False-Positive Rescue** | Scans for reversible Falcon actions, previews restores, restores once, records negative evidence |
| 🎬 **Distraction-Free Player** | Opens detected players in a separate playback window with visual controls |
| 🤖 **AI-Assisted Policy Review** | Turns runtime risk signals into advisory results or candidate rules behind a Policy Gate |
| 🧠 **Provider Profiles** | Supports OpenAI, Gemini, LM Studio, Chrome Built-in AI, and custom gateway profiles |
| ⌨️ **Keyboard Controls** | Playback, seek, speed, volume, screenshot, fullscreen, and loop shortcuts |

> 💡 **Recommended:** Use Falcon alongside [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh). uBOL handles broad ad and tracker blocking; Falcon handles player-adjacent interference, popup recovery, false-positive rescue, and AI-assisted review.

---

## 🚀 Quick Start

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/pingqLIN/Falcon-Player-Enhance.git
cd Falcon-Player-Enhance

# 2. Open Chrome Extensions
# chrome://extensions/

# 3. Enable Developer mode

# 4. Load the unpacked extension directory
# Select: Falcon-Player-Enhance/extension
```

### Optional AI Provider Setup

AI features are optional. Falcon keeps core player protection available without a provider.

| Provider | Type | Setup |
|---|---|---|
| **OpenAI** | Cloud API | Dashboard → AI provider → enter endpoint, model, and API key |
| **Gemini** | Cloud API | Dashboard → AI provider → enter endpoint, model, and API key |
| **LM Studio** | Local model | Start the local server, then run a Dashboard health check |
| **Chrome Built-in AI** | Browser-local capability | Select Chrome Built-in, restore defaults, then run a capability health check |
| **Gateway** | Custom endpoint | Enter a compatible gateway URL and model name |

Provider secrets are session-scoped in extension storage; provider profiles and non-secret defaults are persisted separately.

See [INSTALL.md](INSTALL.md) for detailed setup.

---

## ✨ Features

### 🛡️ Protection Layers

| Layer | Feature | Description |
|---|---|---|
| **Network** | Baseline DNR guardrails | High-confidence rules for malicious redirects, popup traps, and player-adjacent domains |
| **DOM** | Overlay cleanup | Removes or disables visible interference above or around the player |
| **DOM** | Fake video detection | Detects decoy video elements before they steal clicks or confuse controls |
| **MAIN world** | Anti-anti-adblock repair | Applies player-site compatibility shims where isolated scripts are not enough |
| **CSS** | Conservative cosmetic filter | Targets player-adjacent clutter without trying to become a page-wide filter list |
| **Window** | Popup and redirect recovery | Closes suspicious spawned tabs and recovers suspicious same-tab external redirects |
| **Recovery** | False-positive rescue | Restores hidden or click-blocked elements and records negative evidence for future candidate review |

### 🧯 False-Positive Rescue

| Control | Description |
|---|---|
| **Scan page** | Finds Falcon actions that can be restored on the current page |
| **Preview** | Temporarily shows hidden elements or restores clickability for inspection |
| **Restore once** | Reverses one Falcon action for the current page session |
| **Report false positive** | Records a false-positive observation as structured negative evidence |
| **Candidate gate** | Blocks candidate promotion when matching recent false-positive evidence exists |

### 🤖 AI Policy Flow

Falcon does not let runtime AI permanently mutate durable rules. Runtime signals are normalized, AI may summarize risk or propose candidates, and the Policy Gate decides what can happen next.

```text
Site signals
  -> rules and heuristics
  -> AI advisory / generated candidates
  -> Policy Gate
       -> reversible runtime hardening
       -> manual or development-time review
       -> durable rule update outside runtime AI authority
```

| Boundary | Falcon Behavior |
|---|---|
| **Runtime signals** | Popup events, redirect attempts, overlay actions, player context, and coarse element evidence |
| **AI advisory** | Risk summaries and candidate selectors/domains for review |
| **Policy Gate** | Constrains AI-driven actions by tier, confidence, mode, and negative evidence |
| **Durable mutation** | Kept outside runtime AI authority; formal rules require review or development workflow |
| **Privacy posture** | API secrets stay out of local persisted profiles; prompts use normalized evidence rather than raw page dumps |

### 🎬 Player Tools

| Tool | Description |
|---|---|
| **Player detection** | Detects HTML5 video, iframe players, and custom embedded players |
| **Popup player** | Opens a detected player in an independent playback window |
| **Visual controls** | Brightness, contrast, saturation, hue, sharpness, and color temperature |
| **Theme toggle** | Dark and light player themes with saved preference |
| **Picture-in-Picture** | Browser PiP mode for supported video elements |
| **State sync** | Keeps source tab and popup player state aligned where possible |
| **Element picker** | Creates targeted custom element rules from the current page |

---

## 📸 Screenshots

### Real Page Side Panel

[![Falcon side panel on a live page](docs/screenshots/14-live-side-panel.png)](docs/screenshots/14-live-side-panel.png)

*Live side panel — player-focused controls, AI review state, generated candidates, and reversible rescue actions beside the page*

### Dashboard

[![Current dashboard overview](docs/screenshots/15-dashboard-overview-current.png)](docs/screenshots/15-dashboard-overview-current.png)

*Overview — protection counters, defensive layers, popup guard, sticky reference, and runtime switches*

[![Site rule management](docs/screenshots/16-dashboard-sites-rules.png)](docs/screenshots/16-dashboard-sites-rules.png)

*Sites — whitelist, blacklist, enhanced-site profiles, and advanced host patterns*

[![AI policy settings](docs/screenshots/17-dashboard-ai-policy.png)](docs/screenshots/17-dashboard-ai-policy.png)

*AI settings — provider selection, model endpoints, policy mode, candidate generation, and expert controls*

### Rescue and Controls

[![False-positive rescue](docs/screenshots/19-false-positive-rescue.png)](docs/screenshots/19-false-positive-rescue.png)

*False-positive rescue — hidden elements, click-blocked elements, restore actions, and report flow*

[![Keyboard shortcuts and controls](docs/screenshots/20-shortcuts-controls.png)](docs/screenshots/20-shortcuts-controls.png)

*Shortcuts — quick actions, playback keys, volume controls, speed controls, fullscreen, and screenshot capture*

> 📖 For a complete visual walkthrough, see [FEATURE_GUIDE.zh-TW.md](docs/FEATURE_GUIDE.zh-TW.md).

---

## ⌨️ Keyboard Shortcuts

Shortcuts activate when Falcon has a controllable target player.

### Playback

| Key | Action |
|---|---|
| `Space` / `K` | Play or pause |
| `←` / `→` | Seek ±5 seconds |
| `J` / `L` | Seek ±10 seconds |
| `Home` / `End` | Jump to start or end |
| `0`-`9` | Jump to 0%-90% |
| Two digits within 500ms | Jump to 00%-99%, for example `2` then `5` → 25% |

### Volume and Speed

| Key | Action |
|---|---|
| `↑` / `↓` | Volume ±10% |
| `M` | Toggle mute |
| `Shift` + `<` | Decrease speed |
| `Shift` + `>` | Increase speed |

### Other

| Key | Action |
|---|---|
| `F` | Toggle fullscreen |
| `S` | Capture screenshot |
| `L` | Toggle loop |
| `[` / `]` | Set A-B loop start and end |

---

## 🏗 Architecture

```text
extension/
├── manifest.json                 # MV3 configuration
├── background.js                 # Service worker: state, policy, AI, windows, rules
├── content/
│   ├── player-detector.js        # Player discovery
│   ├── player-enhancer.js        # Player controls and popup entry
│   ├── player-controls.js        # Keyboard shortcut handling
│   ├── player-sync.js            # Source-tab and popup-player sync
│   ├── overlay-remover.js        # Overlay and click-blocking cleanup
│   ├── direct-popup-overlay.js   # Falcon-owned UI overlay marker path
│   ├── cosmetic-filter.js        # Conservative CSS cleanup
│   ├── anti-popup.js             # Popup guard
│   ├── anti-antiblock.js         # MAIN-world player-site repair
│   ├── inject-blocker.js         # Script injection guard
│   ├── element-picker.js         # Manual blocking rule picker
│   └── ai-runtime.js             # AI runtime bridge
├── popup/                        # Browser action popup and side-panel shell
├── popup-player/                 # Distraction-free player window
├── dashboard/                    # Settings, AI provider profiles, rescue tools
├── rules/                        # DNR rules, site registry, ad domain list
├── sandbox/                      # Sandboxed helper page
├── security/                     # URL and threat helpers
└── shared/                       # Shared helpers
```

### Module Overview

| Module | World | Role |
|---|---|---|
| `background.js` | Service Worker | State persistence, DNR updates, AI policy, candidate review, false-positive records |
| `player-detector.js` | ISOLATED | Finds players and assigns stable target IDs |
| `player-enhancer.js` | ISOLATED | Adds Falcon controls while marking Falcon-owned UI as internal |
| `overlay-remover.js` | ISOLATED | Records reversible overlay actions before hiding or disabling interference |
| `cosmetic-filter.js` | ISOLATED | Applies conservative CSS rules and honors rescued elements |
| `anti-popup.js` | ISOLATED | Blocks suspicious popup flows while preserving legitimate dialogs |
| `anti-antiblock.js` | MAIN | Repairs player-page compatibility where page scripts must be intercepted |
| `dashboard.js` | Extension page | Configures providers, candidates, blocked elements, rescue controls, and site lists |

### Message Flow

```text
Content scripts
  -> background.js: playerDetected, statsUpdate, recordFalconAction
  -> popup/dashboard: status, rescue records, candidates

popup.js / dashboard.js
  -> background.js: controlCommand, provider settings, scan rescue, promote candidate
  -> content scripts: restore action, preview action, refresh rescue state

AI provider
  -> background.js: advisory or generated candidates
  -> Policy Gate: reversible action or review queue
```

---

## 🧪 Development

### High-Signal Checks

```bash
node --check extension/background.js
node --check extension/dashboard/dashboard.js

npm run test:ai:element-classification
npm run test:ai:element-classification:behavior
npm run test:ai:chrome-builtin-element
npm run test:ai:provider-profiles
npm run test:ai:candidate-promotion
npm run test:interaction-safety
npm run test:popup:smoke
```

### Utility Commands

```bash
npm run docs:screenshots          # Regenerate README and guide screenshots
npm run check:lmstudio            # Check local LM Studio endpoint
npm run check:gateway             # Check custom gateway endpoint
npm run browser:workflow          # Run the local browser workflow helper
```

### Tech Stack

| Area | Stack |
|---|---|
| **Platform** | Chrome Extension Manifest V3 |
| **Extension APIs** | declarativeNetRequest, scripting, storage, tabs, sidePanel, windows, webNavigation |
| **Languages** | JavaScript, HTML, CSS |
| **AI Providers** | OpenAI, Gemini, LM Studio, Chrome Built-in AI, custom gateway |
| **Tests** | Node.js checks, Python regression harnesses, Playwright-backed browser workflows |

---

## 📄 Documentation

| Document | Description |
|---|---|
| [INSTALL.md](INSTALL.md) | Installation and provider setup |
| [FEATURE_GUIDE.zh-TW.md](docs/FEATURE_GUIDE.zh-TW.md) | Complete feature guide with screenshots |
| [AI_CAPABILITY_BOUNDARY.zh-TW.md](docs/AI_CAPABILITY_BOUNDARY.zh-TW.md) | AI capability boundaries and runtime authority |
| [AI_POLICY_GATE_PARAMETERS.zh-TW.md](docs/AI_POLICY_GATE_PARAMETERS.zh-TW.md) | Policy Gate tiers and parameters |
| [BLOCKED_ELEMENTS_FEATURE.zh-TW.md](docs/BLOCKED_ELEMENTS_FEATURE.zh-TW.md) | Custom blocked-elements workflow |
| [PROTECTION_STATUS_CONTRACT_2026-04-25.zh-TW.md](docs/PROTECTION_STATUS_CONTRACT_2026-04-25.zh-TW.md) | Protection status contract |
| [LIVE_BROWSER_SAFE_TESTING.zh-TW.md](docs/LIVE_BROWSER_SAFE_TESTING.zh-TW.md) | Safe live-browser testing workflow |

Local planning notes, raw AI discussions, and implementation memos belong under `docs/local/`, `ai-private/`, `ai-discussion/`, or `local/`; those paths are not part of the publishable documentation surface.

---

## 🤝 Contributing

Contributions are welcome. Please open an issue first for behavior changes, provider integrations, or rules that may affect legitimate page interaction.

---

## 🤖 AI-Assisted Development

This project was developed with AI assistance.

| Model | Role |
|---|---|
| Gemini 2.5 Pro (Google DeepMind) | Initial feature planning and implementation review |
| Claude Opus 4.6 (Anthropic) | Architecture review, UI redesign, documentation review |
| OpenAI Codex | Repository maintenance, README rewrite, and pre-push verification support |

> ⚠️ **Disclaimer:** While the author has made every effort to review and validate the AI-generated code, no guarantee can be made regarding its correctness, security, or fitness for any particular purpose. Use at your own risk.

---

## 📜 License

[MIT License](LICENSE)
