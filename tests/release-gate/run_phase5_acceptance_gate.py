from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PREFERRED_ENCODING = "utf-8"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

NODE_CHECK_FILES = [
    "extension/background.js",
    "extension/content/player-detector.js",
    "extension/content/player-sync.js",
    "extension/popup-player/popup-player.js",
    "extension/content/player-enhancer.js",
    "extension/content/anti-popup.js",
    "extension/content/cosmetic-filter.js",
    "extension/content/inject-blocker.js",
    "extension/content/anti-antiblock.js",
    "extension/content/site-state-helper.js",
    "extension/content/site-state-bridge.js",
]

PY_COMPILE_FILES = [
    "docs/take-screenshots.py",
    "tests/ai/run_candidate_review_regression.py",
    "tests/ai/run_candidate_promotion_regression.py",
    "tests/popup-smoke/run_popup_smoke.py",
    "tests/player-detection/run_player_detection_regression.py",
    "tests/cosmetic-filter/run_cosmetic_filter_regression.py",
    "tests/inject-blocker/run_inject_blocker_overlay_regression.py",
    "tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py",
    "tests/anti-popup/run_anti_popup_compatibility_fallback_regression.py",
    "tests/content-scripts/run_basic_content_script_exclusion_regression.py",
    "tests/interaction-safety/run_interaction_safety_regression.py",
    "tests/interaction-safety/run_labs_flow_cta_regression.py",
    "tests/rules/run_filter_rules_contract.py",
    "tests/site-state/run_site_state_bridge_regression.py",
    "tests/site-state/run_site_state_consistency_regression.py",
    "tests/site-state/run_player_controls_site_state_regression.py",
    "tests/site-state/run_site_state_helper_regression.py",
    "tests/site-registry/run_site_registry_contract_regression.py",
    "tests/release-gate/run_phase5_acceptance_gate.py",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Falcon Phase 5 acceptance gates (G-00 to G-09) with fresh evidence."
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Pass --headless to browser-based regression runners."
    )
    parser.add_argument(
        "--json-out",
        help="Optional path to write the aggregated JSON report."
    )
    parser.add_argument(
        "--stop-on-fail",
        action="store_true",
        help="Stop after the first failed gate."
    )
    return parser.parse_args()


def run_command(command: list[str], timeout_sec: int | None = None) -> dict[str, object]:
    runtime_env = dict(os.environ)
    runtime_env["PYTHONIOENCODING"] = "utf-8"
    try:
        result = subprocess.run(
            command,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            encoding=PREFERRED_ENCODING,
            errors="replace",
            env=runtime_env,
            timeout=timeout_sec,
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        return {
            "command": " ".join(command),
            "returncode": int(result.returncode),
            "ok": result.returncode == 0,
            "stdout": stdout,
            "stderr": stderr,
        }
    except subprocess.TimeoutExpired as error:
        stdout = str(error.stdout or "").strip()
        stderr = str(error.stderr or "").strip()
        return {
            "command": " ".join(command),
            "returncode": 124,
            "ok": False,
            "stdout": stdout,
            "stderr": stderr,
            "timeoutSec": timeout_sec,
            "timedOut": True,
        }


def load_json_file() -> dict[str, object]:
    site_registry = REPO_ROOT / "extension" / "rules" / "site-registry.json"
    with site_registry.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("site_registry_root_not_object")
    return data


def get_commit() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding=PREFERRED_ENCODING,
        errors="replace",
        check=False,
    )
    return result.stdout.strip() or "unknown"


def build_browser_command(path: str, headless: bool, extra: list[str] | None = None) -> list[str]:
    command = [sys.executable, path]
    if headless:
        command.append("--headless")
    if extra:
        command.extend(extra)
    return command


def build_step(
    command: list[str],
    retries: int = 0,
    retry_tokens: list[str] | None = None,
    timeout_sec: int | None = None,
) -> dict[str, object]:
    return {
        "command": command,
        "retries": retries,
        "retry_tokens": retry_tokens or [],
        "timeout_sec": timeout_sec,
    }


def build_retryable_browser_step(
    path: str,
    headless: bool,
    extra: list[str] | None = None,
    retries: int = 1,
    timeout_sec: int = 120,
) -> dict[str, object]:
    return build_step(
        build_browser_command(path, headless, extra),
        retries=retries,
        timeout_sec=timeout_sec,
        retry_tokens=[
            "extension_service_worker_not_ready",
            "extension_content_scripts_not_ready",
        ],
    )


def should_retry(result: dict[str, object], retry_tokens: list[str]) -> bool:
    if result["ok"] or not retry_tokens:
        return False
    haystack = f'{result["stdout"]}\n{result["stderr"]}'
    return any(token in haystack for token in retry_tokens)


def run_step(step: dict[str, object] | list[str]) -> dict[str, object]:
    if isinstance(step, list):
        return run_command(step)

    command = step["command"]
    retries = int(step.get("retries", 0))
    retry_tokens = list(step.get("retry_tokens", []))
    timeout_sec = step.get("timeout_sec")
    attempts: list[dict[str, object]] = []

    for attempt in range(retries + 1):
        result = run_command(command, timeout_sec)
        attempts.append(result)
        if not should_retry(result, retry_tokens) or attempt == retries:
            final_result = dict(result)
            final_result["attempts"] = attempts
            final_result["retryCount"] = attempt
            if timeout_sec is not None:
                final_result["timeoutSec"] = timeout_sec
            return final_result
        time.sleep(1.0)

    final_result = dict(attempts[-1])
    final_result["attempts"] = attempts
    final_result["retryCount"] = retries
    if timeout_sec is not None:
        final_result["timeoutSec"] = timeout_sec
    return final_result


