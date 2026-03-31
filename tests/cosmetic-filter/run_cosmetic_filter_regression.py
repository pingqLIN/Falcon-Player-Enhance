from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"
import sys

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Falcon cosmetic filter regression against canonical site-registry profiles."
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
        default=1200,
        help="Wait time after page load before collecting computed styles."
    )
    return parser.parse_args()


def build_context_args(extension_dir: Path) -> list[str]:
    host_rules = ",".join([
        "MAP javboys.com 127.0.0.1",
        "MAP javboys.online 127.0.0.1",
        "MAP missav.com 127.0.0.1",
        "MAP missav.ws 127.0.0.1"
    ])
    return [
        *smoke.build_extension_args(extension_dir),
        f"--host-resolver-rules={host_rules}"
    ]


def inspect_page(page, url: str, wait_ms: int) -> dict[str, object]:
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector("#global-ad", state="attached")
    page.wait_for_timeout(wait_ms)
    return page.evaluate(
        """() => {
            const ids = ['global-ad', 'javboys-site-ad', 'missav-site-ad', 'normal-card'];
            const elements = Object.fromEntries(ids.map((id) => {
                const element = document.getElementById(id);
                const style = element ? window.getComputedStyle(element) : null;
                return [id, {
                    exists: Boolean(element),
                    display: style ? style.display : null,
                    visibility: style ? style.visibility : null
                }];
            }));
            const styleElement = document.getElementById('__shield_pro_cosmetic__');
            return {
                hostname: window.location.hostname,
                styleElementPresent: Boolean(styleElement),
                styleLength: styleElement ? String(styleElement.textContent || '').length : 0,
                elements
            };
        }"""
    )


def build_report(base_url: str, page, wait_ms: int) -> dict[str, object]:
    javboys = inspect_page(page, base_url.replace("127.0.0.1", "javboys.com"), wait_ms)
    missav = inspect_page(page, base_url.replace("127.0.0.1", "missav.com"), wait_ms)

    checks = {
        "javboysGlobalHidden": javboys["elements"]["global-ad"]["display"] == "none",
        "javboysSiteHidden": javboys["elements"]["javboys-site-ad"]["display"] == "none",
        "javboysMissavStillVisible": javboys["elements"]["missav-site-ad"]["display"] != "none",
        "javboysNormalVisible": javboys["elements"]["normal-card"]["display"] != "none",
        "javboysStylePresent": bool(javboys["styleElementPresent"]) and int(javboys["styleLength"]) > 0,
        "missavGlobalHidden": missav["elements"]["global-ad"]["display"] == "none",
        "missavSiteHidden": missav["elements"]["missav-site-ad"]["display"] == "none",
        "missavJavboysStillVisible": missav["elements"]["javboys-site-ad"]["display"] != "none",
        "missavNormalVisible": missav["elements"]["normal-card"]["display"] != "none",
        "missavStylePresent": bool(missav["styleElementPresent"]) and int(missav["styleLength"]) > 0,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "pages": {
            "javboys": javboys,
            "missav": missav
        }
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-cosmetic-regression-"))

    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                channel=args.browser_channel,
                headless=args.headless,
                args=build_context_args(extension_dir),
            )

            try:
                extension_id = smoke.wait_for_extension_id(context, args.timeout_ms)
                registered_scripts = smoke.wait_for_extension_ready(context, args.timeout_ms)
                page = context.new_page()
                report = build_report(f"{server.base_url}/test-cosmetic-filter.html", page, args.wait_ms)
                print(json.dumps({
                    "ok": report["ok"],
                    "extensionId": extension_id,
                    "registeredScripts": registered_scripts,
                    "report": report
                }, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        server.close()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
