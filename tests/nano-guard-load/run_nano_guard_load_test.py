from __future__ import annotations

import argparse
import json
import math
import shutil
import socketserver
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from statistics import mean, median
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[2]
SITE_DIR = REPO_ROOT / "tests" / "nano-guard-load" / "site"
REPORT_ROOT = REPO_ROOT / "tests" / "nano-guard-load" / "reports"


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


class ReusableTcpServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


@dataclass
class SafetyLimits:
    max_run_seconds: int
    max_case_seconds: int
    max_consecutive_prompt_errors: int
    gpu_sample_interval_ms: int
    max_gpu_temp_c: float
    max_gpu_power_w: float
    cooldown_until_temp_below_c: float
    kill_browser_on_fuse: bool


class GpuSampler:
    def __init__(
        self,
        limits: SafetyLimits,
        disable: bool = False,
        fake_temp_c: float | None = None,
        fake_power_w: float | None = None,
    ) -> None:
        self.limits = limits
        self.disable = disable
        self.fake_temp_c = fake_temp_c
        self.fake_power_w = fake_power_w
        self.samples: list[dict[str, Any]] = []
        self.available = False
        self.reason = ""
        self.source = "nvidia-smi"
        self.fuse_reason: str | None = None
        self._started_at = time.monotonic()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.disable:
            self.available = False
            self.reason = "disabled"
            return

        if self.fake_temp_c is not None or self.fake_power_w is not None:
            self.available = True
            self.source = "fake"
            self._thread = threading.Thread(target=self._sample_fake_loop, daemon=True)
            self._thread.start()
            return

        if not shutil.which("nvidia-smi"):
            self.available = False
            self.reason = "nvidia-smi not found"
            return

        self.available = True
        self._thread = threading.Thread(target=self._sample_nvidia_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)

    def _sample_fake_loop(self) -> None:
        while not self._stop.is_set():
            self._append_sample(
                {
                    "temperatureC": self.fake_temp_c if self.fake_temp_c is not None else 45.0,
                    "powerDrawW": self.fake_power_w if self.fake_power_w is not None else 40.0,
                    "gpuUtilizationPct": 0.0,
                    "memoryUtilizationPct": 0.0,
                    "memoryUsedMiB": 0.0,
                }
            )
            self._stop.wait(max(0.1, self.limits.gpu_sample_interval_ms / 1000))

    def _sample_nvidia_loop(self) -> None:
        query = (
            "power.draw,temperature.gpu,utilization.gpu,"
            "utilization.memory,memory.used"
        )
        command = [
            "nvidia-smi",
            f"--query-gpu={query}",
            "--format=csv,noheader,nounits",
        ]
        while not self._stop.is_set():
            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if completed.returncode != 0:
                    self.reason = completed.stderr.strip() or f"nvidia-smi exited {completed.returncode}"
                    self.available = False
                    return
                first_line = completed.stdout.strip().splitlines()[0]
                values = [item.strip() for item in first_line.split(",")]
                self._append_sample(
                    {
                        "powerDrawW": parse_float(values[0]) if len(values) > 0 else None,
                        "temperatureC": parse_float(values[1]) if len(values) > 1 else None,
                        "gpuUtilizationPct": parse_float(values[2]) if len(values) > 2 else None,
                        "memoryUtilizationPct": parse_float(values[3]) if len(values) > 3 else None,
                        "memoryUsedMiB": parse_float(values[4]) if len(values) > 4 else None,
                    }
                )
            except Exception as error:  # noqa: BLE001 - report sampler failures, do not crash the run
                self.reason = str(error)
                self.available = False
                return
            self._stop.wait(max(0.1, self.limits.gpu_sample_interval_ms / 1000))

    def _append_sample(self, values: dict[str, Any]) -> None:
        elapsed_ms = round((time.monotonic() - self._started_at) * 1000)
        sample = {
            "timestampIso": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "elapsedMs": elapsed_ms,
            **values,
        }
        self.samples.append(sample)
        temp = sample.get("temperatureC")
        power = sample.get("powerDrawW")
        if isinstance(temp, (int, float)) and temp >= self.limits.max_gpu_temp_c:
            self.fuse_reason = f"gpu_temp_c_{temp}_gte_{self.limits.max_gpu_temp_c}"
        if isinstance(power, (int, float)) and power >= self.limits.max_gpu_power_w:
            self.fuse_reason = f"gpu_power_w_{power}_gte_{self.limits.max_gpu_power_w}"


