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
        description="Verify iframe frame-source messages do not leak media metadata to page parents."
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


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class FrameSourcePrivacyHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.startswith("/frame"):
            body = (
                "<!doctype html><html><head><title>Secret Frame Title</title></head>"
                "<body><video id='child-video' src='/media/page-secret-token/master.m3u8' "
                "poster='/poster/page-secret-token.jpg' muted playsinline></video></body></html>"
            ).encode("utf-8")
        else:
            body = (
                "<!doctype html><html><body>"
                "<script>"
                "window.__frameSourceMessages = [];"
                "window.addEventListener('message', (event) => {"
                "  if (event.data && event.data.type === 'shield:frame-source') {"
                "    window.__frameSourceMessages.push(event.data);"
                "  }"
                "});"
                "</script>"
                "<iframe id='fixture-frame' src='/frame'></iframe>"
                "</body></html>"
            ).encode("utf-8")

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
        self.server = ThreadingHTTPServer(("127.0.0.1", self.port), FrameSourcePrivacyHandler)
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


def build_report(messages: list[dict[str, object]]) -> dict[str, object]:
    serialized = json.dumps(messages, ensure_ascii=False)
    leaked_keys = [
        key for message in messages
        for key in ["videoSrc", "poster", "title", "origin"]
        if key in message and message.get(key)
    ]
    checks = {
        "frameSourceMessageObserved": len(messages) > 0,
        "sensitiveKeysAbsent": len(leaked_keys) == 0,
        "secretTokenAbsent": "page-secret-token" not in serialized,
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "messageCount": len(messages),
        "leakedKeys": leaked_keys,
        "messages": messages,
    }


def open_ready_context(playwright, profile_dir: Path, extension_dir: Path, channel: str, headless: bool, timeout_ms: int):
    last_error = None
    for _ in range(3):
        context = playwright.chromium.launch_persistent_context(
            str(profile_dir),
            channel=channel,
            headless=headless,
            args=smoke.build_extension_args(extension_dir),
        )
        try:
            extension_id = smoke.wait_for_extension_id(context, timeout_ms)
            registered_scripts = smoke.wait_for_extension_ready(context, timeout_ms)
            return context, extension_id, registered_scripts
        except RuntimeError as error:
            context.close()
            last_error = error
            if "extension_service_worker_not_ready" not in str(error):
                raise
    raise last_error or RuntimeError("extension_service_worker_not_ready")


def main() -> int:
    args = parse_args()
    extension_dir = Path(args.extension_dir).resolve()
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-frame-source-privacy-"))
    server = TestServer()
    server.start()

    try:
        with sync_playwright() as playwright:
            context, extension_id, registered_scripts = open_ready_context(
                playwright,
                profile_dir,
                extension_dir,
                args.browser_channel,
                args.headless,
                args.timeout_ms,
            )

            try:
                page = context.new_page()
                page.goto(server.parent_url, wait_until="domcontentloaded")
                page.wait_for_timeout(1800)
                messages = page.evaluate("() => window.__frameSourceMessages || []")
                report = build_report(messages)
                print(json.dumps({
                    "ok": report["ok"],
                    "extensionId": extension_id,
                    "registeredScripts": registered_scripts,
                    "report": report
                }, ensure_ascii=False, indent=2))
                return 0 if report["ok"] else 1
            finally:
                context.close()
    finally:
        server.close()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
