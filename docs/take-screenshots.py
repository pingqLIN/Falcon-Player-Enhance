from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS_DIR = PROJECT_ROOT / "docs" / "screenshots"


def page_uri(*parts: str) -> str:
    return (PROJECT_ROOT.joinpath(*parts)).resolve().as_uri()


def scroll_to_selector(page, selector: str) -> None:
    page.evaluate(
        """(selector) => {
            const target = document.querySelector(selector);
            if (target) {
                target.scrollIntoView({ behavior: 'instant' });
            }
        }""",
        selector,
    )


def assert_no_cjk_text(page, label: str) -> None:
    remaining = page.evaluate(
        """() => {
            const matches = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
                if (!text || !/[\\u3400-\\u9fff]/.test(text)) continue;
                const parent = node.parentElement;
                if (!parent) continue;
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                matches.push(text);
                if (matches.length >= 12) break;
            }
            return matches;
        }"""
    )
    if remaining:
        raise RuntimeError(f"{label} still contains CJK text: {remaining}")


def inject_player_english(page) -> None:
    page.evaluate(
        """() => {
            const map = {
                '統一 UI/UX 設計預覽 (Popup + 無干擾播放器)': 'Unified UI/UX Design Preview (Popup + Distraction-Free Player)',
                '統一 UI/UX 設計預覽': 'Unified UI/UX Design Preview',
                '點選播放器': 'Click Player',
                '偵測與清除': 'Detect & Clean',
                '安全播放': 'Safe Play',
                '● 已鎖定播放器': '● Player Locked',
                '已鎖定播放器': 'Player Locked',
                '偵測到的播放器': 'Detected Players',
                'Three-Gray token system · 300px 固定寬 · 支援深色模式': 'Three-Gray token system · 300px fixed width · Dark mode support',
                '無干擾播放器（全視窗）': 'Distraction-Free Player (Full Window)',
                '無干擾播放器': 'Distraction-Free Player',
                '影片已載入 · 點選播放': 'Video loaded · Click to play',
                '播放控制': 'Playback Controls',
                '後退': 'Rewind',
                '靜音': 'Mute',
                '播放': 'Play',
                '循環': 'Loop',
                '快進': 'Forward',
                '全螢幕': 'Fullscreen',
                '拖曳定位': 'Drag to seek',
                '畫面調整': 'Visual Adjustments',
                '亮度 · 對比 · 色調 · 色溫': 'Brightness · Contrast · Hue · Temperature',
                '光影 Luminance': 'Luminance',
                '色彩 Color': 'Color',
                '色調 Tint': 'Hue / Tint',
                '洋紅 M': 'Magenta',
                '綠 G': 'Green',
                '色溫 Temp': 'Temperature',
                '中性': 'Neutral',
                '冷 Cool': 'Cool',
                '暖 Warm': 'Warm',
                '防護設定': 'Protection Settings',
                'Link Shield · 嵌入保護': 'Link Shield · Embed Protection',
                '封鎖嵌入連結': 'Block Embed Links',
                '舞台重置': 'Reset Stage',
                '在 iframe 模式下，防護層覆蓋嵌入頁面，防止意外廣告點擊與外部跳轉。': 'In iframe mode, the shield covers the embedded page to prevent accidental ad clicks and external redirects.',
                '音量': 'Volume',
                '設計說明 — 一致性決策': 'Design Notes — Consistency Decisions',
                '共用 Token（兩個 UI 都遵守）': 'Shared Tokens (Both UIs)',
                'Radius scale 統一': 'Unified radius scale',
                'Font stack 統一': 'Unified font stack',
                'Motion 統一': 'Unified motion easing',
                'Accent 橋接': 'Accent bridging',
                'Popup 主要改動': 'Popup Key Changes',
                'Status bar 新增': 'New status bar',
                'Player chip 重設計': 'Player chip redesign',
                'Stats 第 4 欄': 'Stats 4th column',
                'AI monitor panel 精簡': 'Streamlined AI monitor',
                'Player v6 主要改動': 'Player v6 Key Changes',
                '3 折疊分區取代 5 固定 section': '3 collapsible sections replace 5 fixed',
                'Transport 改為 6 按鈕橫排': 'Transport: 6-button row layout',
                '畫面調整新增色調 Tint + 色溫 Temp': 'Added Hue/Tint + Color Temperature',
                '移除 AI panel': 'Removed AI panel',
                'Token 對照表': 'Token Reference',
                '用途': 'Usage',
                '背景': 'Background',
                '卡片': 'Card',
                '主文字': 'Primary text',
                '主動色': 'Active accent',
                '反色': 'Inverse',
                '成功/安全': 'Success/Safe',
                '危險': 'Danger',
                'Radius 基準': 'Radius base',
                '統一 UI 設計預覽 v6.0 — Popup + 無干擾播放器': 'Unified UI Design Preview v6.0 — Popup + Distraction-Free Player',
                'Cinema dark · oklch 主色橋接為 amber (#F0BC56) · v6: 3 折疊分區 · 無 AI panel · 色調/色溫': 'Cinema dark · oklch accent bridged to amber (#F0BC56) · v6: 3 collapsible sections · No AI panel · Hue/Temperature'
            };
            document.documentElement.lang = 'en';
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                for (const [zh, en] of Object.entries(map)) {
                    if (node.textContent.includes(zh)) {
                        node.textContent = node.textContent.replace(zh, en);
                    }
                }
            }
            document.title = document.title.replace(/統一 UI\\/UX 設計預覽.*/, 'Unified UI/UX Design Preview v6.0');
            const banner = document.querySelector('.preview-banner');
            if (banner) banner.textContent = '🎨 Unified UI Design Preview v6.0 — Popup + Distraction-Free Player';

            const columnLabels = document.querySelectorAll('.col-label');
            if (columnLabels[0]) columnLabels[0].textContent = '📌 Extension Popup (300px)';
            if (columnLabels[1]) columnLabels[1].textContent = '🎬 Distraction-Free Player (Full Window)';

            const designNote = document.querySelector('.design-note');
            if (designNote) {
                designNote.textContent = 'Cinema dark · oklch accent bridged to amber (#F0BC56) · v6: 3 collapsible sections · No AI panel · Hue / Temperature';
            }

            const cards = document.querySelectorAll('.anno-card');
            if (cards[0]) {
                cards[0].querySelector('.anno-title').textContent = '🔗 Shared Tokens (Both UIs)';
                const items = cards[0].querySelectorAll('.anno-item div');
                if (items[0]) items[0].innerHTML = '<strong>Unified radius scale</strong>: xs=4 · sm=6 · md=10 · lg=16 · xl=22 · full=9999px. Buttons, cards, and panels in Popup and Player now use the same scale.';
                if (items[1]) items[1].innerHTML = '<strong>Unified font stack</strong>: -apple-system, SF Pro Text, Helvetica Neue, Arial. The Player no longer uses the legacy "Avenir Next" stack.';
                if (items[2]) items[2].innerHTML = '<strong>Unified motion easing</strong>: ease-out cubic-bezier(0.16,1,0.3,1), dur-short=160ms, dur-mid=240ms. Both UIs now feel consistent in motion.';
                if (items[3]) items[3].innerHTML = '<strong>Accent bridging</strong>: Dashboard stays monochrome, while Player uses amber #F0BC56 as the active accent. Popup AI assessments still echo the green success tone.';
            }

            if (cards[1]) {
                cards[1].querySelector('.anno-title').textContent = '🆕 Popup Key Changes';
                const items = cards[1].querySelectorAll('.anno-item div');
                if (items[0]) items[0].innerHTML = '<strong>New status bar</strong> under the header: Active / current domain / AI mode, so users can read protection state without scrolling.';
                if (items[1]) items[1].innerHTML = '<strong>Player chip redesign</strong>: chips now use status dots, and the active chip flips to inverse colors for a clearer "locked" vs "available" state.';
                if (items[2]) items[2].innerHTML = '<strong>Stats 4th column</strong>: adds AI evals so popup overview stays aligned with the dashboard counters.';
                if (items[3]) items[3].innerHTML = '<strong>Streamlined AI monitor</strong>: long evidence text is replaced by a 2×2 key-value grid, with gate detail expanding only when needed.';
            }

            if (cards[2]) {
                cards[2].querySelector('.anno-title').textContent = '🎬 Player v6 Key Changes';
                const items = cards[2].querySelectorAll('.anno-item div');
                if (items[0]) items[0].innerHTML = '<strong>3 collapsible sections replace 5 fixed sections</strong>: playback controls, visual adjustments, and protection settings. Protection stays collapsed by default to save space.';
                if (items[1]) items[1].innerHTML = '<strong>Transport becomes a 6-button row</strong>: -10s · mute · play · loop · +10s · fullscreen. It is more compact and closer to the earlier preview rhythm.';
                if (items[2]) items[2].innerHTML = '<strong>Hue / Tint and Temperature added</strong>: luminance and color controls are now split into two subgroups, with SVG and CSS filters handling temperature and tint.';
                if (items[3]) items[3].innerHTML = '<strong>AI panel removed</strong>: the player keeps a true distraction-free focus, while AI diagnostics move back to the dashboard.';
            }

            if (cards[3]) {
                cards[3].querySelector('.anno-title').textContent = '🎨 Token Reference';
                const headers = cards[3].querySelectorAll('th');
                if (headers[0]) headers[0].textContent = 'Usage';
                if (headers[1]) headers[1].textContent = 'Popup / Dashboard';
                if (headers[2]) headers[2].textContent = 'Player (dark)';
                const rows = cards[3].querySelectorAll('tbody tr');
                if (rows[0]) rows[0].children[0].textContent = 'Background';
                if (rows[1]) rows[1].children[0].textContent = 'Card';
                if (rows[2]) rows[2].children[0].textContent = 'Primary text';
                if (rows[3]) rows[3].children[0].textContent = 'Active accent';
                if (rows[4]) rows[4].children[0].textContent = 'Success / Safe';
                if (rows[5]) rows[5].children[0].textContent = 'Danger';
                if (rows[6]) rows[6].children[0].textContent = 'Radius base';
            }
        }"""
    )


