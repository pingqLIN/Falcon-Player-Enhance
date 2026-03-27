# Mainline YOLO Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the non-player mainline closer to completion by removing more permanent site-specific runtime logic, tightening popup-player verification, and keeping the branch reviewable with grouped commits.

**Architecture:** Continue the move from hardcoded runtime host lists toward `site-behaviors.json` plus `site-profile.js`, while keeping behavior changes narrow and test-backed. Treat `anti-antiblock.js` as a strategy-extraction task rather than forcing a full JSON-only migration in one pass.

**Tech Stack:** Chrome extension MV3, plain JavaScript content scripts, JSON rule files, Node core tests, Python live-browser scripts, GitHub branch workflow.

---

## Task 1: Extend rule-driven behavior into `inject-blocker.js`

**Files:**
- Modify: `extension/content/inject-blocker.js`
- Modify: `extension/content/site-profile.js`
- Modify: `extension/rules/site-behaviors.json`
- Test: `tests/core/run-core-tests.js`

- [ ] Replace `COMPATIBILITY_MODE_SITES` lookups with `FalconSiteProfiles.getCapability('compatibilityMode')` or equivalent helper access.
- [ ] Move redirect-trap host resolution to profile-backed data instead of `L3_REDIRECT_TRAP_DOMAINS`.
- [ ] Reduce `MALICIOUS_DOMAINS` false-positive risk by switching from broad substring matching to exact host / suffix / token-aware matching.
- [ ] Add core tests for compatibility-mode resolution, redirect-trap host matching, and malicious-domain matching edge cases.
- [ ] Run `node tests/core/run-core-tests.js` and `node --check extension/content/inject-blocker.js`.

## Task 2: Finish compatibility-mode migration in `player-enhancer.js`

**Files:**
- Modify: `extension/content/player-enhancer.js`
- Test: `tests/core/run-core-tests.js`

- [ ] Remove local `COMPATIBILITY_MODE_SITES` usage and read compatibility capability from the site-profile layer.
- [ ] Keep popup and overlay cleanup behavior equivalent for already-supported sites.
- [ ] Add or update core tests that prove compatibility mode still disables aggressive cleanup where expected.
- [ ] Run `node tests/core/run-core-tests.js` and `node --check extension/content/player-enhancer.js`.

## Task 3: Extract anti-antiblock strategy boundary without adding new permanent site branches

**Files:**
- Modify: `extension/content/anti-antiblock.js`
- Modify: `extension/rules/site-behaviors.json`
- Test: `tests/core/run-core-tests.js`
- Document: `docs/SITE_RULE_GENERALIZATION_PLAN.zh-TW.md`

- [ ] Introduce a controlled strategy boundary so `handleJavboysPlayer()` is no longer a naked hostname branch in the main flow.
- [ ] Read strategy selection from `site-behaviors.json` via `antiAntiBlockProfile` or similar existing capability.
- [ ] Keep the current strategy implementation in JS if necessary, but isolate dispatch from raw hostname checks.
- [ ] Add at least one regression-oriented core test proving profile-driven dispatch is used.
- [ ] Update the generalization plan document to record what was migrated and what remains intentionally half-data-driven.
- [ ] Run `node tests/core/run-core-tests.js` and `node --check extension/content/anti-antiblock.js`.

## Task 4: Strengthen popup-player real-world verification

**Files:**
- Modify or Create: `tests/live-browser/*` as needed
- Modify: `docs/POPUP_PLAYER_YOLO_PLAN.zh-TW.md` if verification scope changes

- [ ] Inventory existing popup-player test surface and reuse current live-browser tooling where possible.
- [ ] Add at least one repeatable verification path for popup-player or direct-popup behavior that does not depend on ad hoc manual inspection.
- [ ] Keep any new artifacts reviewable and avoid committing noisy browser profile output.
- [ ] Run the new verification command and capture its result in a stable report file or documented invocation.

## Task 5: Integrate, verify, and ship branch-safe commits

**Files:**
- Modify: `docs/PROGRESS_SNAPSHOT.zh-TW.md` if status meaningfully changes
- Optional: `TODOS.md` only if deliberately adopted into repo

- [ ] Re-read branch diff and ensure no new local-only artifacts were introduced.
- [ ] Run `npm run check`.
- [ ] If popup-player verification introduced a separate command, run it fresh and record the exact result.
- [ ] Group commits by concern so reviewers can inspect rule migration, anti-antiblock strategy extraction, and verification separately if useful.
- [ ] Push the branch after fresh verification evidence.
