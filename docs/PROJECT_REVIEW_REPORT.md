# Falcon-Player-Enhance — Project Review Report

> Review Date: 2026-03-19
> Version: v4.4.0
> Scope: Architecture, Code Quality, Security, AI Integration, Testing Strategy, Distribution Feasibility
> [繁體中文版](PROJECT_REVIEW_REPORT.zh-TW.md)

---

## Table of Contents

1. [Strengths](#1-strengths)
2. [Goal & Process Assessment](#2-goal--process-assessment)
3. [Technology Assessment](#3-technology-assessment)
4. [Implementation Evaluation](#4-implementation-evaluation)
5. [Risk & Contingency Analysis](#5-risk--contingency-analysis)
6. [Overall Recommendations](#6-overall-recommendations)

---

## 1. Strengths

### 1.1 Clear Product Differentiation

Narrowing scope from "general ad blocker + player enhancer" to "player protection specialist" — while delegating general ad blocking to uBlock Origin Lite — is a strategically sound differentiation that avoids head-on competition with large open-source projects.

### 1.2 Well-Designed AI Safety Guardrails

The Policy Gate (T0–T3) tier system is rigorously designed: AI is explicitly prohibited from directly manipulating the DOM. All AI output must pass through a `Policy Compiler` for validation. Mechanisms like `forceSandbox`, TTL, and host fallback demonstrate serious attention to security boundaries.

### 1.3 Comprehensive Architecture Documentation

Flow diagrams (ARCHITECTURE.md), AI design specs (.AI_ENHANCEMENT_ARCHITECTURE.md), API contract (.AI_MODEL_GATEWAY_API_CONTRACT.md), and Schema (.AI_POLICY_SCHEMA_V1.json) are all well documented with clear architectural intent.

### 1.4 Sensible Whitelist Mechanism

Using the `shield-*` class prefix and `data-shield-internal` attribute as internal element identifiers, with a 10-level parent traversal depth cap, strikes a reasonable balance between functionality and performance.

### 1.5 Popup Player Graceful Degradation

Three-tier fallback (`chrome.windows.create` → `window.open(extension URL)` → direct tab) ensures functionality even when message passing fails.

---

## 2. Goal & Process Assessment

### 2.1 Brand Naming Inconsistency 🔴 High Priority

| Location | Name Used |
|----------|-----------|
| `README.md`, `manifest.json` | Falcon-Player-Enhance |
| `background.js` code | APP_BRAND = `'Falcon-Player-Enhance'` |
| `inject-blocker.js` comments | Falcon-Player-Enhance |
| `ai-runtime.js` header | Falcon-Player-Enhance |
| `.DEVELOPMENT_PLAN.md` | Falcon-Player-Enhance 重構 |
| `POLICY-GATE.md` | Falcon-Player-Enhance |

**Problem:** Internal code and external documentation use different brand names, indicating the refactoring is incomplete and creating maintenance confusion.

**Recommendation:** Standardize on `Falcon-Player-Enhance` and replace all `Falcon-Player-Enhance` strings throughout the codebase.

### 2.2 Unclear Refactoring Status 🟡 Medium Priority

`.DEVELOPMENT_PLAN.md` lists Phases 1–4 but actual completion status is ambiguous. `player-controls.js` and `player-sync.js` already exist (originally planned as Phase 4 additions), suggesting partial completion without plan document updates.

**Recommendation:** Update DEVELOPMENT_PLAN.md to mark each phase's actual completion status, or replace with a current-state document.

### 2.3 Competing Architecture Proposals Unresolved 🟡 Medium Priority

The project contains three simultaneous architecture documents:
- `ARCHITECTURE.md` (current)
- `ARCHITECTURE-PROPOSAL.md` (three-tier)
- `ARCHITECTURE-ALTERNATIVE.md` (Probe-First)

All three exist without a recorded decision, causing confusion for new contributors and signaling an undecided architectural direction.

**Recommendation:** Select one direction and mark others as "evaluated but not adopted" historical records.

---

## 3. Technology Assessment

### 3.1 Chrome Web Store Distribution Risk 🔴 High Priority

#### 3.1.1 Adult Content Domains Hardcoded in Source

`background.js`'s `SITE_REGISTRY.domains` explicitly includes:
```
javboys.com, missav.com, supjav.com, thisav.com, jable.tv, avgle.com,
netflav.com, pornhub.com, xvideos.com, xhamster.com, redtube.com,
youporn.com, spankbang.com, eporner.com...
```

Chrome Web Store policy prohibits extensions primarily targeting adult content sites. This list creates high risk of review rejection.

**Recommendation:** Move domain lists out of source code; allow users to configure their own lists or import them.

#### 3.1.2 Overly Broad Permission Combination

`manifest.json` simultaneously requests:
- `declarativeNetRequest` + `declarativeNetRequestWithHostAccess` + `declarativeNetRequestFeedback`
- `<all_urls>` host_permissions
- `scripting` + `tabs` + `sidePanel` + `storage`

`declarativeNetRequestFeedback` requires additional justification; `<all_urls>` triggers manual review in the CWS process.

**Recommendation:** Remove unused `declarativeNetRequestFeedback`; evaluate whether host_permissions can be narrowed.

### 3.2 Security Issues

#### 3.2.1 web_accessible_resources Exposure Too Broad 🔴 High Priority

```json
"web_accessible_resources": [
  {
    "resources": ["content/inject-blocker.js", ...],
    "matches": ["<all_urls>"]
  }
]
```

`inject-blocker.js` can be detected by any external webpage via `chrome-extension://` URL, leaking extension installation information. While `noop.js` and `sandbox.js` legitimately need this, `inject-blocker.js` should not be visible to `<all_urls>`.

**Recommendation:** Change `web_accessible_resources` `matches` to only allow known player site patterns.

#### 3.2.2 Developer Machine Path Leaked in POLICY-GATE.md

```
[background.js](C:\Dev\Projects\Falcon-Player-Enhance\extension\background.js)
```

Absolute paths to the developer's local machine are hardcoded in documentation.

**Recommendation:** Use relative paths or Markdown relative links.

### 3.3 Personal Data Exposure 🔴 High Priority

The following files are committed to Git:
- `tests/bookmarks_2026_3_13.html`
- `tests/bookmarks_2026_3_13.html.bak`

These are browser bookmark exports containing personal browsing history. They must be removed from version history immediately.

**Recommendations:**
1. Add both files to `.gitignore` immediately
2. Use `git filter-repo --path tests/bookmarks_2026_3_13.html --invert-paths` to purge history
3. `filter-rules.json.backup` should also be removed from version control

### 3.4 AI Integration Technical Gaps 🟡 Medium Priority

#### 3.4.1 Model Gateway Not Yet Implemented

The planned `Signal Aggregator → Model Gateway → Policy Compiler → Policy Enforcer` architecture currently:
- Exists only as an API Contract document (no implementation)
- Relies on LM Studio as an optional local feature requiring users to run their own server
- Defines `ai_model` source in the schema but has no corresponding cloud call path

**Recommendation:** Clearly mark what is "implemented" vs "planned" in architecture docs.

#### 3.4.2 Telemetry Data Governance Insufficient

The `exportAiDataset` feature can export user browsing behavior telemetry. Current documentation does not specify storage location, whether exports contain identifying information, or user consent mechanisms.

**Recommendation:** Document data minimization implementation details and user consent mechanisms.

---

## 4. Implementation Evaluation

### 4.1 Performance Risks

#### 4.1.1 Global Injection Cost 🟡 Medium Priority

`ai-runtime.js` with `allFrames: true` across all player sites, combined with 1200ms telemetry flushing and 4000ms MutationObserver health checks, can amplify CPU load on high-churn pages.

**Recommendations:**
- Implement `page_interaction_latency_p95` and `cpu_overhead_p95` metrics (planned in audit Phase A)
- Reduce scan frequency on low-activity / non-focused tabs

#### 4.1.2 Multi-Frame Race Condition Risk

The audit report already identifies that multi-path messages and multi-frame sync may cause race conditions. The incomplete policy cache / tab lifecycle sync point has no corresponding fix on record.

### 4.2 Insufficient Test Coverage 🟡 Medium Priority

| Test Type | Current Status |
|-----------|---------------|
| Core module unit tests | ❌ None (player-detector, overlay-remover, anti-antiblock) |
| AI risk engine | ✅ Offline scenarios (3/3 pass) |
| E2E replay | ⚠️ Exists but requires real browser |
| Self-learning loop | ⚠️ Depends on external AI models |
| Performance benchmarks | ❌ No automated tests |

**Recommendation:** Add unit tests for `isInternalElement`, `detectPlayers`, and overlay identification rules.

### 4.3 No Build System 🟢 Low Priority (Acceptable)

Raw JS files without a bundler is acceptable for MV3 Extensions. Consider adding one if npm package dependencies are needed.

### 4.4 Missing ESLint Configuration 🟢 Low Priority

Complex MAIN world scripts lack static analysis protection.

---

## 5. Risk & Contingency Analysis

### External Environment Assumptions

- Target audience is personal use or limited distribution, not CWS public listing
- Developer has capacity to regularly update rules for target sites
- Users are willing to manually install unpacked extensions

---

### 5.1 🔴 Critical: Chrome Policy Changes Block Functionality

**Trigger:** Chrome restricts MAIN world injection or `<all_urls>` without explicit user consent.

**Contingency:**
- uBlock Origin Lite delegation already reduces `declarativeNetRequest` dependency
- Ensure core player features degrade gracefully without MAIN world injection
- Monitor Chromium blog for breaking change announcements

**Impact:** High — may require 2–4 weeks to refactor `inject-blocker.js`

---

### 5.2 🔴 Critical: Personal Data Exposure (Bookmark Files)

**Trigger:** Repo becomes public or access is accidentally opened.

**Contingency (Execute Immediately):**
1. `git filter-repo --path tests/bookmarks_2026_3_13.html --invert-paths`
2. `git filter-repo --path tests/bookmarks_2026_3_13.html.bak --invert-paths`
3. Replace with `targets.example.json` (already exists)

---

### 5.3 🔴 Critical: Chrome Web Store Review Rejection

**Trigger:** Attempt to submit to Chrome Web Store.

**Contingency:**
- **Option A (Recommended):** Side-loading distribution, bypassing CWS policy entirely
- **Option B:** User-configurable domain list; no adult site names in source code
- **Option C:** Generic CWS build + full side-loaded build

---

### 5.4 🟡 High: AI False Positives Blocking Legitimate Navigation

**Trigger:** Risk score escalates to `high`; user clicks a legitimate link (payment, OAuth) that gets blocked.

**Contingency:**
- Complete `false_positive_signal` downgrade mechanism (planned in Phase C)
- Add "Allow this navigation" instant override button in popup
- Set max TTL for `guardExternalNavigation` (auto-revert to T1 after 5 min)

---

### 5.5 🟡 High: Target Site Counter-Measures

**Trigger:** Site detects `shield-*` class prefix or `data-shield-internal` attribute as a blocking signal.

**Contingency:**
- Randomize the `shield-` prefix per installation (UUID-based)
- Ensure self-learning loop can run periodically in CI for rapid patching

---

### 5.6 🟡 High: LM Studio Local Dependency is Fragile

**Trigger:** User forgets to restart LM Studio after reboot, or a version update breaks API compatibility.

**Contingency:**
- Core protection already works without AI (good) — document this clearly for users
- Provide explicit degradation notice on Health Check failure (not silent)

---

## 6. Overall Recommendations

### Immediate (Security)

| Priority | Action |
|----------|--------|
| P0 | Remove bookmark files from git history; add to `.gitignore` |
| P0 | Fix POLICY-GATE.md absolute dev machine paths |
| P1 | Narrow `web_accessible_resources` — `inject-blocker.js` off `<all_urls>` |
| P1 | Remove `declarativeNetRequestFeedback` if unused |

### Short-term (Quality)

| Priority | Action |
|----------|--------|
| P1 | Unify brand naming — replace all `Falcon-Player-Enhance` with `Falcon-Player-Enhance` |
| P1 | Choose one canonical architecture doc; archive the others |
| P2 | Add unit tests for `isInternalElement`, `detectPlayers`, overlay rules |
| P2 | Address multi-frame race condition with policy versioning (audit Phase A) |

### Medium-term (Strategic)

| Priority | Action |
|----------|--------|
| P2 | Decide distribution strategy (side-load vs CWS dual build) |
| P2 | Externalize domain lists — user-manageable, not hardcoded |
| P3 | Implement Model Gateway MVP to close gap between docs and code |
| P3 | Complete `user_override` write-back loop (Phase C) |

### Monitoring Points

- Chrome Extensions policy updates (quarterly)
- uBlock Origin Lite API compatibility changes
- Target site anti-extension escalation (self-learning loop reports)
- AI telemetry `false_positive_rate` baseline and trend

---

*This report was auto-generated by GitHub Copilot CLI (Claude Sonnet 4.6) based on project source code and documentation. Conclusions should be validated by the developer before adoption.*
