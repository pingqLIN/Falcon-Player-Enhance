from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPORT_DIR = REPO_ROOT / "tests" / "live-browser" / "reports"
DEFAULT_BROWSER_JUDGE = REPO_ROOT / "tests" / "live-browser" / "browser_judge.py"
DEFAULT_PATCH_LOG_DIR = DEFAULT_REPORT_DIR / "patch-agent-logs"
DEFAULT_REVIEW_LOG_DIR = DEFAULT_REPORT_DIR / "review-agent-logs"
DEFAULT_REVIEW_SCHEMA = REPO_ROOT / "tests" / "live-browser" / "review-summary.schema.json"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the browser judge, review failures, execute regressions, and optionally patch in a retry loop."
    )
    parser.add_argument("--targets", required=True, help="Path to reviewed targets JSON.")
    parser.add_argument("--extension-dir", default=str(REPO_ROOT / "extension"), help="Shield Pro unpacked extension path.")
    parser.add_argument("--ublock-extension-dir", help="Optional unpacked uBlock directory.")
    parser.add_argument("--browser-profile-dir", help="Optional persistent Chromium profile directory.")
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=30000)
    parser.add_argument("--settle-ms", type=int, default=3500)
    parser.add_argument("--pass-threshold", type=float, default=70.0)
    parser.add_argument("--max-iterations", type=int, default=3)
    parser.add_argument("--report-dir", default=str(DEFAULT_REPORT_DIR))
    parser.add_argument(
        "--review-agent",
        choices=["codex"],
        help="Structured reviewer stage. Currently Codex-only because the stage expects JSON schema output."
    )
    parser.add_argument(
        "--review-agent-model",
        help="Optional model override for the built-in review agent preset."
    )
    parser.add_argument(
        "--review-agent-log-dir",
        default=str(DEFAULT_REVIEW_LOG_DIR),
        help="Directory where built-in review agent outputs are written."
    )
    parser.add_argument(
        "--review-schema",
        default=str(DEFAULT_REVIEW_SCHEMA),
        help="JSON schema used by the structured review stage."
    )
    parser.add_argument(
        "--patch-command",
        help="Optional shell command to run after a failure. Supports {brief}, {report}, and {review} placeholders."
    )
    parser.add_argument(
        "--patch-agent",
        choices=["codex", "claude", "opencode"],
        help="Built-in non-interactive coding agent preset. Easier than writing --patch-command by hand."
    )
    parser.add_argument(
        "--patch-agent-model",
        help="Optional model override for the built-in patch agent preset."
    )
    parser.add_argument(
        "--patch-agent-log-dir",
        default=str(DEFAULT_PATCH_LOG_DIR),
        help="Directory where built-in patch agent final messages are written."
    )
    return parser.parse_args()


def run_command(command: list[str], label: str, input_text: str | None = None) -> tuple[int, str]:
    print(f"== {label} ==")
    proc = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        input=input_text,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False
    )
    if proc.stdout:
        print(proc.stdout.rstrip())
    if proc.stderr:
        print(proc.stderr.rstrip(), file=sys.stderr)
    return proc.returncode, f"{proc.stdout}\n{proc.stderr}".strip()


def run_shell_command(command: str, label: str) -> tuple[int, str]:
    print(f"== {label} ==")
    proc = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        shell=True
    )
    if proc.stdout:
        print(proc.stdout.rstrip())
    if proc.stderr:
        print(proc.stderr.rstrip(), file=sys.stderr)
    return proc.returncode, f"{proc.stdout}\n{proc.stderr}".strip()