def build_gates(headless: bool) -> list[dict[str, object]]:
    popup_cases = [
        build_step(
            build_browser_command(
                "tests/popup-smoke/run_popup_smoke.py",
                headless,
                ["--cases", "popup-open-local-video", "pin-close-reopen", "popup-player-state-restore"],
            ),
            retries=1,
            timeout_sec=180,
            retry_tokens=["extension_content_scripts_not_ready"],
        ),
        build_step(
            build_browser_command(
                "tests/popup-smoke/run_popup_smoke.py",
                headless,
                ["--cases", "multi-popup-distinct-windows"],
            ),
            retries=2,
            timeout_sec=180,
            retry_tokens=["extension_content_scripts_not_ready"],
        ),
    ]
    return [
        {
            "id": "G-00",
            "label": "Static",
            "steps": [
                ["node", "--check", *NODE_CHECK_FILES],
                [sys.executable, "-m", "py_compile", *PY_COMPILE_FILES],
            ],
            "json_check": True,
        },
        {
            "id": "G-01",
            "label": "Contract",
            "steps": [
                build_retryable_browser_step("tests/site-registry/run_site_registry_contract_regression.py", headless),
                build_retryable_browser_step("tests/content-scripts/run_basic_content_script_exclusion_regression.py", headless),
                [sys.executable, "tests/rules/run_filter_rules_contract.py"],
            ],
        },
        {
            "id": "G-02",
            "label": "Player Detection",
            "steps": [build_retryable_browser_step("tests/player-detection/run_player_detection_regression.py", headless)],
        },
        {
            "id": "G-03",
            "label": "Popup Reliability",
            "steps": popup_cases,
        },
        {
            "id": "G-04",
            "label": "Cosmetic Filter",
            "steps": [build_retryable_browser_step("tests/cosmetic-filter/run_cosmetic_filter_regression.py", headless)],
        },
        {
            "id": "G-05",
            "label": "Inject Overlay",
            "steps": [build_retryable_browser_step("tests/inject-blocker/run_inject_blocker_overlay_regression.py", headless)],
        },
        {
            "id": "G-06",
            "label": "Whitelist Consistency",
            "steps": [
                build_retryable_browser_step("tests/site-state/run_site_state_bridge_regression.py", headless),
                build_retryable_browser_step("tests/site-state/run_site_state_consistency_regression.py", headless),
                build_retryable_browser_step("tests/site-state/run_player_controls_site_state_regression.py", headless),
                build_retryable_browser_step("tests/site-state/run_site_state_helper_regression.py", headless),
                build_retryable_browser_step("tests/anti-antiblock/run_anti_antiblock_whitelist_regression.py", headless),
            ],
        },
        {
            "id": "G-07",
            "label": "AI Candidate Governance",
            "steps": [
                build_retryable_browser_step("tests/ai/run_candidate_review_regression.py", headless),
            ],
        },
        {
            "id": "G-08",
            "label": "AI Controlled Promotion",
            "steps": [
                build_retryable_browser_step("tests/ai/run_candidate_promotion_regression.py", headless),
            ],
        },
        {
            "id": "G-09",
            "label": "Interaction Safety",
            "steps": [
                build_retryable_browser_step("tests/interaction-safety/run_interaction_safety_regression.py", headless),
                build_retryable_browser_step("tests/interaction-safety/run_labs_flow_cta_regression.py", headless),
            ],
        },
    ]


def run_gate(gate: dict[str, object]) -> dict[str, object]:
    step_reports = [run_step(step) for step in gate["steps"]]
    checks: list[dict[str, object]] = []
    if gate.get("json_check"):
        try:
            load_json_file()
            checks.append({
                "command": "python json.load(extension/rules/site-registry.json)",
                "returncode": 0,
                "ok": True,
                "stdout": "site-registry.json parsed successfully",
                "stderr": "",
            })
        except Exception as error:  # noqa: BLE001
            checks.append({
                "command": "python json.load(extension/rules/site-registry.json)",
                "returncode": 1,
                "ok": False,
                "stdout": "",
                "stderr": str(error),
            })
    results = step_reports + checks
    return {
        "id": gate["id"],
        "label": gate["label"],
        "ok": all(item["ok"] for item in results),
        "steps": results,
    }


def write_report(path: str, report: dict[str, object]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    gates = build_gates(args.headless)
    reports: list[dict[str, object]] = []

    for gate in gates:
        report = run_gate(gate)
        reports.append(report)
        if args.stop_on_fail and not report["ok"]:
            break

    overall_ok = all(item["ok"] for item in reports) and len(reports) == len(gates)
    blocker_ids = [item["id"] for item in reports if not item["ok"]]
    report = {
        "ok": overall_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "commit": get_commit(),
        "gates": reports,
        "blockers": blocker_ids,
    }
    output = json.dumps(report, ensure_ascii=False, indent=2)
    print(output)

    if args.json_out:
        write_report(args.json_out, report)

    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
