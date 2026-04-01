from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run AI candidate promotion / rollback regression against the unpacked extension."
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


def build_context(playwright, profile_dir: Path, extension_dir: Path, channel: str, headless: bool):
    return playwright.chromium.launch_persistent_context(
        str(profile_dir),
        channel=channel,
        headless=headless,
        args=smoke.build_extension_args(extension_dir),
    )


def open_ready_context(playwright, profile_dir: Path, extension_dir: Path, channel: str, headless: bool, timeout_ms: int):
    last_error = None
    for _ in range(3):
        context = build_context(playwright, profile_dir, extension_dir, channel, headless)
        try:
            extension_id = smoke.wait_for_extension_id(context, timeout_ms)
            smoke.wait_for_extension_ready(context, timeout_ms)
            return context, extension_id
        except RuntimeError as error:
            context.close()
            last_error = error
            if "extension_service_worker_not_ready" not in str(error):
                raise
    raise last_error or RuntimeError("extension_service_worker_not_ready")


def open_dashboard_page(context, extension_id: str, timeout_ms: int) -> Page:
    page = context.new_page()
    page.goto(
        f"chrome-extension://{extension_id}/dashboard/dashboard.html",
        wait_until="domcontentloaded",
        timeout=timeout_ms,
    )
    page.wait_for_timeout(1200)
    return page


def runtime_message(page: Page, payload: dict[str, object]) -> dict[str, object]:
    return page.evaluate(
        """(payload) => new Promise((resolve) => {
            chrome.runtime.sendMessage(payload, (response) => resolve(response || {}));
        })""",
        payload,
    )


def seed_candidate_storage(page: Page, generated_at: int) -> None:
    page.evaluate(
        """async ({ generatedAt }) => {
            await chrome.storage.local.set({
                aiGeneratedRuleCandidates: {
                    "javboys.com": {
                        hostname: "javboys.com",
                        provider: "openai",
                        model: "gpt-5.4-mini",
                        summary: "player overlay candidate",
                        generatedAt,
                        selectorRules: [
                            { selector: ".overlay-test", reason: "provider_candidate_selector" }
                        ],
                        domainRules: [
                            { pattern: "ad.example", reason: "provider_candidate_domain" }
                        ]
                    }
                },
                aiCandidateReviewLog: [],
                aiCandidatePromotionLog: [],
                aiCandidateRollbackLog: [],
                aiKnowledgeStore: {
                    confirmedPatterns: [
                        {
                            id: "pat_javboys_com_selector__overlay-test",
                            kind: "selector",
                            value: ".overlay-test",
                            category: "provider_candidate",
                            confidence: 0.92,
                            source: "preexisting_manual_baseline",
                            hostnames: ["javboys.com"],
                            hitCount: 4,
                            userVerified: true,
                            createdAt: generatedAt - 1000,
                            updatedAt: generatedAt - 1000
                        }
                    ],
                    candidates: [],
                    observations: [],
                    teachSessions: []
                }
            });
            return true;
        }""",
        {
            "generatedAt": generated_at,
        }
    )


def click_review(page: Page, hostname: str, decision: str, reason: str) -> None:
    page.once("dialog", lambda dialog: dialog.accept(reason))
    locator = page.locator(
        f"button.btn-candidate-review[data-hostname='{hostname}'][data-decision='{decision}']"
    )
    locator.wait_for(state="attached")
    locator.evaluate("(button) => button.click()")
    page.wait_for_timeout(400)


def click_promotion(page: Page, hostname: str, evidence_note: str) -> None:
    page.once("dialog", lambda dialog: dialog.accept(evidence_note))
    locator = page.locator(
        f"button.btn-candidate-promote[data-hostname='{hostname}']"
    )
    locator.wait_for(state="attached")
    locator.evaluate("(button) => button.click()")
    page.wait_for_timeout(400)


def click_rollback(page: Page, evidence_note: str) -> None:
    page.once("dialog", lambda dialog: dialog.accept(evidence_note))
    locator = page.locator("button.btn-candidate-rollback:not([disabled])").first
    locator.wait_for(state="attached")
    locator.evaluate("(button) => button.click()")
    page.wait_for_timeout(400)


