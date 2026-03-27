from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from tempfile import mkdtemp
from typing import Any, Callable

from playwright.sync_api import BrowserContext, Page, sync_playwright


StorageSnapshot = dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify dashboard provider key autosave, draft retention, and per-provider secret persistence."
    )
    parser.add_argument(
        "--extension-dir",
        default="extension",
        help="Falcon-Player-Enhance unpacked extension path."
    )
    parser.add_argument(
        "--browser-profile-dir",
        help="Optional persistent Chromium profile directory."
    )
    parser.add_argument(
        "--browser-channel",
        default="chromium",
        help="Playwright browser channel. Default: chromium"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chromium headlessly."
    )
    parser.add_argument(
        "--out",
        help="Optional output JSON report path."
    )
    return parser.parse_args()


def build_extension_args(extension_dir: Path) -> list[str]:
    path = str(extension_dir.resolve())
    return [
        f"--disable-extensions-except={path}",
        f"--load-extension={path}"
    ]


def wait_for_extension_id(context: BrowserContext, timeout_ms: int = 12000) -> str:
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        worker = context.service_workers[0] if context.service_workers else None
        if worker is None:
            time.sleep(0.25)
            continue

        try:
            registered = worker.evaluate(
                """async () => (await chrome.scripting.getRegisteredContentScripts()).length"""
            )
            if int(registered) > 0:
                match = re.match(r"^chrome-extension://([^/]+)/", str(worker.url))
                if match:
                    return match.group(1)
        except Exception:
            pass

        time.sleep(0.25)

    raise RuntimeError("Extension service worker did not become ready in time.")


def open_dashboard(context: BrowserContext, extension_id: str) -> Page:
    page = context.new_page()
    page.goto(f"chrome-extension://{extension_id}/dashboard/dashboard.html", wait_until="domcontentloaded")
    page.wait_for_selector('.menu-item[data-tab="ai"]')
    page.locator('.menu-item[data-tab="ai"]').click()
    page.wait_for_selector("#ai.tab-panel.active, section#ai.active")
    page.wait_for_selector("#provider-card-grid")
    page.wait_for_selector("#ai-key-display")
    page.wait_for_timeout(400)
    return page


def read_storage(page: Page) -> StorageSnapshot:
    return page.evaluate(
        """() => new Promise((resolve) => {
            chrome.storage.local.get(['aiProviderSettings', 'aiProviderSecrets'], resolve);
        })"""
    )


def wait_for_storage(
    page: Page,
    predicate: Callable[[StorageSnapshot], bool],
    label: str,
    timeout_ms: int = 5000
) -> StorageSnapshot:
    deadline = time.time() + (timeout_ms / 1000)
    last = read_storage(page)

    while time.time() < deadline:
        last = read_storage(page)
        if predicate(last):
            return last
        page.wait_for_timeout(100)

    raise AssertionError(f"{label} did not reach the expected storage state: {json.dumps(last, indent=2)}")


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_true(value: bool, label: str) -> None:
    if not value:
        raise AssertionError(label)


def read_input_value(page: Page, selector: str) -> str:
    return str(page.locator(selector).input_value())


def click_provider(page: Page, provider: str) -> None:
    page.locator(f'.provider-card[data-provider="{provider}"]').click()
    page.wait_for_timeout(150)


def click_mode(page: Page, mode: str) -> None:
    page.locator(f'.mode-card[data-mode="{mode}"]').click()


def ensure_key_editor_visible(page: Page) -> None:
    page.locator("#btn-update-api-key").click()
    page.wait_for_selector("#ai-provider-token")


