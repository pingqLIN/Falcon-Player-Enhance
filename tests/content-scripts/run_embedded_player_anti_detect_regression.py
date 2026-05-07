from __future__ import annotations

import argparse
import json
import shutil
import socket
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify the generic embedded-player anti-detect bootstrap."
    )
    parser.add_argument(
        "--extension-dir",
        default=str(smoke.DEFAULT_EXTENSION_DIR),
        help="Unpacked Falcon-Player-Enhance extension directory.",
    )
    parser.add_argument(
        "--browser-channel",
        default="chromium",
        help="Playwright browser channel. Default: chromium.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chromium headlessly.",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=20000,
        help="Base timeout per Playwright wait.",
    )
    return parser.parse_args()


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class EmbeddedPlayerHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.startswith("/e/test-player"):
            body = b"<!doctype html><title>embed</title><video></video>"
        else:
            body = b"<!doctype html><title>parent</title><iframe src='/e/test-player'></iframe>"

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        return


class TestServer:
    def __init__(self) -> None:
        self.port = find_free_port()
        self.server = ThreadingHTTPServer(("127.0.0.1", self.port), EmbeddedPlayerHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def parent_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/parent"

    def start(self) -> None:
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)


def open_ready_context(playwright, profile_dir: Path, extension_dir: Path, channel: str, headless: bool, timeout_ms: int):
    context = playwright.chromium.launch_persistent_context(
        str(profile_dir),
        channel=channel,
        headless=headless,
        args=smoke.build_extension_args(extension_dir),
    )
    smoke.wait_for_extension_id(context, timeout_ms)
    smoke.wait_for_extension_ready(context, timeout_ms)
    return context


def run_probe(page, parent_url: str) -> dict[str, object]:
    page.goto(parent_url, wait_until="domcontentloaded")
    page.wait_for_timeout(800)

    frame = next(frame for frame in page.frames if "/e/test-player" in frame.url)
    return {
        "topReady": page.evaluate("() => window.__shieldEmbeddedPlayerAntiDetectReady === true"),
        "frameReady": frame.evaluate("() => window.__shieldEmbeddedPlayerAntiDetectReady === true"),
        "adblockFlag": frame.evaluate("() => window.adBlockDetected"),
        "fetchJson": frame.evaluate("async () => fetch('/botd/v1').then((response) => response.json())"),
        "scriptEvent": frame.evaluate(
            """async () => new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = '/botd/v1';
                script.onload = () => resolve('load');
                script.onerror = () => resolve('error');
                document.head.appendChild(script);
                setTimeout(() => resolve('timeout'), 1000);
            })"""
        ),
        "botdResult": frame.evaluate("async () => (await BotD.load()).detect()"),
    }


def build_report(probe: dict[str, object]) -> dict[str, object]:
    fetch_json = probe.get("fetchJson")
    botd_result = probe.get("botdResult")
    checks = {
        "topNotActivated": probe.get("topReady") is False,
        "frameActivated": probe.get("frameReady") is True,
        "adblockFlagFalse": probe.get("adblockFlag") is False,
        "fetchDetectedFalse": isinstance(fetch_json, dict) and fetch_json.get("detected") is False,
        "fetchBotFalse": isinstance(fetch_json, dict) and fetch_json.get("bot") is False,
        "scriptLoaded": probe.get("scriptEvent") == "load",
        "botdFalse": isinstance(botd_result, dict) and botd_result.get("bot") is False,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "probe": probe,
    }


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-embedded-anti-detect-"))
    server = TestServer()
    server.start()

    try:
        with sync_playwright() as playwright:
            context = open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )
            try:
                page = context.new_page()
                report = build_report(run_probe(page, server.parent_url))
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        server.close()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
