import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"
if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Falcon player detection regression page against the unpacked extension."
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
    parser.add_argument(
        "--wait-ms",
        type=int,
        default=6500,
        help="Wait time after page load before collecting regression report."
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()

    try:
        with sync_playwright() as playwright:
            profile_dir = REPO_ROOT / ".tmp" / "player-detection-regression-profile"
            profile_dir.mkdir(parents=True, exist_ok=True)
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                channel=args.browser_channel,
                headless=args.headless,
                args=smoke.build_extension_args(extension_dir),
            )

            try:
                extension_id = smoke.wait_for_extension_id(context, args.timeout_ms)
                registered_scripts = smoke.wait_for_extension_ready(context, args.timeout_ms)
                page = context.new_page()
                page.goto(
                    f"{server.base_url}/test-player-detection-regression.html",
                    wait_until="domcontentloaded",
                    timeout=args.timeout_ms,
                )
                page.wait_for_timeout(args.wait_ms)
                report = page.evaluate("() => window.__regressionReport || null")
                if not report:
                    print(json.dumps({
                        "ok": False,
                        "error": "regression_report_missing",
                        "extensionId": extension_id,
                        "registeredScripts": registered_scripts,
                    }, ensure_ascii=False, indent=2))
                    return 1

                total_cases = len(report.get("caseReports") or [])
                passed_cases = int(report.get("passedCases") or 0)
                ok = total_cases > 0 and passed_cases == total_cases
                print(json.dumps({
                    "ok": ok,
                    "extensionId": extension_id,
                    "registeredScripts": registered_scripts,
                    "report": report,
                }, ensure_ascii=False, indent=2))
                return 0 if ok else 1
            finally:
                context.close()
    finally:
        server.close()


if __name__ == "__main__":
    raise SystemExit(main())
