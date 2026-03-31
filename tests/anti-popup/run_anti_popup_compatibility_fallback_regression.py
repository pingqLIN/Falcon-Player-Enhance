from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run anti-popup compatibility fallback regression without extension runtime access."
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
        "--wait-ms",
        type=int,
        default=1200,
        help="Wait time after page load before collecting DOM state."
    )
    return parser.parse_args()


def build_browser_args() -> list[str]:
    host_rules = ",".join([
        "MAP boyfriendtv.com 127.0.0.1",
        "MAP javboys.com 127.0.0.1"
    ])
    return [f"--host-resolver-rules={host_rules}"]


def inspect_page(page, url: str, wait_ms: int) -> dict[str, object]:
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(wait_ms)
    return page.evaluate(
        """() => {
            const overlay = document.getElementById('aggressive-overlay');
            const frame = document.getElementById('player-frame');
            const overlayStyle = overlay ? window.getComputedStyle(overlay) : null;
            const frameStyle = frame ? window.getComputedStyle(frame) : null;
            return {
                hostname: window.location.hostname,
                overlayExists: Boolean(overlay),
                overlayDisplay: overlayStyle ? overlayStyle.display : null,
                overlayVisibility: overlayStyle ? overlayStyle.visibility : null,
                frameExists: Boolean(frame),
                frameDisplay: frameStyle ? frameStyle.display : null,
                frameVisibility: frameStyle ? frameStyle.visibility : null
            };
        }"""
    )


def build_report(base_url: str, page, wait_ms: int) -> dict[str, object]:
    compat_url = base_url.replace("127.0.0.1", "boyfriendtv.com") + "?registryMode=runtimeFailure"
    empty_config_url = base_url.replace("127.0.0.1", "boyfriendtv.com") + "?registryMode=success&compatibilityModeSites="
    non_compat_url = base_url.replace("127.0.0.1", "javboys.com") + "?registryMode=runtimeFailure"

    compat_page = inspect_page(page, compat_url, wait_ms)
    empty_config_page = inspect_page(page, empty_config_url, wait_ms)
    non_compat_page = inspect_page(page, non_compat_url, wait_ms)

    checks = {
        "compatOverlayPreserved": compat_page["overlayExists"] and compat_page["overlayDisplay"] != "none",
        "compatFrameVisible": compat_page["frameExists"] and compat_page["frameDisplay"] != "none" and compat_page["frameVisibility"] != "hidden",
        "emptyConfigDisablesCompat": (not empty_config_page["overlayExists"]) or empty_config_page["overlayDisplay"] == "none",
        "emptyConfigFrameVisible": empty_config_page["frameExists"] and empty_config_page["frameDisplay"] != "none" and empty_config_page["frameVisibility"] != "hidden",
        "nonCompatOverlayRemoved": (not non_compat_page["overlayExists"]) or non_compat_page["overlayDisplay"] == "none",
        "nonCompatFrameVisible": non_compat_page["frameExists"] and non_compat_page["frameDisplay"] != "none" and non_compat_page["frameVisibility"] != "hidden"
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "pages": {
            "compatibilityFallback": compat_page,
            "emptyConfiguredList": empty_config_page,
            "nonCompatibility": non_compat_page
        }
    }


def main() -> int:
    args = parse_args()
    server = smoke.StaticServer(REPO_ROOT)
    server.start()

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                channel=args.browser_channel,
                headless=args.headless,
                args=build_browser_args()
            )
            try:
                page = browser.new_page()
                report = build_report(
                    f"{server.base_url}/tests/test-anti-popup-compatibility-fallback.html",
                    page,
                    args.wait_ms
                )
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                browser.close()
    finally:
        server.close()


if __name__ == "__main__":
    raise SystemExit(main())
