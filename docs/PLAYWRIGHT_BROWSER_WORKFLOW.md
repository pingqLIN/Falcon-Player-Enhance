# Playwright Browser Workflow Runner

This project includes a standalone Python Playwright runner for repeatable browser workflows.
It uses the same Playwright runtime style as the existing regression scripts.

## Run the Sample

```powershell
npm run browser:workflow -- --workflow tests/browser-workflow.sample.json
```

Run headed while authoring or debugging:

```powershell
npm run browser:workflow -- --workflow tests/browser-workflow.sample.json --headed --trace
```

Artifacts are written to `output/playwright/`.

## Create a Workflow

Copy `tests/browser-workflow.sample.json` and replace the `steps` with your target page and actions:

```json
{
  "name": "example-login-flow",
  "browser": "chromium",
  "headless": false,
  "timeoutMs": 15000,
  "retries": 1,
  "steps": [
    { "action": "goto", "url": "https://example.com/login" },
    { "action": "fill", "label": "Email", "value": "user@example.com" },
    { "action": "fill", "label": "Password", "value": "replace-me" },
    { "action": "click", "role": "button", "name": "Sign in" },
    { "action": "expectUrl", "contains": "/dashboard" },
    { "action": "screenshot", "path": "output/playwright/example-login-flow.png" }
  ]
}
```

## Supported Actions

- `goto`: open a URL or repo-local file path.
- `click`, `dblclick`, `hover`: interact with a locator.
- `fill`, `type`, `press`: enter text or keyboard input.
- `check`, `uncheck`, `selectOption`: form controls.
- `waitForSelector`, `waitForUrl`, `waitForLoadState`, `wait`: explicit waits.
- `expectVisible`, `expectHidden`, `expectText`, `expectUrl`: assertions.
- `screenshot`: save evidence under `output/playwright/`.

Locator steps can use `selector`, `role` plus `name`, `text`, `label`, `placeholder`, `testId`, `altText`, or `title`.

## Chrome Extension Mode

For workflows that need the unpacked extension loaded, add:

```json
{
  "browser": "chrome",
  "headless": false,
  "extensionDir": "extension",
  "userDataDir": ".browser-profiles/playwright-workflow",
  "steps": [
    { "action": "goto", "url": "tests/test-page.html" },
    { "action": "expectVisible", "selector": "video" }
  ]
}
```

Then run:

```powershell
npm run browser:workflow -- --workflow path/to/workflow.json --headed
```
