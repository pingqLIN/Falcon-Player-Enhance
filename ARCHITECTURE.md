# Architecture Flow Diagrams

## 1. Popup Player Opening Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User Action: Click 🎬 Button on Video Player                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────────────┐
    │ player-enhancer.js: openPopupPlayer()             │
    │ - Extract video/iframe source                     │
    │ - Generate unique window ID                       │
    │   (popup-player-{timestamp}-{random})             │
    └───────────────────┬───────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────────────────────┐
    │ chrome.runtime.sendMessage({                      │
    │   action: 'openPopupPlayer',                      │
    │   windowId: windowId,                             │
    │   videoSrc: ...,                                  │
    │   iframeSrc: ...                                  │
    │ })                                                │
    └───────────────────┬───────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────────────────────┐
    │ background.js: Message Handler                    │
    │ - Receive message                                 │
    │ - Build popup URL with parameters                 │
    └───────────────────┬───────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────────────────────┐
    │ chrome.windows.create({                           │
    │   url: popup-player.html?params,                  │
    │   type: 'popup',                                  │
    │   width: 1280,                                    │
    │   height: 720                                     │
    │ })                                                │
    └───────────────────┬───────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────────────────────┐
    │ New Popup Window Opens                            │
    │ popup-player.js: init()                           │
    │ - Extract parameters from URL                     │
    │ - Store unique window instance ID                 │
    │ - Create video or iframe player                   │
    │ - Setup cleanup handlers                          │
    └───────────────────────────────────────────────────┘
