from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CURATED_TARGETS_PATH = REPO_ROOT / "tests" / "live-browser" / "targets.external-ai.single-page.curated.json"
SMOKE_TARGETS_PATH = REPO_ROOT / "tests" / "live-browser" / "targets.external-ai.single-page.smoke.json"
EXPECTED_SMOKE_GENERATED_FROM = "tests/live-browser/targets.external-ai.single-page.curated.json"
EXPECTED_SHARED_TAGS = {"external-ai-curation", "single-page"}
EXPECTED_SMOKE_TAG = "smoke"


def load_targets(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def index_targets(payload: dict[str, object]) -> dict[str, dict[str, object]]:
    targets = payload.get("targets", [])
    if not isinstance(targets, list):
        raise ValueError(f"targets_not_list:{payload}")
    return {
        str(item.get("url", "")).strip(): item
        for item in targets
        if isinstance(item, dict) and str(item.get("url", "")).strip()
    }


def build_report() -> dict[str, object]:
    curated_payload = load_targets(CURATED_TARGETS_PATH)
    smoke_payload = load_targets(SMOKE_TARGETS_PATH)
    curated_targets = index_targets(curated_payload)
    smoke_targets = index_targets(smoke_payload)
    selection_policy = str(smoke_payload.get("selectionPolicy", "")).strip()

    generated_from = str(smoke_payload.get("generatedFrom", "")).strip()
    generated_from_checks = {
        "repoRelativeCuratedPath": generated_from == EXPECTED_SMOKE_GENERATED_FROM,
        "doesNotReferenceLegacyRepoName": "ad-blocker-player-enhancer" not in generated_from.lower(),
    }

    smoke_target_checks: dict[str, dict[str, bool]] = {}
    for url, target in smoke_targets.items():
        tags = set(target.get("tags", [])) if isinstance(target.get("tags"), list) else set()
        curated_target = curated_targets.get(url, {})
        curated_tags = set(curated_target.get("tags", [])) if isinstance(curated_target.get("tags"), list) else set()
        domain_tags = {tag for tag in tags if str(tag).startswith("domain:")}
        smoke_target_checks[url] = {
            "existsInCuratedPool": url in curated_targets,
            "inheritsCuratedTags": EXPECTED_SHARED_TAGS <= tags and EXPECTED_SHARED_TAGS <= curated_tags,
            "addsSmokeTag": EXPECTED_SMOKE_TAG in tags,
            "keepsManualReview": bool(target.get("requiresManualReview", False)),
            "keepsDomainTag": len(domain_tags) == 1,
        }

    smoke_collection_checks = {
        "selectionPolicyPresent": bool(selection_policy),
        "smokeTargetCountMatchesPolicy": len(smoke_targets) == 3,
        "smokeUrlsAreUnique": len(smoke_targets) == len(smoke_payload.get("targets", [])),
        "curatedPoolNotEmpty": len(curated_targets) >= len(smoke_targets) > 0,
    }

    all_checks = [
        *generated_from_checks.values(),
        *smoke_collection_checks.values(),
    ]
    for checks in smoke_target_checks.values():
        all_checks.extend(checks.values())

    return {
        "ok": all(all_checks),
        "checks": {
            "generatedFrom": generated_from_checks,
            "collection": smoke_collection_checks,
            "targets": smoke_target_checks,
        },
        "contract": {
            "curatedPath": EXPECTED_SMOKE_GENERATED_FROM,
            "smokeSelectionPolicy": selection_policy,
            "smokeUrls": list(smoke_targets.keys()),
        },
    }


def main() -> int:
    report = build_report()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
