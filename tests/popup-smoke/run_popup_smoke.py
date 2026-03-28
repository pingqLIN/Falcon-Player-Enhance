from __future__ import annotations

import argparse
import json
import socket
import sys
import tempfile
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs
from urllib.parse import urlparse
from typing import Any

from playwright.sync_api import BrowserContext
from playwright.sync_api import Page
from playwright.sync_api import Playwright
from playwright.sync_api import Worker
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXTENSION_DIR = REPO_ROOT / "extension"
ALL_CASES = [
    "popup-open-local-video",
    "pin-close-reopen",
    "popup-player-state-restore",
    "multi-popup-distinct-windows",
]
DEFAULT_CASES = [
    "popup-open-local-video",
    "pin-close-reopen",
    "multi-popup-distinct-windows",
]
MAX_CASES_PER_RUN = 3

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run up to three Falcon-Player-Enhance popup smoke cases with Playwright."
    )
    parser.add_argument(
        "--cases",
        nargs="+",
        default=DEFAULT_CASES,
        choices=ALL_CASES,
        help="Subset of smoke cases to run. Hard-capped at 3 cases per run."
    )
    parser.add_argument(
        "--extension-dir",
        default=str(DEFAULT_EXTENSION_DIR),
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
    parser.add_argument(
        "--settle-ms",
        type=int,
        default=1200,
        help="Extra settle time after key UI transitions."
    )
    return parser.parse_args()


def build_extension_args(extension_dir: Path) -> list[str]:
    resolved = str(extension_dir.resolve())
    return [
        f"--disable-extensions-except={resolved}",
        f"--load-extension={resolved}",
    ]


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return


class StaticServer:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.port = find_free_port()
        self.httpd = ThreadingHTTPServer(
            ("127.0.0.1", self.port),
            partial(QuietStaticHandler, directory=str(root))
        )
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        self.thread.start()

    def close(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=3)


def wait_for_extension_id(context: BrowserContext, timeout_ms: int) -> str:
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        worker = context.service_workers[0] if context.service_workers else None
        if worker:
            url = str(worker.url)
            if url.startswith("chrome-extension://"):
                return url.split("/")[2]
        time.sleep(0.2)

    raise RuntimeError("extension_service_worker_not_ready")


def get_extension_worker(context: BrowserContext) -> Worker:
    worker = context.service_workers[0] if context.service_workers else None
    if not worker:
        raise RuntimeError("missing_extension_worker")
    return worker


def wait_for_extension_ready(context: BrowserContext, timeout_ms: int) -> int:
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        worker = context.service_workers[0] if context.service_workers else None
        if not worker:
            time.sleep(0.2)
            continue
        try:
            count = int(worker.evaluate("async () => (await chrome.scripting.getRegisteredContentScripts()).length"))
            if count > 0:
                return count
        except Exception:
            pass
        time.sleep(0.2)

    raise RuntimeError("extension_content_scripts_not_ready")


def list_popup_player_windows(context: BrowserContext) -> list[dict[str, Any]]:
    worker = get_extension_worker(context)
    return worker.evaluate(
        """async () => {
            const windows = await chrome.windows.getAll({ populate: true });
            return windows
                .map((item) => ({
                    id: Number(item.id || 0),
                    type: String(item.type || ''),
                    left: Number(item.left || 0),
                    top: Number(item.top || 0),
                    width: Number(item.width || 0),
                    height: Number(item.height || 0),
                    tabs: Array.isArray(item.tabs)
                        ? item.tabs.map((tab) => ({
                            id: Number(tab?.id || 0),
                            url: String(tab?.url || ''),
                            title: String(tab?.title || '')
                        }))
                        : []
                }))
                .filter((item) =>
                    item.type === 'popup' &&
                    item.tabs.some((tab) => tab.url.includes('popup-player/popup-player.html'))
                );
        }"""
    )


def wait_for_popup_player_window(
    context: BrowserContext,
    existing_window_ids: set[int],
    timeout_ms: int
) -> dict[str, Any]:
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        windows = list_popup_player_windows(context)
        for item in windows:
            if int(item["id"]) not in existing_window_ids:
                return item
        time.sleep(0.2)

    raise RuntimeError("popup_player_window_not_found")


def wait_for_popup_player_reopen(
    context: BrowserContext,
    closed_window_id: int,
    closed_popup_url: str,
    timeout_ms: int
) -> dict[str, Any]:
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        windows = list_popup_player_windows(context)
        for item in windows:
            popup_url = str(item["tabs"][0]["url"]) if item.get("tabs") else ""
            if int(item["id"]) != int(closed_window_id):
                return item
            if popup_url != str(closed_popup_url):
                return item
            if "pin=1" in popup_url and "pin=1" not in str(closed_popup_url):
                return item

        time.sleep(0.2)

    raise RuntimeError("popup_player_window_not_found")


def get_popup_player_window_by_id(context: BrowserContext, window_id: int) -> dict[str, Any]:
    windows = list_popup_player_windows(context)
    match = next((item for item in windows if int(item["id"]) == int(window_id)), None)
    if not match:
        raise RuntimeError(f"popup_player_window_missing:{window_id}")
    return match


def wait_for_popup_player_page(
    context: BrowserContext,
    existing_page_ids: set[int],
    timeout_ms: int
) -> Page:
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        for page in context.pages:
            if page.is_closed() or id(page) in existing_page_ids:
                continue
            if "popup-player/popup-player.html" in str(page.url):
                return page
        time.sleep(0.2)
    raise RuntimeError("popup_player_page_not_found")


def wait_for_popup_player_page_url(context: BrowserContext, popup_url: str, timeout_ms: int) -> Page:
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        for page in context.pages:
            if page.is_closed():
                continue
            if str(page.url) == str(popup_url):
                return page
        time.sleep(0.2)
    raise RuntimeError("popup_player_page_url_not_found")


def read_pinned_popup_store(context: BrowserContext) -> dict[str, Any]:
    worker = get_extension_worker(context)
    return worker.evaluate(
        """async () => {
            const result = await chrome.storage.local.get(['pinnedPopupPlayers']);
            return result.pinnedPopupPlayers || {};
        }"""
    )


def wait_for_pinned_popup_bounds(
    context: BrowserContext,
    window_id: int,
    expected_bounds: dict[str, Any],
    timeout_ms: int
) -> dict[str, Any]:
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        state = read_pinned_popup_store(context)
        entry = state.get(str(window_id), {})
        bounds = entry.get("windowBounds", {})
        matches = (
            int(bounds.get("left", 0)) == int(expected_bounds.get("left", 0))
            and int(bounds.get("top", 0)) == int(expected_bounds.get("top", 0))
            and int(bounds.get("width", 0)) == int(expected_bounds.get("width", 0))
            and int(bounds.get("height", 0)) == int(expected_bounds.get("height", 0))
        )
        if matches:
            return bounds
        time.sleep(0.2)
    return {}


def update_popup_player_window_bounds(
    context: BrowserContext,
    window_id: int,
    *,
    left: int,
    top: int,
    width: int,
    height: int,
) -> dict[str, Any]:
    worker = get_extension_worker(context)
    worker.evaluate(
        """async ({ windowId, left, top, width, height }) => {
            await chrome.windows.update(Number(windowId), {
                left: Number(left),
                top: Number(top),
                width: Number(width),
                height: Number(height),
            });
            return true;
        }""",
        {
            "windowId": int(window_id),
            "left": int(left),
            "top": int(top),
            "width": int(width),
            "height": int(height),
        }
    )
    time.sleep(0.5)
    return get_popup_player_window_by_id(context, window_id)


def open_popup_player_via_background(
    context: BrowserContext,
    payload: dict[str, Any],
    timeout_ms: int
) -> dict[str, Any]:
    worker = get_extension_worker(context)
    existing_window_ids = {int(item["id"]) for item in list_popup_player_windows(context)}
    response = worker.evaluate(
        """async ({ payload }) => {
            const created = await createPopupPlayerWindow(payload);
            return {
                success: Boolean(created?.id || created?.window?.id),
                windowId: Number(created?.id || created?.window?.id || 0)
            };
        }""",
        {"payload": payload},
    )
    if response and response.get("success") is False:
        raise RuntimeError(str(response.get("error") or "open_popup_player_failed"))
    return wait_for_popup_player_window(context, existing_window_ids, timeout_ms)


def close_popup_player_window(context: BrowserContext, window_id: int) -> None:
    worker = get_extension_worker(context)
    worker.evaluate(
        """async ({ windowId }) => {
            await chrome.windows.remove(Number(windowId));
            return true;
        }""",
        {"windowId": int(window_id)}
    )


def wait_for_video_ready(page: Page, timeout_ms: int) -> None:
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        ready = page.evaluate(
            """() => {
                const video = document.querySelector('video');
                return Boolean(video && video.readyState >= 1);
            }"""
        )
        if ready:
            return
        time.sleep(0.2)
    raise RuntimeError("popup_player_video_not_ready")


def read_popup_page_window_bounds(page: Page) -> dict[str, int]:
    return dict(page.evaluate(
        """() => ({
            left: Math.round(Number.isFinite(window.screenX) ? window.screenX : (window.screenLeft || 0)),
            top: Math.round(Number.isFinite(window.screenY) ? window.screenY : (window.screenTop || 0)),
            width: Math.round(Number(window.outerWidth || 0)),
            height: Math.round(Number(window.outerHeight || 0))
        })"""
    ))


def close_popup_player_windows(context: BrowserContext) -> None:
    windows = list_popup_player_windows(context)
    if not windows:
        return
    worker = get_extension_worker(context)
    worker.evaluate(
        """async ({ windowIds }) => {
            await Promise.all(windowIds.map(async (windowId) => {
                try {
                    await chrome.windows.remove(Number(windowId));
                } catch (_) {
                    // ignore
                }
            }));
            return true;
        }""",
        {"windowIds": [int(item["id"]) for item in windows]},
    )
    time.sleep(0.6)


def clear_pinned_popup_players(context: BrowserContext) -> None:
    worker = get_extension_worker(context)
    worker.evaluate(
        """async () => {
            const result = await chrome.storage.local.get(['pinnedPopupPlayers']);
            const entries = result.pinnedPopupPlayers && typeof result.pinnedPopupPlayers === 'object'
                ? result.pinnedPopupPlayers
                : {};
            await Promise.all(Object.keys(entries).map(async (windowId) => {
                try {
                    await chrome.runtime.sendMessage({
                        action: 'setPopupPlayerPin',
                        pinned: false,
                        chromeWindowId: Number(windowId)
                    });
                } catch (_) {
                    // ignore
                }
            }));
            await chrome.storage.local.set({ pinnedPopupPlayers: {} });
            return true;
        }"""
    )
    time.sleep(0.3)


def reset_popup_player_environment(context: BrowserContext) -> None:
    clear_pinned_popup_players(context)
    close_popup_player_windows(context)
    clear_pinned_popup_players(context)
    close_popup_player_windows(context)


def parse_popup_payload_from_url(popup_url: str) -> dict[str, Any]:
    query = parse_qs(urlparse(popup_url).query)
    return {
        "windowId": str(query.get("windowId", [""])[0]),
        "videoSrc": str(query.get("videoSrc", [""])[0]),
        "iframeSrc": str(query.get("iframeSrc", [""])[0]),
        "poster": str(query.get("poster", [""])[0]),
        "title": str(query.get("title", [""])[0]),
        "sourceTabUrl": str(query.get("sourceTabUrl", [""])[0]),
        "sourceTabId": int(str(query.get("sourceTabId", ["0"])[0]) or "0"),
        "playerId": str(query.get("playerId", [""])[0]),
        "remoteControlPreferred": str(query.get("remote", [""])[0]) == "1",
        "pin": str(query.get("pin", [""])[0]) == "1",
    }


def get_expected_video_src_for_selector(page: Page, selector: str) -> str:
    return str(page.evaluate(
        """(selector) => {
            const target = document.querySelector(selector);
            if (!(target instanceof Element)) {
                return '';
            }
            const video = target.matches('video') ? target : target.querySelector('video');
            if (!(video instanceof HTMLVideoElement)) {
                return '';
            }
            const source = video.querySelector('source[src]');
            return String(
                source instanceof HTMLSourceElement ? source.src || '' : video.currentSrc || video.src || ''
            );
        }""",
        selector,
    ) or "")


def get_popup_button_targets_for_selector(page: Page, selector: str) -> dict[str, Any]:
    return dict(page.evaluate(
        """(selector) => {
            const target = document.querySelector(selector);
            if (!(target instanceof Element)) {
                return { shieldId: '', videoSrc: '', iframeSrc: '' };
            }
            const shieldTarget =
                (target instanceof HTMLElement && target.dataset.shieldId ? target : null) ||
                target.closest('[data-shield-id]') ||
                target.querySelector('[data-shield-id]');
            const video = target.matches('video') ? target : target.querySelector('video');
            const iframe = target.matches('iframe') ? target : target.querySelector('iframe');
            const source = video instanceof HTMLVideoElement ? video.querySelector('source[src]') : null;
            return {
                shieldId: shieldTarget instanceof HTMLElement ? String(shieldTarget.dataset.shieldId || '') : '',
                videoSrc: String(
                    source instanceof HTMLSourceElement ? source.src || '' :
                    video instanceof HTMLVideoElement ? video.currentSrc || video.src || '' :
                    ''
                ),
                iframeSrc: String(iframe instanceof HTMLIFrameElement ? iframe.src || '' : '')
            };
        }""",
        selector,
    ))


def get_visible_popup_button_indexes_for_selector(
    page: Page,
    selector: str,
    expected_targets: dict[str, Any]
) -> list[int]:
    return list(page.evaluate(
        """({ selector, expectedTargets }) => {
            const target = document.querySelector(selector);
            if (!(target instanceof Element)) {
                return [];
            }
            const rect = target.getBoundingClientRect();
            const expectedShieldId = String(expectedTargets?.shieldId || '');
            const expectedVideoSrc = String(expectedTargets?.videoSrc || '');
            const expectedIframeSrc = String(expectedTargets?.iframeSrc || '');
            return Array.from(document.querySelectorAll('.shield-popup-player-btn'))
                .map((button, index) => ({ button, index }))
                .filter(({ button }) => {
                    const style = window.getComputedStyle(button);
                    return style.opacity === '1' && style.pointerEvents !== 'none';
                })
                .map(({ button, index }) => {
                    const buttonRect = button.getBoundingClientRect();
                    const targetIdMatch = expectedShieldId && button.dataset.shieldPopupTargetId === expectedShieldId ? -50000 : 0;
                    const videoSrcMatch = expectedVideoSrc && button.dataset.shieldPopupVideoSrc === expectedVideoSrc ? -40000 : 0;
                    const iframeSrcMatch = expectedIframeSrc && button.dataset.shieldPopupIframeSrc === expectedIframeSrc ? -40000 : 0;
                    const overlapPenalty = (
                        buttonRect.right >= rect.left &&
                        buttonRect.left <= rect.right &&
                        buttonRect.bottom >= rect.top &&
                        buttonRect.top <= rect.bottom
                    ) ? 0 : 10000;
                    const distance = Math.abs(buttonRect.right - rect.right) + Math.abs(buttonRect.top - rect.top);
                    return { index, score: distance + overlapPenalty + targetIdMatch + videoSrcMatch + iframeSrcMatch };
                })
                .sort((left, right) => left.score - right.score)
                .map((item) => item.index);
        }""",
        {"selector": selector, "expectedTargets": expected_targets},
    ))


def open_test_page(context: BrowserContext, base_url: str, timeout_ms: int) -> Page:
    page = context.new_page()
    page.goto(f"{base_url}/test-popup-player.html", wait_until="domcontentloaded", timeout=timeout_ms)
    try:
        page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 8000))
    except PlaywrightTimeoutError:
        pass
    page.wait_for_selector(".shield-popup-player-btn", timeout=timeout_ms)
    return page