def parse_float(value: str) -> float | None:
    source = str(value or "").strip()
    if not source or source.upper() == "N/A":
        return None
    try:
        return float(source)
    except ValueError:
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local-only Chrome built-in model load tests against a synthetic hostile DOM fixture."
    )
    parser.add_argument("--browser-channel", default="chrome", help="Playwright browser channel. Default: chrome")
    parser.add_argument("--headless", action="store_true", help="Run browser headless.")
    parser.add_argument("--http-port", type=int, default=5612, help="Local fixture HTTP port.")
    parser.add_argument("--density-levels", default="1,2,4", help="Comma-separated density levels.")
    parser.add_argument("--repeats", type=int, default=3, help="Repeats per density.")
    parser.add_argument("--lanes", type=int, default=1, help="Reserved throughput lane count. Current runner executes lane 1 safely.")
    parser.add_argument("--mock-model", action="store_true", help="Use deterministic in-page mock model.")
    parser.add_argument("--mock-latency-ms", type=int, default=30, help="Mock model latency per call.")
    parser.add_argument("--mock-error-after", type=int, default=0, help="Mock model errors after N successful calls.")
    parser.add_argument("--fake-gpu-temp-c", type=float, help="Use fake GPU samples with this temperature.")
    parser.add_argument("--fake-gpu-power-w", type=float, help="Use fake GPU samples with this power draw.")
    parser.add_argument("--disable-gpu-sampling", action="store_true", help="Disable GPU sampling.")
    parser.add_argument("--max-run-seconds", type=int, default=120)
    parser.add_argument("--max-case-seconds", type=int, default=20)
    parser.add_argument("--max-consecutive-prompt-errors", type=int, default=2)
    parser.add_argument("--gpu-sample-interval-ms", type=int, default=1000)
    parser.add_argument("--max-gpu-temp-c", type=float, default=78)
    parser.add_argument("--max-gpu-power-w", type=float, default=160)
    parser.add_argument("--cooldown-until-temp-below-c", type=float, default=65)
    parser.add_argument("--max-candidates", type=int, default=50)
    parser.add_argument("--max-prompt-bytes", type=int, default=12000)
    parser.add_argument("--out", help="Output JSON report path.")
    return parser.parse_args()


def parse_density_levels(value: str) -> list[int]:
    levels = []
    for item in str(value or "").split(","):
        item = item.strip()
        if not item:
            continue
        level = int(item)
        if level <= 0:
            raise ValueError("density levels must be positive integers")
        levels.append(level)
    if not levels:
        raise ValueError("at least one density level is required")
    return levels


def start_http_server(port: int) -> tuple[ReusableTcpServer, threading.Thread]:
    handler = partial(QuietHandler, directory=str(SITE_DIR))
    server = ReusableTcpServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = (len(ordered) - 1) * pct
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return round(ordered[int(rank)], 2)
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (rank - lower), 2)


def summarize_gpu(samples: list[dict[str, Any]], completed_cases: int) -> dict[str, Any]:
    if not samples:
        return {
            "sampleCount": 0,
            "missingSampleCount": 0,
            "averagePowerDrawW": None,
            "peakPowerDrawW": None,
            "peakTemperatureC": None,
            "peakGpuUtilizationPct": None,
            "peakMemoryUsedMiB": None,
            "estimatedEnergyJ": None,
            "estimatedJoulesPerCase": None,
        }

    def numeric_series(key: str) -> list[float]:
        return [float(item[key]) for item in samples if isinstance(item.get(key), (int, float))]

    missing_count = sum(
        1
        for sample in samples
        for key in ("temperatureC", "powerDrawW", "gpuUtilizationPct", "memoryUsedMiB")
        if sample.get(key) is None
    )
    powers = numeric_series("powerDrawW")
    temps = numeric_series("temperatureC")
    gpu_utils = numeric_series("gpuUtilizationPct")
    memory_used = numeric_series("memoryUsedMiB")
    energy_j = estimate_energy_j(samples)

    return {
        "sampleCount": len(samples),
        "missingSampleCount": missing_count,
        "averagePowerDrawW": round(mean(powers), 2) if powers else None,
        "peakPowerDrawW": max(powers) if powers else None,
        "peakTemperatureC": max(temps) if temps else None,
        "peakGpuUtilizationPct": max(gpu_utils) if gpu_utils else None,
        "peakMemoryUsedMiB": max(memory_used) if memory_used else None,
        "estimatedEnergyJ": round(energy_j, 2) if energy_j is not None else None,
        "estimatedJoulesPerCase": round(energy_j / completed_cases, 2)
        if energy_j is not None and completed_cases > 0
        else None,
    }