def apply_player_light_theme(page) -> None:
    signature = page.evaluate(
        """() => {
            const styleId = 'capture-player-light-theme';
            let style = document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
                document.head.appendChild(style);
            }
            style.textContent = `
                body {
                    background: linear-gradient(180deg, #f7f3ea 0%, #efe7dc 100%) !important;
                    color: #4f4332 !important;
                }
                .page-title::after {
                    background: #d9ccb7 !important;
                }
                .device-shell-player {
                    box-shadow: 0 26px 72px rgba(130, 104, 46, 0.16), 0 8px 18px rgba(130, 104, 46, 0.10) !important;
                }
                .player-shell {
                    --pl-bg: #f6f0e5 !important;
                    --pl-surface: #fffaf2 !important;
                    --pl-panel: rgba(255, 251, 243, 0.96) !important;
                    --pl-panel-hi: rgba(255, 255, 255, 0.98) !important;
                    --pl-line: rgba(71, 57, 35, 0.12) !important;
                    --pl-line-hi: rgba(71, 57, 35, 0.2) !important;
                    --pl-text: #2f261a !important;
                    --pl-text-muted: #756954 !important;
                    --pl-amber: #d59a2a !important;
                    --pl-amber-hi: #eab54e !important;
                    --pl-green: #2d9e68 !important;
                    --pl-red: #d95d4e !important;
                    --pl-blue: #5476d8 !important;
                    --pl-shadow: 0 18px 42px rgba(120, 92, 38, 0.12), 0 6px 14px rgba(120, 92, 38, 0.08) !important;
                    background: linear-gradient(160deg, #fffdf7 0%, var(--pl-bg) 58%, #ebdfcb 100%) !important;
                }
                .pl-frame-inner {
                    background: linear-gradient(180deg, #ebe1ce 0%, #d4c5ad 100%) !important;
                }
                .pl-frame-placeholder {
                    background: linear-gradient(180deg, rgba(255, 251, 242, 0.94), rgba(229, 214, 186, 0.96)) !important;
                    color: #594a34 !important;
                }
                .pl-progress-thumb {
                    border-color: #fff8ec !important;
                }
                .preview-banner {
                    background: rgba(255, 255, 255, 0.92) !important;
                    color: #4f4332 !important;
                    border: 1px solid rgba(130, 104, 46, 0.16) !important;
                    box-shadow: 0 10px 26px rgba(130, 104, 46, 0.12) !important;
                }
            `;
            const shell = document.querySelector('.player-shell');
            return shell ? getComputedStyle(shell).getPropertyValue('--pl-bg').trim() : '';
        }"""
    )
    if signature.lower() != "#f6f0e5":
        raise RuntimeError(f"player light theme override failed: {signature}")