def hover_and_open_first_popup(page: Page, context: BrowserContext, timeout_ms: int) -> dict[str, Any]:
    return open_popup_for_selector(page, context, "#player1 video", timeout_ms, expect_target_match=False)


def open_popup_for_selector(
    page: Page,
    context: BrowserContext,
    selector: str,
    timeout_ms: int,
    *,
    expect_target_match: bool = True,
    excluded_video_srcs: set[str] | None = None
) -> dict[str, Any]:
    expected_video_src = get_expected_video_src_for_selector(page, selector)
    expected_targets = get_popup_button_targets_for_selector(page, selector)
    target = page.locator(selector)
    page.locator("body").hover(position={"x": 8, "y": 8})
    page.wait_for_timeout(120)
    target.scroll_into_view_if_needed()
    target.hover()
    page.wait_for_function(
        """(selector) => {
            const target = document.querySelector(selector);
            if (!(target instanceof Element)) {
                return false;
            }
            const rect = target.getBoundingClientRect();
            return Array.from(document.querySelectorAll('.shield-popup-player-btn')).some((button) => {
                const style = window.getComputedStyle(button);
                if (style.opacity !== '1' || style.pointerEvents === 'none') {
                    return false;
                }
                const buttonRect = button.getBoundingClientRect();
                const horizontalOverlap = buttonRect.right >= rect.left && buttonRect.left <= rect.right;
                const verticalOverlap = buttonRect.bottom >= rect.top && buttonRect.top <= rect.bottom;
                return horizontalOverlap && verticalOverlap;
            });
        }""",
        arg=selector,
        timeout=timeout_ms,
    )
    button_indexes = get_visible_popup_button_indexes_for_selector(page, selector, expected_targets)
    if not button_indexes:
        raise RuntimeError(f"visible_popup_button_not_found:{selector}")

    existing_window_ids = {int(item["id"]) for item in list_popup_player_windows(context)}
    for button_index in button_indexes:
        page.evaluate(
            """(buttonIndex) => {
                const button = Array.from(document.querySelectorAll('.shield-popup-player-btn'))[Number(buttonIndex)];
                if (!(button instanceof HTMLElement)) {
                    throw new Error(`visible_popup_button_not_found:${buttonIndex}`);
                }
                button.click();
            }""",
            button_index,
        )
        popup_window = wait_for_popup_player_window(context, existing_window_ids, timeout_ms)
        popup_payload = parse_popup_payload_from_url(str(popup_window["tabs"][0]["url"]))
        if excluded_video_srcs and str(popup_payload["videoSrc"]) in excluded_video_srcs:
            close_popup_player_window(context, int(popup_window["id"]))
            existing_window_ids.add(int(popup_window["id"]))
            page.locator("body").hover(position={"x": 8, "y": 8})
            page.wait_for_timeout(120)
            target.hover()
            page.wait_for_timeout(180)
            continue
        if not expect_target_match:
            return popup_window
        if not expected_video_src or str(popup_payload["videoSrc"]) == expected_video_src:
            return popup_window

        close_popup_player_window(context, int(popup_window["id"]))
        existing_window_ids.add(int(popup_window["id"]))
        page.locator("body").hover(position={"x": 8, "y": 8})
        page.wait_for_timeout(120)
        target.hover()
        page.wait_for_timeout(180)

    raise RuntimeError(f"popup_player_window_target_mismatch:{selector}")


