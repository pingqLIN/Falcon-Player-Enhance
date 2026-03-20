# Falcon-Player-Enhance Design System

> Primary surfaces: popup, pinned side panel, dashboard
> Status: active working baseline for v4.4

## Summary

Falcon-Player-Enhance uses a restrained achromatic interface with a small set of emphasis colors for state and risk. The product should feel calm, technical, and focused on playback safety rather than flashy dashboard chrome.

## Tokens

### Color

Light mode:

- `--bg-primary`: `#F5F5F5`
- `--bg-card`: `#FFFFFF`
- `--bg-sidebar`: `#F0F0F0`
- `--text-primary`: `#333333`
- `--text-secondary`: `#767676`
- `--separator`: `#E0E0E0`

Dark mode:

- `--bg-primary`: `#1A1A1A`
- `--bg-card`: `#252525`
- `--bg-sidebar`: `#202020`
- `--text-primary`: `#E5E5E5`
- `--text-secondary`: `#B0B0B0`
- `--separator`: `#444444`

State accents:

- Success / safe: green family already used by AI tier and locked states
- Warning / fallback: amber family
- Risk / destructive: red family

### Type

- Base UI size: `13px`
- Dense support text: `10px` to `11px`
- Section labels: uppercase `11px` to `12px`
- Main title: `15px`
- Large numeric stats: `16px` to `28px`

## Spacing

Use a compact spacing scale:

- `4px`: micro gaps, chip padding
- `6px`: inline gaps
- `8px`: dense section spacing
- `10px`: popup panel padding
- `12px`: card padding / section gutters
- `16px`: dashboard card spacing

## Component Rules

- Popup order: Flow Indicator, Control Hub, Stats, Level, AI Monitor.
- Empty states must explain what is happening and what the next action is.
- Advanced AI details are hidden by default in popup and shown on demand.
- Shortcut help must be keyboard reachable and not rely on hover alone.
- Toggle controls must expose `aria-label` that reflects current state.

## Icons

- Existing emoji controls are tolerated for now, but every icon-only control must have an explicit `aria-label`.
- New reusable UI icons should prefer SVG over emoji when consistency matters across platforms.
- Brand naming in UI, comments, and design references should use `Falcon-Player-Enhance`.

## Reuse Guidance

- Popup and dashboard should share wording for protection states, enhanced-site terminology, and AI monitor language.
- New settings rows should follow the existing `setting-item` pattern unless a control is primary enough to deserve a dedicated card.
- Do not introduce new color families unless they encode product state, risk, or destructive action.
