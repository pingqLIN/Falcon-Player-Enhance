# Falcon-Player-Enhance — UI/UX Design Review

> Review Date: 2026-03-19
> Branch: `claude/bold-gagarin`
> Scope: Popup UI, Dashboard UI, Design System Consistency, Interaction States, Accessibility
> Method: /plan-design-review (Designer's Eye Plan Review)
> [繁體中文版](DESIGN_REVIEW.zh-TW.md)

---

## Pre-Review System Audit

| Item | Status |
|------|--------|
| DESIGN.md | ❌ Does not exist (design system documented only in a CSS comment) |
| Design System Name | `Three-Gray Achromatic Design System` (popup.css line 1) |
| Theme Support | ✅ Light / Dark, supports `prefers-color-scheme` |
| Font Stack | `-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto` |
| Base Font Size | `12px` (⚠️ below accessibility recommendations) |
| Popup Width | Fixed `300px` (expands to 100% in pinned mode) |
| Color System | Achromatic — grayscale only (`#F5F5F5` / `#333` / `#999`) |
| Internationalization | ✅ i18n architecture, but hardcoded Chinese strings exist |

**UI Scope Confirmed:** Popup, Dashboard, Popup Player window — all reviewed.

---

## Step 0: Overall Design Score

> **Initial Score: 5/10**

The UI has a clear design language (achromatic system, three-tier gray) and some differentiated elements (3-step flow guide, AI Gate card), demonstrating design intent. Points deducted for:

- No DESIGN.md — design decisions are undocumented
- 12px base font size harms accessibility
- Multiple interaction states (empty, loading) are undefined
- AI Monitor panel has excessive information density and shows "(In development)" to all users
- Some emoji used as UI controls without text fallback

---

## Pass 1: Information Architecture

**Score: 5/10 → Target 8/10**

### Popup Structure (top to bottom)

```
┌─────────────────────────────────┐
│ Header (title / Pin / Theme / Toggle) │  ← Always visible, Sticky
├─────────────────────────────────┤
│ Flow Indicator (3-step guide)   │  ← Primary first-look visual ✅
├─────────────────────────────────┤
│ Control Hub (target lock / playback)  │  ← Core function area
├─────────────────────────────────┤
│ Level Panel (blocking level / whitelist) │  ← Settings, positioned too high
├─────────────────────────────────┤
│ Stats Grid (4 counters)         │  ← Status info, positioned too low
├─────────────────────────────────┤
│ AI Monitor Panel (risk / Gate)  │  ← Advanced feature at bottom ✅
├─────────────────────────────────┤
│ Footer (element picker / shortcuts / settings) │  ← Toolbar
└─────────────────────────────────┘
```

### Issue: Level Panel and Stats Grid are in the wrong order

**Current:** Blocking level selector (settings item) appears above statistics (status info).  
**Problem:** Users open the popup primarily to "confirm protection status", not to adjust settings.  
**Recommended order:**
```
1. Flow Indicator (onboarding)
2. Control Hub (lock target / playback controls)
3. Stats Grid (protection status at a glance)
4. Level Panel (adjust only if needed)
5. AI Monitor (advanced users)
```

### Issue: AI Monitor has "(In development)" label but is visible to all users

All users see this panel, yet the label indicates the feature is under development. This:
- Creates trust doubts ("Is this reliable?")
- Creates information noise for new users

**Recommendation:** Add a Dashboard setting to show/hide the AI Monitor panel; default to hidden.

### Dashboard Sidebar Navigation

```
▶️ Player settings     ← Most used, first ✅
🌐 Domain list         ← Should be renamed more intuitively
➕ Enhanced sites      ← Unclear function name
🚫 Blocked elements    ← Clear ✅
🔒 Security settings   ← Too broad
```

**Issue:** "Enhanced sites" vs "Domain list" distinction is not intuitive for new users.  
**Recommendation:** Use more conversational labels like "My whitelist" / "Custom block rules".

---

## Pass 2: Interaction State Coverage

**Score: 4/10 → Target 8/10**

### State Matrix

| UI Feature | Loading | Empty State | Error | Success | Partial |
|------------|---------|-------------|-------|---------|---------|
| Player Chip List | ❓ Undefined | ❌ Not designed | ❓ | Chip component exists | ❓ |
| Stats Grid (0,0,0,0) | ❓ | ❌ All zeros looks broken | ❓ | Normal count | — |
| Flow Status text | ❓ | Shows "Click target player to lock" | ❓ | ❓ | ❓ |
| AI Risk Tier | — | Shows "LOW" / "0.00" | ❓ | — | — |
| AI Provider Status | — | Shows "offline" | ❓ | Shows "online" | — |
| Playback Controls | — | `locked-off` class (CSS hidden) | ❓ | — | — |

### Critical Empty State Issues

**Stats Grid initial state:**  
On first use, all 4 numbers are `0`. This communicates "nothing has happened", which may mean:
- Extension just installed (correct: nothing happened)
- User is on an unsupported site (should explicitly indicate this)
- Something is broken (looks like a bug)

**Recommendation:** First-use empty state should include a friendly guide, e.g., "Visit a video site to start protecting your player."

**Player Chip List empty state:**  
`#player-chip-list` has no fallback content when no players are detected.  
**Recommendation:** Add empty state with "No players detected on this page" + DETECT as the primary action.

**AI Gate Evidence empty state:**  
Current text is "No recent signals" as a chip — feels like data rather than an explanation.  
**Recommendation:** Use warmer copy: "This site looks clean so far."

---

## Pass 3: User Journey & Emotional Arc

**Score: 6/10 → Target 8/10**

### New User Journey

| Step | User Action | Emotion | Current Design Support |
|------|------------|---------|----------------------|
| 1 | First open popup after install | Curious — "Does this work?" | 🟡 Flow Indicator guides, but all-zero stats create doubt |
| 2 | Navigate to a video site | Anticipation | ✅ Auto-detects, no manual action needed |
| 3 | Ad overlay appears | Anxiety | 🔴 No real-time visual feedback that protection is processing |
| 4 | Ad removed | Satisfaction | 🟡 Stats increment, but only visible when popup is opened |
| 5 | Want to adjust settings | Exploration | 🟡 Footer ⚙ is not prominent enough |

### Issue: Flow Indicator lifecycle is undefined

The 3-step guide (CLICK → DETECT → PLAY) is excellent for new user education, but:
- Does it show permanently, or disappear after the user completes the flow?
- Should it transition to a "status display" mode once a player is locked?

**Recommendation:** Define the guide's state machine:
```
Initial: Show 3-step guide (animated pulse)
After lock: Collapse/hide, giving space to Control Hub
On unlock: Re-expand
```

### Issue: 5-second First Impression (Visceral Design)

First glance at the popup: shield 🛡️ + "Falcon-Player-Enhance" + Pin/Theme/Toggle.  
Problem: "Falcon-Player-Enhance" is a technical product name, not user language.

**Recommendation:** Add a one-liner positioning sub-title, e.g.:  
`Falcon-Player-Enhance` → tagline: `Clean video. No interference.`

---

## Pass 4: AI Slop Risk

**Score: 7/10 (relatively strong)**

### Differentiated Design Elements (Keep These)

- ✅ **3-step Flow Guide**: Has animated wire-pulse effects — not a generic card grid
- ✅ **AI Gate Card**: Tier badge (T1/T2) + mode + reason + evidence chip — unique UI language for this product
- ✅ **Player Chip List**: Lock-target concept is meaningful for the video player use case
- ✅ **A-B Loop Buttons**: Highly specific to video playback

### Generic Elements to Improve

- 🟡 **Stats Grid (4 numbers)**: Common dashboard pattern, but acceptable at 300px width
- 🟡 **Blocking level `<select>` dropdown**: Feels dated compared to the rest of the UI; consider a segmented control (`0 | 1 | 2 | 3`)
- 🔴 **Dashboard settings list**: `setting-item` + `status-badge` combination is a completely generic settings page pattern with no personality
- 🔴 **Emoji as icons**: 🛡️ 📌 ⚙ 🚫 🔒 ▶️ render differently across OS and cannot be precisely controlled for visual consistency

### Emoji Icon Replacement Recommendations

| Current | Problem | Recommended Alternative |
|---------|---------|------------------------|
| 🛡️ Title icon | OS rendering varies | SVG icon (icon.svg already exists) |
| ⚙ Settings button | Not accessible without text label | SVG + `aria-label` |
| 📌/📍 Pin button | Semantics unclear | SVG + tooltip |
| ▶️ 🌐 ➕ 🚫 🔒 (sidebar) | Emoji rendering unstable | Consistent SVG icon set |

---

## Pass 5: Design System Alignment

**Score: 4/10 → Target 7/10**

### Inferred Design System (from CSS)

| Item | Current | Issue |
|------|---------|-------|
| Colors | `#F5F5F5` / `#FFFFFF` / `#333` / `#999` / `#E0E0E0` | ✅ Complete grayscale system |
| Font | System font stack | ✅ Reasonable, no external dependencies |
| Base font size | `12px` | ❌ Below recommended minimum (16px) |
| Spacing | No explicit spacing scale | ❌ Scattered across individual CSS rules |
| Border radius | `26px` (toggle), `50%` (buttons) | 🟡 Inconsistent |
| Shadow | `0 2px 4px rgba(0,0,0,0.2)` (toggle) | 🟡 Not defined as a token |
| Animation duration | `0.15s` (hover), `0.3s` (toggle) | 🟡 Not unified as tokens |

### Fatal Gap: No DESIGN.md

The design system specification exists only as `/* Shield Pro v4.0 — Three-Gray Achromatic Design System */` in a CSS comment, with no:
- Complete token list
- Component library list
- Design decision record (why achromatic?)
- Naming conventions for new components

**Recommendation:** Create a minimum viable DESIGN.md covering color tokens, type scale, and spacing scale.

### Mixed Design Languages

Popup and dashboard use partially overlapping but inconsistent class naming:
- Popup uses `rescan-btn`; dashboard uses different classes for similar functionality
- Popup has `toggle-switch-sm`; dashboard has its own toggle variant

---

## Pass 6: Responsive & Accessibility

**Score: 4/10 → Target 7/10**

### Responsive

| Context | Current Status |
|---------|---------------|
| Popup mode (300px) | ✅ Fixed width, appropriate |
| Side Panel mode (pinned) | ✅ `body.pinned-mode` switches to `width: 100%` |
| Dashboard (full page) | 🟡 Sidebar + content area; behavior on narrow viewports unconfirmed |
| Popup Player window (1280×720) | ❓ Not reviewed |

### Accessibility Issues

#### 🔴 High Priority: Base Font Size 12px

WCAG 2.1 SC 1.4.4 requires text to be resizable to 200%, but 12px base is already small in many user configurations. Chrome Extension popups should use a minimum of `13px`, ideally `14px`.

#### 🔴 High Priority: Shortcuts Popover Only Triggers on Hover

```html
<div class="shortcuts-reference" title="Shortcuts and controls overview">
    <div class="shortcuts-summary">...</div>
    <div class="shortcuts-popover" id="shortcuts-popover">...</div>
</div>
```

Only mouse hover reveals the shortcuts popover — keyboard users cannot access the complete shortcut list.  
**Recommendation:** Change to click/focus trigger, or provide a "View all shortcuts" button.

#### 🔴 High Priority: Emoji Buttons Lack Accessible Text

```html
<button class="footer-small-btn" id="btn-pick-element" title="Enable element blocking mode">
    🚫
</button>
```

The `title` attribute is unreliable on touch devices and some screen readers.  
**Recommendation:** Use `aria-label` instead (already used on some components — needs to be consistent).

#### 🟡 Medium Priority: Toggle State Communication

The whitelist mode toggle has only visual styling with no text indicating current state (on/off).  
**Recommendation:** Add dynamic `aria-label`, e.g., `"Whitelist-only mode: Enabled"`.

#### 🟡 Medium Priority: Focus Order Not Designed

No `tabindex` strategy in popup HTML — focus may jump visually when using Tab key.

#### 🟡 Medium Priority: Color Contrast Verification

The achromatic system generally provides good contrast, but verify:
- `--text-secondary: #999` on `--bg-card: #FFFFFF`: ~2.85:1 (❌ below WCAG AA 4.5:1)
- Small text (12px) requires even higher contrast ratios

#### Touch Target Sizes

| Component | Estimated Size | WCAG Recommendation |
|-----------|---------------|---------------------|
| Theme toggle button | `28px × 28px` | ⚠️ Below 44px |
| Footer small buttons | Unknown | ❓ Needs verification |
| Toggle-sm | `36px × 20px` | ❌ Height below 44px |

---

## Pass 7: Unresolved Design Decisions

| Decision | If Deferred, What Happens |
|----------|--------------------------|
| What does Stats Grid show when empty (all zeros)? | Engineers leave `0`; looks like a bug |
| What text appears in Player Chip List empty state? | Blank area — user doesn't know next step |
| Does Flow Indicator collapse after player is locked? | Permanently occupies space, squeezing Control Hub |
| Is AI Monitor panel hidden by default? | All users see "(In development)" label |
| Should shortcuts popover become click-triggered? | Keyboard users cannot access shortcut list |
| Is `白名單保護模式` hardcoded Chinese to be i18n'd? | Chinese appears in English UI; brand inconsistency |
| What distinguishes Dashboard "Domain list" vs "Enhanced sites"? | New users don't know the difference |
| Should emoji icons be replaced with SVG? | Cross-OS rendering inconsistency |
| Should base font increase from 12px to 13–14px? | Accessibility non-compliance |

---

## Not in Scope

| Item | Reason |
|------|--------|
| Popup Player window design | Separate window; should be reviewed independently |
| Animation effect details (wire-pulse) | Already implemented; not this review's focus |
| Dashboard individual tab content details | Needs a dedicated Dashboard design review |
| Extension icon design | icon.svg already exists; not this review's focus |

---

## Reusable Design Elements

| Element | Location | Reuse Recommendation |
|---------|----------|---------------------|
| Toggle Switch | popup.css | ✅ Already consistent; use in dashboard too |
| Three-tier gray color system | popup.css CSS variables | ✅ Should be elevated to DESIGN.md |
| AI Gate Card visual language | popup.html | ✅ Distinctive — keep |
| Flow Indicator component | popup.html | 🟡 Consider extracting as reusable component |
| rescan-btn style | popup.css | 🟡 Naming inconsistent between popup/dashboard |

---

## Recommended TODOs

### P0 — Accessibility Fixes (Immediate)

1. **Fix `#999` insufficient contrast**  
   `--text-secondary` against white background is 2.85:1 — below WCAG AA.  
   Recommend changing to `#767676` (contrast ratio 4.54:1).

2. **Change shortcuts popover to click/focus trigger**  
   Currently hover-only; keyboard users cannot access the full shortcut list.

3. **Add `aria-label` to all emoji buttons**  
   `🚫 📌 ⚙` buttons need explicit accessible labels.

4. **Increase base font from 12px to 13px**  
   Minimum accessibility improvement.

### P1 — Empty States & Status Design

5. **Design Player Chip List empty state**  
   Add description text + DETECT as primary action.

6. **Design Stats Grid first-use state**  
   Differentiate between "all zeros (no protection events yet)" and "all zeros (feature inactive)."

7. **Define Flow Indicator state machine**  
   Clearly specify when the guide collapses/expands.

### P2 — Design System

8. **Create DESIGN.md**  
   Minimum content: color token list, type scale, spacing scale, emoji vs SVG usage rules.

9. **Complete i18n coverage**  
   Replace hardcoded Chinese strings (`白名單保護模式`, etc.) with i18n keys.

10. **Add show/hide setting for AI Monitor panel**  
    Provide toggle in Dashboard to reduce cognitive load for new users.

---

## Completion Summary

```
+====================================================================+
|           DESIGN PLAN REVIEW — COMPLETION SUMMARY                  |
+====================================================================+
| System Audit         | No DESIGN.md; design system in CSS comment  |
| Step 0               | 5/10: empty states, accessibility, AI panel |
| Pass 1  (Info Arch)  | 5/10 → 8/10 (suggest Stats/Level reorder)  |
| Pass 2  (States)     | 4/10 → 8/10 (empty states undefined)        |
| Pass 3  (Journey)    | 6/10 → 8/10 (Flow Indicator lifecycle)      |
| Pass 4  (AI Slop)    | 7/10 (Gate Card is a differentiated asset)  |
| Pass 5  (Design Sys) | 4/10 → 7/10 (needs DESIGN.md)              |
| Pass 6  (Responsive) | 4/10 → 7/10 (12px + hover-only issues)     |
| Pass 7  (Decisions)  | 9 open decisions — all documented           |
+--------------------------------------------------------------------+
| Not in scope         | 4 items (listed above)                      |
| Reusable elements    | Toggle, color system, AI Gate Card          |
| Recommended TODOs    | 10 items (P0×4, P1×3, P2×3)               |
| Open decisions added | 9 (pending developer confirmation)          |
| Overall Design Score | 5/10 → est. 7.5/10 after recommendations    |
+====================================================================+
```

> **Conclusion:** The UI has clear intent and differentiated elements, but needs improvement in three areas: empty state design, accessibility fundamentals, and design system documentation. Recommend implementing P0 accessibility fixes before running `/design-review` for a live visual QA pass.

---

*This report was auto-generated by GitHub Copilot CLI (Claude Sonnet 4.6). Conclusions should be validated by the developer before adoption.*
