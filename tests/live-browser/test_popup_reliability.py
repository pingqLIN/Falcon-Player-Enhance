from __future__ import annotations

import functools
import http.server
import importlib.util
import socketserver
import tempfile
import threading
import time
import unittest
import urllib.parse
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
        host_rules = "MAP boyfriendtv.com 127.0.0.1, MAP *.boyfriendtv.com 127.0.0.1"
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
            args=[
                *MODULE.build_extension_args(REPO_ROOT / "extension", None),
                f"--host-resolver-rules={host_rules}",
            ],
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

    def get_tab_id_for_page(self, page: Page) -> int:
        worker = self.get_extension_worker()
        tab_id = worker.evaluate(
            """
            async (targetUrl) => {
              const normalized = String(targetUrl || '').split('#')[0];
              const tabs = await chrome.tabs.query({});
              const match = tabs.find((tab) => String(tab.url || '').split('#')[0] === normalized);
              return Number(match?.id || 0);
            }
            """,
            page.url,
        )
        if not isinstance(tab_id, int) or tab_id <= 0:
            raise AssertionError(f"Unable to resolve source tab id for {page.url}")
        return tab_id

    def build_remote_popup_url(self, source_page: Page, player_id: str, title: str = "Remote Popup Smoke") -> str:
        popup_base_url = self.get_popup_player_base_url()
        source_tab_id = self.get_tab_id_for_page(source_page)
        return (
            f"{popup_base_url}"
            f"?sourceTabId={source_tab_id}"
            f"&sourceTabUrl={urllib.parse.quote(source_page.url, safe='')}"
            f"&playerId={urllib.parse.quote(player_id, safe='')}"
            f"&title={urllib.parse.quote(title, safe='')}"
            "&remote=1"
            "&pin=1"
        )

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

    def wait_for_direct_overlay_window(self, direct_url: str, timeout_ms: int = 30000) -> dict:
        worker = self.get_extension_worker()
        deadline = time.time() + (timeout_ms / 1000)
        while time.time() < deadline:
            result = worker.evaluate(
                """
                async (targetUrl) => {
                  const windows = await chrome.windows.getAll({ populate: true });
                  for (const win of windows) {
                    for (const tab of win.tabs || []) {
                      if (String(tab.url || '') !== String(targetUrl || '')) continue;
                      let overlayReady = false;
                      let overlayError = '';
                      if (tab.id) {
                        try {
                          const [{ result }] = await chrome.scripting.executeScript({
                            target: { tabId: Number(tab.id) },
                            func: () => Boolean(document.querySelector('#falcon-direct-popup-overlay-root'))
                          });
                          overlayReady = result === true;
                        } catch (error) {
                          overlayError = String(error?.message || error);
                        }
                      }
                      return {
                        found: true,
                        overlayReady,
                        overlayError,
                        windowId: Number(win.id || 0),
                        tabId: Number(tab.id || 0)
                      };
                    }
                  }
                  return { found: false, overlayReady: false, overlayError: '' };
                }
                """,
                direct_url,
            )
            if result.get("found") and result.get("overlayReady"):
                return result
            time.sleep(0.25)
        raise AssertionError(f"Timed out waiting for direct popup overlay on {direct_url}")

    def test_popup_open_local_video(self) -> None:
        page = self.open_popup_test_page()
        known_window_ids = {int(win["id"]) for win in self.list_popup_player_windows()}
        page.locator(".shield-popup-player-btn").first.click(force=True)
        popup_window = self.wait_for_popup_player_window(known_window_ids)
        tab_urls = [tab["url"] for tab in popup_window["tabs"]]
        self.assertTrue(any("popup-player/popup-player.html" in url for url in tab_urls))

    def test_direct_popup_overlay_smoke(self) -> None:
        worker = self.get_extension_worker()
        direct_url = (
            f"http://boyfriendtv.com:{self.httpd.server_address[1]}"
            "/tests/live-browser/fixtures/direct-popup-verification.html"
        )
        created_window_id = worker.evaluate(
            """
            async (payload) => {
              if (typeof createPopupPlayerWindow !== 'function') {
                return 0;
              }
              const created = await createPopupPlayerWindow(payload);
              return Number(created?.id || 0);
            }
            """,
            {
                "iframeSrc": direct_url,
                "title": "Direct Popup Overlay Smoke",
            },
        )
        self.assertGreater(int(created_window_id or 0), 0)
        result = self.wait_for_direct_overlay_window(direct_url)
        self.assertTrue(result["overlayReady"], msg=result.get("overlayError", ""))

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

    def test_direct_popup_overlay_bootstrap(self) -> None:
        page = self.context.new_page()
        page.goto(
            f"{self.server_origin}/tests/live-browser/fixtures/direct-popup-overlay-fixture.html",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        page.wait_for_selector("#fixture-video", timeout=15000)
        overlay_source = (REPO_ROOT / "extension/content/direct-popup-overlay.js").read_text(encoding="utf-8")
        page.add_script_tag(content=overlay_source)
        page.wait_for_function(
            """
            () => {
              const root = document.getElementById('falcon-direct-popup-overlay-root');
              const launcher = root?.querySelector('.falcon-popup-launcher');
              const panel = root?.querySelector('.falcon-popup-panel');
              const api = window.__falconDirectPopupOverlay;
              return Boolean(root && launcher && panel && api && typeof api.refresh === 'function');
            }
            """,
            timeout=15000,
        )

    def test_pinned_remote_restore_reapplies_state_to_source_player(self) -> None:
        source_page = self.open_popup_test_page()
        self.wait_for_video_ready(source_page)
        source_state = source_page.evaluate(
            """
            () => {
              const video = document.querySelector('#player1 video');
              if (!video) return null;
              video.pause();
              video.currentTime = 9;
              video.volume = 0.35;
              video.muted = true;
              video.playbackRate = 1.5;
              const playerId =
                video.dataset.shieldId ||
                video.closest('[data-shield-id]')?.dataset?.shieldId ||
                '';
              return {
                playerId,
                currentTime: Number(video.currentTime || 0),
                volume: Number(video.volume || 0),
                muted: video.muted === true,
                playbackRate: Number(video.playbackRate || 0)
              };
            }
            """
        )
        self.assertIsNotNone(source_state)
        self.assertTrue(source_state["playerId"])

        popup_url = self.build_remote_popup_url(source_page, source_state["playerId"], "Pinned Remote Restore")
        popup = self.context.new_page()
        popup.goto(popup_url, wait_until="domcontentloaded", timeout=30000)
        popup.wait_for_function(
            """
            () => {
              const state = document.getElementById('playback-state');
              const volume = document.getElementById('volume-slider');
              const speed = document.getElementById('speed-select');
              return Boolean(
                state &&
                state.textContent.includes('Remote') &&
                volume &&
                Math.abs(Number(volume.value || 0) - 35) <= 4 &&
                speed &&
                Math.abs(Number(speed.value || 0) - 1.5) < 0.05
              );
            }
            """,
            timeout=20000,
        )
        popup.evaluate(
            """
            () => {
              const params = new URLSearchParams(window.location.search);
              const identity = JSON.stringify({
                playerId: params.get('playerId') || '',
                sourceTabUrl: params.get('sourceTabUrl') || '',
                videoSrc: params.get('videoSrc') || '',
                iframeSrc: params.get('iframeSrc') || '',
                title: params.get('title') || ''
              });
              let hash = 5381;
              for (const char of identity) {
                hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
              }
              const key = `popupPlayerState:${(hash >>> 0).toString(16)}`;
              localStorage.setItem(
                key,
                JSON.stringify({
                  version: 1,
                  playback: {
                    currentTime: 9,
                    volume: 0.35,
                    muted: true,
                    playbackRate: 1.5
                  },
                  ui: {
                    temperature: 0
                  }
                })
              );
            }
            """
        )
        popup.close()

        source_page.evaluate(
            """
            () => {
              const video = document.querySelector('#player1 video');
              if (!video) return;
              video.pause();
              video.currentTime = 2;
              video.volume = 1;
              video.muted = false;
              video.playbackRate = 1;
            }
            """
        )

        restored_popup = self.context.new_page()
        restored_popup.goto(popup_url, wait_until="domcontentloaded", timeout=30000)
        source_page.wait_for_function(
            """
            () => {
              const video = document.querySelector('#player1 video');
              if (!video) return false;
              return (
                Math.abs(Number(video.currentTime || 0) - 9) < 1.5 &&
                Math.abs(Number(video.volume || 0) - 0.35) < 0.08 &&
                video.muted === true &&
                Math.abs(Number(video.playbackRate || 0) - 1.5) < 0.05
              );
            }
            """,
            timeout=20000,
        )
        restored_state = source_page.evaluate(
            """
            () => {
              const video = document.querySelector('#player1 video');
              return {
                currentTime: Number(video?.currentTime || 0),
                volume: Number(video?.volume || 0),
                muted: video?.muted === true,
                playbackRate: Number(video?.playbackRate || 0)
              };
            }
            """
        )
        self.assertAlmostEqual(restored_state["volume"], 0.35, delta=0.08)
        self.assertTrue(restored_state["muted"])
        self.assertAlmostEqual(restored_state["playbackRate"], 1.5, delta=0.05)


if __name__ == "__main__":
    unittest.main()
