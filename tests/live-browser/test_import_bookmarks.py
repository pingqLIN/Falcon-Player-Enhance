from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("import_bookmarks.py")
SPEC = importlib.util.spec_from_file_location("import_bookmarks", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ImportBookmarksHeuristicsTest(unittest.TestCase):
    def test_non_playback_listing_urls_are_flagged(self) -> None:
        self.assertTrue(MODULE.is_probably_non_playback_url("https://poapan.xyz/tag/eros/"))
        self.assertTrue(MODULE.is_probably_non_playback_url("https://javboys.com/all-models/nomura-kota/"))
        self.assertTrue(MODULE.is_probably_non_playback_url("https://example.com/category/news/"))

    def test_playback_urls_rank_higher_than_listing_pages(self) -> None:
        playback_item = {
            "href": "https://javboys.com/fc2-pvv-2728492-%E3%82%AC%E3%83%83%E3%83%81%E3%83%AA%E5%90%9B%E3%82%92%E7%94%9F%E6%8E%98%E3%82%8A/",
            "title": "FC2-PPV-2728492 – Javboys.com",
        }
        listing_item = {
            "href": "https://javboys.com/all-models/nomura-kota/",
            "title": "野村詠太 Nomura Kota – Javboys.com",
        }

        self.assertGreater(MODULE.playback_likelihood(playback_item), MODULE.playback_likelihood(listing_item))


if __name__ == "__main__":
    unittest.main()
