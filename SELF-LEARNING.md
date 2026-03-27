# Self-Learning Browser Validation Loop

This repository now includes an MVP design for a live-browser validation loop that can:

1. Discover or import new target pages from search/forum workflows.
2. Open pages in Chromium with both Falcon-Player-Enhance and uBlock enabled.
3. Score each page with a browser-working judge agent.
4. Produce a patch brief for an external coding agent.
5. Re-run live checks plus existing offline regressions until the stop condition is met.

The implementation is intentionally conservative:

- The repository ships generic discovery templates, not a hardcoded list of adult domains.
- The browser judge is evidence-first. It produces screenshots, scores, and suggestions before any patching step.
- Code modification is delegated to a separate patch agent command so you can swap in Codex, Claude Code, or another local tool.
- Existing regression gates stay in the loop:
  - `tests/ai-eval/run-ai-evaluation.js`
  - `tests/e2e-ai-replay/run-e2e-ai-replay.js`

## Components

### 1. Discovery

Use search APIs, forum exports, or curated lists to build `tests/live-browser/targets.json`.

Recommended source types:

- Search engine APIs for terms related to video-player overlay ads, clickjacking, and aggressive popup traps.
- Forum/manual reports from users who submit failing pages.
- A manually reviewed list of category-leading sites you want to regression-test.

The repo includes:

- `tests/live-browser/targets.example.json`
- `tests/live-browser/discovery-queries.example.json`
- `tests/live-browser/import_bookmarks.py`

### Bookmark import

If you already have a reviewed browser bookmark export, convert it into target candidates:

```powershell
python tests/live-browser/import_bookmarks.py `
  --input tests/bookmarks_2026_3_13.html `
  --require-folder AI `
  --limit-per-domain 10 `
  --out tests/live-browser/targets.from-bookmarks.json
```

You can also filter by hostname pattern:

```powershell
python tests/live-browser/import_bookmarks.py `
  --input tests/bookmarks_2026_3_13.html `
  --include-domain-regex "javboys|missav|thisav|jable|avgle" `
  --exclude-url-regex "/tag/|/all-models/|/_page=|/category/" `
  --limit 50 `
  --out tests/live-browser/targets.from-bookmarks.json
```

### 2. Browser Judge Agent

`tests/live-browser/browser_judge.py` launches Chromium in a persistent context and:

- Loads Falcon-Player-Enhance as an unpacked extension.
- Optionally loads uBlock as another unpacked extension.
- Optionally reuses a browser profile where uBlock is already installed.
- Visits each target page and records:
  - player detection result
  - suspicious overlay count
  - popup count
  - suspicious navigation count
  - screenshot path
  - suggestions

It writes a machine-readable JSON report that can be consumed by the loop controller or another agent.

### 3. Patch Brief Generator

`tests/live-browser/self_learning_loop.py` turns failing reports into a Markdown patch brief. The brief includes:

- target URL and score
- evidence extracted by the browser judge
- suggested code areas to inspect
- reminders to preserve uBlock compatibility
- optional built-in review-agent preset for `codex`
- optional built-in patch-agent presets for `codex`, `claude`, or `opencode`

### 4. Self-Learning Loop

The loop controller runs:

1. browser judge
2. existing offline regressions
3. optional external patch agent
4. browser judge again

Stop conditions:

- all live targets pass the browser judge threshold
- offline regression scripts pass
- max iteration count is reached

## uBlock Integration Modes

There are two supported modes:

### Mode A: unpacked uBlock directory

Provide `--ublock-extension-dir <path>` to the judge/loop script.

This is the most reproducible mode if you have an unpacked copy of uBlock Origin Lite.

### Mode B: existing browser profile

Provide `--browser-profile-dir <path>`.

Use this when uBlock is already installed in a Chromium/Chrome profile and you only need the loop to inject Falcon-Player-Enhance alongside it.

## Safety Guardrails

This setup is meant for defensive validation of your extension, not blind browsing.

- Keep the target list under your control.
- Prefer API/manual discovery over scraping search-engine HTML.
- Review new targets before adding them to the active regression pool.
- Run in a disposable browser profile when probing unfamiliar sites.
- Keep patch application limited to allowlisted project files.

## Suggested Workflow

1. Build a reviewed target list from search/forum/manual intake.
2. Run `browser_judge.py` to collect evidence.
3. Inspect `tests/live-browser/reports/latest-report.json`.
4. If failures exist, run `self_learning_loop.py --patch-command ...`.
5. Promote stable failures into explicit regression targets or fixtures.

## Example

```powershell
python tests/live-browser/browser_judge.py `
  --targets tests/live-browser/targets.example.json `
  --extension-dir extension `
  --browser-profile-dir C:\temp\shield-pro-profile `
  --out tests/live-browser/reports/latest-report.json
```

```powershell
python tests/live-browser/self_learning_loop.py `
  --targets tests/live-browser/targets.example.json `
  --extension-dir extension `
  --browser-profile-dir C:\temp\shield-pro-profile `
  --review-agent codex `
  --patch-agent codex `
  --max-iterations 3
```

Or use the convenience entrypoint:

```powershell
pwsh ./scripts/run-bookmark-self-learning.ps1 -Headless
```