def reset_extension_stats(context: BrowserContext, timeout_ms: int) -> None:
    worker = get_extension_worker(context)
    worker.evaluate(
        """async () => {
            await chrome.storage.local.set({
                stats: {
                    popupsBlocked: 0,
                    overlaysRemoved: 0,
                    fakeVideosRemoved: 0,
                    playersProtected: 0,
                    totalBlocked: 0
                }
            });
            return true;
        }"""
    )
    time.sleep(min(timeout_ms, 1500) / 1000)


def read_extension_stats(context: BrowserContext) -> dict[str, Any]:
    worker = get_extension_worker(context)
    return worker.evaluate(
        """async () => {
            const result = await chrome.storage.local.get(['stats']);
            return result.stats || {};
        }"""
    )


def set_popup_auto_fit_window(context: BrowserContext, enabled: bool) -> None:
    worker = get_extension_worker(context)
    worker.evaluate(
        """async ({ enabled }) => {
            await chrome.storage.local.set({ popupPlayerAutoFitWindow: enabled === true });
            return true;
        }""",
        {"enabled": enabled},
    )
    time.sleep(0.2)


def wait_for_stats(context: BrowserContext, timeout_ms: int, minimum_blocked: int) -> dict[str, Any]:
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        stats = read_extension_stats(context)
        if int(stats.get("popupsBlocked", 0)) >= minimum_blocked:
            return stats
        time.sleep(0.2)
    return read_extension_stats(context)


