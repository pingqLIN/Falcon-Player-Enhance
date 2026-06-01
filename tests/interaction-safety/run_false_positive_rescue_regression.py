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
        description="Verify false-positive rescue can restore a single blocked click target."
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
    page.wait_for_timeout(800)
    return page


def seed_hidden_rule(extension_page, hostname: str) -> None:
    extension_page.evaluate(
        """async ({ hostname }) => {
            await chrome.storage.local.set({
                hiddenElements: [{
                    selector: ".blocked-cta",
                    hostname,
                    timestamp: Date.now()
                }],
                falconActionRecords: [],
                falsePositiveObservations: []
            });
        }""",
        {"hostname": hostname},
    )


def runtime_message(page, payload: dict[str, object]) -> dict[str, object]:
    return page.evaluate(
        """(payload) => new Promise((resolve) => {
            chrome.runtime.sendMessage(payload, (response) => resolve(response || {}));
        })""",
        payload,
    )


def tab_message(extension_page, target_url: str, payload: dict[str, object]) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl, payload }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { success: false, error: 'target_tab_missing' };
            }

            return await new Promise((resolve) => {
                chrome.tabs.sendMessage(targetTab.id, payload, (response) => {
                    resolve({
                        ...(response || {}),
                        tabId: targetTab.id,
                        lastError: chrome.runtime.lastError?.message || null
                    });
                });
            });
        }""",
        {"targetUrl": target_url, "payload": payload},
    )


def inject_cosmetic_filter(extension_page, target_url: str) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { success: false, error: 'target_tab_missing' };
            }

            await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                files: ['content/cosmetic-filter.js']
            });
            return { success: true, tabId: targetTab.id };
        }""",
        {"targetUrl": target_url},
    )


def button_state(page) -> dict[str, object]:
    return page.evaluate(
        """() => {
            const button = document.getElementById('checkout-button');
            const style = window.getComputedStyle(button);
            return {
                display: style.display,
                visibility: style.visibility,
                rescued: button.getAttribute('data-shield-rescued') || '',
                actionId: button.getAttribute('data-shield-action-id') || '',
                metrics: { ...(window.__falconRescueMetrics || {}) }
            };
        }"""
    )


def build_report(
    hidden_state: dict[str, object],
    collected: dict[str, object],
    rescue_response: dict[str, object],
    report_response: dict[str, object],
    final_state: dict[str, object],
    observations_response: dict[str, object],
) -> dict[str, object]:
    records = collected.get("records", []) if isinstance(collected, dict) else []
    observations = observations_response.get("observations", []) if isinstance(observations_response, dict) else []
    checks = {
        "targetInitiallyHidden": hidden_state.get("display") == "none" or hidden_state.get("visibility") == "hidden",
        "actionCollected": len(records) >= 1 and records[0].get("selector") == ".blocked-cta",
        "rescueSucceeded": rescue_response.get("success") is True,
        "targetMarkedRescued": bool(final_state.get("rescued")),
        "targetVisibleAfterRescue": final_state.get("display") != "none" and final_state.get("visibility") != "hidden",
        "clickWorksAfterRescue": int(final_state.get("metrics", {}).get("checkoutClicks", 0)) == 1,
        "falsePositiveReported": report_response.get("success") is True,
        "observationPersisted": len(observations) >= 1 and observations[0].get("selector") == ".blocked-cta",
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "hiddenState": hidden_state,
            "collected": collected,
            "rescueResponse": rescue_response,
            "reportResponse": report_response,
            "finalState": final_state,
            "observations": observations_response,
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-fp-rescue-"))

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

                extension_page = open_dashboard_page(context, extension_id, args.timeout_ms)
                seed_hidden_rule(extension_page, "127.0.0.1")

                target_url = f"{server.base_url}/test-false-positive-rescue.html"
                page = context.new_page()
                page.goto(target_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                inject_result = inject_cosmetic_filter(extension_page, target_url)
                if not inject_result.get("success"):
                    raise RuntimeError(f"inject_cosmetic_filter_failed:{inject_result}")
                page.wait_for_timeout(1000)

                hidden_state = button_state(page)
                collected = tab_message(extension_page, target_url, {"action": "collectFalconActions"})
                records = collected.get("records", [])
                action_id = records[0].get("id") if records else ""
                if not action_id:
                    raise RuntimeError(f"missing_action_record:{collected}")

                rescue_response = runtime_message(extension_page, {
                    "action": "rescueFalconAction",
                    "actionId": action_id,
                })
                page.wait_for_timeout(500)
                page.locator("#checkout-button").click()
                final_state = button_state(page)

                report_response = runtime_message(extension_page, {
                    "action": "reportFalsePositive",
                    "observation": {
                        "actionId": action_id,
                        "hostname": "127.0.0.1",
                        "pageUrl": target_url,
                        "selector": ".blocked-cta",
                        "source": "regression",
                        "reason": "rescued_click_target",
                        "result": {
                            "userConfirmed": True
                        }
                    },
                })
                observations_response = runtime_message(extension_page, {
                    "action": "getFalsePositiveObservations",
                    "hostname": "127.0.0.1",
                    "selector": ".blocked-cta",
                })

                report = build_report(
                    hidden_state,
                    collected,
                    rescue_response,
                    report_response,
                    final_state,
                    observations_response,
                )
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
