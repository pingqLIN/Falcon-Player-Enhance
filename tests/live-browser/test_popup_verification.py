from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE = Path(__file__).with_name("browser_judge.py")
FIXTURES = Path(__file__).with_name("fixtures")


class PopupVerificationSmokeTest(unittest.TestCase):
    def test_repeatable_popup_player_and_direct_popup_paths(self) -> None:
        popup_player = (FIXTURES / "popup-player-verification.html").resolve().as_uri()
        direct_popup = (FIXTURES / "direct-popup-verification.html").resolve().as_uri()

        targets = {
            "targets": [
                {
                    "name": "local popup-player verification fixture",
                    "url": popup_player,
                    "tags": ["popup-player", "local-fixture", "repeatable-verification"],
                    "requiresManualReview": False,
                    "verificationMode": "popup-player",
                    "expectedSignals": {
                        "playerDetected": True,
                        "maxOverlayCount": 0,
                        "maxPopupCount": 0
                    }
                },
                {
                    "name": "local direct-popup verification fixture",
                    "url": direct_popup,
                    "tags": ["direct-popup", "local-fixture", "repeatable-verification"],
                    "requiresManualReview": False,
                    "verificationMode": "direct-popup",
                    "expectedSignals": {
                        "playerDetected": True,
                        "minOverlayCount": 1
                    }
                }
            ]
        }

        with tempfile.TemporaryDirectory(prefix="falcon-popup-verification-") as temp_dir:
            temp = Path(temp_dir)
            targets_path = temp / "targets.json"
            report_path = temp / "report.json"
            profile_dir = temp / "browser-profile"
            targets_path.write_text(json.dumps(targets, indent=2, ensure_ascii=False), encoding="utf-8")

            proc = subprocess.run(
                [
                    sys.executable,
                    str(MODULE),
                    "--targets",
                    str(targets_path),
                    "--extension-dir",
                    str(ROOT / "extension"),
                    "--browser-channel",
                    "chromium",
                    "--browser-profile-dir",
                    str(profile_dir),
                    "--headless",
                    "--pass-threshold",
                    "0",
                    "--settle-ms",
                    "1200",
                    "--timeout-ms",
                    "10000",
                    "--out",
                    str(report_path)
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False
            )

            self.assertEqual(proc.returncode, 0, proc.stdout + "\n" + proc.stderr)

            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["targetCount"], 2)
            self.assertEqual(report["passed"], 2)
            self.assertEqual(report["failed"], 0)

            by_name = {item["name"]: item for item in report["results"]}
            popup_result = by_name["local popup-player verification fixture"]
            direct_result = by_name["local direct-popup verification fixture"]

            self.assertTrue(popup_result["ok"])
            self.assertEqual(popup_result["verificationMode"], "popup-player")
            self.assertEqual(popup_result["signalFailures"], [])
            self.assertGreaterEqual(int(popup_result["snapshot"]["playerDetected"]), 1)
            self.assertEqual(int(popup_result["snapshot"]["overlayCount"]), 0)
            self.assertEqual(int(popup_result["snapshot"]["popupCount"]), 0)

            self.assertTrue(direct_result["ok"])
            self.assertEqual(direct_result["verificationMode"], "direct-popup")
            self.assertEqual(direct_result["signalFailures"], [])
            self.assertGreaterEqual(int(direct_result["snapshot"]["playerDetected"]), 1)
            self.assertGreaterEqual(int(direct_result["snapshot"]["overlayCount"]), 1)
            self.assertIn("repeatable-verification", direct_result["tags"])


if __name__ == "__main__":
    unittest.main()