def run_popup_open_local_video(
    context: BrowserContext,
    base_url: str,
    timeout_ms: int,
    settle_ms: int
) -> dict[str, Any]:
    reset_popup_player_environment(context)
    page = open_test_page(context, base_url, timeout_ms)
    popup_window = hover_and_open_first_popup(page, context, timeout_ms)
    popup_page = wait_for_popup_player_page_url(context, str(popup_window["tabs"][0]["url"]), timeout_ms)
    wait_for_video_ready(popup_page, timeout_ms)
    time.sleep(settle_ms / 1000)
    popup_url = str(popup_window["tabs"][0]["url"])
    payload = parse_popup_payload_from_url(popup_url)
    ok = (
        popup_window["type"] == "popup"
        and "popup-player/popup-player.html" in popup_url
        and bool(payload["videoSrc"])
        and int(payload["sourceTabId"]) > 0
    )
    reset_popup_player_environment(context)
    popup_page.close()
    page.close()
    return {
        "name": "popup-open-local-video",
        "ok": ok,
        "popupWindow": popup_window,
        "popupUrl": popup_url,
        "payload": payload,
    }


def run_pin_close_reopen(
    context: BrowserContext,
    base_url: str,
    timeout_ms: int,
    settle_ms: int
) -> dict[str, Any]:
    reset_popup_player_environment(context)
    set_popup_auto_fit_window(context, False)
    page = open_test_page(context, base_url, timeout_ms)
    popup_window = hover_and_open_first_popup(page, context, timeout_ms)
    popup_page = wait_for_popup_player_page_url(context, str(popup_window["tabs"][0]["url"]), timeout_ms)
    popup_page.locator("#btn-pin").click()
    popup_page.wait_for_function(
        "() => document.getElementById('btn-pin')?.classList.contains('active') === true",
        timeout=timeout_ms,
    )
    popup_window = update_popup_player_window_bounds(
        context,
        int(popup_window["id"]),
        left=int(popup_window.get("left", 0)),
        top=int(popup_window.get("top", 0)),
        width=1200,
        height=760,
    )
    time.sleep(settle_ms / 1000)
    old_window_id = int(popup_window["id"])
    old_bounds = popup_window
    old_popup_url = str(popup_window["tabs"][0]["url"])
    page_bounds_before_close = read_popup_page_window_bounds(popup_page)
    stored_bounds_before_close = wait_for_pinned_popup_bounds(
        context,
        old_window_id,
        old_bounds,
        min(timeout_ms, 5000),
    )
    close_popup_player_window(context, old_window_id)
    reopened_window = wait_for_popup_player_reopen(context, old_window_id, old_popup_url, timeout_ms)
    reopened_page = wait_for_popup_player_page_url(context, str(reopened_window["tabs"][0]["url"]), timeout_ms)
    reopened_page.wait_for_function(
        "() => document.getElementById('btn-pin')?.classList.contains('active') === true",
        timeout=timeout_ms,
    )
    reopened_page.wait_for_timeout(settle_ms)
    reopened_url = str(reopened_window["tabs"][0]["url"])
    reopened_payload = parse_popup_payload_from_url(reopened_url)
    reopened_page_bounds = read_popup_page_window_bounds(reopened_page)
    storage_state = read_pinned_popup_store(context)
    active_window_ids = [int(item["id"]) for item in list_popup_player_windows(context)]
    rebound_entry = storage_state.get(str(reopened_window["id"]), {})
    rebound_bounds = rebound_entry.get("windowBounds", {})

    reopened_once = old_window_id not in active_window_ids and int(reopened_window["id"]) != old_window_id
    original_payload = parse_popup_payload_from_url(old_popup_url)
    carried_source = reopened_payload["sourceTabId"] > 0 and reopened_payload["videoSrc"] == original_payload["videoSrc"]
    actual_size_restored = (
        int(reopened_window.get("width", 0)) == int(old_bounds.get("width", 0))
        and int(reopened_window.get("height", 0)) == int(old_bounds.get("height", 0))
    )
    actual_position_restored = (
        abs(int(reopened_window.get("left", 0)) - int(old_bounds.get("left", 0))) <= 24
        and abs(int(reopened_window.get("top", 0)) - int(old_bounds.get("top", 0))) <= 24
    )
    actual_bounds_restored = (
        actual_size_restored
        and actual_position_restored
    )
    reported_bounds_restored = (
        abs(int(reopened_page_bounds.get("left", 0)) - int(page_bounds_before_close.get("left", 0))) <= 24
        and abs(int(reopened_page_bounds.get("top", 0)) - int(page_bounds_before_close.get("top", 0))) <= 24
        and int(reopened_page_bounds.get("width", 0)) == int(page_bounds_before_close.get("width", 0))
        and int(reopened_page_bounds.get("height", 0)) == int(page_bounds_before_close.get("height", 0))
    )
    stored_bounds_restored = (
        int(rebound_bounds.get("left", 0)) == int(old_bounds.get("left", 0))
        and int(rebound_bounds.get("top", 0)) == int(old_bounds.get("top", 0))
        and int(rebound_bounds.get("width", 0)) == int(old_bounds.get("width", 0))
        and int(rebound_bounds.get("height", 0)) == int(old_bounds.get("height", 0))
    )
    bounds_persisted_before_close = bool(stored_bounds_before_close)
    position_restored = bounds_persisted_before_close and (
        stored_bounds_restored or actual_bounds_restored or reported_bounds_restored
    )
    storage_rebound = str(reopened_window["id"]) in storage_state and str(old_window_id) not in storage_state
    pin_button_still_active = reopened_page.evaluate(
        "() => document.getElementById('btn-pin')?.classList.contains('active') === true"
    )

    reset_popup_player_environment(context)
    reopened_page.close()
    page.close()
    set_popup_auto_fit_window(context, True)
    return {
        "name": "pin-close-reopen",
        "ok": reopened_once and carried_source and position_restored and storage_rebound and pin_button_still_active,
        "beforeClose": popup_window,
        "pageBoundsBeforeClose": page_bounds_before_close,
        "storedBeforeClose": stored_bounds_before_close,
        "afterReopen": reopened_window,
        "pageBoundsAfterReopen": reopened_page_bounds,
        "checks": {
            "reopenedOnce": reopened_once,
            "carriedSource": carried_source,
            "boundsPersistedBeforeClose": bounds_persisted_before_close,
            "positionRestored": position_restored,
            "actualSizeRestored": actual_size_restored,
            "actualPositionRestored": actual_position_restored,
            "actualBoundsRestored": actual_bounds_restored,
            "reportedBoundsRestored": reported_bounds_restored,
            "storedBoundsRestored": stored_bounds_restored,
            "storageRebound": storage_rebound,
            "pinButtonStillActive": pin_button_still_active,
        },
    }


