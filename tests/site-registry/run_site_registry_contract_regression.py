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
        description="Run getSiteRegistry contract regression through a real extension page."
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
    return parser.parse_args()


def fetch_site_registry_contract(page, extension_id: str) -> dict[str, object]:
    page.goto(f"chrome-extension://{extension_id}/dashboard/dashboard.html", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    return page.evaluate(
        """async () => {
            const result = await chrome.runtime.sendMessage({ action: 'getSiteRegistry' });
            return {
                success: Boolean(result?.success),
                popupDirectIframeHosts: result?.profiles?.popupDirectIframeHosts || [],
                compatibilityModeSites: result?.profiles?.compatibilityModeSites || [],
                injectBlockerKnownOverlaySelectors: result?.profiles?.injectBlocker?.knownOverlaySelectors || [],
                cosmeticFilterGlobalSelectors: result?.profiles?.cosmeticFilter?.globalSelectors || []
            };
        }"""
    )


def build_report(contract: dict[str, object]) -> dict[str, object]:
    popup_hosts = contract["popupDirectIframeHosts"]
    compatibility_sites = contract["compatibilityModeSites"]
    overlay_selectors = contract["injectBlockerKnownOverlaySelectors"]
    cosmetic_selectors = contract["cosmeticFilterGlobalSelectors"]

    checks = {
        "success": bool(contract["success"]),
        "popupDirectIframeHosts": isinstance(popup_hosts, list) and "boyfriendtv.com" in popup_hosts,
        "compatibilityModeSites": isinstance(compatibility_sites, list) and "boyfriendtv.com" in compatibility_sites,
        "injectOverlaySelectors": isinstance(overlay_selectors, list) and ".cvpboxOverlay" in overlay_selectors,
        "cosmeticFilterSelectors": isinstance(cosmetic_selectors, list) and '[class*="player-overlay-ad"]' in cosmetic_selectors
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "contract": contract
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-site-registry-contract-"))

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
                contract = fetch_site_registry_contract(page, extension_id)
                report = build_report(contract)
                print(json.dumps({
                    "ok": report["ok"],
                    "extensionId": extension_id,
                    "report": report
                }, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
