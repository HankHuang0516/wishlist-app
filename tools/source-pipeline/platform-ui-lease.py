#!/usr/bin/env python3
"""Cooperative, single-holder UI arbitration for all six platform workers.

Examples (all callers must share the same explicit local state root):
  python3 platform-ui-lease.py --root /local/ui-state assign \
      --run-id hourly-0710 --platform FB --worker fb-worker
  python3 platform-ui-lease.py --root /local/ui-state acquire \
      --run-id hourly-0710 --platform FB --worker fb-worker
  python3 platform-ui-lease.py --root /local/ui-state release \
      --run-id hourly-0710 --platform FB --worker fb-worker --token TOKEN
  python3 platform-ui-lease.py --root /local/ui-state status

The token is local coordination, NOT permission to operate a GUI. A separate
simulator-manager GUI lease is always required. This module does not obtain one
and performs no GUI, network, credential, or production-data operations.

state.json holds assignments by run and one global owner. Times are Unix UTC
seconds. The 120-second deadline never renews; even an expired owner must release
with the original identity and token. Never delete or replace state.lock while
callers may be running. Lost-owner recovery requires outside coordination; this
CLI deliberately has no force-release, timeout takeover, or PID-based takeover.
Exit codes: 0 success, 1 refused, 2 invalid input/state or local I/O failure.
"""

import argparse
from contextlib import contextmanager
import fcntl
import json
import math
import os
from pathlib import Path
import secrets
import tempfile
import time


PLATFORMS = ("FB", "DCARD", "LINE", "RUTEN", "SHOPEE", "CAROUSELL")
LEASE_SECONDS = 120


class LeaseError(Exception):
    def __init__(self, code, exit_code=1):
        super().__init__(code)
        self.code = code
        self.exit_code = exit_code


def valid_label(value):
    return (isinstance(value, str) and 0 < len(value) <= 200
            and value == value.strip() and value.isprintable())


def identity(owner):
    return owner["runId"], owner["platform"], owner["worker"]


def validate_state(state):
    """Corrupt or incompatible state must never become an empty/free slot."""
    try:
        if (not isinstance(state, dict)
                or set(state) != {"schemaVersion", "assignments", "owner"}
                or type(state["schemaVersion"]) is not int
                or state["schemaVersion"] != 1):
            raise ValueError
        assignments = state["assignments"]
        if not isinstance(assignments, dict):
            raise ValueError
        for run_id, platforms in assignments.items():
            if not valid_label(run_id) or not isinstance(platforms, dict):
                raise ValueError
            if any(p not in PLATFORMS or not valid_label(w)
                   for p, w in platforms.items()):
                raise ValueError
        owner = state["owner"]
        if owner is not None:
            if (not isinstance(owner, dict)
                    or set(owner) != {"runId", "platform", "worker", "token",
                                      "acquiredAt", "expiresAt"}):
                raise ValueError
            run_id, platform, worker = identity(owner)
            if (not valid_label(run_id) or not valid_label(worker)
                    or platform not in PLATFORMS
                    or assignments.get(run_id, {}).get(platform) != worker
                    or not valid_label(owner["token"])):
                raise ValueError
            for key in ("acquiredAt", "expiresAt"):
                value = owner[key]
                if (type(value) not in (float, int)
                        or not math.isfinite(value) or value < 0):
                    raise ValueError
            if owner["expiresAt"] != owner["acquiredAt"] + LEASE_SECONDS:
                raise ValueError
    except (KeyError, TypeError, ValueError):
        raise LeaseError("STATE_INVALID", 2) from None


