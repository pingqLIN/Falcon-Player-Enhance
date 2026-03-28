# TODOS

## Engineering Review

### Continue site-specific runtime extraction from mainline scripts

**What:** Continue moving permanent site-specific runtime decisions out of `inject-blocker.js`, `player-enhancer.js`, and `anti-antiblock.js` into `site-behaviors.json` and shared profile helpers.

**Why:** This is the highest-leverage architecture cleanup still open on the mainline. The current branch already removed local compatibility host lists from `inject-blocker.js` and `player-enhancer.js`, improved malicious URL token matching precision, and switched `anti-antiblock.js` to profile-driven strategy dispatch. The remaining work is strategy decomposition and data migration, not more one-off site branches.

**Context:** The current state is better than before but still transitional. `handleJavboysPlayer()` remains a large JS strategy, redirect-trap knowledge still lives in runtime fallback constants, and some policy knowledge is still duplicated across rules and scripts. Future work should keep using the existing `site-profile.js` bridge rather than introducing new hardcoded host arrays.

**Effort:** L
**Priority:** P1
**Depends on:** Stable `site-profile.js` API, `site-behaviors.json` schema maintenance, and current core smoke coverage

### Expand popup-player verification from local fixtures to reviewed live targets

**What:** Extend the new repeatable popup-player / direct-popup verification path from local HTML fixtures into a small reviewed live-target regression pool.

**Why:** The branch now has deterministic fixture coverage via `tests/live-browser/test_popup_verification.py`, but that only proves the judge path and extension plumbing. We still need a compact real-site set to catch integration regressions in iframe, popup, and remote-control behavior.

**Context:** Use the existing live-browser target tooling and keep the pool small, low-noise, and explicitly documented. The goal is not broad crawling; it is high-signal regression protection for popup-player behavior.

**Effort:** M
**Priority:** P1
**Depends on:** Current fixture-based popup verification, reviewed target selection, and stable Playwright environment

### Verify the popup window itself, not just the source page

**What:** Add popup-window focused automated coverage for `popup-player.html` and direct-popup overlay click-through behavior.

**Why:** Current smoke and fixture checks prove the source page and judge pipeline, but they do not yet assert iframe-mode shield defaults, shortcut dispatch, direct-popup replay clicks, or restored popup UI state inside the popup window itself.

**Context:** The reviewed live-target pool now exists, and fixture coverage is in place. The next meaningful strengthening step is one browser test for popup-player bootstrap plus one interaction test for direct-popup overlay event replay.

**Effort:** M
**Priority:** P1
**Depends on:** Existing popup-player fixture tests, stable browser automation, and current popup-player UI contract

### Implement Windows-native provider secret storage

**What:** Replace the current per-provider persisted secret model with a Windows-native secret storage path such as DPAPI or a native-host bridge.

**Why:** The current provider split, draft retention, and autosave behavior are good UX foundations, but secrets are still only at the storage-model stage. This remains the main security hardening gap on the dashboard side.

**Context:** Keep the current UX contract intact: drafts should remain stable while editing, and secret commits should stay explicit. The implementation should improve secrecy without regressing provider switching, autosave, or recovery flows.

**Effort:** L
**Priority:** P1
**Depends on:** Final design choice between direct DPAPI integration and native-host architecture

### Harden provider secret lifecycle and trusted export surfaces

**What:** Close the remaining security gaps around provider-key revocation, trusted sender checks for AI exports, and documentation of current retention behavior.

**Why:** Keys are still durable in browser storage, empty submits do not clear secrets, and some AI insight/export handlers are not yet gated the same way as trusted settings paths.

**Context:** This is smaller than the full DPAPI/native-host project and can be advanced incrementally. The first safe tranche is explicit key removal, sender-gating for export endpoints, and clearer docs about current retention semantics.

**Effort:** M
**Priority:** P1
**Depends on:** Current dashboard persistence flow, background message routing, and the existing secret-handling guidelines

### Close the main-world forged policy message boundary

**What:** Prevent page scripts from using `postMessage` channels to lower blocking level, disable popup protection, or inject fake AI policy into the MAIN world bridge.

**Why:** The current `inject-blocker.js` / `ai-runtime.js` bridge accepts policy-bearing messages from the page window, which means a hostile site script can potentially weaken the extension's own protections from inside the protected page.

**Context:** This needs a real trust-boundary decision, not just another heuristic. The short-term goal is to stop downgrade-capable messages from being page-forgeable; the follow-up goal is to redesign MAIN world messaging so runtime policy changes come from a channel the page cannot spoof.

**Effort:** M
**Priority:** P1
**Depends on:** Current MAIN world bridge design, AI runtime dispatch path, and the existing protection-level / feature-settings flow

### Extract BoyfriendTV detector literals into rule-backed metadata

**What:** Move BoyfriendTV-specific detection literals out of the generic `player-detector.js` flow into a rule object or profile-backed metadata layer.

**Why:** The current detector still embeds hostname checks, inline-script parsing hints, container IDs, and ad-signature strings directly in generic detection logic, which keeps site support coupled to code edits.

