from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKGROUND = ROOT / "extension" / "background.js"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    source = BACKGROUND.read_text(encoding="utf-8")

    require("Local heuristic prior" not in source, "prompt must not include local heuristic prior")
    require(
        "Allowed suggestedAction values: observe_only, hide_element, guard_navigation, block_request"
        not in source,
        "element prompt must not allow block_request",
    )
    require(
        "Allowed suggestedAction values: observe_only, hide_element, guard_navigation." in source,
        "element prompt must declare non-destructive actions only",
    )
    require(
        "Network blocking is handled only by deterministic rules" in source,
        "prompt must keep request blocking outside model authority",
    )
    require(
        "never silently block a click" in source,
        "guard_navigation must be described as visible warning intent",
    )
    require(
        "const allowedActions = ['observe_only', 'hide_element', 'guard_navigation'];" in source,
        "normalizer must reject block_request element actions",
    )
    require(
        "category === 'tracker'\r\n      ? 'block_request'" not in source
        and "category === 'tracker'\n      ? 'block_request'" not in source,
        "tracker fallback must not become block_request",
    )
    require(
        "AI_ELEMENT_CLASSIFICATION_RESPONSE_CONSTRAINT" in source
        and "responseConstraint: AI_ELEMENT_CLASSIFICATION_RESPONSE_CONSTRAINT" in source,
        "Chrome Built-in element classification should attempt responseConstraint",
    )
    require(
        "promptChromeBuiltinSession" in source
        and "isResponseConstraintUnsupportedError" in source,
        "Chrome Built-in prompt calls should be timeout-wrapped with constrained fallback",
    )
    require(
        "elementClassificationCache" in source
        and "AI_ELEMENT_CACHE_MAX_ENTRIES" in source
        and "AI_ELEMENT_CACHE_MAX_ENTRIES_PER_HOST" in source,
        "element classification cache must have global and per-host limits",
    )
    require(
        "buildElementEvidenceSummary" in source
        and "positionBucket" in source
        and "zIndexBucket" in source
        and "sizeBucket" in source,
        "prompt should use evidence features and coarse buckets",
    )
    require(
        "chrome_builtin_not_ready_" in source
        and "classifyAiProviderError" in source
        and "getChromeBuiltinCapabilitySnapshot" in source,
        "Chrome Built-in availability and capability failures must be classified",
    )

    print("chrome_builtin_element_classification_regression: ok")


if __name__ == "__main__":
    main()
