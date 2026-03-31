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
        description="Run inject-blocker overlay regression against canonical site-registry profiles."
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
        help="Wait time after enabling STANDARD blocking before collecting DOM state."
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


def enable_standard_blocking(page: Page, timeout_ms: int) -> None:
    worker = smoke.get_extension_worker(page.context)
    page_url = page.url
    worker.evaluate(
        """async ({ pageUrl, timeoutMs }) => {
            const deadline = Date.now() + timeoutMs;
            let tabId = null;

            while (Date.now() < deadline && tabId === null) {
                const tabs = await chrome.tabs.query({ url: pageUrl });
                const tab = Array.isArray(tabs) ? tabs[0] : null;
                tabId = typeof tab?.id === 'number' ? tab.id : null;
                if (tabId === null) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
            }

            if (tabId === null) {
                throw new Error('test_tab_not_found');
            }

            await chrome.tabs.sendMessage(tabId, { action: 'applyBlockingLevel', level: 2 });
            return { tabId };
        }""",
        {
            "pageUrl": page_url,
            "timeoutMs": timeout_ms
        }
    )


def inspect_page(page: Page, url: str, timeout_ms: int, wait_ms: int) -> dict[str, object]:
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector("#known-global-overlay", state="attached", timeout=timeout_ms)
    enable_standard_blocking(page, timeout_ms)
    page.wait_for_timeout(wait_ms)

    return page.evaluate(
        """() => {
            const ids = ['known-global-overlay', 'known-javboys-overlay', 'safe-content'];
            const elements = Object.fromEntries(ids.map((id) => {
                const element = document.getElementById(id);
                const style = element ? window.getComputedStyle(element) : null;
                return [id, {
                    exists: Boolean(element),
                    display: style ? style.display : null,
                    visibility: style ? style.visibility : null
                }];
            }));

            return {
                hostname: window.location.hostname,
                elements
            };
        }"""
    )


def build_report(base_url: str, page: Page, timeout_ms: int, wait_ms: int) -> dict[str, object]:
    javboys = inspect_page(page, base_url.replace("127.0.0.1", "javboys.com"), timeout_ms, wait_ms)
    checks = {
        "globalOverlayRemoved": javboys["elements"]["known-global-overlay"]["exists"] is False
        or javboys["elements"]["known-global-overlay"]["display"] == "none",
        "siteOverlayRemoved": javboys["elements"]["known-javboys-overlay"]["exists"] is False
        or javboys["elements"]["known-javboys-overlay"]["display"] == "none",
        "safeContentVisible": javboys["elements"]["safe-content"]["exists"] is True
        and javboys["elements"]["safe-content"]["display"] != "none",
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "page": javboys
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-inject-blocker-regression-"))

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
                    f"{server.base_url}/test-inject-blocker-overlays.html",
                    page,
                    args.timeout_ms,
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
