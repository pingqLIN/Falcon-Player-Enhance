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
        description="Run player-controls same-page whitelist/strict transition regression."
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
        default=4500,
        help="Wait time after helper hydration or storage changes before sampling page state."
    )
    return parser.parse_args()


def build_browser_args(extension_dir: Path) -> list[str]:
    host_rules = "MAP falcon-whitelist.test 127.0.0.1"
    return [
        *smoke.build_extension_args(extension_dir),
        f"--host-resolver-rules={host_rules}",
    ]


def set_site_state(extension_page, whitelist: list[str], whitelist_enhance_only: bool, wait_ms: int) -> None:
    extension_page.evaluate(
        """async ({ whitelist, whitelistEnhanceOnly, waitMs }) => {
            await chrome.storage.local.set({ whitelist, whitelistEnhanceOnly });
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            return true;
        }""",
        {
            "whitelist": whitelist,
            "whitelistEnhanceOnly": whitelist_enhance_only,
            "waitMs": wait_ms,
        },
    )


def collect_controls_state(extension_page, target_url: str, wait_ms: int, click_speed: str | None = None) -> dict[str, object]:
    return extension_page.evaluate(
        """async ({ targetUrl, waitMs, clickSpeed }) => {
            const tabs = await chrome.tabs.query({});
            const targetHostname = (() => {
                try {
                    return new URL(targetUrl).hostname;
                } catch (_) {
                    return '';
                }
            })();
            const targetTab = tabs.find((tab) => {
                if (tab.url === targetUrl) return true;
                try {
                    return targetHostname && new URL(tab.url).hostname === targetHostname;
                } catch (_) {
                    return false;
                }
            });
            if (!targetTab?.id) {
                return { error: 'target_tab_missing', tabs: tabs.map((tab) => tab.url) };
            }

            const [result] = await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: async ({ sampleWaitMs, speedValue }) => {
                    const helper = window.__ShieldSiteStateHelper;
                    const mainVideo = document.getElementById('main-video');
                    if (!helper?.load || !helper?.getState || !mainVideo) {
                        return {
                            helperPresent: Boolean(helper?.load),
                            mainVideoPresent: Boolean(mainVideo),
                        };
                    }

                    await helper.load().catch(() => null);
                    await new Promise((resolve) => setTimeout(resolve, sampleWaitMs));

                    const speedControl = document.querySelector('.shield-speed-control');
                    const speedButtons = Array.from(document.querySelectorAll('.shield-speed-control .shield-speed-btn')).map((button) => ({
                        speed: button.getAttribute('data-speed') || '',
                        text: button.textContent?.trim() || '',
                    }));

                    if (speedValue) {
                        const targetButton = document.querySelector(`.shield-speed-control .shield-speed-btn[data-speed="${speedValue}"]`);
                        if (targetButton instanceof HTMLElement) {
                            targetButton.click();
                            await new Promise((resolve) => setTimeout(resolve, 150));
                        }
                    }

                    const activeButton = document.querySelector('.shield-speed-control .shield-speed-btn[style*="66, 133, 244"]');

                    return {
                        helperPresent: true,
                        mainVideoPresent: true,
                        state: helper.getState(),
                        shouldRunMediaAutomation: helper.shouldRunMediaAutomation(window.location.hostname),
                        speedControlCount: document.querySelectorAll('.shield-speed-control').length,
                        speedButtons,
                        playbackRate: mainVideo.playbackRate,
                        speedControlAttachedToMainShell: Boolean(mainVideo.closest('#primary-shell')?.querySelector('.shield-speed-control')),
                        activeSpeedButton: activeButton?.getAttribute('data-speed') || '',
                    };
                },
                args: [{ sampleWaitMs: waitMs, speedValue: clickSpeed }],
            });

            return result?.result || null;
        }""",
        {
            "targetUrl": target_url,
            "waitMs": wait_ms,
            "clickSpeed": click_speed,
        },
    )


def build_report(whitelist_mode: dict[str, object], strict_mode: dict[str, object], restore_mode: dict[str, object]) -> dict[str, object]:
    checks = {
        "whitelistHelperPresent": bool(whitelist_mode.get("helperPresent")),
        "whitelistMediaAutomationDisabled": whitelist_mode.get("shouldRunMediaAutomation") is False,
        "whitelistNoSpeedControls": int(whitelist_mode.get("speedControlCount", 0)) == 0,
        "strictMediaAutomationEnabled": strict_mode.get("shouldRunMediaAutomation") is True,
        "strictSpeedControlsPresent": int(strict_mode.get("speedControlCount", 0)) >= 1,
        "strictSpeedControlsAttachedToMainShell": strict_mode.get("speedControlAttachedToMainShell") is True,
        "strictSpeedButtonsExposed": len(strict_mode.get("speedButtons", [])) >= 4,
        "strictSpeedClickApplied": abs(float(strict_mode.get("playbackRate", 0)) - 1.5) < 0.01,
        "strictActiveSpeedButtonTracked": strict_mode.get("activeSpeedButton") == "1.5",
        "restoreMediaAutomationDisabled": restore_mode.get("shouldRunMediaAutomation") is False,
        "restoreSpeedControlsRemoved": int(restore_mode.get("speedControlCount", 0)) == 0,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "samples": {
            "whitelistMode": whitelist_mode,
            "strictMode": strict_mode,
            "restoreMode": restore_mode,
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-player-controls-site-state-"))

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
                target_url = f"{server.base_url.replace('127.0.0.1', 'falcon-whitelist.test')}/test-site-state-consistency.html"

                extension_page = context.new_page()
                extension_page.goto(
                    f"chrome-extension://{extension_id}/dashboard/dashboard.html",
                    wait_until="domcontentloaded",
                    timeout=args.timeout_ms,
                )
                extension_page.wait_for_timeout(1200)

                set_site_state(extension_page, ["falcon-whitelist.test"], True, args.wait_ms)
                target_page = context.new_page()
                target_page.goto(target_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                target_page.wait_for_timeout(1500)
                whitelist_mode = collect_controls_state(extension_page, target_url, args.wait_ms)

                set_site_state(extension_page, ["falcon-whitelist.test"], False, args.wait_ms)
                strict_mode = collect_controls_state(extension_page, target_url, args.wait_ms, click_speed="1.5")

                set_site_state(extension_page, ["falcon-whitelist.test"], True, args.wait_ms)
                restore_mode = collect_controls_state(extension_page, target_url, args.wait_ms)

                report = build_report(whitelist_mode, strict_mode, restore_mode)
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
