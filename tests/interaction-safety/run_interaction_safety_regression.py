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
        description="Run interaction safety regression against a login/auth-like page."
    )
    parser.add_argument("--extension-dir", default=str(smoke.DEFAULT_EXTENSION_DIR))
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=20000)
    return parser.parse_args()


def collect_helper_state(extension_page, target_url: str) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { helperPresent: false, error: 'target_tab_missing' };
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

            return result?.result || { helperPresent: false, error: 'missing_result' };
        }""",
        {
            "targetUrl": target_url,
        },
    )


def collect_dom_state(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const overlay = document.getElementById('auth-overlay');
            const preview = document.getElementById('preview-video');
            const overlayStyle = overlay ? window.getComputedStyle(overlay) : null;
            const previewStyle = preview ? window.getComputedStyle(preview) : null;
            return {
                detectorCount: document.querySelectorAll('.shield-detected-player, .shield-detected-container').length,
                popupButtons: document.querySelectorAll('.shield-popup-player-btn').length,
                overlayVisible: Boolean(overlay) && overlayStyle.display !== 'none' && overlayStyle.visibility !== 'hidden',
                previewHidden: Boolean(preview) && (
                    preview.dataset.shieldFakeRemoved ||
                    previewStyle.display === 'none' ||
                    previewStyle.visibility === 'hidden'
                ),
                metrics: window.__authMetrics || {}
            };
        }"""
    )


def build_report(initial_state: dict[str, object], initial_dom: dict[str, object], final_state: dict[str, object], final_dom: dict[str, object]) -> dict[str, object]:
    safety = final_state.get("state", {}).get("interactionSafety", {})
    metrics = final_dom.get("metrics", {})
    checks = {
        "helperPresent": bool(final_state.get("helperPresent")),
        "interactionSensitivePage": safety.get("interactionSensitivePage") is True,
        "mediaAutomationDisabled": final_state.get("shouldRunMediaAutomation") is False,
        "cleanupStillAllowed": final_state.get("shouldRunCleanup") is True,
        "noPlayerDetection": int(final_dom.get("detectorCount", 0)) == 0,
        "noPopupButtons": int(final_dom.get("popupButtons", 0)) == 0,
        "authOverlayStillVisible": final_dom.get("overlayVisible") is True,
        "previewVideoNotHidden": final_dom.get("previewHidden") is False,
        "oauthClickWorked": int(metrics.get("oauthClicks", 0)) >= 1,
        "keydownNotIntercepted": int(metrics.get("keydowns", 0)) >= 1,
        "formSubmitWorked": int(metrics.get("submits", 0)) >= 1,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "initial": {
                "helper": initial_state,
                "dom": initial_dom,
            },
            "final": {
                "helper": final_state,
                "dom": final_dom,
            },
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-interaction-safety-"))

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

                page = context.new_page()
                target_url = f"{server.base_url}/test-interaction-safety.html"
                page.goto(target_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(1800)

                extension_page = context.new_page()
                extension_page.goto(f"chrome-extension://{extension_id}/dashboard/dashboard.html", wait_until="domcontentloaded", timeout=args.timeout_ms)
                extension_page.wait_for_timeout(1200)

                initial_state = collect_helper_state(extension_page, target_url)
                initial_dom = collect_dom_state(page)

                page.locator("#oauth-google").click()
                page.locator("body").press("Space")
                page.locator("#submit-login").click()
                page.wait_for_timeout(500)

                final_state = collect_helper_state(extension_page, target_url)
                final_dom = collect_dom_state(page)
                report = build_report(initial_state, initial_dom, final_state, final_dom)
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
