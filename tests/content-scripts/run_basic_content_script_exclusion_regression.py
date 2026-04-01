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
        description="Verify shield-basic-docidle excludes known login-safe domains."
    )
    parser.add_argument(
        "--extension-dir",
        default=str(smoke.DEFAULT_EXTENSION_DIR),
        help="Unpacked Falcon-Player-Enhance extension directory."
    )
    parser.add_argument(
        "--browser-channel",
        default="chromium",
        help="Playwright browser channel. Default: chromium."
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chromium headlessly."
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=20000,
        help="Base timeout per Playwright wait."
    )
    return parser.parse_args()


def fetch_registered_contract(page, extension_id: str) -> dict[str, object]:
    page.goto(f"chrome-extension://{extension_id}/dashboard/dashboard.html", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    return page.evaluate(
        """async () => {
            const definitions = await chrome.scripting.getRegisteredContentScripts({
                ids: ['shield-basic-docidle']
            });
            const definition = Array.isArray(definitions) ? definitions[0] || {} : {};
            return {
                id: definition.id || '',
                matches: definition.matches || [],
                excludeMatches: definition.excludeMatches || []
            };
        }"""
    )


def open_ready_context(playwright, profile_dir: Path, extension_dir: Path, channel: str, headless: bool, timeout_ms: int):
    last_error = None
    for _ in range(3):
        context = playwright.chromium.launch_persistent_context(
            str(profile_dir),
            channel=channel,
            headless=headless,
            args=smoke.build_extension_args(extension_dir),
        )
        try:
            extension_id = smoke.wait_for_extension_id(context, timeout_ms)
            smoke.wait_for_extension_ready(context, timeout_ms)
            return context, extension_id
        except RuntimeError as error:
            context.close()
            last_error = error
            if "extension_service_worker_not_ready" not in str(error):
                raise
    raise last_error or RuntimeError("extension_service_worker_not_ready")


def build_report(contract: dict[str, object]) -> dict[str, object]:
    exclude_matches = contract.get("excludeMatches", [])
    checks = {
        "scriptFound": contract.get("id") == "shield-basic-docidle",
        "lovableExcluded": isinstance(exclude_matches, list) and "*://lovable.dev/*" in exclude_matches,
        "lovableWildcardExcluded": isinstance(exclude_matches, list) and "*://*.lovable.dev/*" in exclude_matches,
        "authLovableExcluded": isinstance(exclude_matches, list) and "*://auth.lovable.dev/*" in exclude_matches,
        "authLovableWildcardExcluded": isinstance(exclude_matches, list) and "*://*.auth.lovable.dev/*" in exclude_matches,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "contract": contract
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-basic-script-exclusion-"))

    try:
        with sync_playwright() as playwright:
            context, extension_id = open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )
            try:
                page = context.new_page()
                contract = fetch_registered_contract(page, extension_id)
                report = build_report(contract)
                print(json.dumps({
                    "ok": report["ok"],
                    "extensionId": extension_id,
                    "report": report
                }, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