def run_popup_player_state_restore(
    context: BrowserContext,
    base_url: str,
    timeout_ms: int,
    settle_ms: int
) -> dict[str, Any]:
    reset_popup_player_environment(context)
    set_popup_auto_fit_window(context, False)
    page = open_test_page(context, base_url, timeout_ms)
    popup_window = hover_and_open_first_popup(page, context, timeout_ms)
    popup_page = wait_for_popup_player_page_url(context, str(popup_window["tabs"][0]["url"]), timeout_ms)
    wait_for_video_ready(popup_page, timeout_ms)
    popup_page.locator("#btn-pin").click()
    popup_page.wait_for_function(
        "() => document.getElementById('btn-pin')?.classList.contains('active') === true",
        timeout=timeout_ms,
    )
    popup_page.evaluate(
        """() => {
            const video = document.querySelector('video');
            const setSlider = (id, value) => {
                const slider = document.getElementById(id);
                if (!slider) return;
                slider.value = String(value);
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            };

            if (video) {
                video.currentTime = 14;
                video.volume = 0.35;
                video.muted = true;
                video.playbackRate = 1.75;
                video.dispatchEvent(new Event('timeupdate', { bubbles: true }));
                video.dispatchEvent(new Event('volumechange', { bubbles: true }));
                video.dispatchEvent(new Event('ratechange', { bubbles: true }));
            }

            setSlider('brightness-slider', 118);
            setSlider('contrast-slider', 112);
            setSlider('saturation-slider', 130);
            setSlider('sharpness-slider', 45);
            setSlider('hue-slider', 20);
            setSlider('temperature-slider', 24);
        }"""
    )
    time.sleep(settle_ms / 1000)
    old_popup_url = str(popup_window["tabs"][0]["url"])
    close_popup_player_window(context, int(popup_window["id"]))
    reopened_window = wait_for_popup_player_reopen(context, int(popup_window["id"]), old_popup_url, timeout_ms)
    verify_page = wait_for_popup_player_page_url(context, str(reopened_window["tabs"][0]["url"]), timeout_ms)
    wait_for_video_ready(verify_page, timeout_ms)
    verify_page.wait_for_timeout(settle_ms)
    snapshot = verify_page.evaluate(
        """() => {
            const video = document.querySelector('video');
            const brightnessSlider = document.getElementById('brightness-slider');
            const contrastSlider = document.getElementById('contrast-slider');
            const saturationSlider = document.getElementById('saturation-slider');
            const sharpnessSlider = document.getElementById('sharpness-slider');
            const hueSlider = document.getElementById('hue-slider');
            const temperatureSlider = document.getElementById('temperature-slider');
            return {
                currentTime: video ? Number(video.currentTime || 0) : null,
                volume: video ? Number(video.volume || 0) : null,
                muted: video ? video.muted === true : null,
                playbackRate: video ? Number(video.playbackRate || 0) : null,
                brightness: brightnessSlider ? Number(brightnessSlider.value || 0) : null,
                contrast: contrastSlider ? Number(contrastSlider.value || 0) : null,
                saturation: saturationSlider ? Number(saturationSlider.value || 0) : null,
                sharpness: sharpnessSlider ? Number(sharpnessSlider.value || 0) : null,
                hue: hueSlider ? Number(hueSlider.value || 0) : null,
                temperature: temperatureSlider ? Number(temperatureSlider.value || 0) : null
            };
        }"""
    )

    current_time_ok = snapshot["currentTime"] is not None and float(snapshot["currentTime"]) >= 12
    volume_ok = abs(float(snapshot["volume"] or 0) - 0.35) <= 0.05
    muted_ok = snapshot["muted"] is True
    speed_ok = abs(float(snapshot["playbackRate"] or 0) - 1.75) <= 0.05
    brightness_ok = int(snapshot["brightness"] or 0) == 118
    contrast_ok = int(snapshot["contrast"] or 0) == 112
    saturation_ok = int(snapshot["saturation"] or 0) == 130
    sharpness_ok = int(snapshot["sharpness"] or 0) == 45
    hue_ok = int(snapshot["hue"] or 0) == 20
    temperature_ok = int(snapshot["temperature"] or 0) == 24

    reset_popup_player_environment(context)
    verify_page.close()
    page.close()
    set_popup_auto_fit_window(context, True)
    return {
        "name": "popup-player-state-restore",
        "ok": (
            current_time_ok
            and volume_ok
            and muted_ok
            and speed_ok
            and brightness_ok
            and contrast_ok
            and saturation_ok
            and sharpness_ok
            and hue_ok
            and temperature_ok
        ),
        "snapshot": snapshot,
        "checks": {
            "currentTimeOk": current_time_ok,
            "volumeOk": volume_ok,
            "mutedOk": muted_ok,
            "speedOk": speed_ok,
            "brightnessOk": brightness_ok,
            "contrastOk": contrast_ok,
            "saturationOk": saturation_ok,
            "sharpnessOk": sharpness_ok,
            "hueOk": hue_ok,
            "temperatureOk": temperature_ok,
        },
    }


