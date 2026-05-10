#!/usr/bin/env python3
"""Run a repeatable browser workflow from a JSON file."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, TimeoutError, sync_playwright


LOCATOR_ACTIONS = {
    "check",
    "click",
    "dblclick",
    "expectHidden",
    "expectText",
    "expectVisible",
    "fill",
    "hover",
    "press",
    "selectOption",
    "type",
    "uncheck",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a JSON-defined Playwright browser workflow.")
    parser.add_argument("--workflow", required=True, help="Path to the workflow JSON file.")
    parser.add_argument("--browser", choices=["chromium", "chrome", "msedge", "firefox", "webkit"])
    parser.add_argument("--headed", action="store_true", help="Show the browser window.")
    parser.add_argument("--headless", action="store_true", help="Force headless mode.")
    parser.add_argument("--timeout", type=int, help="Default timeout in milliseconds.")
    parser.add_argument("--slow-mo", type=int, default=None, help="Slow actions for visual debugging.")
    parser.add_argument("--trace", action="store_true", help="Save a Playwright trace to output/playwright/.")
    parser.add_argument("--base-url", help="Resolve relative workflow URLs against this base URL.")
    return parser.parse_args()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "workflow"


def load_workflow(workflow_path: Path) -> dict[str, Any]:
    with workflow_path.open("r", encoding="utf-8") as handle:
        workflow = json.load(handle)
    steps = workflow.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ValueError('Workflow must include a non-empty "steps" array.')
    return workflow


def resolve_url(value: str, base_url: str | None) -> str:
    if re.match(r"^(about:|chrome-extension:|data:|file:|https?:)", value):
        return value
    if base_url:
        return urljoin(base_url, value)
    return Path(value).resolve().as_uri()


def resolve_artifact_path(raw_path: str | None, fallback_name: str) -> Path:
    target = Path(raw_path) if raw_path else Path("output") / "playwright" / fallback_name
    return target.resolve()


def locator_for(page: Page, step: dict[str, Any]):
    exact = step.get("exact")
    if "selector" in step:
        locator = page.locator(step["selector"])
    elif "role" in step:
        kwargs = {"name": step.get("name")}
        if exact is not None:
            kwargs["exact"] = exact
        locator = page.get_by_role(step["role"], **kwargs)
    elif "text" in step and step.get("action") != "expectText":
        kwargs = {}
        if exact is not None:
            kwargs["exact"] = exact
        locator = page.get_by_text(step["text"], **kwargs)
    elif "label" in step:
        kwargs = {}
        if exact is not None:
            kwargs["exact"] = exact
        locator = page.get_by_label(step["label"], **kwargs)
    elif "placeholder" in step:
        kwargs = {}
        if exact is not None:
            kwargs["exact"] = exact
        locator = page.get_by_placeholder(step["placeholder"], **kwargs)
    elif "testId" in step:
        locator = page.get_by_test_id(step["testId"])
    elif "altText" in step:
        kwargs = {}
        if exact is not None:
            kwargs["exact"] = exact
        locator = page.get_by_alt_text(step["altText"], **kwargs)
    elif "title" in step:
        kwargs = {}
        if exact is not None:
            kwargs["exact"] = exact
        locator = page.get_by_title(step["title"], **kwargs)
    else:
        raise ValueError(
            f'Step action "{step.get("action")}" needs a selector, role, text, '
            "label, placeholder, testId, altText, or title."
        )
    return locator.nth(step["nth"]) if isinstance(step.get("nth"), int) else locator.first


def wait_for_condition(description: str, timeout_ms: int, check) -> None:
    deadline = time.monotonic() + timeout_ms / 1000
    last_error: Exception | None = None
    while time.monotonic() <= deadline:
        try:
            if check():
                return
        except Exception as error:  # Playwright can throw while the DOM is changing.
            last_error = error
        time.sleep(0.25)
    suffix = f" Last error: {last_error}" if last_error else ""
    raise TimeoutError(f"Timed out waiting for {description}.{suffix}")


def expect_text(locator, step: dict[str, Any], timeout_ms: int) -> None:
    if not any(key in step for key in ("text", "contains", "matches")):
        raise ValueError('expectText requires "text", "contains", or "matches".')

    def check() -> bool:
        text = locator.text_content(timeout=min(timeout_ms, 1000)) or ""
        if "matches" in step:
            return re.search(step["matches"], text) is not None
        if "contains" in step:
            return step["contains"] in text
        return text.strip() == str(step["text"])

    wait_for_condition("expected text", timeout_ms, check)


def run_step(page: Page, step: dict[str, Any], context: dict[str, Any]) -> None:
    action = step["action"]
    timeout_ms = int(step.get("timeoutMs", context["timeout_ms"]))
    locator = locator_for(page, step) if action in LOCATOR_ACTIONS else None

    if action == "goto":
        if "url" not in step:
            raise ValueError('goto requires "url".')
        page.goto(
            resolve_url(step["url"], context.get("base_url")),
            timeout=timeout_ms,
            wait_until=step.get("waitUntil", "domcontentloaded"),
        )
    elif action == "click":
        locator.click(timeout=timeout_ms, button=step.get("button"), modifiers=step.get("modifiers"))
    elif action == "dblclick":
        locator.dblclick(timeout=timeout_ms, button=step.get("button"), modifiers=step.get("modifiers"))
    elif action == "fill":
        locator.fill(str(step.get("value", "")), timeout=timeout_ms)
    elif action == "type":
        locator.type(str(step.get("value", "")), timeout=timeout_ms, delay=step.get("delayMs"))
    elif action == "press":
        if "key" not in step:
            raise ValueError('press requires "key".')
        locator.press(step["key"], timeout=timeout_ms)
    elif action == "check":
        locator.check(timeout=timeout_ms)
    elif action == "uncheck":
        locator.uncheck(timeout=timeout_ms)
    elif action == "selectOption":
        locator.select_option(step.get("value"), timeout=timeout_ms)
    elif action == "hover":
        locator.hover(timeout=timeout_ms)
    elif action == "waitForSelector":
        if "selector" not in step:
            raise ValueError('waitForSelector requires "selector".')
        page.locator(step["selector"]).first.wait_for(state=step.get("state", "visible"), timeout=timeout_ms)
    elif action in {"waitForUrl", "waitForURL"}:
        if "url" not in step:
            raise ValueError(f'{action} requires "url".')
        page.wait_for_url(step["url"], timeout=timeout_ms)
    elif action == "waitForLoadState":
        page.wait_for_load_state(step.get("state", "networkidle"), timeout=timeout_ms)
    elif action == "wait":
        page.wait_for_timeout(int(step.get("ms", 1000)))
    elif action == "expectVisible":
        locator.wait_for(state="visible", timeout=timeout_ms)
    elif action == "expectHidden":
        locator.wait_for(state="hidden", timeout=timeout_ms)
    elif action == "expectText":
        expect_text(locator, step, timeout_ms)
    elif action == "expectUrl":
        if not any(key in step for key in ("url", "contains", "matches")):
            raise ValueError('expectUrl requires "url", "contains", or "matches".')

        def check() -> bool:
            current_url = page.url
            if "matches" in step:
                return re.search(step["matches"], current_url) is not None
            if "contains" in step:
                return step["contains"] in current_url
            return current_url == step["url"]

        wait_for_condition("expected URL", timeout_ms, check)
    elif action == "screenshot":
        screenshot_path = resolve_artifact_path(
            step.get("path"),
            f'{context["slug"]}-{context["step_index"] + 1:02d}.png',
        )
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_path), full_page=bool(step.get("fullPage", True)))
        print(f"  artifact: {screenshot_path.relative_to(Path.cwd())}")
    else:
        raise ValueError(f"Unsupported action: {action}")


def run_step_with_retries(page: Page, step: dict[str, Any], context: dict[str, Any]) -> None:
    retries = int(step.get("retries", context["retries"]))
    for attempt in range(retries + 1):
        try:
            run_step(page, step, context)
            return
        except Exception as error:
            if attempt >= retries:
                raise
            print(f"  retry {attempt + 1}/{retries}: {error}", file=sys.stderr)
            page.wait_for_timeout(int(context["retry_delay_ms"]))


def browser_config(browser_name: str):
    if browser_name in {"chrome", "msedge"}:
        return "chromium", browser_name
    return browser_name, None


def launch_runtime(playwright, workflow: dict[str, Any], args: argparse.Namespace):
    browser_name = args.browser or workflow.get("browser", "chromium")
    browser_type_name, channel = browser_config(browser_name)
    browser_type = getattr(playwright, browser_type_name)
    headless = args.headless or (not args.headed and bool(workflow.get("headless", True)))
    slow_mo = args.slow_mo if args.slow_mo is not None else workflow.get("slowMoMs")
    launch_options = {
        "headless": headless,
        "slow_mo": slow_mo,
        "channel": workflow.get("channel", channel),
        "args": workflow.get("args", []),
    }
    launch_options = {key: value for key, value in launch_options.items() if value is not None}

    if workflow.get("extensionDir"):
        if browser_type_name != "chromium":
            raise ValueError("extensionDir can only be used with chromium, chrome, or msedge.")
        extension_dir = Path(workflow["extensionDir"]).resolve()
        if not extension_dir.exists():
            raise FileNotFoundError(f"Extension directory not found: {extension_dir}")
        user_data_dir = Path(workflow.get("userDataDir", ".browser-profiles/playwright-workflow")).resolve()
        extension_args = [
            f"--disable-extensions-except={extension_dir}",
            f"--load-extension={extension_dir}",
            *workflow.get("args", []),
        ]
        context = playwright.chromium.launch_persistent_context(
            str(user_data_dir),
            **{**launch_options, "args": extension_args},
        )
        return context, context.browser, context.pages[0] if context.pages else context.new_page()

    browser = browser_type.launch(**launch_options)
    context = browser.new_context(
        viewport=workflow.get("viewport"),
        storage_state=workflow.get("storageState"),
    )
    return context, browser, context.new_page()


def capture_failure(page: Page | None, workflow_slug: str, step_index: int) -> None:
    if page is None or page.is_closed():
        return
    screenshot_path = resolve_artifact_path(None, f"{workflow_slug}-failure-step-{step_index + 1:02d}.png")
    screenshot_path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot_path), full_page=True)
    print(f"Failure screenshot: {screenshot_path.relative_to(Path.cwd())}", file=sys.stderr)


def main() -> int:
    args = parse_args()
    workflow_path = Path(args.workflow).resolve()
    workflow = load_workflow(workflow_path)
    workflow_name = workflow.get("name") or workflow_path.stem
    workflow_slug = slugify(workflow_name)
    timeout_ms = args.timeout or int(workflow.get("timeoutMs", 15000))
    context_options = {
        "base_url": args.base_url or workflow.get("baseUrl"),
        "retries": int(workflow.get("retries", 0)),
        "retry_delay_ms": int(workflow.get("retryDelayMs", 500)),
        "slug": workflow_slug,
        "timeout_ms": timeout_ms,
    }

    print(f"Running workflow: {workflow_name}")
    print(f"Workflow file: {workflow_path.relative_to(Path.cwd())}")

    page: Page | None = None
    context = None
    browser = None
    current_step_index = 0

    try:
        with sync_playwright() as playwright:
            context, browser, page = launch_runtime(playwright, workflow, args)
            page.set_default_timeout(timeout_ms)
            page.set_default_navigation_timeout(timeout_ms)

            trace_enabled = args.trace or bool(workflow.get("trace", False))
            if trace_enabled:
                context.tracing.start(screenshots=True, snapshots=True, sources=True)

            for current_step_index, step in enumerate(workflow["steps"]):
                if "action" not in step:
                    raise ValueError(f"Step {current_step_index + 1} is missing action.")
                label = step.get("name", step["action"])
                print(f"{current_step_index + 1:02d}. {label}")
                run_step_with_retries(page, step, {**context_options, "step_index": current_step_index})

            if workflow.get("saveStorageState"):
                state_path = Path(workflow["saveStorageState"]).resolve()
                state_path.parent.mkdir(parents=True, exist_ok=True)
                context.storage_state(path=str(state_path))
                print(f"Storage state: {state_path.relative_to(Path.cwd())}")

            if trace_enabled:
                trace_path = resolve_artifact_path(None, f"{workflow_slug}-trace.zip")
                trace_path.parent.mkdir(parents=True, exist_ok=True)
                context.tracing.stop(path=str(trace_path))
                print(f"Trace: {trace_path.relative_to(Path.cwd())}")

            print("Workflow completed.")
            return 0
    except Exception as error:
        try:
            capture_failure(page, workflow_slug, current_step_index)
        except PlaywrightError:
            pass
        print(error, file=sys.stderr)
        return 1
    finally:
        if context is not None:
            try:
                context.close()
            except PlaywrightError:
                pass
        if browser is not None:
            try:
                browser.close()
            except PlaywrightError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