**Context:** This should be a small safe extraction step, not a full detector rewrite. Start by centralizing the literals and making the existing parser consume that single rule object without changing behavior.

**Effort:** M
**Priority:** P2
**Depends on:** Stable `site-profile.js` / rule-loading conventions and the current player-detector regression behavior

### Add end-to-end verification for custom-site management and popup quick-add

**What:** Add real verification for `getCustomSites` / `addCustomSite` / `removeCustomSite` and the popup quick-add path now that background handlers exist.

**Why:** The feature is now wired end-to-end, but it still lacks dedicated automated coverage. Without that, future refactors could silently break dashboard custom-site management or popup quick-add again.

**Context:** The next safe step is not more UX work; it is verification. Prefer one focused background/core test for the domain-management flow and one UI/browser check for popup quick-add visibility and add/remove behavior.

**Effort:** M
**Priority:** P2
**Depends on:** Current background custom-site handlers, popup quick-add UI, and stable test harnesses

### Roll out formal documentation i18n entry points

**What:** Add the planned multilingual documentation set and place language entry links at the top of `README.md` using BCP 47-style filenames for docs.

**Why:** This is a clear user-facing deliverable already scoped earlier, and the naming strategy is settled. It should happen after the mainline runtime and secret-storage work is in a steadier place.

**Context:** Keep Chrome extension `_locales` naming untouched where Chrome requires `zh_TW`, but use documentation filenames like `README.zh-TW.md`, `README.zh-CN.md`, `README.ja.md`, `README.de.md`, `README.fr.md`, `README.es.md`, `README.ko.md`, and `README.it.md`.

**Effort:** L
**Priority:** P2
**Depends on:** Stable source documents, language-entry conventions, and dual-agent translation/review workflow

### Evaluate trust-aware scoring beyond enhanced hosts

**What:** Evaluate extending trust-aware scoring from `site-registry` enhanced hosts to basic protection hosts, likely in observe-only or limited-escalation mode first.

**Why:** This is the most natural coverage expansion after Milestone 1 proves that trust-aware protection, tab-local override, and preservation regressions are stable on the reviewed high-risk host set.

**Context:** Milestone 1 is intentionally constrained to enhanced hosts only so blast radius stays small while the new policy model settles. Once that rollout is stable, the next meaningful product question is whether broader sites should at least receive trust-aware scoring signals before any aggressive protections are enabled. Start by defining a low-risk rollout mode, the additional regression matrix, and the success criteria that would justify promotion beyond observe-only.

**Effort:** M
**Priority:** P3
**Depends on:** Milestone 1 trust-aware rollout, tab-local override coverage, and reviewed live-browser regressions

### Build a safe promotion pipeline for AI rule candidates

**What:** Build a reviewable promotion pipeline that takes AI-produced `candidateSelectors` and `candidateDomains` through replay validation and human approval before they become durable blocking rules.

**Why:** This is the most credible path from "AI helps tune policy" to "AI helps grow protection coverage" without letting noisy model output mutate runtime behavior unsafely.

**Context:** The repository already contains provider advisory flows, candidate fields, and supporting design notes, but Milestone 1 is intentionally focused on trust-aware protection, tab-local override, and regression safety. This follow-on work should define the stages for candidate generation, safety constraints, replay validation, approval UX, and eventual promotion into maintained rule sets. The goal is controlled learning, not automatic rule mutation.

**Effort:** L
**Priority:** P3
**Depends on:** Milestone 1 policy helper consolidation, replay regression stability, and durable review criteria for candidate quality

### Maintain a reviewed enhanced-host regression pool

**What:** Maintain a small, manually reviewed enhanced-host regression pool for live-browser smoke, tab-isolation, and preservation regressions.

**Why:** Milestone 1 now depends on real-browser checks for tab-local override isolation and preservation of age gates and core playback controls, so those checks need a stable target pool instead of ad hoc site selection.

**Context:** The repo already has target JSON files, bookmark import utilities, and a self-learning loop, but those artifacts vary in noise and review quality. This TODO is about curating a compact set of low-noise, high-signal hosts that are explicitly suitable for recurring regression use. Keep the pool small enough to stay maintainable, and document why each host belongs in the pool and what failure mode it is meant to catch.

**Effort:** M
**Priority:** P3
**Depends on:** Milestone 1 live-browser smoke flow, confirmed stable hosts, and preservation regression criteria

## Completed

- Added a rule-driven bridge into MAIN world by injecting `content/site-profile.js` before `anti-antiblock.js` and `inject-blocker.js`.
- Removed local compatibility host lists from `inject-blocker.js` and `player-enhancer.js` in favor of profile-driven capabilities.
- Improved `inject-blocker.js` malicious URL detection from broad substring matching toward boundary-aware token matching.
- Switched `anti-antiblock.js` from naked hostname dispatch to profile-driven anti-antiblock strategy selection, while keeping the large JS strategy implementation intact for now.
- Wired `anti-antiblock.js` to start consuming profile-provided `fakeGlobals`, `suppressErrors`, and `errorSelectors` as part of the current strategy boundary.
- Added repeatable popup-player / direct-popup smoke verification under `tests/live-browser/`.
