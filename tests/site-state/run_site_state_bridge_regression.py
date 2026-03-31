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
        description="Run document_start site-state bridge regression against the unpacked extension."
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
        default=500,
        help="Wait time after storage changes before collecting bridge messages."
    )
    return parser.parse_args()


def build_context_args(extension_dir: Path) -> list[str]:
    host_rules = "MAP javboys.com 127.0.0.1"
    return [
        *smoke.build_extension_args(extension_dir),
        f"--host-resolver-rules={host_rules}"
    ]


def set_storage_state(extension_page, whitelist: list[str], whitelist_enhance_only: bool) -> None:
    extension_page.evaluate(
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
        },
    )


def collect_messages(page) -> list[dict[str, object]]:
    return page.evaluate("() => Array.isArray(window.__bridgeMessages) ? [...window.__bridgeMessages] : []")


def build_report(initial_messages: list[dict[str, object]], whitelist_messages: list[dict[str, object]], strict_messages: list[dict[str, object]]) -> dict[str, object]:
    initial_last = initial_messages[-1] if initial_messages else {}
    whitelist_last = whitelist_messages[-1] if whitelist_messages else {}
    strict_last = strict_messages[-1] if strict_messages else {}

    checks = {
        "initialMessagePresent": len(initial_messages) >= 1,
        "initialStateShapeValid": isinstance(initial_last.get("whitelistDomains"), list) and initial_last.get("whitelistEnhanceOnly") is True,
        "whitelistUpdateObserved": len(whitelist_messages) > len(initial_messages) and "javboys.com" in whitelist_last.get("whitelistDomains", []),
        "whitelistNormalizedHost": "www.javboys.com" not in whitelist_last.get("whitelistDomains", []),
        "strictModeUpdateObserved": len(strict_messages) > len(whitelist_messages) and strict_last.get("whitelistEnhanceOnly") is False,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "initial": initial_messages,
            "whitelist": whitelist_messages,
            "strict": strict_messages,
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-site-state-bridge-"))

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
                smoke.wait_for_extension_ready(context, args.timeout_ms)

                bridge_page = context.new_page()
                bridge_page.goto(
                    f"{server.base_url.replace('127.0.0.1', 'javboys.com')}/test-site-state-bridge.html",
                    wait_until="domcontentloaded",
                    timeout=args.timeout_ms,
                )
                bridge_page.wait_for_timeout(1200)

                extension_page = context.new_page()
                extension_page.goto(
                    f"chrome-extension://{extension_id}/dashboard/dashboard.html",
                    wait_until="domcontentloaded",
                    timeout=args.timeout_ms,
                )
                extension_page.wait_for_timeout(1200)

                initial_messages = collect_messages(bridge_page)

                set_storage_state(extension_page, ["www.javboys.com"], True)
                bridge_page.wait_for_timeout(args.wait_ms)
                whitelist_messages = collect_messages(bridge_page)

                set_storage_state(extension_page, ["www.javboys.com"], False)
                bridge_page.wait_for_timeout(args.wait_ms)
                strict_messages = collect_messages(bridge_page)

                report = build_report(initial_messages, whitelist_messages, strict_messages)
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
