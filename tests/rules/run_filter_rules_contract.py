from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FILTER_RULES_PATH = REPO_ROOT / "extension" / "rules" / "filter-rules.json"


def main() -> int:
    payload = json.loads(FILTER_RULES_PATH.read_text(encoding="utf-8"))
    lovable_rule = next(
        (
            item for item in payload
            if item.get("action", {}).get("type") == "allow"
            and set(item.get("condition", {}).get("initiatorDomains", [])) >= {"lovable.dev", "auth.lovable.dev"}
        ),
        None,
    )

    report = {
        "ok": bool(lovable_rule),
        "checks": {
            "lovableAllowRulePresent": bool(lovable_rule),
            "lovableAllowRuleResourceTypes": bool(lovable_rule) and set(lovable_rule.get("condition", {}).get("resourceTypes", [])) >= {
                "script",
                "xmlhttprequest",
                "image",
                "sub_frame",
            },
        },
        "rule": lovable_rule or {},
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] and all(report["checks"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