```

## 2. Whitelist Check Flow (Defense Bypass)

```
┌─────────────────────────────────────────────────────────────────┐
│ User Interaction (click, mousedown, etc.)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────────────┐
    │ inject-blocker.js: Event Intercepted              │
    │ (DEFENSE #11, #19, or others)                     │
    └───────────────────┬───────────────────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────────────────────┐
    │ isInternalElement(target)                         │
    │ Check:                                            │
    │ 1. Class starts with "shield-"?                   │
    │ 2. data-shield-internal="true"?                   │
    │ 3. Parent element (up to 10 levels)?              │
    └───────────────────┬───────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          │                           │
        YES                          NO
          │                           │
          ▼                           ▼
    ┌─────────────┐           ┌─────────────────┐
    │ ALLOW       │           │ CONTINUE WITH   │
    │ Bypass all  │           │ DEFENSE CHECKS  │
    │ defenses    │           │ (block if sus)  │
    └─────────────┘           └─────────────────┘
```

## 3. Multiple Windows Management

```
┌─────────────────────────────────────────────────────────────────┐
│ Page with Multiple Video Players                               │
│ ┌────────┐  ┌────────┐  ┌────────┐                            │
│ │Video 1 │  │Video 2 │  │Video 3 │                            │
│ │  🎬    │  │  🎬    │  │  🎬    │                            │
│ └────────┘  └────────┘  └────────┘                            │
└─────────────────────────────────────────────────────────────────┘
       │             │             │
       │ Click       │ Click       │ Click
       │             │             │
       ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Window 1 │  │ Window 2 │  │ Window 3 │
│          │  │          │  │          │
│ ID:      │  │ ID:      │  │ ID:      │
│ popup-   │  │ popup-   │  │ popup-   │
│ player-  │  │ player-  │  │ player-  │
│ 123-abc  │  │ 124-def  │  │ 125-ghi  │
│          │  │          │  │          │
│ [Video]  │  │ [Video]  │  │ [Video]  │
│ Playing  │  │ Playing  │  │ Playing  │
└──────────┘  └──────────┘  └──────────┘
     │             │             │
     │ Independent │ Independent │
     │ Can close   │ Can close   │
     │ without     │ without     │
     │ affecting   │ affecting   │
     │ others      │ others      │
     ▼             ▼             ▼
```

## 4. Defense Mechanisms with Whitelist

```
┌─────────────────────────────────────────────────────────────────┐
│ ALL REQUESTS (window.open, clicks, events, etc.)                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
    ┌────────────────────────────────────────────────┐
    │ Is this a chrome-extension:// URL?             │
    └───────────┬────────────────────┬───────────────┘
                │ YES                │ NO
                ▼                    ▼
    ┌──────────────────┐   ┌─────────────────────────┐
    │ ALLOW            │   │ Is element internal?    │
    │ (Extension URL)  │   │ (shield-* class)        │
    └──────────────────┘   └────┬────────────────┬───┘
                                │ YES            │ NO
                                ▼                ▼
                    ┌──────────────────┐   ┌─────────────┐
                    │ ALLOW            │   │ Run         │
                    │ (Internal elem)  │   │ Defense     │
                    └──────────────────┘   │ Checks      │
                                           └──────┬──────┘
                                                  │
                                     ┌────────────┴────────────┐
                                     │                         │
                                  Blocked                   Allowed
                                     │                         │
                                     ▼                         ▼
                        ┌──────────────────┐      ┌──────────────────┐
                        │ BLOCK            │      │ ALLOW            │
                        │ - Malicious URL  │      │ - Safe content   │
                        │ - Clickjacking   │      │ - User action    │
                        │ - Popup attack   │      │                  │
                        └──────────────────┘      └──────────────────┘
```

## 5. Component Interaction Map

```
┌──────────────────────────────────────────────────────────────────┐
│                         Web Page                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ player-detector.js                                      │     │
│  │ Detects video/iframe players                           │     │
│  └─────────┬──────────────────────────────────────────────┘     │
│            │ fires 'playersDetected' event                       │
│            ▼                                                      │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ player-enhancer.js                                      │     │
│  │ - Adds 🎬 button (marked as shield-internal)           │     │
│  │ - Handles button click                                  │     │
│  │ - Sends message to background                           │     │
│  └─────────┬──────────────────────────────────────────────┘     │
│            │                                                      │
└────────────┼──────────────────────────────────────────────────────┘
             │ chrome.runtime.sendMessage
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    background.js                                 │
│  - Receives 'openPopupPlayer' message                            │
│  - Creates new window with chrome.windows.create()              │
└────────────┬─────────────────────────────────────────────────────┘
             │
             ▼ Opens new window
┌──────────────────────────────────────────────────────────────────┐
│                  Popup Player Window                             │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ popup-player.html + popup-player.js                    │     │
│  │ - Loads video from URL params                          │     │
│  │ - Stores unique instance ID                            │     │
│  │ - Independent playback                                 │     │
│  └────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘

    Protection Layer (Runs on all pages)
    ┌──────────────────────────────────────────────────────┐
    │ inject-blocker.js (MAIN world)                       │
    │ - Intercepts window.open, clicks, events             │
    │ - Checks isInternalElement() before blocking         │
    │ - Allows chrome-extension:// URLs                    │
    └──────────────────────────────────────────────────────┘
    ┌──────────────────────────────────────────────────────┐
    │ anti-popup.js                                        │
    │ - Blocks document-level events                       │
    │ - Whitelists shield-* elements                       │
    └──────────────────────────────────────────────────────┘
```

## Key Features

### ✅ Whitelist Scope
- Only elements with `.shield-*` class prefix
- Or elements with `data-shield-internal="true"`
- Or children of above elements (up to 10 levels)
- ⚡ Performance: Limited depth prevents slowdown

### ✅ Security Maintained
- All external popups still blocked
- Clickjacking detection still active
- Only extension's own UI bypasses defenses
- CodeQL verified: 0 security alerts

### ✅ Multi-Window Support
- Each window has unique ID
- Windows operate independently
- Can open multiple simultaneously
- Closing one doesn't affect others

### ✅ Fallback Mechanism
- Primary: chrome.windows.create() via background
- Fallback 1: Direct window.open() with extension URL
- Fallback 2: Direct video URL in new tab
- Ensures functionality even if messaging fails
