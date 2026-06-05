# Feature Guide

This is the English feature map for the current Falcon-Player-Enhance build. The detailed Traditional Chinese walkthrough with screenshots is maintained in [FEATURE_GUIDE.zh-TW.md](FEATURE_GUIDE.zh-TW.md).

## User Surfaces

| Surface | Features |
|---|---|
| Popup / side panel | Player detection, player lock, scan page, false-positive rescue, AI monitor, generated candidates, quick controls, block level, and shortcuts |
| Popup player | Independent playback window, source sync, playback controls, visual adjustments, theme toggle, PiP, fullscreen, screenshot, loop and A-B loop |
| Dashboard | Overview stats, site lists, AI provider profiles, Policy Gate controls, candidate review/promotion/rollback, blocked elements, data reset/export, and advanced runtime state |

## Protection Features

| Feature | What It Does | Main Files |
|---|---|---|
| Player detection | Finds HTML5 video, iframe players, and custom embedded player surfaces | `player-detector.js`, `player-enhancer.js` |
| Overlay cleanup | Removes or disables player-adjacent overlays while recording reversible actions | `overlay-remover.js`, `inject-blocker.js` |
| Fake video cleanup | Detects decoy video-like elements that steal clicks or hide the real player | `fake-video-remover.js` |
| Popup guard | Blocks suspicious spawned tabs and popup traps from managed player pages | `anti-popup.js`, `inject-blocker.js`, `background.js` |
| Redirect guard | Recovers suspicious same-tab external redirects after player interaction | `inject-blocker.js`, `background.js` |
| Anti-anti-adblock repair | Applies MAIN-world compatibility shims for hostile player pages | `anti-antiblock.js`, `embedded-player-anti-detect.js` |
| Cosmetic cleanup | Applies conservative CSS cleanup without becoming a page-wide list blocker | `cosmetic-filter.js` |
| Site state bridge | Shares site state between MAIN-world repairs and isolated content scripts | `site-state-bridge.js`, `site-state-helper.js` |

## Recovery and Governance

| Feature | What It Does |
|---|---|
| False-positive scan | Finds Falcon actions that can be previewed or restored on the current page |
| Preview restore | Temporarily shows hidden elements or restores clickability for inspection |
| Restore once | Reverses one action for the current page session |
| Report false positive | Records negative evidence so matching AI candidates cannot be promoted silently |
| Candidate review | Lets users accept or reject generated host candidate sets |
| Candidate promotion | Converts accepted candidates into confirmed patterns behind governance logs |
| Candidate rollback | Deactivates promoted patterns and links rollback evidence to the original promotion |

## AI and Provider Features

| Feature | What It Does |
|---|---|
| Provider profiles | Supports OpenAI, Gemini, LM Studio, Chrome Built-in AI, and gateway profiles |
| Provider privacy | Stores secrets separately from persisted non-secret profile defaults |
| Advisory mode | Lets AI summarize risk without authorizing runtime mutation |
| Hybrid mode | Allows reversible T2 actions when Policy Gate thresholds permit them |
| Dynamic candidates | Produces selector/domain candidates for review instead of direct durable mutation |
| Policy Gate | Keeps runtime AI reversible and blocks durable rule changes inside extension runtime |

For advanced setup, see [ADVANCED_AI_POLICY_GUIDE.md](ADVANCED_AI_POLICY_GUIDE.md).
