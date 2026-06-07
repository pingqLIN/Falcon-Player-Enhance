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
                    "promoted.example": {
                        hostname: "promoted.example",
                        provider: "gemini",
                        model: "gemini-2.5-flash",
                        summary: "already promoted candidate",
                        generatedAt: 1775040000000,
                        selectorRules: [
                            { selector: ".promoted-ad", reason: "provider_candidate_selector" }
                        ],
                        domainRules: [
                            { pattern: "promoted.example", reason: "provider_candidate_domain" }
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
                        id: "review_facebook_accept",
                        hostname: "www.facebook.com",
                        decision: "accepted",
                        reason: "manual_review_accept",
                        provider: "chrome_builtin",
                        model: "gemini-nano",
                        generatedAt: 1775060000000,
                        selectorCount: 1,
                        domainCount: 1,
                        actor: "regression_seed",
                        decidedAt: 1775061000000,
                        schemaVersion: "track_e_v2",
                        evidenceRefs: []
                    },
                    {
                        id: "review_promoted_example_accept",
                        hostname: "promoted.example",
                        decision: "accepted",
                        reason: "manual_review_accept",
                        provider: "gemini",
                        model: "gemini-2.5-flash",
                        generatedAt: 1775040000000,
                        selectorCount: 1,
                        domainCount: 1,
                        actor: "regression_seed",
                        decidedAt: 1775041000000,
                        schemaVersion: "track_e_v2",
                        evidenceRefs: []
                    },
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
                ],
                aiCandidatePromotionLog: [
                    {
                        promotionId: "promotion_promoted_example",
                        hostname: "promoted.example",
                        provider: "gemini",
                        model: "gemini-2.5-flash",
                        generatedAt: 1775040000000,
                        decisionId: "review_promoted_example_accept",
                        selectorCount: 1,
                        domainCount: 1,
                        confirmedPatternIds: ["pat_promoted_example_selector__promoted-ad"],
                        reusedPatternIds: [],
                        reason: "regression_seed_promotion",
                        actor: "regression_seed",
                        promotedAt: 1775042000000,
                        schemaVersion: "track_e_v2",
                        evidenceRefs: ["regression_seed_promotion"]
                    }
                ]
            });
            return true;
        }"""
    )


def open_popup_page(context, extension_id: str, timeout_ms: int, tab_id: int | None = None) -> Page:
    page = context.new_page()
    page.set_viewport_size({"width": 620, "height": 760})
    tab_query = f"&tabId={tab_id}" if tab_id else ""
    page.goto(
        f"chrome-extension://{extension_id}/popup/popup.html?pinned=1{tab_query}",
        wait_until="domcontentloaded",
        timeout=timeout_ms,
    )
    page.wait_for_selector(".ai-candidate-item", timeout=timeout_ms)
    return page


def seed_pending_display_reload(context, extension_page: Page) -> int:
    watched_page = context.new_page()
    watched_url = (REPO_ROOT / "tests" / "test-page.html").resolve().as_uri()
    watched_page.goto(watched_url, wait_until="domcontentloaded")
    tab_id = extension_page.evaluate(
        """async (watchedUrl) => {
            const tabs = await chrome.tabs.query({});
            const tab = tabs.find((item) => String(item.url || '') === watchedUrl);
            if (!tab?.id) throw new Error('watched_tab_not_found');
            await chrome.storage.local.set({
                autoReloadDisplaySettings: false,
                displaySettingsPendingReload: {
                    tabId: tab.id,
                    url: watchedUrl,
                    settingKeys: ['blockingLevel', 'popupGuardEnabled'],
                    source: 'regression_seed',
                    changedAt: Date.now()
                }
            });
            return tab.id;
        }""",
        watched_url,
    )
    return int(tab_id)


def build_report(page: Page) -> dict[str, object]:
    initial = page.evaluate(
        """() => ({
            itemCount: document.querySelectorAll('.ai-candidate-item').length,
            disabledCount: document.querySelectorAll('.ai-candidate-item[data-selection-disabled="true"]').length,
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            firstAriaChecked: document.querySelector('.ai-candidate-item')?.getAttribute('aria-checked') || '',
            firstSelected: document.querySelector('.ai-candidate-item')?.classList.contains('selected') === true,
            acceptButtons: document.querySelectorAll('.btn-ai-candidate-accept').length,
            rejectButtons: document.querySelectorAll('.btn-ai-candidate-reject').length,
            promoteButtons: document.querySelectorAll('.btn-ai-candidate-promote').length,
            rollbackButtons: document.querySelectorAll('.btn-ai-candidate-rollback').length,
            enabledPromoteButtons: document.querySelectorAll('.btn-ai-candidate-promote:not(:disabled)').length,
            enabledRollbackButtons: document.querySelectorAll('.btn-ai-candidate-rollback:not(:disabled)').length,
            reloadWarningVisible: document.querySelector('#display-reload-warning')?.hidden === false,
            reloadWarningText: document.querySelector('#display-reload-warning-body')?.textContent || ''
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

    page.locator(".ai-candidate-item[data-selection-disabled='true']").first.click(force=True)
    after_disabled_click = page.evaluate(
        """() => ({
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length,
            disabledCheckedCount: document.querySelectorAll('.ai-candidate-item[data-selection-disabled="true"] .ai-candidate-checkbox:checked').length,
            disabledTabIndex: document.querySelector('.ai-candidate-item[data-selection-disabled="true"]')?.tabIndex
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

    page.locator(".btn-ai-candidate-rollback:not(:disabled)").first.click()
    page.wait_for_function(
        """() => {
            return document.querySelectorAll('.ai-candidate-rolled-back').length >= 1;
        }""",
        timeout=10000,
    )
    after_rollback = page.evaluate(
        """() => ({
            summary: document.querySelector('#ai-candidates-summary')?.textContent || '',
            rolledBackRows: document.querySelectorAll('.ai-candidate-rolled-back').length,
            checkedCount: document.querySelectorAll('.ai-candidate-checkbox:checked').length
        })"""
    )

    checks = {
        "candidatesRendered": initial["itemCount"] == 4,
        "disabledCandidateRendered": initial["disabledCount"] == 2,
        "allCandidateActionsRendered": initial["acceptButtons"] == 4 and initial["rejectButtons"] == 4 and initial["promoteButtons"] == 4 and initial["rollbackButtons"] == 4,
        "candidateGovernanceActionsEnabled": initial["enabledPromoteButtons"] >= 1 and initial["enabledRollbackButtons"] >= 1,
        "pendingDisplayReloadWarningRendered": initial["reloadWarningVisible"] is True and "blockingLevel" in initial["reloadWarningText"],
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
        "rollbackActionWorksInSidePanel": after_rollback["rolledBackRows"] >= 1,
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
            "afterRollback": after_rollback,
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
                extension_page = ai_review.open_dashboard_page(context, extension_id, args.timeout_ms)
                watched_tab_id = seed_pending_display_reload(context, extension_page)
                popup_page = open_popup_page(context, extension_id, args.timeout_ms, watched_tab_id)
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