def build_report(initial_snapshot: dict[str, object], promoted_snapshot: dict[str, object], rolled_back_snapshot: dict[str, object], export_dataset: dict[str, object]) -> dict[str, object]:
    promoted_candidates = promoted_snapshot.get("provider", {}).get("generatedRuleCandidates", [])
    rolled_back_candidates = rolled_back_snapshot.get("provider", {}).get("generatedRuleCandidates", [])
    promotion_log = export_dataset.get("dataset", {}).get("candidatePromotionLog", [])
    rollback_log = export_dataset.get("dataset", {}).get("candidateRollbackLog", [])
    initial_confirmed = int(initial_snapshot.get("knowledge", {}).get("confirmedCount", 0))
    promoted_confirmed = int(promoted_snapshot.get("knowledge", {}).get("confirmedCount", 0))
    rolled_back_confirmed = int(rolled_back_snapshot.get("knowledge", {}).get("confirmedCount", 0))
    latest_promoted = promoted_candidates[0].get("latestPromotion") if promoted_candidates else None
    latest_rolled_back = rolled_back_candidates[0].get("latestPromotion") if rolled_back_candidates else None
    promoted_reused_count = len(latest_promoted.get("reusedPatternIds", [])) if isinstance(latest_promoted, dict) else 0

    checks = {
        "promotionRecorded": len(promoted_snapshot.get("candidatePromotionLog", [])) >= 1,
        "promotionSummaryUpdated": int(promoted_snapshot.get("provider", {}).get("candidatePromotionSummary", {}).get("activePromotions", 0)) >= 1,
        "promotionVisibleOnCandidate": isinstance(latest_promoted, dict) and latest_promoted.get("active") is True,
        "promotionLinkedToDecision": isinstance(latest_promoted, dict) and bool(latest_promoted.get("decisionId")),
        "confirmedPatternsIncreased": promoted_confirmed > initial_confirmed,
        "promotionTrackedReusedPatterns": promoted_reused_count >= 1,
        "promotionExported": len(promotion_log) >= 1 and promotion_log[0].get("hostname") == "javboys.com",
        "rollbackRecorded": len(rolled_back_snapshot.get("candidateRollbackLog", [])) >= 1,
        "rollbackSummaryUpdated": int(rolled_back_snapshot.get("provider", {}).get("candidatePromotionSummary", {}).get("totalRollbacks", 0)) >= 1,
        "rollbackVisibleOnCandidate": isinstance(latest_rolled_back, dict) and latest_rolled_back.get("active") is False,
        "confirmedPatternsRolledBack": rolled_back_confirmed == initial_confirmed,
        "rollbackExported": len(rollback_log) >= 1 and rollback_log[0].get("hostname") == "javboys.com",
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "snapshots": {
            "initial": initial_snapshot,
            "promoted": promoted_snapshot,
            "rolledBack": rolled_back_snapshot,
        },
        "export": export_dataset,
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-ai-candidate-promotion-"))

    try:
        with sync_playwright() as playwright:
            context, extension_id = open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )
            try:
                dashboard_page = open_dashboard_page(context, extension_id, args.timeout_ms)
                seed_candidate_storage(dashboard_page, 1774980000000)
            finally:
                context.close()

            context, extension_id = open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )
            try:
                dashboard_page = open_dashboard_page(context, extension_id, args.timeout_ms)
                initial_snapshot = runtime_message(dashboard_page, {"action": "getAiInsights"}).get("snapshot", {})
                click_review(dashboard_page, "javboys.com", "accepted", "manual_review_accept")
                click_promotion(dashboard_page, "javboys.com", "evidence:dashboard_manual_promotion")
                promoted_snapshot = runtime_message(dashboard_page, {"action": "getAiInsights"}).get("snapshot", {})
                click_rollback(dashboard_page, "evidence:dashboard_manual_rollback")
                rolled_back_snapshot = runtime_message(dashboard_page, {"action": "getAiInsights"}).get("snapshot", {})
                export_dataset = runtime_message(dashboard_page, {"action": "exportAiDataset"})
                report = build_report(
                    initial_snapshot,
                    promoted_snapshot,
                    rolled_back_snapshot,
                    export_dataset,
                )
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
