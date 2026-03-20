from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("browser_judge.py")
SPEC = importlib.util.spec_from_file_location("browser_judge", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BrowserJudgeInterstitialTest(unittest.TestCase):
    def test_detects_notification_lure_from_click_allow_gate(self) -> None:
        result = MODULE.detect_interstitial_type(
            '点击 "允许"',
            "",
            "https://d6tvdi2naffc73d3qlug.anjk-protect.pro/xm/xm1/",
        )

        self.assertEqual(result, "notification_lure")

    def test_detects_browser_challenge_from_cloudflare_copy(self) -> None:
        result = MODULE.detect_interstitial_type(
            "Just a moment...",
            "Checking your browser before accessing the page. Cloudflare DDoS protection.",
            "https://example.com/",
        )

        self.assertEqual(result, "browser_challenge")

    def test_does_not_flag_normal_playback_page(self) -> None:
        result = MODULE.detect_interstitial_type(
            "FC2-PPV-2728492 - JavBoys",
            "embedded player ready and comments below",
            "https://javboys.com/fc2-ppv-2728492/",
        )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
