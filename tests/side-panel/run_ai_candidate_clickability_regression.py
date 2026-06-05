from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import Page
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"
AI_TEST_DIR = REPO_ROOT / "tests" / "ai"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))
if str(AI_TEST_DIR) not in sys.path:
    sys.path.insert(0, str(AI_TEST_DIR))

import run_candidate_review_regression as ai_review  # noqa: E402
import run_popup_smoke as smoke  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify generated AI candidates are clickable in the pinned side-panel UI."
    )
    parser.add_argument("--extension-dir", default=str(smoke.DEFAULT_EXTENSION_DIR))
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=20000)
    return parser.parse_args()


def seed_candidate_storage(page: Page) -> None:
    page.evaluate(
        """async () => {
            await chrome.storage.local.set({
                popupAiMonitorVisible: true,
                aiCandidatePromotionLog: [],
                aiCandidateRollbackLog: [],
                aiGeneratedRuleCandidates: {
                    "javboys.com": {
                        hostname: "javboys.com",
                        provider: "chrome_builtin",
                        model: "gemini-nano",
                        summary: "ai_profile+gateway",
                        generatedAt: 1775070000000,
                        selectorRules: [
                            { selector: ".overlay-test", reason: "provider_candidate_selector" }
                        ],
                        domainRules: [
                            { pattern: "ad.example", reason: "provider_candidate_domain" }
                        ]
                    },
                    "www.facebook.com": {
                        hostname: "www.facebook.com",
                        provider: "chrome_builtin",
                        model: "gemini-nano",
                        summary: "ai_profile+chrome_builtin",
                        generatedAt: 1775060000000,
                        selectorRules: [
                            { selector: ".sponsored", reason: "provider_candidate_selector" }
                        ],
                        domainRules: [
                            { pattern: "tracker.example", reason: "provider_candidate_domain" }
                        ]
                    },
                    "rejected.example": {
                        hostname: "rejected.example",
                        provider: "openai",
                        model: "gpt-5.4-mini",
                        summary: "previously rejected candidate",
                        generatedAt: 1775050000000,
                        selectorRules: [
                            { selector: ".rejected-ad", reason: "provider_candidate_selector" }
                        ],
                        domainRules: [
                            { pattern: "rejected.example", reason: "provider_candidate_domain" }
                        ]
                    }
                },
                aiCandidateReviewLog: [
                    {
                        id: "review_rejected_example",
                        hostname: "rejected.example",
                        decision: "rejected",
                        reason: "manual_review_reject",
                        provider: "openai",
                        model: "gpt-5.4-mini",
                        generatedAt: 1775050000000,
                        selectorCount: 1,
                        domainCount: 1,
                        actor: "regression_seed",
                        decidedAt: 1775051000000,
                        schemaVersion: "track_e_v2",
                        evidenceRefs: []
                    }
                ]
            });
            return true;
        }"""
    )


def open_popup_page(context, extension_id: str, timeout_ms: int) -> Page:
    page = context.new_page()
    page.set_viewport_size({"width": 620, "height": 760})
    page.goto(
        f"chrome-extension://{extension_id}/popup/popup.html?pinned=1",
        wait_until="domcontentloaded",
        timeout=timeout_ms,
    )
    page.wait_for_selector(".ai-candidate-item", timeout=timeout_ms)
    return page


