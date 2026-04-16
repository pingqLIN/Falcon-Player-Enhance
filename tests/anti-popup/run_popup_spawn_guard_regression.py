from __future__ import annotations

import argparse
import json
import sys
import tempfile
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify suspicious popup tabs spawned from managed player sites are closed and do not break back navigation."
    )
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=20000)
    parser.add_argument("--wait-ms", type=int, default=2500)
    return parser.parse_args()


def build_browser_args() -> list[str]:
    host_rules = ",".join([
        "MAP starter.test 127.0.0.1",
        "MAP javboys.com 127.0.0.1",
        "MAP popup-source.test 127.0.0.1",
        "MAP displayendpointstarring.com 127.0.0.1",
    ])
    return [f"--host-resolver-rules={host_rules}"]


def get_iframe_click_point(page) -> dict[str, float]:
    point = page.evaluate(
        """() => {
            const frame = document.getElementById('trap-frame');
            if (!frame) return null;
            const rect = frame.getBoundingClientRect();
            window.scrollTo(0, Math.max(0, rect.top + window.scrollY - 180));
            const next = frame.getBoundingClientRect();
            return {
                x: next.left + next.width / 2,
                y: next.top + next.height / 2,
                width: next.width,
                height: next.height
            };
        }"""
    )
    if not point:
        raise RuntimeError("trap_frame_missing")
    return point


def get_external_page_urls(context) -> list[str]:
    urls: list[str] = []
    for current_page in context.pages:
        url = current_page.url
        if not url:
            continue
        if url.startswith("about:") or url.startswith("chrome-extension://"):
            continue
        urls.append(url)
    return urls


def build_report(
    before_urls: list[str],
    after_click_urls: list[str],
    current_url: str,
    after_back_url: str,
) -> dict[str, object]:
    checks = {
        "suspiciousPopupClosed": not any("displayendpointstarring.com" in url for url in after_click_urls),
        "openerStayedOnManagedPage": "javboys.com" in current_url,
        "backNavigationReturnedToStart": "starter.test" in after_back_url,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "beforeUrls": before_urls,
            "afterClickUrls": after_click_urls,
            "currentUrl": current_url,
            "afterBackUrl": after_back_url,
        },
    }


def main() -> int:
    args = parse_args()
    server = smoke.StaticServer(REPO_ROOT)
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-popup-guard-"))

    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                channel=args.browser_channel,
                headless=args.headless,
                args=smoke.build_extension_args(REPO_ROOT / "extension") + build_browser_args(),
                viewport={"width": 1440, "height": 960},
            )
            try:
                extension_id = smoke.wait_for_extension_id(context, args.timeout_ms)
                smoke.wait_for_extension_ready(context, args.timeout_ms)

                page = context.new_page()
                start_url = f"{server.base_url}/tests/test-popup-spawn-guard-start.html".replace("127.0.0.1", "starter.test")
                host_url = f"{server.base_url}/tests/test-popup-spawn-guard.html".replace("127.0.0.1", "javboys.com")

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.goto(host_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)

                before_urls = get_external_page_urls(context)
                point = get_iframe_click_point(page)
                page.mouse.click(point["x"], point["y"])
                page.wait_for_timeout(args.wait_ms)

                after_click_urls = get_external_page_urls(context)
                current_url = page.url

                page.go_back(wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(800)
                after_back_url = page.url

                report = build_report(before_urls, after_click_urls, current_url, after_back_url)
                print(json.dumps({
                    "ok": report["ok"],
                    "extensionId": extension_id,
                    "report": report,
                }, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        server.close()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
