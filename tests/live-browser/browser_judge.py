from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXTENSION_DIR = REPO_ROOT / "extension"
DEFAULT_REPORT_PATH = REPO_ROOT / "tests" / "live-browser" / "reports" / "latest-report.json"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Open live targets in Chromium, score the player state, and emit suggestions."
    )
    parser.add_argument("--targets", required=True, help="Path to a JSON file containing {'targets': [...]} .")
    parser.add_argument("--out", default=str(DEFAULT_REPORT_PATH), help="Output JSON report path.")
    parser.add_argument("--extension-dir", default=str(DEFAULT_EXTENSION_DIR), help="Falcon-Player-Enhance unpacked extension path.")
    parser.add_argument("--ublock-extension-dir", help="Optional unpacked uBlock extension directory.")
    parser.add_argument(
        "--browser-profile-dir",
        help="Optional persistent Chromium profile directory. Useful when uBlock is already installed there."
    )
    parser.add_argument("--browser-channel", default="chromium", help="Playwright browser channel. Default: chromium")
    parser.add_argument("--headless", action="store_true", help="Run Chromium headlessly.")
    parser.add_argument("--timeout-ms", type=int, default=30000, help="Navigation timeout per target.")
    parser.add_argument("--settle-ms", type=int, default=3500, help="Extra wait after navigation.")
    parser.add_argument("--pass-threshold", type=float, default=70.0, help="Minimum score to count as a pass.")
    return parser.parse_args()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_targets(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    targets = data.get("targets", [])
    if not isinstance(targets, list) or not targets:
        raise ValueError("targets JSON must include a non-empty 'targets' array")
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(targets, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"target #{index} must be an object")
        url = str(item.get("url", "")).strip()
        if not url:
            raise ValueError(f"target #{index} is missing a url")
        normalized.append(
            {
                "name": str(item.get("name") or f"target-{index}"),
                "url": url,
                "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                "requiresManualReview": bool(item.get("requiresManualReview", False))
            }
        )
    return normalized


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "target"


def build_extension_args(shield_dir: Path, ublock_dir: Path | None) -> list[str]:
    paths = [str(shield_dir.resolve())]
    if ublock_dir:
        paths.append(str(ublock_dir.resolve()))
    joined = ",".join(paths)
    return [
        f"--disable-extensions-except={joined}",
        f"--load-extension={joined}"
    ]


def wait_for_extension_ready(context, timeout_ms: int = 12000) -> int:
    deadline = time.time() + (timeout_ms / 1000)

    while time.time() < deadline:
        worker = context.service_workers[0] if context.service_workers else None
        if worker is None:
            time.sleep(0.25)
            continue

        try:
            registered = worker.evaluate(
                """async () => (await chrome.scripting.getRegisteredContentScripts()).length"""
            )
            if int(registered) > 0:
                return int(registered)
        except Exception:
            pass

        time.sleep(0.25)

    return 0


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").lower()).strip()


def detect_interstitial_type(page_title: str, page_body_preview: str, page_url: str) -> str | None:
    title = normalize_text(page_title)
    body = normalize_text(page_body_preview)
    url = normalize_text(page_url)
    combined = " ".join(part for part in [title, body, url] if part)

    if any(marker in combined for marker in ["bitdefender", "browser protection"]):
        return "security_interstitial"

    if any(
        marker in combined
        for marker in [
            "just a moment",
            "please wait",
            "請稍候",
            "checking your browser",
            "cloudflare",
            "ddos protection"
        ]
    ):
        return "browser_challenge"

    if any(
        marker in combined
        for marker in [
            'click "allow"',
            "click 'allow'",
            "click allow",
            '点击 "允许"',
            "点击允许",
            '點擊 "允許"',
            "點擊允許"
        ]
    ):
        return "notification_lure"

    return None


def describe_interstitial_type(interstitial_type: str) -> str:
    labels = {
        "security_interstitial": "security interstitial",
        "browser_challenge": "browser challenge",
        "notification_lure": "notification lure"
    }
    return labels.get(interstitial_type, interstitial_type.replace("_", " "))


def score_snapshot(snapshot: dict[str, Any]) -> tuple[float, list[str]]:
    score = 100.0
    reasons: list[str] = []
    interstitial_type = snapshot.get("interstitialType")

    if interstitial_type:
        score -= 40
        reasons.append(
            f"Navigation landed on a {describe_interstitial_type(interstitial_type)} before playback content loaded."
        )
    elif not snapshot.get("playerDetected"):
        score -= 40
        reasons.append("No credible video or iframe player was detected.")

    overlay_count = int(snapshot.get("overlayCount", 0))
    if overlay_count > 0:
        penalty = min(42, overlay_count * 12)
        score -= penalty
        reasons.append(f"Detected {overlay_count} suspicious overlay element(s) above the player.")

    popup_count = int(snapshot.get("popupCount", 0))
    if popup_count > 0:
        penalty = min(20, popup_count * 10)
        score -= penalty
        reasons.append(f"{popup_count} popup window(s) opened during passive inspection.")

    suspicious_nav_count = int(snapshot.get("suspiciousNavCount", 0))
    if suspicious_nav_count > 0:
        penalty = min(20, suspicious_nav_count * 5)
        score -= penalty
        reasons.append(f"Detected {suspicious_nav_count} suspicious navigation attempt(s).")

    if snapshot.get("consoleErrorCount", 0) > 0:
        score -= min(10, int(snapshot["consoleErrorCount"]) * 2)
        reasons.append("The page emitted console errors during inspection.")

    return max(0.0, round(score, 2)), reasons


def build_suggestions(snapshot: dict[str, Any], reasons: list[str]) -> list[str]:
    suggestions: list[str] = []
    interstitial_type = snapshot.get("interstitialType")

    if interstitial_type:
        suggestions.append(
            "Treat this as an invalid landing path "
            f"({describe_interstitial_type(interstitial_type)}) and review the target or network environment before patching player heuristics."
        )
    elif not snapshot.get("playerDetected"):
        suggestions.append(
            "Adjust player detection heuristics for iframe-heavy hosts and lazy-loaded video containers."
        )

    if int(snapshot.get("overlayCount", 0)) > 0:
        suggestions.append(
            "Expand overlay heuristics for large clickable fixed/absolute elements intersecting the primary player."
        )

    if int(snapshot.get("popupCount", 0)) > 0 or int(snapshot.get("suspiciousNavCount", 0)) > 0:
        suggestions.append(
            "Review popup and clickjacking interception around player-adjacent links and navigation handlers."
        )

    if int(snapshot.get("shieldMarkerCount", 0)) == 0:
        suggestions.append(
            "Confirm Falcon-Player-Enhance content scripts are loading on this host and that the host permission set includes it."
        )

    if snapshot.get("aiGateTier"):
        suggestions.append(
            f"Runtime policy gate observed {snapshot.get('aiGateTier')} ({snapshot.get('aiGateMode') or 'unknown-mode'})."
        )

    if not suggestions and reasons:
        suggestions.append("Inspect timing issues between page bootstrap, content-script injection, and late overlays.")

    if not suggestions:
        suggestions.append("No action needed. Keep this page in the reviewed regression pool.")

    return suggestions


def evaluate_page(page, settle_ms: int) -> dict[str, Any]:
    popup_count = 0
    console_errors: list[str] = []

    def on_popup(_popup) -> None:
        nonlocal popup_count
        popup_count += 1

    def on_console(msg) -> None:
        if msg.type in {"error", "warning"}:
            text = msg.text or ""
            if len(console_errors) < 10:
                console_errors.append(text)

    page.on("popup", on_popup)
    page.on("console", on_console)

    page.wait_for_timeout(settle_ms)

    snapshot = page.evaluate(
        """
        () => {
          const areaThreshold = 30000;

          const isVisible = (el) => {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 8 && rect.height > 8;
          };

          const overlaps = (a, b) => {
            const left = Math.max(a.left, b.left);
            const top = Math.max(a.top, b.top);
            const right = Math.min(a.right, b.right);
            const bottom = Math.min(a.bottom, b.bottom);
            if (right <= left || bottom <= top) return 0;
            return (right - left) * (bottom - top);
          };

          const toRect = (rect) => ({
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });

          const mediaCandidates = [
            ...Array.from(document.querySelectorAll("video")),
            ...Array.from(document.querySelectorAll("iframe"))
          ]
            .filter((el) => isVisible(el))
            .map((el) => {
              const rect = el.getBoundingClientRect();
              const tag = el.tagName.toLowerCase();
              const area = rect.width * rect.height;
              const src = tag === "video" ? (el.currentSrc || el.src || "") : (el.src || "");
              return { el, rect, tag, area, src };
            })
            .filter((item) => item.area >= areaThreshold)
            .sort((a, b) => b.area - a.area);

          const player = mediaCandidates[0] || null;
          const playerRect = player ? player.rect : null;
          const playerContainer = player
            ? (
                player.el.closest("[data-shield-id], .shield-detected-container, .shield-detected-player")
                || player.el.closest("[class*='player'], [id*='player'], [class*='video'], [id*='video']")
              )
            : null;
          const suspiciousSelectors = "a, button, [role=button], [onclick], div, span";
          const titleLower = (document.title || "").toLowerCase();
          const bodyTextLower = (document.body?.innerText || "").toLowerCase().slice(0, 4000);
          let interstitialType = null;

          if (titleLower.includes("bitdefender") || bodyTextLower.includes("bitdefender") || bodyTextLower.includes("browser protection")) {
            interstitialType = "security_interstitial";
          } else if (
            titleLower.includes("just a moment") ||
            titleLower.includes("please wait") ||
            titleLower.includes("請稍候") ||
            bodyTextLower.includes("checking your browser") ||
            bodyTextLower.includes("cloudflare") ||
            bodyTextLower.includes("ddos protection")
          ) {
            interstitialType = "browser_challenge";
          }

          const suspicious = playerRect
            ? Array.from(document.querySelectorAll(suspiciousSelectors))
                .filter((el) => {
                  if (!isVisible(el)) return false;
                  if (player && (el === player.el || el.contains(player.el) || player.el.contains(el))) return false;
                  const style = window.getComputedStyle(el);
                  if (style.pointerEvents === "none") return false;
                  const position = style.position;
                  if (!["fixed", "absolute", "sticky", "relative"].includes(position)) return false;
                  const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
                  const href = el.href || null;
                  const insidePlayerContainer = Boolean(playerContainer && playerContainer.contains(el));
                  const zIndexRaw = style.zIndex || "0";
                  const zIndex = Number.parseInt(style.zIndex || "0", 10);
                  const rect = el.getBoundingClientRect();
                  if (
                    insidePlayerContainer &&
                    !text &&
                    !href &&
                    ["auto", "0", "1"].includes(zIndexRaw)
                  ) {
                    return false;
                  }
                  const intersection = overlaps(playerRect, rect);
                  const ratio = intersection / Math.max(1, playerRect.width * playerRect.height);
                  const ownArea = rect.width * rect.height;
                  return ownArea > 1200 && (zIndex >= 10 || position !== "relative") && ratio >= 0.2;
                })
                .slice(0, 12)
                .map((el) => {
                  const style = window.getComputedStyle(el);
                  const rect = el.getBoundingClientRect();
                  return {
                    tag: el.tagName.toLowerCase(),
                    text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().slice(0, 120),
                    href: el.href || null,
                    zIndex: style.zIndex || "0",
                    position: style.position,
                    rect: toRect(rect)
                  };
                })
            : [];

          return {
            pageTitle: document.title || "",
            pageBodyPreview: (document.body?.innerText || "").slice(0, 4000),
            playerDetected: Boolean(player),
            playerTag: player ? player.tag : null,
            playerSrc: player ? player.src : null,
            playerRect: player ? toRect(player.rect) : null,
            overlayCount: suspicious.length,
            suspiciousOverlays: suspicious,
            suspiciousNavs: suspicious.map((item) => item.href).filter(Boolean).slice(0, 10),
            shieldMarkerCount: document.querySelectorAll("[data-shield-internal='true'], [class*='shield-']").length,
            aiGateTier: document.documentElement?.dataset?.shieldAiGateTier || null,
            aiGateMode: document.documentElement?.dataset?.shieldAiGateMode || null,
            aiGateReason: document.documentElement?.dataset?.shieldAiGateReason || null,
            aiEvidence: document.documentElement?.dataset?.shieldAiEvidence || "",
            interstitialType,
            interstitialEvidence: interstitialType ? (document.title || bodyTextLower.slice(0, 160)) : "",
            hiddenByShieldCount: document.querySelectorAll("[data-shield-hidden]").length,
            videoCount: document.querySelectorAll("video").length,
            iframeCount: document.querySelectorAll("iframe").length
          };
        }
        """
    )

    snapshot["popupCount"] = popup_count
    snapshot["suspiciousNavCount"] = len(snapshot.get("suspiciousNavs", []))
    snapshot["consoleErrorCount"] = len(console_errors)
    snapshot["consoleErrors"] = console_errors
    detected_interstitial = detect_interstitial_type(
        str(snapshot.get("pageTitle") or ""),
        str(snapshot.get("pageBodyPreview") or ""),
        page.url,
    )
    if detected_interstitial:
        snapshot["interstitialType"] = detected_interstitial
        snapshot["interstitialEvidence"] = (
            str(snapshot.get("interstitialEvidence") or "")
            or str(snapshot.get("pageTitle") or "")
            or str(snapshot.get("pageBodyPreview") or "")[:160]
        )
    return snapshot


def run() -> int:
    args = parse_args()
    targets_path = Path(args.targets).resolve()
    report_path = Path(args.out).resolve()
    ensure_parent(report_path)
    targets = load_targets(targets_path)

    shield_dir = Path(args.extension_dir).resolve()
    if not shield_dir.exists():
        raise FileNotFoundError(f"Falcon-Player-Enhance extension directory not found: {shield_dir}")

    ublock_dir = Path(args.ublock_extension_dir).resolve() if args.ublock_extension_dir else None
    if ublock_dir and not ublock_dir.exists():
        raise FileNotFoundError(f"uBlock extension directory not found: {ublock_dir}")

    report_root = report_path.parent / time.strftime("%Y%m%d-%H%M%S")
    screenshots_dir = report_root / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    user_data_dir = Path(args.browser_profile_dir).resolve() if args.browser_profile_dir else report_root / "browser-profile"
    user_data_dir.mkdir(parents=True, exist_ok=True)
    started_at = time.strftime("%Y-%m-%dT%H:%M:%S")
    results: list[dict[str, Any]] = []

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(user_data_dir),
            channel=args.browser_channel,
            headless=args.headless,
            args=build_extension_args(shield_dir, ublock_dir),
            viewport={"width": 1440, "height": 960}
        )
        registered_script_count = wait_for_extension_ready(context)
        print(f"Extension ready: registered content scripts={registered_script_count}")

        try:
            for target in targets:
                name = target["name"]
                screenshot_path = screenshots_dir / f"{slugify(name)}.png"
                result: dict[str, Any] = {
                    "name": name,
                    "url": target["url"],
                    "tags": target["tags"],
                    "requiresManualReview": target["requiresManualReview"]
                }
                page = context.new_page()
                try:
                    page.goto(target["url"], wait_until="domcontentloaded", timeout=args.timeout_ms)
                    try:
                        page.wait_for_load_state("networkidle", timeout=min(args.timeout_ms, 12000))
                    except PlaywrightTimeoutError:
                        pass

                    snapshot = evaluate_page(page, args.settle_ms)
                    page.screenshot(path=str(screenshot_path), full_page=True)
                    score, reasons = score_snapshot(snapshot)
                    result.update(
                        {
                            "ok": score >= args.pass_threshold and snapshot.get("playerDetected") and snapshot.get("overlayCount", 0) == 0,
                            "score": score,
                            "reasons": reasons,
                            "suggestions": build_suggestions(snapshot, reasons),
                            "screenshot": str(screenshot_path),
                            "snapshot": snapshot
                        }
                    )
                except Exception as exc:  # noqa: BLE001
                    result.update(
                        {
                            "ok": False,
                            "score": 0.0,
                            "reasons": [f"Navigation or evaluation failed: {exc}"],
                            "suggestions": ["Check host permission coverage, timeout settings, and page boot timing."],
                            "screenshot": None,
                            "snapshot": {
                                "playerDetected": False,
                                "overlayCount": 0,
                                "popupCount": 0,
                                "suspiciousNavCount": 0,
                                "consoleErrorCount": 0
                            }
                        }
                    )
                finally:
                    page.close()

                results.append(result)
                print(
                    f"[{'PASS' if result['ok'] else 'FAIL'}] {name} "
                    f"score={result['score']} overlays={result['snapshot'].get('overlayCount', 0)} "
                    f"popups={result['snapshot'].get('popupCount', 0)}"
                )
        finally:
            context.close()

    passed = sum(1 for item in results if item["ok"])
    report = {
        "generatedAt": started_at,
        "extensionDir": str(shield_dir),
        "ublockExtensionDir": str(ublock_dir) if ublock_dir else None,
        "browserProfileDir": str(user_data_dir),
        "registeredContentScriptCount": registered_script_count,
        "targetCount": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "passThreshold": args.pass_threshold,
        "results": results
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Report written: {report_path}")
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except Exception as exc:  # noqa: BLE001
        print(f"Fatal error: {exc}", file=sys.stderr)
        raise