def run_multi_popup_distinct_windows(
    context: BrowserContext,
    base_url: str,
    timeout_ms: int,
    settle_ms: int
) -> dict[str, Any]:
    reset_popup_player_environment(context)
    page = open_test_page(context, base_url, timeout_ms)
    opened_windows: list[dict[str, Any]] = []
    first_window = open_popup_for_selector(
        page,
        context,
        "#player2 video",
        timeout_ms,
        expect_target_match=False,
    )
    opened_windows.append(first_window)
    page.wait_for_timeout(settle_ms)
    first_payload = parse_popup_payload_from_url(str(first_window["tabs"][0]["url"]))
    second_video_src = next(
        src for src in [
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        ]
        if src != str(first_payload["videoSrc"])
    )
    second_window = open_popup_player_via_background(
        context,
        {
            "videoSrc": second_video_src,
            "title": "Popup Smoke Background Open",
            "sourceTabUrl": f"{base_url}/test-popup-player.html",
            "sourceTabId": int(first_payload["sourceTabId"] or 0),
        },
        timeout_ms,
    )
    opened_windows.append(second_window)
    page.wait_for_timeout(settle_ms)

    second_payload = parse_popup_payload_from_url(str(second_window["tabs"][0]["url"]))
    distinct_window_ids = int(opened_windows[0]["id"]) != int(opened_windows[1]["id"])
    distinct_tab_ids = int(opened_windows[0]["tabs"][0]["id"]) != int(opened_windows[1]["tabs"][0]["id"])
    distinct_video_src = bool(first_payload["videoSrc"]) and bool(second_payload["videoSrc"]) and first_payload["videoSrc"] != second_payload["videoSrc"]

    reset_popup_player_environment(context)
    page.close()
    return {
        "name": "multi-popup-distinct-windows",
        "ok": distinct_window_ids and distinct_tab_ids and distinct_video_src,
        "openedWindows": opened_windows,
        "checks": {
            "distinctWindowIds": distinct_window_ids,
            "distinctTabIds": distinct_tab_ids,
            "distinctVideoSrc": distinct_video_src,
        },
    }


