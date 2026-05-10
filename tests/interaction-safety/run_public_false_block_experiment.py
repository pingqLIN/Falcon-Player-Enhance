from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
POPUP_SMOKE_DIR = REPO_ROOT / "tests" / "popup-smoke"
DEFAULT_TARGETS = REPO_ROOT / "tests" / "interaction-safety" / "public-interaction-targets.json"
DEFAULT_REPORT = REPO_ROOT / "tests" / "live-browser" / "reports" / "public-false-block-latest.json"

if str(POPUP_SMOKE_DIR) not in sys.path:
    sys.path.insert(0, str(POPUP_SMOKE_DIR))

import run_popup_smoke as smoke  # noqa: E402


COLLECT_INTERACTIVE_CANDIDATES_SCRIPT = """
() => {
  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const textFor = (element) => [
    element.innerText || '',
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
    element.getAttribute('value') || '',
    element.getAttribute('placeholder') || ''
  ].join(' ').replace(/\\s+/g, ' ').trim().slice(0, 80);

  const bucket = (value) => Math.round(Number(value || 0) / 10) * 10;
  const isElementDisabled = (element) => {
    if (element.disabled === true) return true;
    if (String(element.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return true;
    return Boolean(element.closest('[inert], [aria-hidden="true"]'));
  };

  const isVisible = (element) => {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 6 || rect.height < 6) return false;
    const style = window.getComputedStyle(element);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number.parseFloat(style.opacity || '1') <= 0.05) return false;
    if (element.closest('[hidden]')) return false;
    return true;
  };

  const hitTest = (element, rect) => {
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const stack = document.elementsFromPoint(x, y);
    const hit = stack[0] || null;
    const reachable = stack.some((candidate) =>
      candidate === element || element.contains(candidate)
    );
    return {
      x: Math.round(x),
      y: Math.round(y),
      reachable,
      topTag: hit?.tagName?.toLowerCase?.() || '',
      topClass: String(hit?.className || '').slice(0, 80),
      topId: String(hit?.id || '').slice(0, 80)
    };
  };

  const candidates = [];
  Array.from(document.querySelectorAll(selector)).forEach((element, index) => {
    if (!isVisible(element)) return;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const tag = element.tagName.toLowerCase();
    const role = String(element.getAttribute('role') || '').toLowerCase();
    const type = String(element.getAttribute('type') || '').toLowerCase();
    const href = String(element.href || element.getAttribute('href') || '').split('#')[0].slice(0, 160);
    const name = String(element.getAttribute('name') || '').slice(0, 80);
    const text = textFor(element);
    const stableKey = [
      tag,
      role,
      type,
      name,
      href,
      text.toLowerCase()
    ].join('|');
    const signature = [
      stableKey,
      bucket(rect.left),
      bucket(rect.top),
      bucket(rect.width),
      bucket(rect.height)
    ].join('|');
    const hit = hitTest(element, rect);

    candidates.push({
      index,
      stableKey,
      signature,
      tag,
      role,
      type,
      name,
      href,
      text,
      disabled: isElementDisabled(element),
      pointerEvents: style.pointerEvents,
      visible: true,
      shieldMutated: Boolean(
        element.dataset?.shieldHidden ||
        element.dataset?.shieldBlocked ||
        element.closest('[data-shield-hidden], [data-shield-blocked], [class*="shield-"]')
      ),
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      hit
    });
  });

  return {
    url: window.location.href,
    title: document.title || '',
    candidates
  };
}
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare public pages with and without the extension and measure false-blocked interactive elements."
    )
    parser.add_argument("--targets", default=str(DEFAULT_TARGETS))
    parser.add_argument("--out", default=str(DEFAULT_REPORT))
    parser.add_argument("--extension-dir", default=str(smoke.DEFAULT_EXTENSION_DIR))
    parser.add_argument("--browser-channel", default="chromium")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--timeout-ms", type=int, default=30000)
    parser.add_argument("--settle-ms", type=int, default=2500)
    parser.add_argument("--max-targets", type=int, default=0)
    parser.add_argument("--max-candidates-per-page", type=int, default=250)
    parser.add_argument("--threshold", type=float, default=0.06)
    return parser.parse_args()


def load_targets(path: Path, max_targets: int) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    targets = data.get("targets", [])
    if not isinstance(targets, list) or not targets:
        raise ValueError("targets JSON must include a non-empty 'targets' array")

    normalized = []
    for index, target in enumerate(targets, start=1):
        if not isinstance(target, dict):
            raise ValueError(f"target #{index} must be an object")
        url = str(target.get("url") or "").strip()
        if not url:
            raise ValueError(f"target #{index} is missing url")
        normalized.append({
            "name": str(target.get("name") or f"target-{index}"),
            "url": url,
            "tags": target.get("tags") if isinstance(target.get("tags"), list) else []
        })
    return normalized[:max_targets] if max_targets > 0 else normalized


def open_context(playwright, profile_dir: Path, channel: str, headless: bool, extension_dir: Path | None = None):
    args = smoke.build_extension_args(extension_dir) if extension_dir else []
    return playwright.chromium.launch_persistent_context(
        str(profile_dir),
        channel=channel,
        headless=headless,
        args=args,
        viewport={"width": 1366, "height": 900}
    )


def collect_page_candidates(context, target: dict[str, Any], timeout_ms: int, settle_ms: int, max_candidates: int) -> dict[str, Any]:
    page = context.new_page()
    try:
        page.goto(target["url"], wait_until="domcontentloaded", timeout=timeout_ms)
        try:
            page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 10000))
        except PlaywrightTimeoutError:
            pass
        page.wait_for_timeout(settle_ms)
        snapshot = page.evaluate(COLLECT_INTERACTIVE_CANDIDATES_SCRIPT)
        candidates = snapshot.get("candidates", [])
        if isinstance(candidates, list) and max_candidates > 0:
            snapshot["candidates"] = candidates[:max_candidates]
            snapshot["truncatedCandidateCount"] = max(0, len(candidates) - max_candidates)
        return {
            "ok": True,
            "snapshot": snapshot,
            "error": ""
        }
    except Exception as error:  # noqa: BLE001
        return {
            "ok": False,
            "snapshot": {
                "url": page.url,
                "title": page.title() if not page.is_closed() else "",
                "candidates": []
            },
            "error": str(error)
        }
    finally:
        page.close()


def index_candidates(candidates: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    indexed: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        stable_key = str(candidate.get("stableKey") or "")
        if stable_key:
            indexed.setdefault(stable_key, []).append(candidate)
    return indexed


def pop_matching_candidate(
    indexed: dict[str, list[dict[str, Any]]],
    control_candidate: dict[str, Any]
) -> dict[str, Any] | None:
    stable_key = str(control_candidate.get("stableKey") or "")
    if stable_key and indexed.get(stable_key):
        return indexed[stable_key].pop(0)
    return None


def is_false_blocked_candidate(
    control_candidate: dict[str, Any],
    extension_candidate: dict[str, Any] | None
) -> tuple[bool, str]:
    if not extension_candidate:
        return True, "missing_in_extension"
    if extension_candidate.get("disabled") is True:
        return True, "disabled"
    if control_candidate.get("pointerEvents") != "none" and extension_candidate.get("pointerEvents") == "none":
        return True, "pointer_events_none"
    if extension_candidate.get("shieldMutated") is True:
        return True, "shield_mutated"
    if extension_candidate.get("hit", {}).get("reachable") is not True:
        return True, "hit_test_unreachable"
    return False, ""


def compare_target(target: dict[str, Any], control: dict[str, Any], extension: dict[str, Any]) -> dict[str, Any]:
    control_candidates = control.get("snapshot", {}).get("candidates", [])
    extension_candidates = extension.get("snapshot", {}).get("candidates", [])
    extension_by_key = index_candidates(extension_candidates)
    false_blocked = []

    for candidate in control_candidates:
        if candidate.get("disabled") is True:
            continue
        if candidate.get("hit", {}).get("reachable") is not True:
            continue

        matched = pop_matching_candidate(extension_by_key, candidate)
        blocked, reason = is_false_blocked_candidate(candidate, matched)
        if blocked:
            false_blocked.append({
                "reason": reason,
                "control": {
                    "tag": candidate.get("tag"),
                    "role": candidate.get("role"),
                    "type": candidate.get("type"),
                    "text": candidate.get("text"),
                    "href": candidate.get("href"),
                    "rect": candidate.get("rect")
                },
                "extension": matched
            })

    total = sum(
        1 for candidate in control_candidates
        if candidate.get("disabled") is not True and candidate.get("hit", {}).get("reachable") is True
    )
    rate = len(false_blocked) / total if total else 0.0
    ok = control.get("ok") is True and extension.get("ok") is True

    return {
        "name": target["name"],
        "url": target["url"],
        "tags": target["tags"],
        "ok": ok,
        "totalInteractiveCandidates": total,
        "falseBlockedCandidates": len(false_blocked),
        "falseBlockRate": round(rate, 4),
        "falseBlockedSamples": false_blocked[:20],
        "controlError": control.get("error", ""),
        "extensionError": extension.get("error", ""),
        "controlUrl": control.get("snapshot", {}).get("url", ""),
        "extensionUrl": extension.get("snapshot", {}).get("url", ""),
        "controlCandidateCount": len(control_candidates),
        "extensionCandidateCount": len(extension_candidates)
    }


def main() -> int:
    args = parse_args()
    targets = load_targets(Path(args.targets).resolve(), args.max_targets)
    extension_dir = Path(args.extension_dir).resolve()
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    control_profile = Path(tempfile.mkdtemp(prefix="falcon-false-block-control-"))
    extension_profile = Path(tempfile.mkdtemp(prefix="falcon-false-block-extension-"))

    try:
        with sync_playwright() as playwright:
            control_context = open_context(
                playwright,
                control_profile,
                args.browser_channel,
                args.headless,
                None
            )
            extension_context = open_context(
                playwright,
                extension_profile,
                args.browser_channel,
                args.headless,
                extension_dir
            )
            try:
                extension_id = smoke.wait_for_extension_id(extension_context, args.timeout_ms)
                smoke.wait_for_extension_ready(extension_context, args.timeout_ms)
                results = []
                for target in targets:
                    control = collect_page_candidates(
                        control_context,
                        target,
                        args.timeout_ms,
                        args.settle_ms,
                        args.max_candidates_per_page
                    )
                    extension = collect_page_candidates(
                        extension_context,
                        target,
                        args.timeout_ms,
                        args.settle_ms,
                        args.max_candidates_per_page
                    )
                    result = compare_target(target, control, extension)
                    results.append(result)
                    print(
                        f"[{target['name']}] falseBlockRate={result['falseBlockRate']:.2%} "
                        f"falseBlocked={result['falseBlockedCandidates']} "
                        f"total={result['totalInteractiveCandidates']}"
                    )

                total = sum(int(result["totalInteractiveCandidates"]) for result in results)
                false_blocked = sum(int(result["falseBlockedCandidates"]) for result in results)
                rate = false_blocked / total if total else 0.0
                ok = total > 0 and rate < args.threshold and all(result["ok"] for result in results)
                report = {
                    "ok": ok,
                    "extensionId": extension_id,
                    "threshold": args.threshold,
                    "falseBlockRate": round(rate, 4),
                    "totalInteractiveCandidates": total,
                    "falseBlockedCandidates": false_blocked,
                    "targetCount": len(results),
                    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "results": results
                }
                out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                print(json.dumps({
                    "ok": report["ok"],
                    "falseBlockRate": report["falseBlockRate"],
                    "totalInteractiveCandidates": total,
                    "falseBlockedCandidates": false_blocked,
                    "report": str(out_path)
                }, ensure_ascii=False, indent=2))
                return 0 if ok else 1
            finally:
                control_context.close()
                extension_context.close()
    finally:
        shutil.rmtree(control_profile, ignore_errors=True)
        shutil.rmtree(extension_profile, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
