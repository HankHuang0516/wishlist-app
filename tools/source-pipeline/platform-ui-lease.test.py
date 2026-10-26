#!/usr/bin/env python3
"""Standard-library tests; copy both files to the local SSD and run with -B.

Concurrency tests start six real Python processes, wait until all report READY,
then release their input gates together. No GUI or simulator lease is requested.
Every test's state is temporary and lives beside this test's local copy.
"""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock


sys.dont_write_bytecode = True
DIRECTORY = Path(__file__).resolve().parent
SCRIPT = DIRECTORY / "platform-ui-lease.py"
SPEC = importlib.util.spec_from_file_location("platform_ui_lease", SCRIPT)
LEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEASE)


def child():
    """A real process running the same CLI, gated only for race-test readiness."""
    print("READY", flush=True)
    if sys.stdin.buffer.read(1) != b"1":
        return 2
    return LEASE.main(sys.argv[2:])


class PlatformUiLeaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(
            prefix="ui-lease-state-", dir=DIRECTORY)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "coordination"
        self.store = LEASE.Coordinator(self.root)

    def arguments(self, command, platform="FB", worker="fb-worker", run="run-1",
                  token=None):
        args = ["--root", str(self.root), command]
        if command != "status":
            args.extend(["--run-id", run, "--platform", platform, "--worker", worker])
        if token is not None:
            # URL-safe random tokens may start with '-'. Keep the value bound
            # to its option so argparse never treats it as another flag.
            args.append("--token=" + token)
        return args

    def cli(self, command, platform="FB", worker="fb-worker", run="run-1",
            token=None, error=None):
        process = subprocess.run(
            [sys.executable, "-B", str(SCRIPT),
             *self.arguments(command, platform, worker, run, token)],
            text=True, capture_output=True, timeout=15, cwd=DIRECTORY)
        self.assertEqual(process.stderr, "")
        result = json.loads(process.stdout)
        if error is None:
            self.assertEqual(process.returncode, 0, result)
            self.assertTrue(result["ok"])
        else:
            self.assertNotEqual(process.returncode, 0)
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], error)
        self.assertTrue(result["simulatorManagerGuiLeaseRequired"])
        return result

    def race(self, command):
        processes = []
        try:
            for platform in LEASE.PLATFORMS:
                worker = platform.lower() + "-worker"
                process = subprocess.Popen(
                    [sys.executable, "-B", str(Path(__file__).resolve()),
                     "--operation-child", *self.arguments(command, platform, worker)],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, text=True, cwd=DIRECTORY)
                processes.append((platform, worker, process))
            for _, _, process in processes:
                self.assertEqual(process.stdout.readline().strip(), "READY")
            for _, _, process in processes:
                process.stdin.write("1")
                process.stdin.flush()
                process.stdin.close()
                process.stdin = None
            results = []
            for platform, worker, process in processes:
                output, errors = process.communicate(timeout=15)
                self.assertEqual(errors, "")
                results.append((platform, worker, process.returncode,
                                json.loads(output)))
            return results
        finally:
            for _, _, process in processes:
                if process.poll() is None:
                    process.kill()
                process.communicate(timeout=5)

    def test_six_process_acquire_has_exactly_one_winner_and_next_platform_can_take(self):
        for platform in LEASE.PLATFORMS:
            self.cli("assign", platform, platform.lower() + "-worker")
        results = self.race("acquire")
        winners = [row for row in results if row[2] == 0]
        self.assertEqual(len(winners), 1, results)
        platform, worker, _, granted = winners[0]
        self.assertFalse(granted["reused"])
        self.assertEqual(granted["owner"]["expiresAt"]
                         - granted["owner"]["acquiredAt"], 120)
        for row in results:
            if row[2] != 0:
                self.assertEqual(row[3]["error"], "UI_HELD")
                self.assertNotIn("token", row[3])
        status = self.cli("status")
        self.assertEqual(status["owner"], granted["owner"])
        self.assertNotIn(granted["token"], json.dumps(status))
        self.cli("release", platform, worker, token=granted["token"])
        next_platform = next(p for p in LEASE.PLATFORMS if p != platform)
        next_grant = self.cli("acquire", next_platform,
                              next_platform.lower() + "-worker")
        self.assertNotEqual(next_grant["token"], granted["token"])
        self.assertEqual(next_grant["owner"]["platform"], next_platform)
        self.assertEqual(len(list(self.root.glob(".state-*.tmp"))), 0)

    def test_concurrent_assignments_do_not_lose_other_platforms(self):
        results = self.race("assign")
        self.assertTrue(all(code == 0 for _, _, code, _ in results), results)
        status = self.cli("status")
        self.assertEqual(status["assignments"]["run-1"],
                         {p: p.lower() + "-worker" for p in LEASE.PLATFORMS})
        self.assertFalse(status["held"])

    def test_assignment_required_worker_matches_and_reacquire_does_not_renew(self):
        self.cli("acquire", error="NOT_ASSIGNED")
        self.cli("assign")
        self.cli("acquire", worker="impostor", error="WORKER_MISMATCH")
        self.cli("acquire", run="other-run", error="NOT_ASSIGNED")
        original = self.cli("acquire")
        snapshot = self.store.state_file.read_bytes()
        # A later clock makes any accidental renewal visible without a sleep.
        later = LEASE.Coordinator(self.root,
                                  clock=lambda: original["owner"]["acquiredAt"] + 60)
        repeated = later.execute("acquire", "run-1", "FB", "fb-worker")
        self.assertTrue(repeated["reused"])
        self.assertEqual(repeated["token"], original["token"])
        self.assertEqual(repeated["owner"], original["owner"])
        self.cli("assign")
        self.cli("status")
        self.assertEqual(self.store.state_file.read_bytes(), snapshot)

    def test_wrong_identity_or_token_cannot_release_or_reassign_holder(self):
        self.cli("assign")
        granted = self.cli("acquire")
        snapshot = self.store.state_file.read_bytes()
        for changes in ({"worker": "other"}, {"run": "other-run"},
                        {"platform": "LINE"}):
            with self.subTest(changes=changes):
                self.cli("release", token=granted["token"],
                         error="NOT_UI_OWNER", **changes)
                self.assertEqual(self.store.state_file.read_bytes(), snapshot)
        self.cli("release", token="wrong-token", error="TOKEN_MISMATCH")
        self.cli("release", token="錯誤的token", error="TOKEN_MISMATCH")
        self.cli("assign", worker="replacement", error="ASSIGNMENT_IN_USE")
        self.cli("assign", run="next-run", error="ASSIGNMENT_IN_USE")
        self.assertEqual(self.store.state_file.read_bytes(), snapshot)
        self.cli("release", token=granted["token"])
        self.cli("assign", worker="replacement")
        self.cli("acquire", worker="fb-worker", error="WORKER_MISMATCH")
        self.cli("acquire", worker="replacement")
        self.cli("release", worker="replacement", token=granted["token"],
                 error="TOKEN_MISMATCH")

    def test_expired_owner_remains_until_original_owner_releases_original_token(self):
        old_clock = LEASE.Coordinator(self.root, clock=lambda: time.time() - 121)
        old_clock.execute("assign", "run-1", "FB", "fb-worker")
        original = old_clock.execute("acquire", "run-1", "FB", "fb-worker")
        self.cli("assign", "LINE", "line-worker")
        snapshot = self.store.state_file.read_bytes()
        status = self.cli("status")
        self.assertTrue(status["held"])
        self.assertTrue(status["expired"])
        self.assertFalse(status["tokenActive"])
        self.assertEqual(status["owner"], original["owner"])
        self.cli("acquire", "LINE", "line-worker", error="UI_HELD")
        self.cli("acquire", error="LEASE_EXPIRED_RELEASE_REQUIRED")
        self.cli("assign", worker="replacement", error="ASSIGNMENT_IN_USE")
        self.cli("release", "LINE", "line-worker", token=original["token"],
                 error="NOT_UI_OWNER")
        self.cli("release", token="not-the-original", error="TOKEN_MISMATCH")
        self.assertEqual(self.store.state_file.read_bytes(), snapshot)
        self.cli("release", token=original["token"])
        next_grant = self.cli("acquire", "LINE", "line-worker")
        self.assertFalse(next_grant["expired"])
        self.assertTrue(next_grant["tokenActive"])

    def test_new_run_cannot_bypass_global_holder(self):
        self.cli("assign")
        original = self.cli("acquire")
        self.cli("assign", "DCARD", "dcard-worker", run="next-run")
        self.cli("acquire", "DCARD", "dcard-worker", run="next-run",
                 error="UI_HELD")
        self.cli("release", run="next-run", token=original["token"],
                 error="NOT_UI_OWNER")
        self.cli("release", token=original["token"])
        self.cli("acquire", "DCARD", "dcard-worker", run="next-run")

    def test_leading_dash_token_releases_through_real_cli(self):
        self.cli("assign")
        with mock.patch.object(LEASE.secrets, "token_urlsafe",
                               return_value="-synthetic-url-safe-token"):
            granted = self.store.execute("acquire", "run-1", "FB", "fb-worker")
        self.cli("release", token=granted["token"])
        self.assertFalse(self.cli("status")["held"])

    def test_exact_deadline_is_expired_not_renewable(self):
        fixed = LEASE.Coordinator(self.root, clock=lambda: 1000)
        fixed.execute("assign", "run-1", "FB", "fb-worker")
        granted = fixed.execute("acquire", "run-1", "FB", "fb-worker")
        boundary = LEASE.Coordinator(self.root, clock=lambda: 1120)
        self.assertTrue(boundary.execute("status")["expired"])
        with self.assertRaises(LEASE.LeaseError) as error:
            boundary.execute("acquire", "run-1", "FB", "fb-worker")
        self.assertEqual(error.exception.code, "LEASE_EXPIRED_RELEASE_REQUIRED")
        boundary.execute("release", "run-1", "FB", "fb-worker", granted["token"])
        self.assertFalse(boundary.execute("status")["held"])

    def test_replace_failure_preserves_holder_and_cleans_temporary_file(self):
        self.cli("assign")
        granted = self.cli("acquire")
        snapshot = self.store.state_file.read_bytes()
        with mock.patch.object(LEASE.os, "replace", side_effect=OSError("disk fault")):
            with self.assertRaises(OSError):
                self.store.execute("release", "run-1", "FB", "fb-worker",
                                   granted["token"])
        self.assertEqual(self.store.state_file.read_bytes(), snapshot)
        self.assertEqual(list(self.root.glob(".state-*.tmp")), [])
        self.cli("assign", "LINE", "line-worker")
        self.cli("acquire", "LINE", "line-worker", error="UI_HELD")
        self.cli("release", token=granted["token"])

    def test_corrupt_or_inconsistent_state_fails_closed_without_rewriting(self):
        self.cli("assign")
        self.cli("acquire")
        valid = json.loads(self.store.state_file.read_text())
        inconsistent = json.loads(json.dumps(valid))
        inconsistent["assignments"] = {}
        for bad in ("{truncated", json.dumps(inconsistent),
                    json.dumps({"schemaVersion": 99, "assignments": {}, "owner": None})):
            with self.subTest(bad=bad):
                self.store.state_file.write_text(bad)
                self.cli("status", error="STATE_INVALID")
                self.cli("assign", "LINE", "line-worker", error="STATE_INVALID")
                self.cli("acquire", error="STATE_INVALID")
                self.assertEqual(self.store.state_file.read_text(), bad)

    def test_root_is_mandatory_and_platforms_are_fixed(self):
        for args in (["status"], self.arguments("assign", platform="TWITTER")):
            process = subprocess.run([sys.executable, "-B", str(SCRIPT), *args],
                                     capture_output=True, text=True, timeout=15,
                                     cwd=DIRECTORY)
            self.assertEqual(process.returncode, 2)
        self.assertFalse(self.root.exists())
        # --root is also accepted after the subcommand.
        process = subprocess.run([sys.executable, "-B", str(SCRIPT), "status",
                                  "--root", str(self.root)],
                                 capture_output=True, text=True, timeout=15,
                                 cwd=DIRECTORY)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertFalse(json.loads(process.stdout)["held"])


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--operation-child":
        raise SystemExit(child())
    unittest.main()