class Coordinator:
    def __init__(self, root, clock=time.time):
        if not str(root).strip():
            raise LeaseError("ROOT_REQUIRED", 2)
        self.root = Path(root).expanduser().resolve()
        self.state_file = self.root / "state.json"
        self.clock = clock

    @contextmanager
    def locked(self):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Lock a stable inode, never the state file that atomic replace changes.
        fd = os.open(self.root / "state.lock",
                     os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "a+b") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)

    def load(self):
        try:
            text = self.state_file.read_text(encoding="utf-8")
        except FileNotFoundError:
            return {"schemaVersion": 1, "assignments": {}, "owner": None}
        try:
            state = json.loads(text)
        except (ValueError, UnicodeError):
            raise LeaseError("STATE_INVALID", 2) from None
        validate_state(state)
        return state

    def save(self, state):
        validate_state(state)
        # Temp file and destination share a filesystem; fsync before replacement
        # and fsync the directory before acknowledging the persisted operation.
        fd, temporary = tempfile.mkstemp(prefix=".state-", suffix=".tmp",
                                         dir=self.root)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(state, stream, ensure_ascii=False, allow_nan=False,
                          sort_keys=True, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.state_file)
            directory_fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def execute(self, command, run_id=None, platform=None, worker=None, token=None):
        if command not in ("assign", "acquire", "release", "status"):
            raise LeaseError("COMMAND_INVALID", 2)
        if command != "status":
            if (not valid_label(run_id) or platform not in PLATFORMS
                    or not valid_label(worker)):
                raise LeaseError("IDENTITY_INVALID", 2)
        if command == "release" and not valid_label(token):
            raise LeaseError("TOKEN_REQUIRED", 2)
        with self.locked():
            state = self.load()
            now = self.clock()
            if type(now) not in (int, float) or not math.isfinite(now) or now < 0:
                raise LeaseError("CLOCK_INVALID", 2)
            owner = state["owner"]
            requested = (run_id, platform, worker)
            result = {"ok": True, "command": command,
                      "simulatorManagerGuiLeaseRequired": True}
            if command == "assign":
                # This also protects a holder from reassignment by a later run,
                # and protects expired holders until explicit release.
                if (owner is not None and owner["platform"] == platform
                        and identity(owner) != requested):
                    raise LeaseError("ASSIGNMENT_IN_USE")
                platforms = state["assignments"].setdefault(run_id, {})
                changed = platforms.get(platform) != worker
                if changed:
                    platforms[platform] = worker
                    self.save(state)
                result.update(runId=run_id, platform=platform, worker=worker,
                              changed=changed)
                return result
            if command == "release":
                if owner is None:
                    raise LeaseError("NO_UI_OWNER")
                if identity(owner) != requested:
                    raise LeaseError("NOT_UI_OWNER")
                if not secrets.compare_digest(owner["token"].encode("utf-8"),
                                              token.encode("utf-8")):
                    raise LeaseError("TOKEN_MISMATCH")
                state["owner"] = None
                self.save(state)
                result["released"] = True
                return result
            if command == "acquire":
                assigned = state["assignments"].get(run_id, {}).get(platform)
                if assigned is None:
                    raise LeaseError("NOT_ASSIGNED")
                if assigned != worker:
                    raise LeaseError("WORKER_MISMATCH")
                if owner is not None:
                    if identity(owner) != requested:
                        raise LeaseError("UI_HELD")
                    if now >= owner["expiresAt"]:
                        raise LeaseError("LEASE_EXPIRED_RELEASE_REQUIRED")
                    result["reused"] = True
                else:
                    owner = {"runId": run_id, "platform": platform,
                             "worker": worker, "token": secrets.token_urlsafe(32),
                             "acquiredAt": now, "expiresAt": now + LEASE_SECONDS}
                    state["owner"] = owner
                    self.save(state)
                    result["reused"] = False
                # Only acquire returns the coordination token, never status.
                result["token"] = owner["token"]
            expired = owner is not None and now >= owner["expiresAt"]
            result.update(owner=None if owner is None else {
                k: v for k, v in owner.items() if k != "token"
            }, held=owner is not None, expired=expired,
                tokenActive=owner is not None and not expired)
            if command == "status":
                result["assignments"] = state["assignments"]
            return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    # Accept --root on either side of the subcommand, with no implicit default.
    parser.add_argument("--root", default=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("assign", "acquire", "release", "status"):
        sub = commands.add_parser(name)
        sub.add_argument("--root", default=argparse.SUPPRESS)
        if name != "status":
            sub.add_argument("--run-id", required=True)
            sub.add_argument("--platform", required=True, choices=PLATFORMS)
            sub.add_argument("--worker", required=True)
        if name == "release":
            sub.add_argument("--token", required=True)
    args = parser.parse_args(argv)
    if not getattr(args, "root", None):
        parser.error("--root is required; all callers must share one local state root")
    try:
        result = Coordinator(args.root).execute(
            args.command, getattr(args, "run_id", None),
            getattr(args, "platform", None), getattr(args, "worker", None),
            getattr(args, "token", None))
    except LeaseError as error:
        print(json.dumps({"ok": False, "error": error.code,
                          "simulatorManagerGuiLeaseRequired": True}))
        return error.exit_code
    except (OSError, UnicodeError):
        # A failed acknowledgement is not proof that replace did not commit.
        # Call status or reacquire the same identity to inspect; never force reset.
        print(json.dumps({"ok": False, "error": "STATE_IO_ERROR",
                          "simulatorManagerGuiLeaseRequired": True}))
        return 2
    print(json.dumps(result, ensure_ascii=False, allow_nan=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
