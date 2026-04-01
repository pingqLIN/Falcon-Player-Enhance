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
        description="Run canonical site-state helper regression through a real extension page."
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
        default=300,
        help="Wait time after storage changes before sampling helper state."
    )
    return parser.parse_args()


def build_browser_args(extension_dir: Path) -> list[str]:
    host_rules = "MAP falcon-whitelist.test 127.0.0.1"
    return [
        *smoke.build_extension_args(extension_dir),
        f"--host-resolver-rules={host_rules}",
    ]


def collect_helper_state(extension_page, target_url: str, whitelist: list[str], whitelist_enhance_only: bool, wait_ms: int) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl, whitelist, whitelistEnhanceOnly, waitMs }) => {
            await chrome.storage.local.set({ whitelist, whitelistEnhanceOnly });
            await new Promise((resolve) => setTimeout(resolve, waitMs));

            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { error: 'target_tab_missing', tabs: tabs.map((tab) => tab.url) };
            }

            const [result] = await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: async () => {
                    const helper = window.__ShieldSiteStateHelper;
                    if (!helper?.load || !helper?.getState) {
                        return { helperPresent: false };
                    }

                    await helper.load();
                    return {
                        helperPresent: true,
                        state: helper.getState(),
                        shouldRunCleanup: helper.shouldRunCleanup(window.location.hostname),
                        shouldRunMediaAutomation: helper.shouldRunMediaAutomation(window.location.hostname)
                    };
                }
            });

            return result?.result || null;
        }""",
        {
            "targetUrl": target_url,
            "whitelist": whitelist,
            "whitelistEnhanceOnly": whitelist_enhance_only,
            "waitMs": wait_ms,
        },
    )


def build_report(initial_state: dict[str, object], whitelist_mode: dict[str, object], strict_mode: dict[str, object]) -> dict[str, object]:
    initial_domains = initial_state.get("state", {}).get("whitelistDomains", [])
    whitelist_domains = whitelist_mode.get("state", {}).get("whitelistDomains", [])
    strict_domains = strict_mode.get("state", {}).get("whitelistDomains", [])

    checks = {
        "helperPresentInitially": bool(initial_state.get("helperPresent")),
        "initialCleanupEnabled": initial_state.get("shouldRunCleanup") is True and initial_domains == [],
        "initialMediaAutomationEnabled": initial_state.get("shouldRunMediaAutomation") is True,
        "whitelistEnhanceOnlyDisablesCleanup": whitelist_mode.get("shouldRunCleanup") is False and "falcon-whitelist.test" in whitelist_domains,
        "whitelistEnhanceOnlyDisablesMediaAutomation": whitelist_mode.get("shouldRunMediaAutomation") is False and "falcon-whitelist.test" in whitelist_domains,
        "strictModeReEnablesCleanup": strict_mode.get("shouldRunCleanup") is True and "falcon-whitelist.test" in strict_domains,
        "strictModeReEnablesMediaAutomation": strict_mode.get("shouldRunMediaAutomation") is True and "falcon-whitelist.test" in strict_domains,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "initial": initial_state,
            "whitelistMode": whitelist_mode,
            "strictMode": strict_mode,
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-site-state-helper-"))

    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                channel=args.browser_channel,
                headless=args.headless,
                args=build_browser_args(extension_dir),
            )

            try:
                extension_id = smoke.wait_for_extension_id(context, args.timeout_ms)
                smoke.wait_for_extension_ready(context, args.timeout_ms)
                target_page = context.new_page()
                target_url = f"{server.base_url.replace('127.0.0.1', 'falcon-whitelist.test')}/test-site-state-helper.html"
                target_page.goto(target_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                target_page.wait_for_timeout(1200)

                extension_page = context.new_page()
                extension_page.goto(f"chrome-extension://{extension_id}/dashboard/dashboard.html", wait_until="domcontentloaded")
                extension_page.wait_for_timeout(1200)

                initial_state = collect_helper_state(extension_page, target_url, [], True, args.wait_ms)
                whitelist_mode = collect_helper_state(extension_page, target_url, ["falcon-whitelist.test"], True, args.wait_ms)
                strict_mode = collect_helper_state(extension_page, target_url, ["falcon-whitelist.test"], False, args.wait_ms)
                report = build_report(initial_state, whitelist_mode, strict_mode)

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