def resolve_executable(name: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise FileNotFoundError(f"Executable not found on PATH: {name}")
    return resolved


def build_codex_exec_command(
    last_message_path: Path,
    model: str | None = None,
    output_schema_path: Path | None = None,
    images: list[Path] | None = None
) -> list[str]:
    command = [
        resolve_executable("codex"),
        "exec",
        "-C",
        str(REPO_ROOT),
        "--skip-git-repo-check",
        "-s",
        "danger-full-access",
        "--output-last-message",
        str(last_message_path),
    ]
    if model:
        command.extend(["-m", model])
    if output_schema_path:
        command.extend(["--output-schema", str(output_schema_path)])
    for image_path in images or []:
        command.extend(["-i", str(image_path)])
    command.append("-")
    return command


def build_patch_agent_prompt(brief_path: Path, report_path: Path, review_path: Path | None) -> str:
    lines = [
        "You are updating the Shield Pro browser extension repository.",
        f"Read the patch brief at: {brief_path}",
        f"Read the browser report at: {report_path}",
    ]
    if review_path:
        lines.append(f"Read the review summary at: {review_path}")
    lines.extend(
        [
            "",
            "Task:",
            "- Modify the repository so the failing live-browser targets pass.",
            "- Preserve compatibility with uBlock Origin Lite.",
            "- Keep these regressions passing:",
            "  - node tests/ai-eval/run-ai-evaluation.js",
            "  - node tests/e2e-ai-replay/run-e2e-ai-replay.js",
            "- Prefer focused changes in host-scoped heuristics, player detection, overlay detection, or popup handling.",
            "- Do not revert unrelated user changes.",
            "- Run validation after edits and summarize the concrete changes you made."
        ]
    )
    return "\n".join(lines)


def build_patch_agent_command(
    agent: str,
    model: str | None,
    prompt: str,
    last_message_path: Path
) -> list[str]:
    if agent == "codex":
        return build_codex_exec_command(last_message_path, model=model)

    if agent == "claude":
        command = [
            resolve_executable("claude"),
            "-p",
            "--permission-mode",
            "bypassPermissions",
            "--output-format",
            "text",
        ]
        if model:
            command.extend(["--model", model])
        command.append(prompt)
        return command

    if agent == "opencode":
        command = [
            resolve_executable("opencode"),
            "run",
            "--dir",
            str(REPO_ROOT),
        ]
        if model:
            command.extend(["--model", model])
        command.append(prompt)
        return command

    raise ValueError(f"Unsupported patch agent preset: {agent}")


def build_browser_judge_command(args: argparse.Namespace, report_path: Path) -> list[str]:
    command = [
        sys.executable,
        str(DEFAULT_BROWSER_JUDGE),
        "--targets",
        str(Path(args.targets).resolve()),
        "--extension-dir",
        str(Path(args.extension_dir).resolve()),
        "--browser-channel",
        args.browser_channel,
        "--timeout-ms",
        str(args.timeout_ms),
        "--settle-ms",
        str(args.settle_ms),
        "--pass-threshold",
        str(args.pass_threshold),
        "--out",
        str(report_path)
    ]

    if args.ublock_extension_dir:
        command.extend(["--ublock-extension-dir", str(Path(args.ublock_extension_dir).resolve())])
    if args.browser_profile_dir:
        command.extend(["--browser-profile-dir", str(Path(args.browser_profile_dir).resolve())])
    if args.headless:
        command.append("--headless")

    return command


def build_review_context(
    report: dict[str, Any],
    browser_exit: int,
    browser_output: str,
    ai_exit: int,
    ai_output: str,
    replay_exit: int,
    replay_output: str
) -> dict[str, Any]:
    return {
        "browserExitCode": browser_exit,
        "browserOutput": browser_output,
        "aiEvalExitCode": ai_exit,
        "aiEvalOutput": ai_output,
        "replayExitCode": replay_exit,
        "replayOutput": replay_output,
        "failedTargets": [
            {
                "name": item.get("name"),
                "url": item.get("url"),
                "score": item.get("score"),
                "reasons": item.get("reasons", []),
                "suggestions": item.get("suggestions", []),
                "screenshot": item.get("screenshot"),
                "snapshot": item.get("snapshot", {}),
                "runtimePolicyGate": {
                    "tier": item.get("snapshot", {}).get("aiGateTier"),
                    "mode": item.get("snapshot", {}).get("aiGateMode"),
                    "reason": item.get("snapshot", {}).get("aiGateReason"),
                    "evidence": item.get("snapshot", {}).get("aiEvidence", "")
                }
            }
            for item in report.get("results", [])
            if not item.get("ok")
        ]
    }


def build_review_prompt(review_context_path: Path, report_path: Path) -> str:
    return "\n".join(
        [
            "You are the Codex reviewer for Shield Pro live-browser validation.",
            f"Read the browser report JSON at: {report_path}",
            f"Read the review context JSON at: {review_context_path}",
            "",
            "Task:",
            "- Review each failed target in the report.",
            "- Use the attached screenshots as evidence when available.",
            "- Treat runtime policy gate data as supporting evidence, not as proof by itself.",
            "- Distinguish invalid targets from real extension failures.",
            "- Be conservative: do not recommend patching invalid targets or weak evidence.",
            "",
            "Rules:",
            "- If the page is a tag page, category page, index page, model listing page, or otherwise not a real playback page, classify it as invalid_target.",
            "- If the page lands on a browser challenge, security interstitial, filtering warning, or notification-lure / 'click allow' gate instead of the content page, classify it as invalid_target unless there is strong evidence the extension caused it.",
            "- If the page likely needs more time for lazy loading, use player_not_loaded_yet.",
            "- If the browser judge itself looks too strict, use judge_heuristic_gap.",
            "- Only set shouldGeneratePatchBrief=true when a code or rule change is actually warranted.",
            "- If evidence is mixed, prefer targetValidity=uncertain and nextStep=human_review.",
            "",
            "Return JSON only, matching the supplied schema."
        ]
    )


def parse_json_document(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content or "", encoding="utf-8")


def actionable_review_targets(review_summary: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not review_summary:
        return []
    return [
        item
        for item in review_summary.get("targets", [])
        if item.get("shouldGeneratePatchBrief")
    ]


def review_clears_browser_failure(review_summary: dict[str, Any] | None) -> bool:
    if not review_summary:
        return False
    return (
        review_summary.get("actionableFailureCount", 0) == 0
        and review_summary.get("reviewStatus") in {"clear", "invalid_targets_only"}
    )


def write_patch_brief(
    path: Path,
    report: dict[str, Any],
    iteration: int,
    review_summary: dict[str, Any] | None,
    ai_exit: int,
    replay_exit: int
) -> None:
    review_by_url = {
        item.get("url"): item
        for item in (review_summary or {}).get("targets", [])
    }
    failed_results = [item for item in report.get("results", []) if not item.get("ok")]
    actionable_results = []

    if review_summary:
        actionable_urls = {item.get("url") for item in actionable_review_targets(review_summary)}
        actionable_results = [item for item in failed_results if item.get("url") in actionable_urls]
    else:
        actionable_results = failed_results

    lines = [
        f"# Patch Brief Iteration {iteration}",
        "",
        "Fix the failing live-browser targets while preserving compatibility with uBlock Origin Lite.",
        "",
        "Constraints:",
        "- Prefer changes in content scripts, popup logic, host-scoped heuristics, or dashboard visibility before broad global rules.",
        "- Do not remove the existing AI evaluation or e2e replay logic.",
        "- Keep compatibility with a companion uBlock setup.",
        "",
        "Actionable browser targets:"
    ]

    if actionable_results:
        for item in actionable_results:
            snapshot = item.get("snapshot", {})
            review_item = review_by_url.get(item.get("url"), {})
            lines.extend(
                [
                    f"- {item.get('name')} ({item.get('url')})",
                    f"  score: {item.get('score')}",
                    f"  overlays: {snapshot.get('overlayCount', 0)}",
                    f"  popups: {snapshot.get('popupCount', 0)}",
                    f"  runtime policy gate: {snapshot.get('aiGateTier') or 'n/a'} / {snapshot.get('aiGateMode') or 'n/a'}",
                    f"  runtime gate reason: {snapshot.get('aiGateReason') or 'n/a'}",
                    f"  runtime gate evidence: {snapshot.get('aiEvidence') or 'n/a'}",
                    f"  reasons: {'; '.join(item.get('reasons', []))}",
                    f"  review classification: {review_item.get('classification', 'n/a')}",
                    f"  review root cause: {review_item.get('rootCause', 'n/a')}",
                    f"  review fix area: {review_item.get('recommendedFixArea', 'n/a')}",
                    f"  suggestions: {'; '.join(item.get('suggestions', []))}",
                    f"  screenshot: {item.get('screenshot')}"
                ]
            )
    else:
        lines.append("- None from browser review.")

    lines.extend(
        [
            "",
            "Regression commands to keep passing:",
            "- node tests/ai-eval/run-ai-evaluation.js",
            "- node tests/e2e-ai-replay/run-e2e-ai-replay.js",
            "",
            "Regression status:"
        ]
    )
    lines.append(f"- ai-eval: {'PASS' if ai_exit == 0 else 'FAIL'}")
    lines.append(f"- e2e-ai-replay: {'PASS' if replay_exit == 0 else 'FAIL'}")

    if review_summary:
        lines.extend(
            [
                "",
                "Review summary:",
                f"- reviewStatus: {review_summary.get('reviewStatus')}",
                f"- actionableFailureCount: {review_summary.get('actionableFailureCount')}",
                f"- summary: {review_summary.get('summary')}"
            ]
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def run_review_stage(
    args: argparse.Namespace,
    report_path: Path,
    review_context_path: Path,
    review_summary_path: Path,
    review_last_message_path: Path,
    review_raw_log_path: Path,
    review_context: dict[str, Any]
) -> tuple[int, str, dict[str, Any] | None]:
    if args.review_agent != "codex":
        raise ValueError(f"Unsupported review agent preset: {args.review_agent}")

    review_context_path.write_text(json.dumps(review_context, indent=2, ensure_ascii=False), encoding="utf-8")
    screenshot_paths = [
        Path(item["screenshot"])
        for item in review_context.get("failedTargets", [])
        if item.get("screenshot") and Path(item["screenshot"]).exists()
    ]
    prompt = build_review_prompt(review_context_path, report_path)
    command = build_codex_exec_command(
        review_last_message_path,
        model=args.review_agent_model,
        output_schema_path=Path(args.review_schema).resolve(),
        images=screenshot_paths[:6]
    )
    review_exit, review_output = run_command(command, f"review agent ({args.review_agent})", input_text=prompt)
    write_text(review_raw_log_path, review_output)

    review_summary = None
    parse_error = None
    source_text = None
    if review_last_message_path.exists():
        source_text = review_last_message_path.read_text(encoding="utf-8")
    elif review_output:
        source_text = review_output

    if source_text:
        try:
            review_summary = parse_json_document(source_text)
        except Exception as exc:  # noqa: BLE001
            parse_error = exc

    if review_summary is not None:
        review_summary_path.write_text(json.dumps(review_summary, indent=2, ensure_ascii=False), encoding="utf-8")
        return review_exit, review_output, review_summary

    if parse_error is not None:
        raise parse_error

    return review_exit, review_output, None


def run() -> int:
    args = parse_args()
    if args.patch_command and args.patch_agent:
        raise ValueError("Use either --patch-command or --patch-agent, not both.")

    report_dir = Path(args.report_dir).resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    patch_agent_log_dir = Path(args.patch_agent_log_dir).resolve()
    patch_agent_log_dir.mkdir(parents=True, exist_ok=True)
    review_agent_log_dir = Path(args.review_agent_log_dir).resolve()
    review_agent_log_dir.mkdir(parents=True, exist_ok=True)

    for iteration in range(1, args.max_iterations + 1):
        stamp = time.strftime("%Y%m%d-%H%M%S")
        iteration_dir = report_dir / f"iter-{iteration:02d}-{stamp}"
        iteration_dir.mkdir(parents=True, exist_ok=True)
        report_path = iteration_dir / "browser-report.json"
        brief_path = iteration_dir / "patch-brief.md"
        summary_path = iteration_dir / "iteration-summary.json"
        review_context_path = iteration_dir / "review-context.json"
        review_summary_path = iteration_dir / "review-summary.json"
        review_last_message_path = review_agent_log_dir / f"iter-{iteration:02d}-review-last-message.json"
        review_raw_log_path = review_agent_log_dir / f"iter-{iteration:02d}-review-stdout.log"

        browser_exit, browser_output = run_command(
            build_browser_judge_command(args, report_path),
            f"browser judge iteration {iteration}"
        )
        report = load_json(report_path)

        ai_exit, ai_output = run_command(
            ["node", "tests/ai-eval/run-ai-evaluation.js"],
            "offline regression: ai-eval"
        )
        replay_exit, replay_output = run_command(
            ["node", "tests/e2e-ai-replay/run-e2e-ai-replay.js"],
            "offline regression: e2e-ai-replay"
        )

        raw_success = browser_exit == 0 and ai_exit == 0 and replay_exit == 0
        review_exit = None
        review_output = None
        review_summary = None

        if args.review_agent and not raw_success:
            review_context = build_review_context(
                report,
                browser_exit,
                browser_output,
                ai_exit,
                ai_output,
                replay_exit,
                replay_output
            )
            try:
                review_exit, review_output, review_summary = run_review_stage(
                    args,
                    report_path,
                    review_context_path,
                    review_summary_path,
                    review_last_message_path,
                    review_raw_log_path,
                    review_context
                )
            except Exception as exc:  # noqa: BLE001
                review_exit = 1
                review_output = str(exc)
                write_text(review_raw_log_path, review_output)

        browser_cleared_by_review = browser_exit != 0 and review_clears_browser_failure(review_summary)
        success = ai_exit == 0 and replay_exit == 0 and (browser_exit == 0 or browser_cleared_by_review)

        summary = {
            "iteration": iteration,
            "browserExitCode": browser_exit,
            "browserClearedByReview": browser_cleared_by_review,
            "aiEvalExitCode": ai_exit,
            "replayExitCode": replay_exit,
            "reviewExitCode": review_exit,
            "success": success,
            "browserReportPath": str(report_path),
            "reviewSummaryPath": str(review_summary_path) if review_summary else None,
            "failedTargets": [
                {
                    "name": item.get("name"),
                    "url": item.get("url"),
                    "score": item.get("score"),
                    "reasons": item.get("reasons", [])
                }
                for item in report.get("results", [])
                if not item.get("ok")
            ],
            "actionableReviewTargets": actionable_review_targets(review_summary),
            "commandOutput": {
                "browser": browser_output,
                "aiEval": ai_output,
                "replay": replay_output,
                "review": review_output
            }
        }
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

        if success:
            print(f"Self-learning loop passed at iteration {iteration}.")
            return 0

        write_patch_brief(brief_path, report, iteration, review_summary, ai_exit, replay_exit)
        print(f"Patch brief written: {brief_path}")

        if review_summary and not actionable_review_targets(review_summary) and ai_exit == 0 and replay_exit == 0:
            print("Review marked all browser failures as non-actionable; stopping without patch generation.")
            return 1

        if not args.patch_command and not args.patch_agent:
            print("No patch command configured; stopping after writing the patch brief.")
            return 1

        if args.patch_agent:
            last_message_path = patch_agent_log_dir / f"iter-{iteration:02d}-last-message.txt"
            patch_prompt = build_patch_agent_prompt(
                brief_path,
                report_path,
                review_summary_path if review_summary else None
            )
            patch_exit, patch_output = run_command(
                build_patch_agent_command(
                    args.patch_agent,
                    args.patch_agent_model,
                    patch_prompt,
                    last_message_path
                ),
                f"patch agent iteration {iteration} ({args.patch_agent})",
                input_text=patch_prompt if args.patch_agent == "codex" else None
            )
            write_text(last_message_path, patch_output)
        else:
            patch_command = (
                args.patch_command
                .replace("{brief}", str(brief_path))
                .replace("{report}", str(report_path))
                .replace("{review}", str(review_summary_path))
            )
            patch_exit, patch_output = run_shell_command(
                patch_command,
                f"patch agent iteration {iteration}"
            )
            write_text(patch_agent_log_dir / f"iter-{iteration:02d}-shell-output.txt", patch_output)

        if patch_exit != 0:
            print(f"Patch command failed at iteration {iteration}.")
            return 1

    print(f"Reached max iterations ({args.max_iterations}) without a clean pass.")
    return 1


if __name__ == "__main__":
    raise SystemExit(run())
