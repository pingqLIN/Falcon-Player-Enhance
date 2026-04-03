from __future__ import annotations

import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKGROUND_PATH = REPO_ROOT / "extension" / "background.js"
CONSUMER_PATHS = {
    "fake-video-remover": REPO_ROOT / "extension" / "content" / "fake-video-remover.js",
    "overlay-remover": REPO_ROOT / "extension" / "content" / "overlay-remover.js",
    "player-enhancer": REPO_ROOT / "extension" / "content" / "player-enhancer.js",
    "player-controls": REPO_ROOT / "extension" / "content" / "player-controls.js",
    "player-detector": REPO_ROOT / "extension" / "content" / "player-detector.js",
}
CONTENT_SCRIPT_CONSUMERS = [
    "content/player-detector.js",
    "content/fake-video-remover.js",
    "content/overlay-remover.js",
    "content/player-enhancer.js",
    "content/player-controls.js",
    "content/player-sync.js",
]
SITE_STATE_FALLBACK_FREE_CONSUMERS = [
    "fake-video-remover",
    "overlay-remover",
    "player-enhancer",
]


def extract_definition_block(source: str, name: str, next_name: str | None = None) -> str:
    start_token = f"const {name} = ["
    start_index = source.find(start_token)
    if start_index < 0:
        raise ValueError(f"missing_definition:{name}")
    if not next_name:
        return source[start_index:]
    end_tokens = [
        f"const {next_name} = [",
        f"const {next_name} = ",
    ]
    end_index = -1
    for end_token in end_tokens:
        end_index = source.find(end_token, start_index)
        if end_index >= 0:
            break
    if end_index < 0:
        raise ValueError(f"missing_definition:{next_name}")
    return source[start_index:end_index]


def extract_js_paths(block: str) -> list[str]:
    return re.findall(r"'([^']+\.js)'", block)


def build_report() -> dict[str, object]:
    background_source = BACKGROUND_PATH.read_text(encoding="utf-8")
    basic_block = extract_definition_block(
        background_source,
        "BASIC_GLOBAL_CONTENT_SCRIPT_DEFINITIONS",
        "ENHANCED_SITE_CONTENT_SCRIPT_DEFINITIONS",
    )
    enhanced_block = extract_definition_block(
        background_source,
        "ENHANCED_SITE_CONTENT_SCRIPT_DEFINITIONS",
        "AI_POLICY_VERSION",
    )
    basic_js_paths = extract_js_paths(basic_block)
    enhanced_js_paths = extract_js_paths(enhanced_block)
    helper_path = "content/site-state-helper.js"

    order_checks = {
        "basicDocIdleHelperFirst": False,
        "enhancedDocIdleHelperFirst": False,
    }
    order_checks["basicDocIdleHelperFirst"] = helper_path in basic_js_paths and all(
        basic_js_paths.index(helper_path) < basic_js_paths.index(path)
        for path in CONTENT_SCRIPT_CONSUMERS
        if path in basic_js_paths and path != helper_path
    )
    order_checks["enhancedDocIdleHelperFirst"] = helper_path in enhanced_js_paths and all(
        enhanced_js_paths.index(helper_path) < enhanced_js_paths.index(path)
        for path in CONTENT_SCRIPT_CONSUMERS
        if path in enhanced_js_paths and path != helper_path
    )

    consumer_checks: dict[str, dict[str, bool]] = {}
    for name, path in CONSUMER_PATHS.items():
        source = path.read_text(encoding="utf-8")
        checks = {
            "referencesSiteStateHelper": "__ShieldSiteStateHelper" in source,
            "waitsForHelper": "waitForSiteStateHelper" in source or name == "player-controls",
            "hasNoDirectWhitelistStorageFallback": "chrome.storage.local.get(['whitelist', 'whitelistEnhanceOnly']" not in source,
            "failsClosedWithoutHelper": False,
        }
        if name == "player-detector":
            checks["waitsForHelper"] = "waitForSiteStateHelper" in source
            detector_body = source.split("function hashString", 1)[0]
            checks["failsClosedWithoutHelper"] = "return false;" in detector_body
        elif name == "player-controls":
            checks["failsClosedWithoutHelper"] = "mediaAutomationEnabled = false;" in source
        else:
            checks["failsClosedWithoutHelper"] = "blockingEnabled = false;" in source or "cleanupEnabled = false;" in source
        if name not in SITE_STATE_FALLBACK_FREE_CONSUMERS:
            checks["hasNoDirectWhitelistStorageFallback"] = True
        consumer_checks[name] = checks

    all_checks = [*order_checks.values()]
    for checks in consumer_checks.values():
        all_checks.extend(checks.values())

    return {
        "ok": all(all_checks),
        "checks": {
            "contentScriptOrder": order_checks,
            "consumers": consumer_checks,
        },
        "contract": {
            "helperPath": helper_path,
            "basicDocIdleJs": basic_js_paths,
            "enhancedDocIdleJs": enhanced_js_paths,
        },
    }


def main() -> int:
    report = build_report()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
