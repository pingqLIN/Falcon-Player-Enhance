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
        description="Run AI candidate review governance regression against the unpacked extension."
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


def click_candidate_review(page: Page, hostname: str, decision: str, reason: str) -> None:
    page.once(
        "dialog",
        lambda dialog: dialog.accept(reason) if dialog.type == "prompt" else dialog.accept()
    )
    locator = page.locator(
        f"button.btn-candidate-review[data-hostname='{hostname}'][data-decision='{decision}']"
    )
    locator.wait_for(state="attached")
    locator.evaluate("(button) => button.click()")
    page.wait_for_timeout(300)


def seed_candidate_storage(page: Page, generated_at: int, clear_review_log: bool = False) -> None:
    page.evaluate(
        """async ({ generatedAt, clearReviewLog }) => {
            const payload = {
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
                }
            };
            if (clearReviewLog) {
                payload.aiCandidateReviewLog = [];
            }
            await chrome.storage.local.set(payload);
            return true;
        }""",
        {
            "generatedAt": generated_at,
            "clearReviewLog": clear_review_log,
        }
    )


def build_report(initial_snapshot: dict[str, object], accept_snapshot: dict[str, object], reject_snapshot: dict[str, object], refreshed_snapshot: dict[str, object], export_dataset: dict[str, object]) -> dict[str, object]:
    initial_candidates = initial_snapshot.get("provider", {}).get("generatedRuleCandidates", [])
    accept_candidates = accept_snapshot.get("provider", {}).get("generatedRuleCandidates", [])
    reject_candidates = reject_snapshot.get("provider", {}).get("generatedRuleCandidates", [])
    refreshed_candidates = refreshed_snapshot.get("provider", {}).get("generatedRuleCandidates", [])
    review_log = export_dataset.get("dataset", {}).get("candidateReviewLog", [])
    initial_confirmed = int(initial_snapshot.get("knowledge", {}).get("confirmedCount", 0))
    final_confirmed = int(reject_snapshot.get("knowledge", {}).get("confirmedCount", 0))

    latest_accept = accept_candidates[0].get("latestDecision") if accept_candidates else None
    latest_reject = reject_candidates[0].get("latestDecision") if reject_candidates else None
    latest_refreshed = refreshed_candidates[0].get("latestDecision") if refreshed_candidates else None

    checks = {
        "initialCandidatePresent": len(initial_candidates) == 1,
        "acceptDecisionRecorded": len(accept_snapshot.get("candidateReviewLog", [])) >= 1,
        "acceptSummaryUpdated": int(accept_snapshot.get("provider", {}).get("candidateReviewSummary", {}).get("acceptedCount", 0)) >= 1,
        "acceptLatestDecisionVisible": isinstance(latest_accept, dict) and latest_accept.get("decision") == "accepted",
        "rejectDecisionRecorded": len(reject_snapshot.get("candidateReviewLog", [])) >= 2,
        "rejectSummaryUpdated": int(reject_snapshot.get("provider", {}).get("candidateReviewSummary", {}).get("rejectedCount", 0)) >= 1,
        "rejectLatestDecisionVisible": isinstance(latest_reject, dict) and latest_reject.get("decision") == "rejected",
        "refreshedCandidateRequiresReview": len(refreshed_candidates) == 1 and latest_refreshed is None,
        "reviewLogRetainedAfterRefresh": int(refreshed_snapshot.get("provider", {}).get("candidateReviewSummary", {}).get("totalDecisions", 0)) >= 2,
        "reviewLogExported": len(review_log) >= 2 and any(item.get("hostname") == "javboys.com" for item in review_log),
        "confirmedPatternsUnchanged": initial_confirmed == final_confirmed,
    }

    return {
        "ok": all(checks.values()),
        "checks": checks,
        "snapshots": {
            "initial": initial_snapshot,
            "accepted": accept_snapshot,
            "rejected": reject_snapshot,
            "refreshed": refreshed_snapshot,
        },
        "reviewLog": review_log,
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-ai-candidate-review-"))

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
                seed_candidate_storage(dashboard_page, 1774970000000, clear_review_log=True)
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
                click_candidate_review(dashboard_page, "javboys.com", "accepted", "manual_review_accept")
                accept_snapshot = runtime_message(dashboard_page, {"action": "getAiInsights"}).get("snapshot", {})
                click_candidate_review(dashboard_page, "javboys.com", "rejected", "manual_review_reject")
                reject_snapshot = runtime_message(dashboard_page, {"action": "getAiInsights"}).get("snapshot", {})
                export_dataset = runtime_message(dashboard_page, {"action": "exportAiDataset"})
                seed_candidate_storage(dashboard_page, 1774979999999, clear_review_log=False)
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
                refreshed_snapshot = runtime_message(dashboard_page, {"action": "getAiInsights"}).get("snapshot", {})
                report = build_report(
                    initial_snapshot,
                    accept_snapshot,
                    reject_snapshot,
                    refreshed_snapshot,
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
