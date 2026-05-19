---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: cloudflare-dns-sync
source_skill_path: ~/clawd/skills/cloudflare-dns-sync/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# cloudflare-dns-sync

> Idempotent Cloudflare DNS record upsert. A/AAAA/MX/TXT/CNAME. Auto-detects public IP for A/AAAA. No-op if the record already matches — safe to run on a tight timer.

## When a directive should call this

- Dynamic DNS (DDNS) — keep an A record pointed at a changing residential IP (Virgin Media mail server, home services)
- Declarative DNS setup as part of infrastructure provisioning (MX, SPF, DMARC, DKIM)
- Periodic DNS drift correction (re-assert known-good records)

## When NOT to call this

- Not using Cloudflare → wrong skill (no Route 53, Gandi, Namecheap support)
- Bulk zone replication → use Cloudflare's own bulk tools

## How to call it

```bash
# DDNS — auto-detect public IP
cloudflare-dns-sync --zone example.com --record mail.example.com --type A

# Static MX
cloudflare-dns-sync --zone example.com --record example.com --type MX \
  --content mail.example.com --priority 10

# SPF
cloudflare-dns-sync --zone example.com --record example.com --type TXT \
  --content "v=spf1 mx -all"

# Dry run
cloudflare-dns-sync --zone X --record Y --type A --dry-run
```

## Prerequisites

- Cloudflare API token with `Zone:Read` + `DNS:Edit` on target zones
- Token at `~/.credentials/cloudflare.env` as `CLOUDFLARE_API_TOKEN=...`
  (or `~/.credentials/cloudflare-<zone>.env`, or `--api-token` flag, or `CLOUDFLARE_API_TOKEN` env)

## Output

Stdout JSON: `{ ok, action: "noop|created|updated", record, type, content, id, previousContent? }`.

## Typical scheduling (DDNS on systemd timer)

See `Mail Server Setup — example.com hub` under OpenClaw Infrastructure for a worked example using this skill on a 5-minute timer.

See `~/clawd/skills/cloudflare-dns-sync/SKILL.md` for full flag reference.
