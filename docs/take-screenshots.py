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


def capture_player_previews(browser) -> None:
    print("1. Player Preview (Dark)...")
    page = browser.new_page(viewport={"width": 900, "height": 720})
    page.goto(page_uri("docs", "player-ui-preview.html"), wait_until="networkidle")
    page.wait_for_timeout(500)
    page.screenshot(path=str(SCREENSHOTS_DIR / "01-player-dark-full.png"), full_page=False)
    print("   => 01-player-dark-full.png")

    scroll_to_selector(page, ".control-rail, .rail-section")
    page.wait_for_timeout(300)
    page.screenshot(path=str(SCREENSHOTS_DIR / "02-player-dark-controls.png"), full_page=False)
    print("   => 02-player-dark-controls.png")

    print("2. Player Preview (Light)...")
    theme_button = page.locator("#btn-theme, .btn-theme").first
    if theme_button.count() > 0:
        theme_button.click()
    else:
        page.evaluate("() => { document.body.dataset.theme = 'light'; }")
    page.wait_for_timeout(500)
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