def run_case(
    case_name: str,
    context: BrowserContext,
    extension_id: str,
    base_url: str,
    timeout_ms: int,
    settle_ms: int
) -> dict[str, Any]:
    started_at = time.time()
    try:
        if case_name == "popup-open-local-video":
            result = run_popup_open_local_video(context, base_url, timeout_ms, settle_ms)
        elif case_name == "pin-close-reopen":
            result = run_pin_close_reopen(context, base_url, timeout_ms, settle_ms)
        elif case_name == "popup-player-state-restore":
            result = run_popup_player_state_restore(context, base_url, timeout_ms, settle_ms)
        elif case_name == "multi-popup-distinct-windows":
            result = run_multi_popup_distinct_windows(context, base_url, timeout_ms, settle_ms)
        else:
            raise ValueError(f"unsupported_case:{case_name}")

        result["durationMs"] = int((time.time() - started_at) * 1000)
        return result
    except Exception as error:
        return {
            "name": case_name,
            "ok": False,
            "durationMs": int((time.time() - started_at) * 1000),
            "error": str(error),
        }


def launch_context(playwright: Playwright, extension_dir: Path, browser_channel: str, headless: bool) -> BrowserContext:
    profile_dir = Path(tempfile.mkdtemp(prefix="falcon-popup-smoke-"))
    return playwright.chromium.launch_persistent_context(
        user_data_dir=str(profile_dir),
        channel=browser_channel,
        headless=headless,
        args=build_extension_args(extension_dir),
        viewport={"width": 1440, "height": 960},
    )


