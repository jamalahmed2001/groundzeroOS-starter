---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: mailcow-imap
source_skill_path: ~/clawd/skills/mailcow-imap/SKILL.md
updated: 2026-04-27T10:52:05Z
up: Agent Skills Hub
---
# mailcow-imap

> Check Mailcow emails using IMAP access

# Mailcow IMAP Access

Check your Mailcow emails via IMAP protocol.

## ✅ Current Status

**Working:** Robust IMAP access is now implemented via `curl imaps://` (Python wrapper), verified against live inbox.

Capabilities now working:
1. Inbox status (total + unread)
2. Recent email list (sender/subject/date)
3. Search by keyword with actionable output

See `STATUS.md` for implementation details.

## Usage

### List Mailboxes
```bash
python3 <home>/clawd/skills/mailcow-imap/mailcow-client.py list
```

### Check Inbox Status
```bash
python3 <home>/clawd/skills/mailcow-imap/mailcow-client.py status
```

### List Recent Emails
```bash
# List 10 most recent
python3 <home>/clawd/skills/mailcow-imap/mailcow-client.py recent 10

# List 20 most recent
python3 <home>/clawd/skills/mailcow-imap/mailcow-client.py recent 20
```

### Search Emails
```bash
python3 <home>/clawd/skills/mailcow-imap/mailcow-client.py search "query"
```

## Configuration

**Credentials file:** `<home>/.credentials/mailcow-<domain>.conf`

**Server Details:**
- Server: `mail.<domain>`
- Port: `993` (IMAP SSL)
- Username: `<operator>@<domain>`
- Password: `<password>`

## Technical Details

### Python 3.13 Issue
Python 3.13.2 removed `imaplib.IMAP4_SSL` class. Script uses `imaplib.IMAP4` with `starttls()` instead, but this is timing out on Mailcow.

### IMAP Protocol
- **IMAP4** with `starttls()` for SSL/TLS upgrade
- Port: `993`

### Authentication
- **Username:** `<operator>@<domain>`
- **Password:** `<password>`

### Server Capabilities (from OpenSSL test)
- `LOGIN` — Plain authentication
- `SELECT` — Select mailbox
- `STATUS` — Get mailbox status (UNSEEN count)
- `SEARCH` — Find emails
- `FETCH` — Retrieve email data
- `LOGOUT` — Close connection

## Available Scripts

### Python Scripts
- `test-connection.py` — IMAP connection test
- `mailcow-client.py` — Full IMAP client (list, status, search, recent)
- `STATUS.md` — Troubleshooting details

### Shell Scripts in ~/clawd/scripts (Glue / Legacy)

These are convenience wrappers that live in the main workspace scripts folder:

- `~/clawd/scripts/check-inbox.sh` — High-level inbox check using the Mailcow client
- `~/clawd/scripts/check-mailcow-api.sh` — Direct API health check for Mailcow
- `~/clawd/scripts/test-mailcow-imap.sh` — IMAP connection test wrapper

Prefer the Python client for new workflows, but these scripts are safe to call when you want a quick check from cron or ad-hoc terminal use.

## Files

- `SKILL.md` — This file
- `STATUS.md` — Status and troubleshooting
- `README.md` — Usage guide
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]