def capture_player_previews(browser) -> None:
    print("1. Player Preview (Dark)...")
    page = browser.new_page(viewport={"width": 900, "height": 720})
    page.goto(page_uri("docs", "player-ui-preview.html"), wait_until="networkidle")
    page.wait_for_timeout(500)
    inject_player_english(page)
    assert_no_cjk_text(page, "player preview (dark)")
    page.wait_for_timeout(300)
    page.screenshot(path=str(SCREENSHOTS_DIR / "01-player-dark-full.png"), full_page=False)
    print("   => 01-player-dark-full.png")

    scroll_to_selector(page, ".control-rail, .rail-section")
    page.wait_for_timeout(300)
    page.screenshot(path=str(SCREENSHOTS_DIR / "02-player-dark-controls.png"), full_page=False)
    print("   => 02-player-dark-controls.png")

    print("2. Player Preview (Light)...")
    apply_player_light_theme(page)
    page.wait_for_timeout(500)
    inject_player_english(page)
    assert_no_cjk_text(page, "player preview (light)")
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    page.screenshot(path=str(SCREENSHOTS_DIR / "03-player-light-full.png"), full_page=False)
    print("   => 03-player-light-full.png")

    scroll_to_selector(page, ".control-rail, .rail-section")
    page.wait_for_timeout(300)
    page.screenshot(path=str(SCREENSHOTS_DIR / "04-player-light-controls.png"), full_page=False)
    print("   => 04-player-light-controls.png")
    page.close()