def build_report(page: Page) -> dict[str, object]:
    initial = page.evaluate(
        """() => ({
            itemCount: document.querySelectorAll('.ai-candidate-item').length,
            disabledCount: document.querySelectorAll('.ai-candidate-item[aria-disabled="true"]').length,
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            firstAriaChecked: document.querySelector('.ai-candidate-item')?.getAttribute('aria-checked') || '',
            firstSelected: document.querySelector('.ai-candidate-item')?.classList.contains('selected') === true
        })"""
    )

    page.locator(".ai-candidate-item .ai-candidate-body").first.click()
    after_row_click = page.evaluate(
        """() => ({
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            firstAriaChecked: document.querySelector('.ai-candidate-item')?.getAttribute('aria-checked') || '',
            firstSelected: document.querySelector('.ai-candidate-item')?.classList.contains('selected') === true
        })"""
    )

    page.locator(".ai-candidate-item").nth(1).focus()
    page.keyboard.press("Enter")
    after_keyboard_enter = page.evaluate(
        """() => ({
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            secondAriaChecked: document.querySelectorAll('.ai-candidate-item')[1]?.getAttribute('aria-checked') || '',
            secondSelected: document.querySelectorAll('.ai-candidate-item')[1]?.classList.contains('selected') === true
        })"""
    )

    page.keyboard.press("Space")
    after_keyboard_space = page.evaluate(
        """() => ({
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            secondAriaChecked: document.querySelectorAll('.ai-candidate-item')[1]?.getAttribute('aria-checked') || '',
            secondSelected: document.querySelectorAll('.ai-candidate-item')[1]?.classList.contains('selected') === true
        })"""
    )

    page.locator(".ai-candidate-item[aria-disabled='true']").click(force=True)
    after_disabled_click = page.evaluate(
        """() => ({
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            disabledCheckedCount: document.querySelectorAll('.ai-candidate-item[aria-disabled="true"] .ai-candidate-checkbox:checked').length,
            disabledTabIndex: document.querySelector('.ai-candidate-item[aria-disabled="true"]')?.tabIndex
        })"""
    )

    page.locator("#btn-ai-select-all-candidates").click()
    after_select_all = page.evaluate(
        """() => ({
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            selectedRows: document.querySelectorAll('.ai-candidate-item.selected').length,
            ariaCheckedRows: Array.from(document.querySelectorAll('.ai-candidate-item'))
                .filter((item) => item.getAttribute('aria-checked') === 'true').length
        })"""
    )

    page.locator("#btn-ai-accept-selected-candidates").click()
    page.wait_for_function(
        """() => {
            const text = document.querySelector('#ai-candidates-summary')?.textContent || '';
            return /Accepted|已接受|popupAiCandidatesAccepted/.test(text);
        }""",
        timeout=10000,
    )
    after_accept = page.evaluate(
        """() => ({
            summary: document.querySelector('#ai-candidates-summary')?.textContent || '',
            acceptedRows: document.querySelectorAll('.ai-candidate-accepted').length
        })"""
    )

    checks = {
        "candidatesRendered": initial["itemCount"] == 3,
        "disabledCandidateRendered": initial["disabledCount"] == 1,
        "rowClickSelectsFirstCandidate": after_row_click["checkedCount"] == 1,
        "rowClickUpdatesAria": after_row_click["firstAriaChecked"] == "true",
        "rowClickUpdatesVisualState": after_row_click["firstSelected"] is True,
        "keyboardEnterSelectsSecondCandidate": after_keyboard_enter["checkedCount"] == 2,
        "keyboardEnterUpdatesRowState": after_keyboard_enter["secondAriaChecked"] == "true" and after_keyboard_enter["secondSelected"] is True,
        "keyboardSpaceDeselectsSecondCandidate": after_keyboard_space["checkedCount"] == 1,
        "keyboardSpaceUpdatesRowState": after_keyboard_space["secondAriaChecked"] == "false" and after_keyboard_space["secondSelected"] is False,
        "disabledCandidateCannotBeSelected": after_disabled_click["checkedCount"] == 1 and after_disabled_click["disabledCheckedCount"] == 0,
        "disabledCandidateNotFocusable": after_disabled_click["disabledTabIndex"] == -1,
        "selectAllChecksAllCandidates": after_select_all["checkedCount"] == 2,
        "selectAllUpdatesRows": after_select_all["selectedRows"] == 2 and after_select_all["ariaCheckedRows"] == 2,
        "acceptSelectedReviewsCandidates": after_accept["acceptedRows"] == 2,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "snapshots": {
            "initial": initial,
            "afterRowClick": after_row_click,
            "afterKeyboardEnter": after_keyboard_enter,
            "afterKeyboardSpace": after_keyboard_space,
            "afterDisabledClick": after_disabled_click,
            "afterSelectAll": after_select_all,
            "afterAccept": after_accept,
        },
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-ai-candidate-clickability-"))

    try:
        with sync_playwright() as playwright:
            context, extension_id = ai_review.open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )
            try:
                seed_page = ai_review.open_dashboard_page(context, extension_id, args.timeout_ms)
                seed_candidate_storage(seed_page)
            finally:
                context.close()

            context, extension_id = ai_review.open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )
            try:
                popup_page = open_popup_page(context, extension_id, args.timeout_ms)
                report = build_report(popup_page)
                print(json.dumps({
                    "ok": report["ok"],
                    "extensionId": extension_id,
                    "report": report,
                }, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
