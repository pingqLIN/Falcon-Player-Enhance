# AI Guard Implementation Plan

## Goal

Build a practical AI-assisted protection stack for Shield Pro with three distinct roles:

1. `Codex reviewer`: development-time evaluator and repair orchestrator
2. `Gemini Nano guard`: runtime local advisory guard inside the browser environment
3. `Policy gate`: deterministic boundary between AI judgment and executable actions

This plan deliberately separates development-time autonomy from runtime autonomy.

## Current State

The repository already has a usable live-browser validation loop:

- `tests/live-browser/import_bookmarks.py`
- `tests/live-browser/browser_judge.py`
- `tests/live-browser/self_learning_loop.py`
- `scripts/run-bookmark-self-learning.ps1`

Current strengths:

- reviewed target import from bookmark exports
- Chromium + Shield Pro + uBlock Origin Lite live validation
- browser evidence capture via screenshots and DOM snapshot summaries
- optional patch-agent loop using `codex`, `claude`, or `opencode`
- offline regression gates:
  - `tests/ai-eval/run-ai-evaluation.js`
  - `tests/e2e-ai-replay/run-e2e-ai-replay.js`

Current limitation:

- live-browser judge is still a conservative DOM-based smoke evaluator
- target quality still strongly affects pass/fail accuracy
- runtime AI is not yet integrated into the extension

## Architecture Direction

### Layer A: Development-Time AI

Owner: `Codex reviewer`

Purpose:

- interpret live-browser evidence
- classify failures
- decide whether a failure is due to target quality, missing host coverage, timing, heuristic weakness, or actual protection failure
- propose and optionally implement focused code/rule changes

This layer is allowed to modify the codebase, but only inside the development loop.

### Layer B: Runtime Local AI

Owner: `Gemini Nano guard`

Purpose:

- provide low-latency local classification inside the browser
- judge uncertain DOM situations where hard rules are weak
- annotate risk, confidence, and recommended action

This layer should not directly modify code or create persistent rules.

### Layer C: Deterministic Policy Gate

Owner: extension runtime policy

Purpose:

- decide what can execute immediately
- decide what must remain advisory only
- decide when escalation to development-time repair is needed

This layer is the only layer allowed to turn AI output into runtime actions.

## Workstream 1: Codex As Active Reviewer

### Objective

Use `Codex` as a high-quality evaluator at the end of the development cycle to raise confidence and detect false conclusions early.

### Why first

- fastest improvement in signal quality
- lowest operational risk
- directly reuses the live-browser loop that already exists
- produces structured data needed by later Gemini Nano experiments

### Scope

Add a new `review` stage after browser-judge execution and before patch generation.

Inputs:

- browser report JSON
- screenshots
- target metadata
- optional DOM snapshot fragments
- offline regression outputs

Outputs:

- failure classification
- confidence score
- recommended action class
- suggested patch scope
- `do-not-fix` label for invalid targets

### Failure Classes

`Codex reviewer` should assign one of:

- `invalid_target`
- `player_not_loaded_yet`
- `host_permission_gap`
- `judge_heuristic_gap`
- `overlay_protection_failure`
- `popup_protection_failure`
- `regression_from_recent_change`
- `unknown_needs_human_review`

### Deliverables

1. Add `review-summary.json` generation to the live-browser loop
2. Add screenshot-aware Codex review prompt template
3. Add classification schema with confidence scores
4. Add a rule: do not generate patch brief for `invalid_target` unless explicitly overridden

### Success Criteria

- fewer false failures caused by list/tag pages
- clearer patch briefs
- less wasted patching on bad targets

## Workstream 2: Gemini Nano Runtime Guard Feasibility

### Objective

Evaluate whether local Chrome Gemini Nano can serve as a long-running browser-side advisory guard.

### Source repo

Reference material and launcher:

- `C:\Dev\Projects\gemini-nano-local-model-github\README.md`
- `C:\Dev\Projects\gemini-nano-local-model-github\scripts\Start-GeminiNanoChrome.ps1`
- `C:\Dev\Projects\gemini-nano-local-model-github\probe\nano-exchange-layer.js`

### Existing useful pieces

The Gemini Nano starter already demonstrates:

- isolated Chrome user-data launch
- model-pack import and integrity verification
- Prompt API detection
- exchange-layer identity, audit, protect, and throttling concepts
- single-session multiplexing for multiple entities

### Feasibility Questions

1. Can Shield Pro extension code access Prompt API reliably in the intended Chrome environment?
2. What is the average decision latency for short DOM classification prompts?
3. Is the API stable enough under multiple tabs and noisy pages?
4. Can entity isolation prevent conversation bleed across hosts/tabs?
5. Is fallback behavior acceptable when Prompt API is unavailable?

### Nano Phase Boundaries

Phase 2A: advisory only

- classify suspicious overlays
- classify uncertain player containers
- output `risk`, `confidence`, `reason`, `recommendation`

Phase 2B: reversible actions only

- temporarily hide a candidate overlay
- temporarily elevate player z-index
- temporarily suppress a click interception candidate

Phase 2C: never directly allowed

- permanent ruleset writes
- code edits
- auto-whitelisting a host forever
- any irreversible policy mutation

### Gemini Nano Evaluation Matrix

