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
        description="Verify element-picker injection stays inert until explicitly activated."
    )
    parser.add_argument("--extension-dir", default=str(smoke.DEFAULT_EXTENSION_DIR))
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=20000)
    return parser.parse_args()


def collect_metrics(page) -> dict[str, int]:
    return page.evaluate("() => ({ ...(window.__authMetrics || {}) })")


def click_oauth(page) -> None:
    page.locator("#oauth-google").click(force=True)
    page.wait_for_timeout(250)


def collect_picker_state(extension_page, target_url: str) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { error: 'target_tab_missing' };
            }

            const send = (message) => new Promise((resolve) => {
                chrome.tabs.sendMessage(targetTab.id, message, (response) => {
                    resolve({
                        response: response || null,
                        lastError: chrome.runtime.lastError?.message || null
                    });
                });
            });

            const state = await send({ action: 'getPickerState' });
            return {
                tabId: targetTab.id,
                pickerActive: Boolean(state.response?.active),
                lastError: state.lastError
            };
        }""",
        {"targetUrl": target_url},
    )


def inject_picker_script(extension_page, target_url: str) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { success: false, error: 'target_tab_missing' };
            }

            await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                files: ['content/element-picker.js']
            });

            return { success: true, tabId: targetTab.id };
        }""",
        {"targetUrl": target_url},
    )


def activate_picker_via_background(extension_page, target_url: str) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { success: false, error: 'target_tab_missing' };
            }

            const response = await chrome.runtime.sendMessage({
                action: 'injectElementPicker',
                tabId: targetTab.id
            });

            return response || { success: false, error: 'missing_response' };
        }""",
        {"targetUrl": target_url},
    )


def deactivate_picker(extension_page, target_url: str) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl }) => {
            const tabs = await chrome.tabs.query({});
            const targetTab = tabs.find((tab) => tab.url === targetUrl);
            if (!targetTab?.id) {
                return { success: false, error: 'target_tab_missing' };
            }

            return await chrome.tabs.sendMessage(targetTab.id, { action: 'deactivateElementPicker' });
        }""",
        {"targetUrl": target_url},
    )


def build_report(
    initial_metrics: dict[str, int],
    after_injection_metrics: dict[str, int],
    after_activation_metrics: dict[str, int],
    after_deactivation_metrics: dict[str, int],
    picker_after_injection: dict[str, object],
    picker_after_activation: dict[str, object],
    picker_after_deactivation: dict[str, object],
) -> dict[str, object]:
    checks = {
        "injectionKeepsPickerInactive": picker_after_injection.get("pickerActive") is False,
        "injectionDoesNotBlockClicks": int(after_injection_metrics.get("oauthClicks", 0)) == int(initial_metrics.get("oauthClicks", 0)) + 1,
        "backgroundActivationTurnsPickerOn": picker_after_activation.get("pickerActive") is True,
        "deactivateTurnsPickerOff": picker_after_deactivation.get("pickerActive") is False,
        "deactivatedPickerRestoresClicks": int(after_deactivation_metrics.get("oauthClicks", 0)) == int(after_activation_metrics.get("oauthClicks", 0)) + 1,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "initialMetrics": initial_metrics,
            "afterInjectionMetrics": after_injection_metrics,
            "afterActivationMetrics": after_activation_metrics,
            "afterDeactivationMetrics": after_deactivation_metrics,
            "pickerAfterInjection": picker_after_injection,
            "pickerAfterActivation": picker_after_activation,
            "pickerAfterDeactivation": picker_after_deactivation,
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-picker-regression-"))

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
                page.wait_for_timeout(1500)

                extension_page = context.new_page()
                extension_page.goto(
                    f"chrome-extension://{extension_id}/dashboard/dashboard.html",
                    wait_until="domcontentloaded",
                    timeout=args.timeout_ms,
                )
                extension_page.wait_for_timeout(800)

                initial_metrics = collect_metrics(page)

                inject_result = inject_picker_script(extension_page, target_url)
                if not inject_result.get("success"):
                    raise RuntimeError(f"inject_failed:{inject_result}")

                picker_after_injection = collect_picker_state(extension_page, target_url)
                click_oauth(page)
                after_injection_metrics = collect_metrics(page)

                activate_result = activate_picker_via_background(extension_page, target_url)
                if not activate_result.get("success"):
                    raise RuntimeError(f"activate_failed:{activate_result}")

                page.wait_for_timeout(300)
                picker_after_activation = collect_picker_state(extension_page, target_url)
                click_oauth(page)
                after_activation_metrics = collect_metrics(page)

                deactivate_result = deactivate_picker(extension_page, target_url)
                if deactivate_result.get("success") is False:
                    raise RuntimeError(f"deactivate_failed:{deactivate_result}")

                page.wait_for_timeout(300)
                picker_after_deactivation = collect_picker_state(extension_page, target_url)
                click_oauth(page)
                after_deactivation_metrics = collect_metrics(page)

                report = build_report(
                    initial_metrics,
                    after_injection_metrics,
                    after_activation_metrics,
                    after_deactivation_metrics,
                    picker_after_injection,
                    picker_after_activation,
                    picker_after_deactivation,
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
