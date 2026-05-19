#!/usr/bin/env python3
"""Sync Mailcow mailboxes -> ONYX dashboard IMAP accounts list.

- Reads Mailcow mailboxes from the Mailcow Admin API.
- Writes dashboard/mailcow-accounts.json

Config:
  MAILCOW_URL   (default: https://mail.example.com)
  MAILCOW_API_KEY (required)
  DEFAULT_PASS  (required unless you extend this script to do per-user secrets)

Safety:
- This does NOT attempt any mailbox password changes.
- This is a provisioning/visibility helper for the ONYX dashboard only.
"""

from __future__ import annotations

import json
import os
import sys
import subprocess


def require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise SystemExit(f"Missing env {name}")
    return v


def get_json(url: str, api_key: str):
    """Fetch JSON using curl (more reliable in minimal python environments)."""
    cmd = [
        "curl",
        "-sS",
        url,
        "-H",
        f"X-API-Key: {api_key}",
        "-H",
        "Accept: application/json",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"curl failed ({res.returncode}) fetching {url}: {res.stderr.strip()}")
    raw = (res.stdout or "").strip()
    if not raw:
        raise SystemExit(f"Empty response from {url}")
    return json.loads(raw)


def main() -> int:
    base = os.environ.get("MAILCOW_URL", "https://mail.example.com").rstrip("/")
    api_key = require_env("MAILCOW_API_KEY")
    default_pass = require_env("DEFAULT_PASS")

    mailboxes = get_json(base + "/api/v1/get/mailbox/all", api_key)
    if not isinstance(mailboxes, list):
        raise SystemExit(f"Unexpected response for mailboxes: {type(mailboxes)}")

    accounts = []
    for mb in mailboxes:
        user = mb.get("username")
        if not user or "@" not in user:
            continue
        accounts.append({
            "user": user,
            "pass": default_pass,
            "label": user,
        })

    accounts.sort(key=lambda a: (a["user"].split("@", 1)[1].lower(), a["user"].split("@", 1)[0].lower()))

    out_path = os.path.join(os.path.dirname(__file__), "..", "mailcow-accounts.json")
    out_path = os.path.abspath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(accounts, f, indent=2)
        f.write("\n")

    print(f"Wrote {len(accounts)} accounts -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
