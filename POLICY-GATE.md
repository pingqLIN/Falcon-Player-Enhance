# Policy Gate

Falcon-Player-Enhance uses a four-tier policy gate so AI-derived signals cannot directly mutate runtime behavior without a deterministic boundary.

## Tiers

- `T0`: pure deterministic rules
  - immediate execution
  - examples: known popup traps, known malicious redirect domains, fixed overlay selectors
- `T1`: advisory only
  - AI signals may affect risk scoring, telemetry, and review priority
  - runtime must not enable new blocking behaviors from AI at this tier
- `T2`: reversible runtime actions
  - AI-derived policy may enable temporary and reversible actions
  - current allowed actions:
    - `tune_overlay_scan`
    - `tighten_popup_guard`
    - `guard_external_navigation`
    - `apply_extra_blocked_domains`
- `T3`: development-time escalation
  - runtime never performs this directly
  - used to export evidence and escalate to `Codex reviewer` / patch loop

## Current Runtime Mapping

- `low` / `medium` risk hosts: `T1`
- `high` / `critical` risk hosts: `T2`
- active host fallback: force `T1`
- runtime never enables durable mutation

## Gate Payload

Policies now carry:

- `policyGateVersion`
- `policyGate.tier`
- `policyGate.mode`
- `policyGate.reason`
- `policyGate.allowAiAdvisory`
- `policyGate.allowReversibleActions`
- `policyGate.allowDurableMutation`
- `policyGate.escalateToCodexReview`
- `policyGate.thresholds`
- `policyGate.actionBudget`
- `policyGate.allowedActions`

## Enforcement

- [background.js](extension/background.js) computes the gate alongside risk policy.
- [ai-runtime.js](extension/content/ai-runtime.js) sanitizes AI policy before publishing it to the page.
- [inject-blocker.js](extension/content/inject-blocker.js) only accepts AI-driven popup/domain tightening when `T2` allows it.
- [overlay-remover.js](extension/content/overlay-remover.js) only accepts AI-driven scan tuning when `T2` allows it.

## Guardrails

- runtime AI remains reversible only
- host fallback always reduces authority
- durable mutation stays outside the extension runtime
- `T3` is reserved for development-time review and patching
