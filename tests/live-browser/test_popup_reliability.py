from __future__ import annotations

import functools
import http.server
import importlib.util
import socketserver
import tempfile
import threading
import time
import unittest
from pathlib import Path

from playwright.sync_api import Page
from playwright.sync_api import sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = Path(__file__).with_name("browser_judge.py")
SPEC = importlib.util.spec_from_file_location("browser_judge", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class QuietHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


class ThreadedTcpServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


class PopupReliabilitySmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = ThreadedTcpServer(
            ("127.0.0.1", 0),
            functools.partial(QuietHttpRequestHandler, directory=str(REPO_ROOT)),
        )
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.server_origin = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        cls.user_data_dir = tempfile.TemporaryDirectory(prefix="falcon-popup-smoke-")
        cls.playwright = sync_playwright().start()
        cls.context = cls.playwright.chromium.launch_persistent_context(
            user_data_dir=cls.user_data_dir.name,
            channel="chromium",
            headless=True,
            args=MODULE.build_extension_args(REPO_ROOT / "extension", None),
            viewport={"width": 1440, "height": 960},
        )
        cls.registered_script_count = MODULE.wait_for_extension_ready(cls.context)
        if cls.registered_script_count <= 0:
            raise AssertionError("Falcon-Player-Enhance content scripts did not register in time.")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.context.close()
        cls.playwright.stop()
        cls.user_data_dir.cleanup()
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.server_thread.join(timeout=2)

    def tearDown(self) -> None:
        for page in list(self.context.pages):
            if page.is_closed():
                continue
            page.close()

    def open_popup_test_page(self) -> Page:
        page = self.context.new_page()
        page.goto(f"{self.server_origin}/tests/test-popup-player.html", wait_until="domcontentloaded", timeout=30000)
        try:
            page.wait_for_load_state("networkidle", timeout=12000)
        except Exception:
            pass
        page.wait_for_function(
            "() => document.querySelectorAll('.shield-popup-player-btn').length >= 1",
            timeout=20000,
        )
        page.hover("#player1")
        return page

    def wait_for_video_ready(self, page: Page) -> None:
        page.wait_for_selector("video", timeout=20000)
        page.wait_for_function(
            "() => { const video = document.querySelector('video'); return Boolean(video && video.readyState >= 1); }",
            timeout=20000,
        )

    def get_extension_worker(self):
        deadline = time.time() + 12
        while time.time() < deadline:
            if self.context.service_workers:
                return self.context.service_workers[0]
            time.sleep(0.1)
        raise AssertionError("Extension service worker was not available.")

    def get_popup_player_base_url(self) -> str:
        worker = self.get_extension_worker()
        return worker.evaluate("() => chrome.runtime.getURL('popup-player/popup-player.html')")

    def list_popup_player_windows(self) -> list[dict]:
        worker = self.get_extension_worker()
        return worker.evaluate(
            """
            async () => {
              const windows = await chrome.windows.getAll({ populate: true });
              return windows
                .map((win) => ({
                  id: Number(win.id || 0),
                  type: String(win.type || ''),
                  tabs: (win.tabs || []).map((tab) => ({
                    id: Number(tab.id || 0),
                    url: String(tab.url || '')
                  }))
                }))
                .filter((win) => win.tabs.some((tab) => tab.url.includes('popup-player/popup-player.html')));
            }
            """
        )

    def wait_for_popup_player_window(self, known_window_ids: set[int], timeout_ms: int = 30000) -> dict:
        deadline = time.time() + (timeout_ms / 1000)
        while time.time() < deadline:
            windows = self.list_popup_player_windows()
            for win in windows:
                if int(win["id"]) not in known_window_ids:
                    return win
            time.sleep(0.25)
        raise AssertionError("Timed out waiting for popup-player browser window.")

    def test_popup_open_local_video(self) -> None:
        page = self.open_popup_test_page()
        known_window_ids = {int(win["id"]) for win in self.list_popup_player_windows()}
        page.locator(".shield-popup-player-btn").first.click(force=True)
        popup_window = self.wait_for_popup_player_window(known_window_ids)
        tab_urls = [tab["url"] for tab in popup_window["tabs"]]
        self.assertTrue(any("popup-player/popup-player.html" in url for url in tab_urls))

    def test_runtime_state_restore_on_reopen(self) -> None:
        popup_base_url = self.get_popup_player_base_url()
        popup_url = (
            f"{popup_base_url}"
            "?videoSrc=https%3A%2F%2Fcommondatastorage.googleapis.com%2Fgtv-videos-bucket%2Fsample%2FBigBuckBunny.mp4"
            "&title=Popup%20Smoke"
            "&pin=1"
        )
        popup = self.context.new_page()
        popup.goto(popup_url, wait_until="domcontentloaded", timeout=30000)
        self.wait_for_video_ready(popup)
        popup.evaluate(
            """
            () => {
              const video = document.querySelector('video');
              video.currentTime = 12;
              video.volume = 0.35;
              video.muted = true;
              video.playbackRate = 1.5;
            }
            """
        )
        popup.locator("#temperature-slider").evaluate(
            """
            (el) => {
              el.value = '18';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            """
        )
        popup.wait_for_timeout(300)
        popup.close()
        restored = self.context.new_page()
        restored.goto(popup_url, wait_until="domcontentloaded", timeout=30000)
        self.wait_for_video_ready(restored)
        restored.wait_for_function(
            """
            () => {
              const video = document.querySelector('video');
              return Boolean(video && Math.abs(video.currentTime - 12) < 1.5);
            }
            """,
            timeout=20000,
        )
        state = restored.evaluate(
            """
            () => {
              const video = document.querySelector('video');
              const slider = document.getElementById('temperature-slider');
              return {
                currentTime: Number(video.currentTime || 0),
                volume: Number(video.volume || 0),
                muted: video.muted === true,
                playbackRate: Number(video.playbackRate || 0),
                temperature: Number(slider?.value || 0)
              };
            }
            """
        )
        self.assertAlmostEqual(state["volume"], 0.35, delta=0.08)
        self.assertTrue(state["muted"])
        self.assertAlmostEqual(state["playbackRate"], 1.5, delta=0.05)
        self.assertEqual(state["temperature"], 18)
        self.assertIn("pin=1", restored.url)


if __name__ == "__main__":
    unittest.main()
