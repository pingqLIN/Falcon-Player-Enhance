# Live Browser Agent

This folder contains the MVP for live-site validation with a browser-working judge agent.

## Files

- `browser_judge.py`: opens targets in Chromium, scores each page, saves evidence.
- `import_bookmarks.py`: converts a Netscape bookmarks export into reviewed target candidates.
- `self_learning_loop.py`: orchestrates judge -> regressions -> structured Codex review -> optional patch agent -> retry.
- `test_popup_reliability.py`: headless popup smoke for popup-open-local-video and runtime-state-restore-on-reopen.
- `targets.example.json`: reviewed target format.
- `targets.external-ai.single-page.curated.json`: curated single-page regression targets imported from an external AI review pass.
- `targets.external-ai.single-page.smoke.json`: reduced smoke subset for faster live-browser validation, updated to keep only validated lower-noise seeds after the first smoke pass.
- `discovery-queries.example.json`: generic query templates for building new targets outside the repo.
- `scripts/run-bookmark-self-learning.ps1`: one-command PowerShell entrypoint from bookmarks to self-learning loop.

## Quick Start

```powershell
python tests/live-browser/import_bookmarks.py --help
python tests/live-browser/browser_judge.py --help
python tests/live-browser/self_learning_loop.py --help
npm run test:popup-reliability
python -m unittest tests/live-browser/test_popup_reliability.py
pwsh ./scripts/run-bookmark-self-learning.ps1 -Headless
```

## Notes

- The repository does not ship a hardcoded adult-site list.
- If you want category-specific targets, generate them outside the repo and review them before adding them to `targets.json`.
- `targets.external-ai.single-page.curated.json` is a reviewed import artifact for regression work. Keep `requiresManualReview: true` until a human confirms each target still behaves as expected.
- A bookmark export like `tests/bookmarks_2026_3_13.html` is a good sample input for `import_bookmarks.py`.
- For reliable uBlock coverage, prefer either:
  - an unpacked uBlock directory via `--ublock-extension-dir`
  - an existing Chromium profile via `--browser-profile-dir`
- `test_popup_reliability.py` intentionally validates popup creation via the extension service worker's `chrome.windows.getAll({ populate: true })` view instead of only Playwright page events; this is more stable for headless popup windows created by `chrome.windows.create()`.
- `npm run test:popup-reliability` is the smallest direct routing smoke. It validates that iframe-direct hosts still open real direct popups while remote-only payloads continue to use the extension popup path.

## Built-In Patch Agents

`self_learning_loop.py` now supports:

- `--review-agent codex`
- `--patch-agent codex`
- `--patch-agent claude`
- `--patch-agent opencode`

Example:

```powershell
python tests/live-browser/self_learning_loop.py `
  --targets tests/live-browser/targets.from-bookmarks.filtered.json `
  --extension-dir extension `
  --ublock-extension-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Extensions\ddkjiahejlhfcafbddmgiahcphecmpfh\2026.308.1810_0" `
  --review-agent codex `
  --patch-agent codex `
  --max-iterations 2 `
  --headless
```

If you want to keep using your own runner, `--patch-command` still works.

## Review Output

When `--review-agent codex` is enabled and a run fails, the loop writes:

- `review-context.json`
- `review-summary.json`

The review stage can mark targets as `invalid_target`, which prevents them from automatically generating patch briefs.