def estimate_energy_j(samples: list[dict[str, Any]]) -> float | None:
    samples_with_power = [
        sample for sample in samples if isinstance(sample.get("powerDrawW"), (int, float))
    ]
    if len(samples_with_power) < 2:
        return None

    energy = 0.0
    for previous, current in zip(samples_with_power, samples_with_power[1:]):
        delta_seconds = max(0.0, (current["elapsedMs"] - previous["elapsedMs"]) / 1000)
        energy += float(previous["powerDrawW"]) * delta_seconds
    return energy


def build_summary(
    results: list[dict[str, Any]],
    elapsed_seconds: float,
    gpu_samples: list[dict[str, Any]],
    prompt_api_probe: dict[str, Any],
    gpu_available: bool,
    gpu_reason: str,
    blocked_external_request_count: int,
    disposition: str,
    fuse_reason: str | None,
) -> dict[str, Any]:
    completed = [item for item in results if item.get("ok")]
    failed = [item for item in results if not item.get("ok")]
    model_latencies = [
        float(item.get("timings", {}).get("modelLatencyMs"))
        for item in completed
        if isinstance(item.get("timings", {}).get("modelLatencyMs"), (int, float))
    ]
    total_latencies = [
        float(item.get("timings", {}).get("totalLatencyMs"))
        for item in completed
        if isinstance(item.get("timings", {}).get("totalLatencyMs"), (int, float))
    ]
    processed_features = sum(
        int(item.get("features", {}).get("selectedCandidateCount") or 0) for item in completed
    )
    attempted = len(results)
    completed_count = len(completed)
    elapsed_minutes = elapsed_seconds / 60 if elapsed_seconds > 0 else 0

    summary = {
        "runDisposition": disposition,
        "fuseReason": fuse_reason,
        "attemptedModelCalls": attempted,
        "completedCaseCount": completed_count,
        "failedCaseCount": len(failed),
        "errorRate": round(len(failed) / attempted, 4) if attempted else 0,
        "elapsedSeconds": round(elapsed_seconds, 3),
        "casePerMinute": round(completed_count / elapsed_minutes, 3) if elapsed_minutes else None,
        "processedFeatureCount": processed_features,
        "featuresPerSecond": round(processed_features / elapsed_seconds, 3) if elapsed_seconds > 0 else None,
        "modelLatencyMs": {
            "p50": round(median(model_latencies), 2) if model_latencies else None,
            "p95": percentile(model_latencies, 0.95),
            "max": max(model_latencies) if model_latencies else None,
            "insufficientSamples": len(model_latencies) < 2,
        },
        "totalLatencyMs": {
            "p50": round(median(total_latencies), 2) if total_latencies else None,
            "p95": percentile(total_latencies, 0.95),
            "max": max(total_latencies) if total_latencies else None,
            "insufficientSamples": len(total_latencies) < 2,
        },
        "gpuSamplingAvailable": gpu_available,
        "gpuSamplingReason": gpu_reason,
        "gpu": summarize_gpu(gpu_samples, completed_count),
        "blockedExternalRequestCount": blocked_external_request_count,
        "promptApiAvailable": bool(prompt_api_probe.get("promptApiAvailable")),
        "promptApiRoute": prompt_api_probe.get("route"),
    }
    return summary


