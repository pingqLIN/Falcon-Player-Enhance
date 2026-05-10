from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify action icon clicks are configured to open the side panel."
    )
    parser.add_argument("--extension-dir", default=str(smoke.DEFAULT_EXTENSION_DIR))
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=20000)
    return parser.parse_args()


def collect_side_panel_contract(context) -> dict[str, object]:
    worker = smoke.get_extension_worker(context)
    return worker.evaluate(
        """async () => {
            const manifest = chrome.runtime.getManifest();
            const behavior = chrome.sidePanel?.getPanelBehavior
                ? await chrome.sidePanel.getPanelBehavior()
                : null;
            const defaultPath = String(manifest.side_panel?.default_path || '');
            const registeredScripts = await chrome.scripting.getRegisteredContentScripts();
            return {
                sidePanelAvailable: Boolean(chrome.sidePanel),
                getPanelBehaviorAvailable: Boolean(chrome.sidePanel?.getPanelBehavior),
                openPanelOnActionClick: behavior?.openPanelOnActionClick === true,
                behavior,
                defaultPath,
                defaultPathPinned: defaultPath.includes('popup/popup.html') &&
                    defaultPath.includes('pinned=1'),
                registeredScriptCount: registeredScripts.length
            };
        }"""
    )


def build_report(contract: dict[str, object]) -> dict[str, object]:
    checks = {
        "sidePanelAvailable": contract.get("sidePanelAvailable") is True,
        "getPanelBehaviorAvailable": contract.get("getPanelBehaviorAvailable") is True,
        "openPanelOnActionClick": contract.get("openPanelOnActionClick") is True,
        "defaultPathPinned": contract.get("defaultPathPinned") is True,
        "contentScriptsReady": int(contract.get("registeredScriptCount") or 0) > 0,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "contract": contract,
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-side-panel-behavior-"))

    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                channel=args.browser_channel,
                headless=args.headless,
                args=smoke.build_extension_args(extension_dir),
            )
            try:
                extension_id = smoke.wait_for_extension_id(context, args.timeout_ms)
                smoke.wait_for_extension_ready(context, args.timeout_ms)
                contract = collect_side_panel_contract(context)
                report = build_report(contract)
                print(json.dumps({
                    "ok": report["ok"],
                    "extensionId": extension_id,
                    "report": report,
                }, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
