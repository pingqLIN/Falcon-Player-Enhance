from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


class BookmarkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.folder_stack: list[str] = []
        self.pending_folder: str | None = None
        self.capture_folder = False
        self.capture_anchor = False
        self.current_anchor: dict[str, Any] | None = None
        self.items: list[dict[str, Any]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        lower_tag = tag.lower()
        if lower_tag == "h3":
            self.capture_folder = True
            self.pending_folder = ""
        elif lower_tag == "a":
            self.capture_anchor = True
            self.current_anchor = {
                "href": attrs_map.get("href") or "",
                "addDate": attrs_map.get("add_date"),
                "icon": attrs_map.get("icon"),
                "title": "",
                "folders": list(self.folder_stack)
            }
        elif lower_tag == "dl" and self.pending_folder:
            self.folder_stack.append(self.pending_folder.strip())
            self.pending_folder = None

    def handle_endtag(self, tag: str) -> None:
        lower_tag = tag.lower()
        if lower_tag == "h3":
            self.capture_folder = False
        elif lower_tag == "a":
            self.capture_anchor = False
            if self.current_anchor and self.current_anchor.get("href"):
                self.current_anchor["title"] = self.current_anchor["title"].strip()
                self.items.append(self.current_anchor)
            self.current_anchor = None
        elif lower_tag == "dl":
            if self.folder_stack:
                self.folder_stack.pop()

    def handle_data(self, data: str) -> None:
        if self.capture_folder:
            self.pending_folder = f"{self.pending_folder or ''}{data}"
        elif self.capture_anchor and self.current_anchor is not None:
            self.current_anchor["title"] = f"{self.current_anchor['title']}{data}"


NON_PLAYBACK_SEGMENTS = {
    "tag",
    "tags",
    "category",
    "categories",
    "genre",
    "genres",
    "search",
    "s",
    "page",
    "author",
    "actors",
    "actor",
    "models",
    "model",
    "all-models",
    "performers",
    "stars",
    "star",
    "labels",
    "collections",
    "archives",
    "archive",
}

LIKELY_PLAYBACK_HINTS = (
    "watch",
    "video",
    "embed",
    "play",
    "movie",
    "episode",
    "player",
    "stream",
    "ppv",
    "fc2",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import a Netscape bookmarks export into live-browser targets JSON."
    )
    parser.add_argument("--input", required=True, help="Bookmarks HTML export path.")
    parser.add_argument("--out", help="Output targets JSON path. Omit to print summary only.")
    parser.add_argument("--include-domain-regex", help="Only keep domains matching this regex.")
    parser.add_argument("--exclude-domain-regex", help="Drop domains matching this regex.")
    parser.add_argument("--include-url-regex", help="Only keep URLs matching this regex.")
    parser.add_argument("--exclude-url-regex", help="Drop URLs matching this regex.")
    parser.add_argument("--limit", type=int, help="Max number of targets to emit after filtering.")
    parser.add_argument("--limit-per-domain", type=int, default=5, help="Max URLs per hostname.")
    parser.add_argument("--require-folder", action="append", default=[], help="Only keep entries whose folder path contains this text.")
    parser.add_argument("--tag", action="append", default=[], help="Extra tag(s) to attach to every emitted target.")
    parser.add_argument(
        "--skip-non-playback",
        dest="skip_non_playback",
        action="store_true",
        default=True,
        help="Skip obvious tag/category/model/search/listing URLs."
    )
    parser.add_argument(
        "--no-skip-non-playback",
        dest="skip_non_playback",
        action="store_false",
        help="Keep URLs even when they look like non-playback index pages."
    )
    parser.add_argument(
        "--sort-by-playback-likelihood",
        dest="sort_by_playback_likelihood",
        action="store_true",
        default=True,
        help="Prefer likely playback pages before applying output limits."
    )
    parser.add_argument(
        "--no-sort-by-playback-likelihood",
        dest="sort_by_playback_likelihood",
        action="store_false",
        help="Keep original bookmark order instead of ranking likely playback pages first."
    )
    parser.add_argument("--manual-review", dest="manual_review", action="store_true", default=True, help="Mark imported targets as requiring review.")
    parser.add_argument("--no-manual-review", dest="manual_review", action="store_false", help="Mark imported targets as already reviewed.")
    parser.add_argument("--summary-only", action="store_true", help="Print summary without writing a targets file.")
    return parser.parse_args()


def compile_regex(value: str | None) -> re.Pattern[str] | None:
    return re.compile(value, re.IGNORECASE) if value else None


def normalize_hostname(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def normalize_title(title: str, hostname: str) -> str:
    title = re.sub(r"\s+", " ", title or "").strip()
    return title[:160] if title else hostname


def normalize_slug_token(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")


def path_segments(url: str) -> list[str]:
    parsed = urlparse(url)
    return [segment for segment in parsed.path.split("/") if segment]


def is_probably_non_playback_url(url: str) -> bool:
    parsed = urlparse(url)
    segments = [segment.lower() for segment in path_segments(url)]
    if not segments:
        return True

    query = parsed.query.lower()
    if any(segment in NON_PLAYBACK_SEGMENTS for segment in segments[:-1]):
        return True
    if segments[0] in NON_PLAYBACK_SEGMENTS:
        return True
    if any(key in query for key in ("page=", "paged=", "orderby=", "sort=", "filter=")):
        return True

    last_segment = segments[-1]
    if last_segment.isdigit():
        return True
    if re.fullmatch(r"page-\d+", last_segment):
        return True

    return False


def playback_likelihood(item: dict[str, Any]) -> int:
    url = item.get("href", "")
    title = normalize_title(item.get("title", ""), normalize_hostname(url))
    segments = path_segments(url)
    last_segment = normalize_slug_token(segments[-1]) if segments else ""
    joined = f"{title} {last_segment}".lower()
    score = 0

    if not is_probably_non_playback_url(url):
        score += 40
    if len(segments) >= 1:
        score += min(15, len(segments) * 3)
    if len(last_segment) >= 12:
        score += 12
    if re.search(r"[a-z]{2,6}-?\d{2,6}", joined):
        score += 18
    if any(hint in joined for hint in LIKELY_PLAYBACK_HINTS):
        score += 14
    if re.search(r"\d{3,}", joined):
        score += 8
    if title and title != normalize_hostname(url):
        score += 6

    return score


def folder_text(item: dict[str, Any]) -> str:
    return " / ".join(part for part in item.get("folders", []) if part)


def matches_required_folders(item: dict[str, Any], required: list[str]) -> bool:
    if not required:
        return True
    haystack = folder_text(item).lower()
    return any(token.lower() in haystack for token in required)


def build_target(item: dict[str, Any], extra_tags: list[str], manual_review: bool) -> dict[str, Any]:
    url = item["href"]
    hostname = normalize_hostname(url)
    folder_tags = [f"folder:{part}" for part in item.get("folders", []) if part]
    tags = ["bookmark-import", f"domain:{hostname}", *folder_tags, *extra_tags]
    unique_tags = []
    seen = set()
    for tag in tags:
        if tag and tag not in seen:
            seen.add(tag)
            unique_tags.append(tag)
    return {
        "name": normalize_title(item.get("title", ""), hostname),
        "url": url,
        "tags": unique_tags,
        "requiresManualReview": manual_review,
        "source": {
            "type": "bookmark-import",
            "folders": item.get("folders", []),
            "addDate": item.get("addDate"),
            "playbackLikelihood": playback_likelihood(item),
            "autoSkippedNonPlayback": is_probably_non_playback_url(url)
        }
    }


def describe_generated_from(input_path: Path, output_path: Path) -> str:
    try:
        return str(input_path.relative_to(output_path.parent))
    except ValueError:
        return input_path.name


def run() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Bookmarks file not found: {input_path}")

    parser = BookmarkParser()
    parser.feed(input_path.read_text(encoding="utf-8", errors="ignore"))

    include_re = compile_regex(args.include_domain_regex)
    exclude_re = compile_regex(args.exclude_domain_regex)
    include_url_re = compile_regex(args.include_url_regex)
    exclude_url_re = compile_regex(args.exclude_url_regex)
    per_domain_seen: Counter[str] = Counter()
    candidates: list[dict[str, Any]] = []
    domain_counts: Counter[str] = Counter()
    seen_urls: set[str] = set()

    for item in parser.items:
        url = item.get("href", "")
        if not url.startswith(("http://", "https://")):
            continue
        if url in seen_urls:
            continue
        hostname = normalize_hostname(url)
        if not hostname:
            continue
        if include_re and not include_re.search(hostname):
            continue
        if exclude_re and exclude_re.search(hostname):
            continue
        if include_url_re and not include_url_re.search(url):
            continue
        if exclude_url_re and exclude_url_re.search(url):
            continue
        if not matches_required_folders(item, args.require_folder):
            continue
        if args.skip_non_playback and is_probably_non_playback_url(url):
            continue

        seen_urls.add(url)
        candidates.append(item)

    if args.sort_by_playback_likelihood:
        candidates.sort(
            key=lambda item: (
                -playback_likelihood(item),
                normalize_hostname(item.get("href", "")),
                item.get("href", "")
            )
        )

    accepted: list[dict[str, Any]] = []
    for item in candidates:
        hostname = normalize_hostname(item["href"])
        if per_domain_seen[hostname] >= args.limit_per_domain:
            continue

        accepted.append(build_target(item, args.tag, args.manual_review))
        per_domain_seen[hostname] += 1
        domain_counts[hostname] += 1

        if args.limit and len(accepted) >= args.limit:
            break

    summary = {
        "input": str(input_path),
        "bookmarkCount": len(parser.items),
        "candidateCount": len(candidates),
        "acceptedCount": len(accepted),
        "topDomains": domain_counts.most_common(15)
    }

    print(json.dumps(summary, indent=2, ensure_ascii=False))

    if args.summary_only or not args.out:
        return 0

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedFrom": describe_generated_from(input_path, out_path),
        "targets": accepted
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote targets file: {out_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except Exception as exc:  # noqa: BLE001
        print(f"Fatal error: {exc}", file=sys.stderr)
        raise
