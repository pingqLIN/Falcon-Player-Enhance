from __future__ import annotations

import argparse
import json
import os
import shutil
import socketserver
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from statistics import median
from typing import Any

from playwright.sync_api import sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[2]
SITE_DIR = REPO_ROOT / "tests" / "nano-guard" / "site"
SCENARIOS_PATH = REPO_ROOT / "tests" / "nano-guard" / "scenarios.json"
REPORT_ROOT = REPO_ROOT / "tests" / "nano-guard" / "reports"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a Gemini Nano Prompt API feasibility probe for Falcon-Player-Enhance advisory use."
    )
    parser.add_argument("--model-source-dir", help="Explicit OptGuide model version directory.")
    parser.add_argument("--browser-channel", default="chrome", help="Playwright browser channel. Default: chrome")
    parser.add_argument("--headless", action="store_true", help="Attempt headless probe. Default is headed Chrome.")
    parser.add_argument("--http-port", type=int, default=5611, help="Local HTTP port for the probe page.")
    parser.add_argument("--repeats", type=int, default=2, help="How many times to run each scenario.")
    parser.add_argument("--out", help="Output JSON report path.")
    return parser.parse_args()


def resolve_latest_model_dir(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).resolve()
        if not path.exists():
            raise FileNotFoundError(f"Model source dir not found: {path}")
        return path

    root = Path(os.environ["LOCALAPPDATA"]) / "Google" / "Chrome" / "User Data" / "OptGuideOnDeviceModel"
    if not root.exists():
        raise FileNotFoundError(f"OptGuide model root not found: {root}")

    candidates = sorted([item for item in root.iterdir() if item.is_dir()], reverse=True)
    if not candidates:
        raise FileNotFoundError(f"No model version directories found under: {root}")
    return candidates[0]


def ensure_model_link(user_data_dir: Path, model_source_dir: Path) -> Path:
    target_root = user_data_dir / "OptGuideOnDeviceModel"
    target_root.mkdir(parents=True, exist_ok=True)
    target_dir = target_root / model_source_dir.name
    if target_dir.exists():
        return target_dir

    shutil.copytree(model_source_dir, target_dir)
    return target_dir


def start_http_server(port: int) -> tuple[socketserver.TCPServer, threading.Thread]:
    handler = partial(QuietHandler, directory=str(SITE_DIR))
    server = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def load_scenarios() -> list[dict[str, Any]]:
    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    scenarios = data.get("scenarios", [])
    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("scenarios.json must contain a non-empty 'scenarios' array")
    return scenarios


def summarize_results(run_result: dict[str, Any]) -> dict[str, Any]:
    results = run_result.get("results", [])
    latencies = [item["latencyMs"] for item in results if item.get("ok") and isinstance(item.get("latencyMs"), int)]
    matched = [item for item in results if item.get("matchedExpected") is True]
    parsed = [item for item in results if item.get("parsed") is not None]
    error_counts: dict[str, int] = {}
    labels_by_id: dict[str, list[str]] = {}
    for item in results:
        if item.get("parsed") and item["parsed"].get("label"):
            labels_by_id.setdefault(item["scenarioId"], []).append(item["parsed"]["label"])
        if item.get("error"):
            error_counts[item["error"]] = error_counts.get(item["error"], 0) + 1
        for attempt in item.get("attempts", []):
            message = attempt.get("error")
            if message:
                error_counts[message] = error_counts.get(message, 0) + 1

    consistency = {}
    for scenario_id, labels in labels_by_id.items():
        if not labels:
            consistency[scenario_id] = 0.0
            continue
        dominant = max(labels.count(label) for label in set(labels))
        consistency[scenario_id] = round(dominant / len(labels), 3)

    api_probe = run_result.get("apiProbe", {})
    available = bool(
        api_probe.get("hasLanguageModelCreate")
        or api_probe.get("hasCreateTextSession")
        or api_probe.get("hasWindowLanguageModelCreate")
    )

    parse_rate = round(len(parsed) / len(results), 3) if results else 0.0
    expected_match_rate = round(len(matched) / len(results), 3) if results else 0.0
    median_latency = round(median(latencies), 1) if latencies else None
    min_consistency = min(consistency.values()) if consistency else 0.0
    common_errors = [
        {"message": message, "count": count}
        for message, count in sorted(error_counts.items(), key=lambda item: (-item[1], item[0]))
    ][:5]

    if not available:
      recommendation = "do-not-integrate"
    elif parse_rate < 0.7 or min_consistency < 0.6:
      recommendation = "do-not-integrate"
    elif median_latency is not None and median_latency > 5000:
      recommendation = "proceed-advisory-only"
    else:
      recommendation = "proceed-advisory-only"

    return {
        "promptApiAvailable": available,
        "route": run_result.get("route"),
        "scenarioCount": len(results),
        "parseRate": parse_rate,
        "expectedMatchRate": expected_match_rate,
        "medianLatencyMs": median_latency,
        "minConsistency": min_consistency,
        "consistencyByScenario": consistency,
        "commonErrors": common_errors,
        "recommendation": recommendation
    }


def run() -> int:
    args = parse_args()
    model_source_dir = resolve_latest_model_dir(args.model_source_dir)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    report_dir = REPORT_ROOT / stamp
    report_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out).resolve() if args.out else report_dir / "nano-guard-report.json"

    user_data_dir = report_dir / "chrome-user-data"
    user_data_dir.mkdir(parents=True, exist_ok=True)
    linked_model_dir = ensure_model_link(user_data_dir, model_source_dir)

    server, _thread = start_http_server(args.http_port)
    scenarios = load_scenarios()
    page_url = f"http://127.0.0.1:{args.http_port}/nano_guard_probe.html"

    report: dict[str, Any] = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "pageUrl": page_url,
        "modelSourceDir": str(model_source_dir),
        "linkedModelDir": str(linked_model_dir),
        "browserChannel": args.browser_channel,
        "headless": args.headless,
        "repeats": args.repeats
    }

    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=str(user_data_dir),
                channel=args.browser_channel,
                headless=args.headless,
                args=[
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-fre",
                    "--disable-popup-blocking",
                    "--enable-features=OptimizationGuideOnDeviceModel,OnDeviceModelExecution,AIPromptAPI,AIPromptAPIMultimodalInput,PromptAPI"
                ],
                viewport={"width": 1440, "height": 960}
            )
            try:
                page = context.new_page()
                page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(1500)
                api_probe = page.evaluate("() => window.nanoGuardProbe.probeApi()")
                run_result = page.evaluate(
                    """async ({ scenarios, repeats }) => {
                        return await window.nanoGuardProbe.runScenarioSet(scenarios, repeats);
                    }""",
                    {"scenarios": scenarios, "repeats": args.repeats}
                )
                screenshot_path = report_dir / "nano-guard-probe.png"
                page.screenshot(path=str(screenshot_path), full_page=True)

                report["apiProbe"] = api_probe
                report["runResult"] = run_result
                report["summary"] = summarize_results(run_result)
                report["screenshot"] = str(screenshot_path)
            finally:
                context.close()
    finally:
        server.shutdown()
        server.server_close()

    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2, ensure_ascii=False))
    print(f"Report written: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
