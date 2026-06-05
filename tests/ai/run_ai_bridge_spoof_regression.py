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
        description="Verify page-forged AI bridge postMessage payloads cannot enter telemetry."
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


def build_context_args(extension_dir: Path) -> list[str]:
    host_rules = ",".join([
        "MAP javboys.com 127.0.0.1",
        "MAP javboys.online 127.0.0.1"
    ])
    return [
        *smoke.build_extension_args(extension_dir),
        f"--host-resolver-rules={host_rules}"
    ]


def collect_telemetry(context) -> list[dict[str, object]]:
    worker = smoke.get_extension_worker(context)
    return worker.evaluate(
        """async () => {
            const result = await chrome.storage.local.get(['aiTelemetryLog']);
            return Array.isArray(result.aiTelemetryLog) ? result.aiTelemetryLog : [];
        }"""
    )


def send_extension_telemetry_with_secret_context(context) -> dict[str, object]:
    worker = smoke.get_extension_worker(context)
    return worker.evaluate(
        """async () => {
            aiState.enabled = true;
            const result = processAiTelemetry({
                events: [{
                    type: 'blocked_popup',
                    source: 'extension-regression',
                    severity: 1,
                    confidence: 0.9,
                    detail: {
                        reason: 'popup_blocked',
                        url: 'https://ads.example/collect?page-secret-token=abc123'
                    },
                    ts: Date.now()
                }],
                context: {
                    source: 'extension-regression',
                    hostname: 'javboys.com',
                    url: 'https://javboys.com/watch?page-secret-token=abc123#secret-fragment',
                    frame: 'top'
                }
            }, {
                tab: {
                    id: 1,
                    url: 'https://javboys.com/watch?page-secret-token=abc123#secret-fragment'
                }
            });
            await persistAiState();
            return result;
        }"""
    )


def enable_standard_blocking(context, page_url: str, timeout_ms: int) -> None:
    worker = smoke.get_extension_worker(context)
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
            "timeoutMs": timeout_ms,
        }
    )


def open_ready_context(playwright, profile_dir: Path, extension_dir: Path, channel: str, headless: bool, timeout_ms: int):
    last_error = None
    for _ in range(3):
        context = playwright.chromium.launch_persistent_context(
            str(profile_dir),
            channel=channel,
            headless=headless,
            args=build_context_args(extension_dir),
        )
        try:
            extension_id = smoke.wait_for_extension_id(context, timeout_ms)
            registered_scripts = smoke.wait_for_extension_ready(context, timeout_ms)
            return context, extension_id, registered_scripts
        except RuntimeError as error:
            context.close()
            last_error = error
            if "extension_service_worker_not_ready" not in str(error):
                raise
    raise last_error or RuntimeError("extension_service_worker_not_ready")


def build_report(telemetry: list[dict[str, object]]) -> dict[str, object]:
    serialized = json.dumps(telemetry, ensure_ascii=False)
    forged_events = [
        item for item in telemetry
        if item.get("event", {}).get("type") == "blocked_popup"
        and item.get("event", {}).get("source") == "page-forged"
    ]
    main_world_events = [
        item for item in telemetry
        if item.get("event", {}).get("type") in {"blocked_popup", "blocked_malicious_navigation"}
        and item.get("event", {}).get("source") == "inject-blocker"
    ]
    extension_events = [
        item for item in telemetry
        if item.get("event", {}).get("source") == "extension-regression"
    ]
    extension_context_urls = [
        str(item.get("context", {}).get("url", ""))
        for item in extension_events
    ]
    checks = {
        "forgedEventRejected": len(forged_events) == 0,
        "mainWorldPostMessageTelemetryRejected": len(main_world_events) == 0,
        "extensionTelemetryAccepted": len(extension_events) > 0,
        "extensionContextUrlReduced": all(
            "?" not in url and "#" not in url for url in extension_context_urls
        ),
        "forgedSecretAbsent": "page-secret-token" not in serialized,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "telemetryCount": len(telemetry),
        "forgedEvents": forged_events,
        "mainWorldEvents": main_world_events,
        "extensionContextUrls": extension_context_urls,
        "telemetryPreview": telemetry[-3:],
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-ai-bridge-spoof-"))
    server = smoke.StaticServer(REPO_ROOT / "tests")
    server.start()

    try:
        with sync_playwright() as playwright:
            context, extension_id, registered_scripts = open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )

            try:
                page = context.new_page()
                page.goto(
                    f"{server.base_url}/test-inject-blocker-overlays.html".replace("127.0.0.1", "javboys.com"),
                    wait_until="domcontentloaded",
                )
                enable_standard_blocking(context, page.url, args.timeout_ms)
                page.evaluate(
                    """() => {
                        window.postMessage({
                            type: '__SHIELD_AI_EVENT__',
                            bridgeVersion: 2,
                            payload: {
                                type: 'blocked_popup',
                                source: 'inject-blocker',
                                severity: 3,
                                confidence: 1,
                                detail: {
                                    reason: 'page_secret_exfiltration_attempt',
                                    url: 'https://attacker.example/collect?page-secret-token=abc123',
                                    arbitraryText: 'page-secret-token'
                                }
                            }
                        }, '*');
                        window.postMessage({
                            type: '__SHIELD_POTENTIAL_EXTERNAL_NAV_TRAP__',
                            payload: {
                                pageUrl: 'https://attacker.example/page-secret-token',
                                interaction: {
                                    href: 'https://attacker.example/collect?page-secret-token=abc123'
                                }
                            }
                        }, '*');
                        window.open('https://exoclick.com/collect?page-secret-token=abc123', '_blank');
                    }"""
                )
                page.wait_for_timeout(1800)
                send_extension_telemetry_with_secret_context(context)
                page.wait_for_timeout(400)
                report = build_report(collect_telemetry(context))
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
