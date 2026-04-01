import argparse
import json
import sys
import tempfile
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

def verify_x_feed_popup(page, context, timeout_ms: int) -> dict:
    existing_ids = {int(item["id"]) for item in smoke.list_popup_player_windows(context)}
    dispatch = page.evaluate(
        """() => {
            const section = document.querySelector('[data-case-id="x-feed-muted"]');
            const targetNode = section?.querySelector('video[data-shield-id][data-popup-button-attached="true"], video[data-shield-id]');
            const targetId = targetNode?.dataset?.shieldId || '';
            if (!targetId) {
                return { ok: false, reason: 'x_target_missing' };
            }
            const selector = '.shield-popup-player-btn[data-shield-popup-target-id="' + targetId + '"]';
            const button = document.querySelector(selector);
            if (!button) {
                return { ok: false, reason: 'x_button_missing', targetId };
            }
            const before = {
                targetId,
                videoSrc: button.dataset.shieldPopupVideoSrc || '',
                iframeSrc: button.dataset.shieldPopupIframeSrc || ''
            };
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return { ok: true, before };
        }"""
    )
    if dispatch.get("ok") is not True:
        return {
            "ok": False,
            "dispatch": dispatch,
            "popupUrl": "",
        }

    popup = smoke.wait_for_popup_player_window(context, existing_ids, timeout_ms)
    popup_url = str(popup["tabs"][0]["url"]) if popup.get("tabs") else ""
    has_usable_payload = (
        "playerId=" in popup_url and
        ("videoSrc=" in popup_url or "iframeSrc=" in popup_url)
    )
    return {
        "ok": "popup-player/popup-player.html" in popup_url and has_usable_payload,
        "dispatch": dispatch,
        "popupUrl": popup_url,
        "hasUsablePayload": has_usable_payload,
    }


def verify_hidden_button_pass_through(page) -> dict:
    input_locator = page.locator("#interaction-guard-input")
    button_locator = page.locator("#interaction-guard-button")
    input_locator.click(timeout=10000)
    page.keyboard.type("falcon-pass-through")
    button_locator.click(timeout=10000)
    state = page.evaluate(
        """() => ({
            activeElementId: document.activeElement?.id || '',
            inputValue: document.getElementById('interaction-guard-input')?.value || '',
            inputFocusedCount: Number(window.interactionState?.inputFocusedCount || 0),
            buttonClickedCount: Number(window.interactionState?.buttonClickedCount || 0)
        })"""
    )
    ok = (
        state["inputValue"] == "falcon-pass-through" and
        state["inputFocusedCount"] > 0 and
        state["buttonClickedCount"] > 0
    )
    return {
        "ok": ok,
        "state": state,
    }


def verify_linked_preview_card_click(page) -> dict:
    card = page.locator("#linked-preview-card")
    card.click(timeout=10000)
    state = page.evaluate(
        """() => ({
            hash: window.location.hash || '',
            linkedPreviewClicks: Number(window.interactionState?.linkedPreviewClicks || 0),
            popupButtonCount: document.querySelectorAll('.shield-popup-player-btn').length,
            linkedPreviewDetected: Boolean(document.querySelector('#linked-preview-card [data-shield-id], #linked-preview-card .shield-detected-player, #linked-preview-card .shield-detected-container'))
        })"""
    )
    ok = (
        state["hash"] == "#linked-preview-clicked" and
        state["linkedPreviewClicks"] > 0 and
        state["linkedPreviewDetected"] is False
    )
    return {
        "ok": ok,
        "state": state,
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()

    try:
        with sync_playwright() as playwright:
            with tempfile.TemporaryDirectory(prefix="falcon-player-detection-") as profile_dir:
                context = playwright.chromium.launch_persistent_context(
                    profile_dir,
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
                    interaction_smoke = verify_hidden_button_pass_through(page)
                    linked_preview_smoke = verify_linked_preview_card_click(page)
                    report = page.evaluate("() => window.__collectRegressionReport?.() || window.__regressionReport || null")
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
                    x_popup = verify_x_feed_popup(page, context, args.timeout_ms)
                    ok = (
                        total_cases > 0 and
                        passed_cases == total_cases and
                        x_popup.get("ok") is True and
                        interaction_smoke.get("ok") is True and
                        linked_preview_smoke.get("ok") is True
                    )
                    print(json.dumps({
                        "ok": ok,
                        "extensionId": extension_id,
                        "registeredScripts": registered_scripts,
                        "report": report,
                        "interactionSmoke": interaction_smoke,
                        "linkedPreviewSmoke": linked_preview_smoke,
                        "xPopupSmoke": x_popup,
                    }, ensure_ascii=False, indent=2))
                    return 0 if ok else 1
                finally:
                    context.close()
    finally:
        server.close()


if __name__ == "__main__":
    raise SystemExit(main())