def main() -> int:
    args = parse_args()
    if len(args.cases) > MAX_CASES_PER_RUN:
        raise SystemExit(f"at most {MAX_CASES_PER_RUN} Playwright smoke cases are allowed per run")

    extension_dir = Path(args.extension_dir).resolve()
    if not extension_dir.exists():
        raise SystemExit(f"extension directory not found: {extension_dir}")

    server = StaticServer(REPO_ROOT / "tests")
    server.start()
    results: list[dict[str, Any]] = []

    try:
        with sync_playwright() as playwright:
            for case_name in args.cases:
                context = launch_context(playwright, extension_dir, args.browser_channel, args.headless)
                try:
                    registered_scripts = wait_for_extension_ready(context, args.timeout_ms)
                    extension_id = wait_for_extension_id(context, args.timeout_ms)

                    result = run_case(
                        case_name,
                        context,
                        extension_id,
                        server.base_url,
                        args.timeout_ms,
                        args.settle_ms,
                    )
                    result["extensionId"] = extension_id
                    result["registeredScripts"] = registered_scripts
                    results.append(result)
                    status = "PASS" if result.get("ok") else "FAIL"
                    print(f"[{status}] {case_name}")
                    if result.get("error"):
                        print(f"  error={result['error']}")
                finally:
                    context.close()
    finally:
        server.close()

    summary = {
        "ok": all(bool(item.get("ok")) for item in results),
        "results": results,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
