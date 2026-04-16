from __future__ import annotations

import argparse
import json
import sys
import tempfile
import shutil
import time
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


def set_popup_guard_enabled(context, enabled: bool) -> None:
    worker = smoke.get_extension_worker(context)
    worker.evaluate(
        """async ({ enabled }) => {
            await chrome.storage.local.set({ popupGuardEnabled: enabled === true });
            return true;
        }""",
        {"enabled": enabled},
    )
    time.sleep(0.25)


def build_report(
    enabled_sample: dict[str, object],
    disabled_sample: dict[str, object],
) -> dict[str, object]:
    checks = {
        "enabledGuardClosedPopup": not any("displayendpointstarring.com" in url for url in enabled_sample["afterClickUrls"]),
        "enabledOpenerStayedOnManagedPage": "javboys.com" in str(enabled_sample["currentUrl"]),
        "enabledBackNavigationReturnedToStart": "starter.test" in str(enabled_sample["afterBackUrl"]),
        "disabledGuardLeavesPopupOpen": any("displayendpointstarring.com" in url for url in disabled_sample["afterClickUrls"]),
        "disabledOpenerStayedOnManagedPage": "javboys.com" in str(disabled_sample["currentUrl"]),
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "enabled": enabled_sample,
            "disabled": disabled_sample,
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

                set_popup_guard_enabled(context, True)
                before_urls = get_external_page_urls(context)
                point = get_iframe_click_point(page)
                page.mouse.click(point["x"], point["y"])
                page.wait_for_timeout(args.wait_ms)

                after_click_urls = get_external_page_urls(context)
                current_url = page.url

                page.go_back(wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(800)
                after_back_url = page.url

                enabled_sample = {
                    "beforeUrls": before_urls,
                    "afterClickUrls": after_click_urls,
                    "currentUrl": current_url,
                    "afterBackUrl": after_back_url,
                }

                for popup_page in list(context.pages):
                    if popup_page is page or popup_page.is_closed():
                        continue
                    if "displayendpointstarring.com" in popup_page.url:
                        popup_page.close()

                set_popup_guard_enabled(context, False)
                page.goto(host_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)

                disabled_before_urls = get_external_page_urls(context)
                point = get_iframe_click_point(page)
                page.mouse.click(point["x"], point["y"])
                page.wait_for_timeout(args.wait_ms)

                disabled_after_click_urls = get_external_page_urls(context)
                disabled_current_url = page.url
                disabled_sample = {
                    "beforeUrls": disabled_before_urls,
                    "afterClickUrls": disabled_after_click_urls,
                    "currentUrl": disabled_current_url,
                }

                report = build_report(enabled_sample, disabled_sample)
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