def run_verification(page: Page) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    unset_value = read_input_value(page, "#ai-key-display")

    openai_key = "sk-openai-autosave-A"
    ensure_key_editor_visible(page)
    page.locator("#ai-provider-token").fill(openai_key)
    page.locator("#btn-confirm-api-key").click()
    openai_storage = wait_for_storage(
        page,
        lambda snapshot: str(snapshot.get("aiProviderSecrets", {}).get("openai", "")) == openai_key,
        "openai confirm save"
    )
    assert_equal(
        str(openai_storage.get("aiProviderSettings", {}).get("provider", "")),
        "openai",
        "openai provider selection"
    )
    results.append(
        {
            "step": "openai_autosave",
            "provider": openai_storage.get("aiProviderSettings", {}).get("provider"),
            "secretKeys": sorted(openai_storage.get("aiProviderSecrets", {}).keys())
        }
    )

    click_provider(page, "gemini")
    ensure_key_editor_visible(page)
    gemini_key = "gm-gemini-autosave-B"
    page.locator("#ai-provider-token").fill(gemini_key)
    page.locator("#btn-confirm-api-key").click()
    gemini_storage = wait_for_storage(
        page,
        lambda snapshot: (
            str(snapshot.get("aiProviderSecrets", {}).get("openai", "")) == openai_key
            and str(snapshot.get("aiProviderSecrets", {}).get("gemini", "")) == gemini_key
            and str(snapshot.get("aiProviderSettings", {}).get("provider", "")) == "gemini"
        ),
        "gemini confirm save"
    )
    results.append(
        {
            "step": "gemini_autosave",
            "provider": gemini_storage.get("aiProviderSettings", {}).get("provider"),
            "secretKeys": sorted(gemini_storage.get("aiProviderSecrets", {}).keys())
        }
    )

    click_provider(page, "openai")
    assert_equal(read_input_value(page, "#ai-provider-token"), "", "stored provider should not leak draft text on reopen")
    assert_true(read_input_value(page, "#ai-key-display") != unset_value, "stored key display should differ from unset state")
    results.append(
        {
            "step": "switch_back_openai",
            "keyDisplay": read_input_value(page, "#ai-key-display")
        }
    )

    ensure_key_editor_visible(page)
    openai_draft = "sk-openai-draft-switch"
    page.locator("#ai-provider-token").fill(openai_draft)
    click_provider(page, "gateway")
    click_provider(page, "openai")
    assert_equal(read_input_value(page, "#ai-provider-token"), openai_draft, "provider switch should preserve staged draft")
    switch_storage = wait_for_storage(
        page,
        lambda snapshot: (
            str(snapshot.get("aiProviderSecrets", {}).get("openai", "")) == openai_key
            and str(snapshot.get("aiProviderSettings", {}).get("provider", "")) == "openai"
        ),
        "provider switch autosave without secret write"
    )
    results.append(
        {
            "step": "provider_switch_keeps_draft",
            "draftLength": len(openai_draft),
            "storedSecretPreserved": str(switch_storage.get("aiProviderSecrets", {}).get("openai", "")) == openai_key
        }
    )

    click_mode(page, "advisory")
    assert_equal(read_input_value(page, "#ai-provider-token"), openai_draft, "mode switch should not immediately clear current key draft")
    advisory_storage = wait_for_storage(
        page,
        lambda snapshot: (
            str(snapshot.get("aiProviderSecrets", {}).get("openai", "")) == openai_key
            and str(snapshot.get("aiProviderSettings", {}).get("mode", "")) == "advisory"
        ),
        "mode change autosave without secret write"
    )
    results.append(
        {
            "step": "mode_switch_autosave",
            "mode": advisory_storage.get("aiProviderSettings", {}).get("mode"),
            "storedSecretPreserved": str(advisory_storage.get("aiProviderSecrets", {}).get("openai", "")) == openai_key
        }
    )

    endpoint_draft = "sk-openai-endpoint-draft"
    page.locator("#ai-provider-token").fill(endpoint_draft)
    custom_endpoint = "https://api.openai.com/v1/responses?autosave=1"
    page.locator("#lmstudio-endpoint").fill(custom_endpoint)
    assert_equal(read_input_value(page, "#ai-provider-token"), endpoint_draft, "endpoint edit should not immediately clear current key draft")
    endpoint_storage = wait_for_storage(
        page,
        lambda snapshot: (
            str(snapshot.get("aiProviderSecrets", {}).get("openai", "")) == openai_key
            and str(snapshot.get("aiProviderSettings", {}).get("endpoint", "")) == custom_endpoint
        ),
        "endpoint change autosave without secret write"
    )
    results.append(
        {
            "step": "endpoint_change_autosave",
            "endpoint": endpoint_storage.get("aiProviderSettings", {}).get("endpoint"),
            "storedSecretPreserved": str(endpoint_storage.get("aiProviderSecrets", {}).get("openai", "")) == openai_key
        }
    )

    page.locator("#btn-confirm-api-key").click()
    confirmed_draft_storage = wait_for_storage(
        page,
        lambda snapshot: str(snapshot.get("aiProviderSecrets", {}).get("openai", "")) == endpoint_draft,
        "explicit draft confirm save"
    )
    results.append(
        {
            "step": "explicit_key_confirm",
            "storedSecretUpdated": str(confirmed_draft_storage.get("aiProviderSecrets", {}).get("openai", "")) == endpoint_draft
        }
    )

    return results


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    if not extension_dir.exists():
        raise FileNotFoundError(f"Extension directory not found: {extension_dir}")

    report_path = Path(args.out).resolve() if args.out else None
    user_data_dir = Path(args.browser_profile_dir).resolve() if args.browser_profile_dir else Path(mkdtemp(prefix="falcon-dashboard-profile-"))
    payload: dict[str, Any] = {
        "ok": False,
        "extensionDir": str(extension_dir),
        "browserChannel": args.browser_channel,
        "headless": bool(args.headless),
        "userDataDir": str(user_data_dir),
        "results": []
    }

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            channel=args.browser_channel,
            headless=args.headless,
            args=build_extension_args(extension_dir),
            viewport={"width": 1440, "height": 960}
        )
        page: Page | None = None

        try:
            extension_id = wait_for_extension_id(context)
            payload["extensionId"] = extension_id
            page = open_dashboard(context, extension_id)
            payload["results"] = run_verification(page)
            payload["ok"] = True
        except Exception as error:
            payload["error"] = str(error)
            if page is not None:
                payload["pageUrl"] = page.url
        finally:
            if report_path:
                report_path.parent.mkdir(parents=True, exist_ok=True)
                report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            context.close()

    print(json.dumps(payload, indent=2))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