For each test host, record:

- Prompt API availability
- cold-start latency
- median inference latency
- timeout rate
- result consistency across repeated prompts
- behavior under concurrent entities
- audit trail size and retention needs

### Deliverables

1. A small integration probe inside Shield Pro test harness
2. A `nano_guard_probe` report format
3. A compatibility matrix by host/page type
4. A recommendation: `proceed`, `proceed-advisory-only`, or `do-not-integrate`

### Success Criteria

- stable local access in intended Chrome channel
- acceptable latency for advisory decisions
- strong enough consistency to justify runtime use

### Latest Feasibility Result

Observed on `2026-03-13` in the local harness:

- Chrome exposed `window.LanguageModel.create`
- Prompt API surface was detectable
- repeated session creation still failed with `Unable to create a text session because the service is not running.`
- this remained true after:
  - enabling the Prompt API feature flags
  - serving the probe page over local HTTP
  - retrying for service warm-up
  - passing `outputLanguage: "en"`
  - copying the model into an isolated Chrome profile

Current conclusion:

- treat Gemini Nano as `not yet production-viable` for Shield Pro runtime guard decisions
- continue feasibility testing only
- do not make runtime policy depend on Nano availability

## Workstream 3: AI-To-Action Decision Timing

### Objective

Define exactly when AI output is allowed to influence runtime behavior.

### Recommended Gate Model

#### T0: pure deterministic rules

Execute immediately.

Examples:

- known popup signatures
- obvious full-screen clickjacking overlays
- blocked malicious URL patterns
- static domain-scoped rules already validated

#### T1: AI advisory only

AI may score and label, but cannot execute anything persistent.

Examples:

- "this element is probably a deceptive overlay"
- "this iframe is probably the real player"
- "this host looks like a false positive risk"

#### T2: AI + rule agreement for reversible actions

Runtime may perform reversible actions when:

- deterministic heuristics exceed a threshold
- AI confidence exceeds a threshold
- action is locally reversible

Examples:

- temporary overlay hide
- temporary player elevation
- temporary click suppression around a suspicious element

#### T3: development-time escalation

If repeated failures survive T0-T2:

- export evidence
- create review summary
- invoke `Codex reviewer`
- optionally invoke patch agent

Only this layer can change code or durable policy.

### Required Decision Payload

Every AI decision should emit:

- `decisionId`
- `host`
- `tabId`
- `pageType`
- `entityId`
- `candidateType`
- `riskScore`
- `confidence`
- `recommendedAction`
- `reversible`
- `expiresAt`
- `trace`

### Required Policy Checks

Before executing a runtime action, the policy gate must verify:

- host is within scope
- action is reversible
- action budget not exceeded for this page/session
- AI confidence threshold met
- deterministic heuristic threshold met
- no recent user override says "stop"

### User Override Rules

Runtime policy must treat user override as strong evidence.

Examples:

- if user restores an element, reduce AI authority on that host temporarily
- if user repeatedly confirms a block, increase trust for similar ephemeral actions

## Recommended Sequence

### Phase 1

Implement `Codex reviewer` in the existing live-browser loop.

Why:

- immediate value
- low risk
- produces labeled failure data

### Phase 2

Run Gemini Nano feasibility tests in a separate probe branch or harness.

Why:

- isolates Prompt API uncertainty
- avoids mixing runtime experiments into core extension behavior too early

### Phase 3

Introduce `policy gate` schema and advisory logging into the extension.

Why:

- gives runtime a stable contract before adding AI execution authority

### Phase 4

Enable Gemini Nano advisory mode in the extension.

Why:

- gives real-world telemetry without risking irreversible decisions

### Phase 5

Enable limited reversible runtime actions under T2 gate.

Why:

- only after confidence, latency, and user-override behavior are understood

## Concrete Next Deliverables

### D1. Codex reviewer schema

Add a JSON schema for live-browser post-review:

- `classification`
- `confidence`
- `rootCause`
- `recommendedFixArea`
- `targetValidity`
- `nextStep`

### D2. Live-browser review stage

Extend `self_learning_loop.py`:

- browser judge
- offline regressions
- Codex review stage
- patch brief only when review says target is valid

### D3. Nano probe adapter

Create a small adapter in this repo that can call the Gemini Nano starter profile and test:

- player classification prompt
- overlay classification prompt
- false-positive classification prompt

### D4. Policy schema

Add a new runtime policy document:

- thresholds
- reversible action list
- override cooldowns
- escalation thresholds

## Risks

- Prompt API availability may vary by Chrome channel or flag set
- Gemini Nano may be too slow or too inconsistent for real-time page defense
- AI overreach at runtime can create false positives that hurt user trust
- development-time patch loops can overfit to a narrow target pool

## Guardrails

- runtime AI starts advisory-only
- permanent code or durable rule changes remain development-time only
- every AI-assisted runtime action must be reversible and logged
- user override always outranks AI confidence

## Decision

Proceed with:

1. `Codex reviewer` integration first
2. `Gemini Nano` feasibility spike second
3. `policy gate` implementation before runtime AI execution authority

Do not proceed yet with:

- letting Gemini Nano directly create durable site rules
- letting runtime AI silently self-modify the extension
- mixing development-time patching and runtime AI action logic into one layer
