from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify managed player sites block suspicious external same-tab navigation while preserving same-site navigation."
    )
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=20000)
    parser.add_argument("--wait-ms", type=int, default=1600)
    return parser.parse_args()


def build_browser_args() -> list[str]:
    host_rules = ",".join([
        "MAP javboys.com 127.0.0.1",
        "MAP external-redirect.test 127.0.0.1",
    ])
    return [f"--host-resolver-rules={host_rules}"]


def managed_url(base_url: str, path: str, host: str) -> str:
    return f"{base_url}{path}".replace("127.0.0.1", host)


def click_and_wait(page, selector: str, wait_ms: int) -> str:
    page.click(selector)
    page.wait_for_timeout(wait_ms)
    return page.url


def set_same_tab_redirect_guard_enabled(context, enabled: bool) -> None:
    worker = smoke.get_extension_worker(context)
    worker.evaluate(
        """async ({ enabled }) => {
            await chrome.storage.local.set({ sameTabRedirectGuardEnabled: enabled === true });
            return true;
        }""",
        {"enabled": enabled},
    )
    time.sleep(0.25)


def main() -> int:
    args = parse_args()
    server = smoke.StaticServer(REPO_ROOT)
    server.start()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-managed-nav-guard-"))

    report: dict[str, object] = {}
    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                channel=args.browser_channel,
                headless=args.headless,
                args=smoke.build_extension_args(REPO_ROOT / "extension") + build_browser_args(),
                viewport={"width": 1440, "height": 960},
            )
            try:
                extension_id = smoke.wait_for_extension_id(context, args.timeout_ms)
                smoke.wait_for_extension_ready(context, args.timeout_ms)

                page = context.new_page()
                start_url = managed_url(server.base_url, "/tests/test-managed-external-nav-guard.html", "javboys.com")
                same_site_target = managed_url(server.base_url, "/tests/test-managed-external-nav-same-site.html", "javboys.com")
                external_target = managed_url(server.base_url, "/tests/test-managed-external-nav-external.html", "external-redirect.test")

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)

                set_same_tab_redirect_guard_enabled(context, True)
                same_site_url = click_and_wait(page, "#same-site-image-link", args.wait_ms)
                same_site_allowed = same_site_url == same_site_target

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                external_text_url = click_and_wait(page, "#external-text-link", args.wait_ms)
                external_text_allowed = external_text_url == external_target

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                external_card_text_url = click_and_wait(page, "#external-card-text-link", args.wait_ms)
                external_card_text_allowed = external_card_text_url == external_target

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                external_image_url = click_and_wait(page, "#external-image-link", args.wait_ms)
                external_image_blocked = external_image_url == start_url

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                open_self_url = click_and_wait(page, "#external-window-open-self", args.wait_ms)
                open_self_blocked = open_self_url == start_url

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                assign_url = click_and_wait(page, "#external-location-assign", args.wait_ms)
                assign_blocked = assign_url == start_url

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                document_location_url = click_and_wait(page, "#external-document-location", args.wait_ms)
                document_location_blocked = document_location_url == start_url

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                top_document_location_url = click_and_wait(page, "#external-top-document-location", args.wait_ms)
                top_document_location_blocked = top_document_location_url == start_url

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                child_frame = page.frame(name="same-origin-trap-frame")
                if child_frame is None:
                    raise RuntimeError("same_origin_trap_frame_missing")
                child_frame.click("#child-top-document-location")
                page.wait_for_timeout(args.wait_ms)
                child_top_document_location_url = page.url
                child_top_document_location_blocked = child_top_document_location_url == start_url
                child_top_document_location_exposes_gap = child_top_document_location_url == external_target

                set_same_tab_redirect_guard_enabled(context, False)

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                disabled_open_self_url = click_and_wait(page, "#external-window-open-self", args.wait_ms)

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                disabled_assign_url = click_and_wait(page, "#external-location-assign", args.wait_ms)
                disabled_assign_allowed = disabled_assign_url == external_target

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                disabled_document_location_url = click_and_wait(page, "#external-document-location", args.wait_ms)
                disabled_document_location_allowed = disabled_document_location_url == external_target

                page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout_ms)
                page.wait_for_timeout(args.wait_ms)
                disabled_child_frame = page.frame(name="same-origin-trap-frame")
                if disabled_child_frame is None:
                    raise RuntimeError("disabled_same_origin_trap_frame_missing")
                disabled_child_frame.click("#child-top-document-location")
                page.wait_for_timeout(args.wait_ms)
                disabled_child_top_document_location_url = page.url
                disabled_child_top_document_location_allowed = disabled_child_top_document_location_url == external_target

                report = {
                    "ok": all([
                        same_site_allowed,
                        external_text_allowed,
                        external_card_text_allowed,
                        external_image_blocked,
                        open_self_blocked,
                        assign_blocked,
                        document_location_blocked,
                        top_document_location_blocked,
                        disabled_assign_allowed,
                        disabled_document_location_allowed,
                        disabled_child_top_document_location_allowed,
                    ]),
                    "checks": {
                        "sameSiteImageAllowed": same_site_allowed,
                        "externalTextAllowed": external_text_allowed,
                        "externalCardTextAllowed": external_card_text_allowed,
                        "externalImageBlocked": external_image_blocked,
                        "windowOpenSelfBlocked": open_self_blocked,
                        "locationAssignBlocked": assign_blocked,
                        "documentLocationBlocked": document_location_blocked,
                        "topDocumentLocationBlocked": top_document_location_blocked,
                        "childTopDocumentLocationKnownGap": child_top_document_location_exposes_gap,
                        "disabledLocationAssignAllowed": disabled_assign_allowed,
                        "disabledDocumentLocationAllowed": disabled_document_location_allowed,
                        "disabledChildTopDocumentLocationAllowed": disabled_child_top_document_location_allowed,
                    },
                    "samples": {
                        "startUrl": start_url,
                        "sameSiteUrl": same_site_url,
                        "externalTextUrl": external_text_url,
                        "externalCardTextUrl": external_card_text_url,
                        "externalImageUrl": external_image_url,
                        "windowOpenSelfUrl": open_self_url,
                        "locationAssignUrl": assign_url,
                        "documentLocationUrl": document_location_url,
                        "topDocumentLocationUrl": top_document_location_url,
                        "childTopDocumentLocationUrl": child_top_document_location_url,
                        "disabledWindowOpenSelfUrl": disabled_open_self_url,
                        "disabledLocationAssignUrl": disabled_assign_url,
                        "disabledDocumentLocationUrl": disabled_document_location_url,
                        "disabledChildTopDocumentLocationUrl": disabled_child_top_document_location_url,
                    },
                }
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