def capture_dashboard_previews(browser) -> None:
    print("3. Dashboard Preview...")
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    page.goto(page_uri("docs", "dashboard-preview.html"), wait_until="networkidle")
    page.wait_for_timeout(500)
    page.screenshot(path=str(SCREENSHOTS_DIR / "05-dashboard-overview.png"), full_page=False)
    print("   => 05-dashboard-overview.png")

    for tab, idx in [("sites", "06"), ("ai", "07"), ("advanced", "08")]:
        page.locator(f'[data-tab="{tab}"]').first.click()
        page.wait_for_timeout(500)
        page.screenshot(path=str(SCREENSHOTS_DIR / f"{idx}-dashboard-{tab}.png"), full_page=False)
        print(f"   => {idx}-dashboard-{tab}.png")
    page.close()


def capture_extension_pages(browser) -> None:
    print("4. Popup...")
    page = browser.new_page(viewport={"width": 420, "height": 700})
    page.goto(page_uri("extension", "popup", "popup.html"), wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(SCREENSHOTS_DIR / "09-popup-main.png"), full_page=True)
    print("   => 09-popup-main.png")
    page.close()

    print("5. Popup Player...")
    page = browser.new_page(viewport={"width": 900, "height": 700})
    page.goto(page_uri("extension", "popup-player", "popup-player.html"), wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(SCREENSHOTS_DIR / "10-popup-player-actual.png"), full_page=True)
    print("   => 10-popup-player-actual.png")
    page.close()

    print("6. Dashboard (actual)...")
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    page.goto(page_uri("extension", "dashboard", "dashboard.html"), wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(SCREENSHOTS_DIR / "11-dashboard-actual.png"), full_page=True)
    print("   => 11-dashboard-actual.png")
    page.close()


def capture_fullpage_previews(browser) -> None:
    print("7. Full page previews...")
    page = browser.new_page(viewport={"width": 900, "height": 720})
    page.goto(page_uri("docs", "player-ui-preview.html"), wait_until="networkidle")
    page.wait_for_timeout(500)
    inject_player_english(page)
    assert_no_cjk_text(page, "player preview (fullpage)")
    page.wait_for_timeout(300)
    page.screenshot(path=str(SCREENSHOTS_DIR / "12-player-fullpage.png"), full_page=True)
    print("   => 12-player-fullpage.png")
    page.close()

    page = browser.new_page(viewport={"width": 1200, "height": 800})
    page.goto(page_uri("docs", "dashboard-preview.html"), wait_until="networkidle")
    page.wait_for_timeout(500)
    page.screenshot(path=str(SCREENSHOTS_DIR / "13-dashboard-fullpage.png"), full_page=True)
    print("   => 13-dashboard-fullpage.png")
    page.close()


def main() -> None:
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        capture_player_previews(browser)
        capture_dashboard_previews(browser)
        capture_extension_pages(browser)
        capture_fullpage_previews(browser)
        browser.close()
    print("\nDone! All screenshots saved to docs/screenshots/")


if __name__ == "__main__":
    main()
