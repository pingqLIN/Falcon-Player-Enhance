from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402
from playwright.sync_api import Page, sync_playwright  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run anti-antiblock whitelist-mode regression against storage-backed whitelist state."
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
        help="Wait time after page load before collecting DOM state."
    )
    return parser.parse_args()


def build_context_args(extension_dir: Path) -> list[str]:
    host_rules = ",".join([
        "MAP javboys.com 127.0.0.1",
        "MAP javboys.online 127.0.0.1"
    ])
    return [
        *smoke.build_extension_args(extension_dir),
        f"--host-resolver-rules={host_rules}"
    ]


def set_whitelist_state(page: Page, whitelist: list[str], whitelist_enhance_only: bool) -> None:
    worker = smoke.get_extension_worker(page.context)
    worker.evaluate(
        """async ({ whitelist, whitelistEnhanceOnly }) => {
            await chrome.storage.local.set({
                whitelist,
                whitelistEnhanceOnly
            });
            return true;
        }""",
        {
            "whitelist": whitelist,
            "whitelistEnhanceOnly": whitelist_enhance_only
        }
    )


def inspect_current_page(page: Page, wait_ms: int) -> dict[str, object]:
    page.wait_for_timeout(wait_ms)
    return page.evaluate(
        """() => {
            const message = document.getElementById('anti-adblock-message');
            const frame = document.getElementById('player-frame');
            const messageStyle = message ? window.getComputedStyle(message) : null;
            const frameStyle = frame ? window.getComputedStyle(frame) : null;
            const styleElement = document.getElementById('__shield_anti_adblock_css__');

            return {
                hostname: window.location.hostname,
                styleElementPresent: Boolean(styleElement),
                messagePresent: Boolean(message),
                messageDisplay: messageStyle ? messageStyle.display : null,
                messageVisibility: messageStyle ? messageStyle.visibility : null,
                frameDisplay: frameStyle ? frameStyle.display : null,
                frameVisibility: frameStyle ? frameStyle.visibility : null,
                antiBypassLoaded: Boolean(window.__antiAdblockBypassLoaded),
                antiAntiblockInitDone: Boolean(window.__antiAntiblockInitDone)
            };
        }"""
    )


def inspect_page(page: Page, url: str, wait_ms: int) -> dict[str, object]:
    page.goto(url, wait_until="domcontentloaded")
    return inspect_current_page(page, wait_ms)


def build_report(base_url: str, page: Page, wait_ms: int) -> dict[str, object]:
    host_url = base_url.replace("127.0.0.1", "javboys.com")

    set_whitelist_state(page, ["youtube.com", "www.javboys.com"], True)
    whitelist_mode = inspect_page(page, host_url, wait_ms)

    set_whitelist_state(page, ["youtube.com", "www.javboys.com"], False)
    strict_mode = inspect_current_page(page, wait_ms)

    set_whitelist_state(page, ["youtube.com", "www.javboys.com"], True)
    whitelist_restored = inspect_current_page(page, wait_ms)

    set_whitelist_state(page, ["youtube.com"], True)
    non_whitelist = inspect_page(page, host_url, wait_ms)

    checks = {
        "whitelistSkippedStyle": not bool(whitelist_mode["styleElementPresent"]),
        "whitelistMessageVisible": bool(whitelist_mode["messagePresent"]) and whitelist_mode["messageDisplay"] != "none",
        "strictModeInjectedStyle": bool(strict_mode["styleElementPresent"]),
        "strictModeMessageHidden": (not bool(strict_mode["messagePresent"])) or strict_mode["messageDisplay"] == "none",
        "strictModeIframeVisible": strict_mode["frameDisplay"] != "none" and strict_mode["frameVisibility"] != "hidden",
        "whitelistRestoreRemovedStyle": not bool(whitelist_restored["styleElementPresent"]),
        "whitelistRestoreMessageVisible": bool(whitelist_restored["messagePresent"]) and whitelist_restored["messageDisplay"] != "none",
        "whitelistRestoreIframeVisible": whitelist_restored["frameDisplay"] != "none" and whitelist_restored["frameVisibility"] != "hidden",
        "nonWhitelistInjectedStyle": bool(non_whitelist["styleElementPresent"]),
        "nonWhitelistMessageHidden": (not bool(non_whitelist["messagePresent"])) or non_whitelist["messageDisplay"] == "none",
        "nonWhitelistIframeVisible": non_whitelist["frameDisplay"] != "none" and non_whitelist["frameVisibility"] != "hidden",
        "antiAntiblockInitDone": bool(non_whitelist["antiAntiblockInitDone"]) and bool(whitelist_mode["antiAntiblockInitDone"]) and bool(strict_mode["antiAntiblockInitDone"]) and bool(whitelist_restored["antiAntiblockInitDone"]),
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "pages": {
            "whitelistMode": whitelist_mode,
            "strictMode": strict_mode,
            "whitelistRestored": whitelist_restored,
            "nonWhitelist": non_whitelist
        }
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-anti-antiblock-regression-"))

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
                report = build_report(
                    f"{server.base_url}/test-anti-antiblock-whitelist.html",
                    page,
                    args.wait_ms
                )
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