def is_environment_blocking_error(message: str) -> bool:
    lowered = message.lower()
    return (
        "prompt_api_unavailable" in lowered
        or "service is not running" in lowered
        or "not ready" in lowered
        or "unable to create" in lowered
    )


def build_recommendation(disposition: str, summary: dict[str, Any], mock_model: bool) -> dict[str, Any]:
    if disposition == "mock-validated":
        return {
            "status": "mock-only",
            "message": "Runner, local fixture, metric collection, and report generation completed with mock model.",
        }
    if disposition == "environment-blocked":
        return {
            "status": "blocked",
            "message": "Prompt API environment was unavailable or unusable; do not infer hardware capacity from this run.",
        }
    if disposition == "fuse-tripped":
        return {
            "status": "unsafe-to-increase",
            "message": f"Fuse tripped: {summary.get('fuseReason')}. Reduce load or improve prefiltering before rerun.",
        }
    if disposition == "completed" and not mock_model:
        return {
            "status": "candidate-baseline",
            "message": (
                "Use this run as the current conservative capacity baseline. "
                "Increase density only after another no-fuse report."
            ),
        }
    return {
        "status": "failed",
        "message": "Run failed before producing a usable baseline.",
    }


def run() -> int:
    args = parse_args()
    densities = parse_density_levels(args.density_levels)
    if args.lanes != 1:
        print("warning: lanes > 1 is accepted for report compatibility but current runner executes safely on lane 1.")

    limits = SafetyLimits(
        max_run_seconds=args.max_run_seconds,
        max_case_seconds=args.max_case_seconds,
        max_consecutive_prompt_errors=args.max_consecutive_prompt_errors,
        gpu_sample_interval_ms=args.gpu_sample_interval_ms,
        max_gpu_temp_c=args.max_gpu_temp_c,
        max_gpu_power_w=args.max_gpu_power_w,
        cooldown_until_temp_below_c=args.cooldown_until_temp_below_c,
        kill_browser_on_fuse=True,
    )

    stamp = time.strftime("%Y%m%d-%H%M%S")
    report_dir = REPORT_ROOT / stamp
    report_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out).resolve() if args.out else report_dir / "nano-guard-load-report.json"
    page_url = f"http://127.0.0.1:{args.http_port}/malicious_fixture.html"
    server, _thread = start_http_server(args.http_port)
    sampler = GpuSampler(
        limits,
        disable=args.disable_gpu_sampling,
        fake_temp_c=args.fake_gpu_temp_c,
        fake_power_w=args.fake_gpu_power_w,
    )

    started_at = time.monotonic()
    results: list[dict[str, Any]] = []
    blocked_external_requests: list[str] = []
    prompt_api_probe: dict[str, Any] = {}
    disposition = "failed"
    fuse_reason: str | None = None
    consecutive_prompt_errors = 0
    context = None

    try:
        sampler.start()
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                user_data_dir=str(report_dir / "chrome-user-data"),
                channel=args.browser_channel,
                headless=args.headless,
                args=[
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-fre",
                    "--disable-popup-blocking",
                    "--enable-features=OptimizationGuideOnDeviceModel,OnDeviceModelExecution,AIPromptAPI,AIPromptAPIMultimodalInput,PromptAPI",
                ],
                viewport={"width": 1280, "height": 900},
            )
            page = context.new_page()
            page.set_default_timeout((args.max_case_seconds + 5) * 1000)

            def route_handler(route: Any) -> None:
                parsed = urlparse(route.request.url)
                is_local_http = parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and parsed.port == args.http_port
                is_allowed = is_local_http or parsed.scheme in {"data", "about"}
                if is_allowed:
                    route.continue_()
                    return
                blocked_external_requests.append(route.request.url)
                route.abort()

            page.route("**/*", route_handler)
            page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
            prompt_api_probe = page.evaluate("() => window.nanoGuardLoad.probePromptApi()")

            case_matrix = [
                {"density": density, "round": round_index + 1}
                for density in densities
                for round_index in range(max(1, args.repeats))
            ]

            for case_index, case in enumerate(case_matrix, start=1):
                elapsed = time.monotonic() - started_at
                if elapsed >= limits.max_run_seconds:
                    fuse_reason = f"max_run_seconds_{limits.max_run_seconds}"
                    disposition = "fuse-tripped"
                    break
                if sampler.fuse_reason:
                    fuse_reason = sampler.fuse_reason
                    disposition = "fuse-tripped"
                    break

                config = {
                    "caseIndex": case_index,
                    "density": case["density"],
                    "round": case["round"],
                    "mockModel": args.mock_model,
                    "mockLatencyMs": args.mock_latency_ms,
                    "mockErrorAfter": args.mock_error_after,
                    "maxCandidates": args.max_candidates,
                    "maxPromptBytes": args.max_prompt_bytes,
                    "maxCaseSeconds": args.max_case_seconds,
                    "temperature": 0,
                    "topK": 3,
                }
                result = page.evaluate(
                    "async (config) => await window.nanoGuardLoad.runCase(config)",
                    config,
                )
                result["caseIndex"] = case_index
                result["round"] = case["round"]
                results.append(result)

                if result.get("ok"):
                    consecutive_prompt_errors = 0
                    if not args.mock_model and not prompt_api_probe.get("route"):
                        prompt_api_probe = page.evaluate("() => window.nanoGuardLoad.probePromptApi()")
                else:
                    consecutive_prompt_errors += 1
                    error = str(result.get("error") or "")
                    if not args.mock_model and is_environment_blocking_error(error):
                        disposition = "environment-blocked"
                        fuse_reason = error
                        break
                    if consecutive_prompt_errors >= limits.max_consecutive_prompt_errors:
                        disposition = "fuse-tripped"
                        fuse_reason = f"consecutive_prompt_errors_{consecutive_prompt_errors}"
                        break

            if blocked_external_requests and disposition not in {"fuse-tripped", "environment-blocked"}:
                disposition = "failed"
                fuse_reason = "external_request_blocked"
            elif disposition == "failed":
                disposition = "mock-validated" if args.mock_model else "completed"

            prompt_api_probe = page.evaluate("() => window.nanoGuardLoad.probePromptApi()")
            screenshot_path = report_dir / "nano-guard-load-fixture.png"
            page.screenshot(path=str(screenshot_path), full_page=True)
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:
                pass
        sampler.stop()
        server.shutdown()
        server.server_close()

    elapsed_seconds = time.monotonic() - started_at
    prompt_api_usable = bool(args.mock_model or any(item.get("ok") for item in results))
    summary = build_summary(
        results,
        elapsed_seconds,
        sampler.samples,
        prompt_api_probe,
        sampler.available,
        sampler.reason,
        len(blocked_external_requests),
        disposition,
        fuse_reason,
    )
    recommendation = build_recommendation(disposition, summary, args.mock_model)
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "pageUrl": page_url,
        "browserChannel": args.browser_channel,
        "headless": args.headless,
        "mockModel": args.mock_model,
        "promptApiAvailable": bool(prompt_api_probe.get("promptApiAvailable")),
        "promptApiUsable": prompt_api_usable,
        "promptApiRoute": prompt_api_probe.get("route"),
        "promptApiUnavailableReason": None if prompt_api_usable else fuse_reason,
        "runDisposition": disposition,
        "safetyLimits": limits.__dict__,
        "runMatrix": {
            "densityLevels": densities,
            "repeats": args.repeats,
            "lanes": args.lanes,
            "effectiveLanes": 1,
            "maxCandidates": args.max_candidates,
            "maxPromptBytes": args.max_prompt_bytes,
        },
        "networkGuard": {
            "allowedOrigin": f"http://127.0.0.1:{args.http_port}",
            "blockedExternalRequestCount": len(blocked_external_requests),
            "blockedExternalRequests": blocked_external_requests[:20],
        },
        "promptApiProbe": prompt_api_probe,
        "caseResults": results,
        "gpuSamples": sampler.samples,
        "summary": summary,
        "recommendation": recommendation,
    }
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"runDisposition": disposition, "summary": summary, "recommendation": recommendation}, indent=2, ensure_ascii=False))
    print(f"Report written: {out_path}")
    return 0 if disposition in {"mock-validated", "completed", "environment-blocked", "fuse-tripped"} else 1


if __name__ == "__main__":
    raise SystemExit(run())
