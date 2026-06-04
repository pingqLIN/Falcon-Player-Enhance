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
        description="Verify blocked page element rules can be previewed from the dashboard on the matching page."
    )
    parser.add_argument("--extension-dir", default=str(smoke.DEFAULT_EXTENSION_DIR))
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=20000)
    return parser.parse_args()


def open_dashboard_page(context, extension_id: str, timeout_ms: int):
    page = context.new_page()
    page.goto(
        f"chrome-extension://{extension_id}/dashboard/dashboard.html",
        wait_until="domcontentloaded",
        timeout=timeout_ms,
    )
    page.wait_for_timeout(1000)
    return page


def seed_hidden_rule(extension_page, hostname: str) -> None:
    extension_page.evaluate(
        """async ({ hostname }) => {
            await chrome.storage.local.set({
                hiddenElements: [{
                    selector: ".blocked-cta",
                    hostname,
                    timestamp: Date.now()
                }]
            });
        }""",
        {"hostname": hostname},
    )


def inject_cosmetic_filter(extension_page, target_url: str) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { success: false, error: "target_tab_missing" };
            }

            await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                files: ["content/cosmetic-filter.js"]
            });
            return { success: true, tabId: targetTab.id };
        }""",
        {"targetUrl": target_url},
    )


def button_state(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const button = document.getElementById("checkout-button");
            const style = window.getComputedStyle(button);
            return {
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                preview: button.getAttribute("data-shield-rescue-preview") || "",
                outlineStyle: style.outlineStyle,
                actionId: button.getAttribute("data-shield-action-id") || ""
            };
        }"""
    )


def build_report(
    hidden_state: dict[str, object],
    preview_state: dict[str, object],
    final_state: dict[str, object],
    summary_text: str,
) -> dict[str, object]:
    checks = {
        "targetInitiallyHidden": hidden_state.get("display") == "none" or hidden_state.get("visibility") == "hidden",
        "previewShowsTarget": preview_state.get("display") != "none" and preview_state.get("visibility") != "hidden",
        "previewMarksTarget": preview_state.get("preview") == "1",
        "previewUsesOutline": preview_state.get("outlineStyle") not in ("", "none"),
        "summaryReportsMatch": "1" in summary_text,
        "previewAutoClears": final_state.get("preview") == "" and (
            final_state.get("display") == "none" or final_state.get("visibility") == "hidden"
        ),
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "hiddenState": hidden_state,
            "previewState": preview_state,
            "finalState": final_state,
            "summaryText": summary_text,
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-blocked-preview-"))

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

                target_url = f"{server.base_url}/test-false-positive-rescue.html"
                page = context.new_page()
                page.goto(target_url, wait_until="domcontentloaded", timeout=args.timeout_ms)

                dashboard_page = open_dashboard_page(context, extension_id, args.timeout_ms)
                seed_hidden_rule(dashboard_page, "127.0.0.1")
                inject_result = inject_cosmetic_filter(dashboard_page, target_url)
                if not inject_result.get("success"):
                    raise RuntimeError(f"inject_cosmetic_filter_failed:{inject_result}")

                page.wait_for_timeout(1000)
                hidden_state = button_state(page)

                dashboard_page.reload(wait_until="domcontentloaded", timeout=args.timeout_ms)
                dashboard_page.wait_for_timeout(1000)
                dashboard_page.locator('.menu-item[data-tab="advanced"]').click()
                dashboard_page.wait_for_timeout(400)
                dashboard_page.locator(".btn-hidden-preview").first.click()

                page.wait_for_timeout(400)
                preview_state = button_state(page)
                summary_text = dashboard_page.locator("#hidden-elements-summary").inner_text()

                page.wait_for_timeout(7300)
                final_state = button_state(page)

                report = build_report(hidden_state, preview_state, final_state, summary_text)
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
