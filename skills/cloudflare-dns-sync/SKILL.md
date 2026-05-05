---
name: cloudflare-dns-sync
description: Idempotent Cloudflare DNS record upsert. Keeps A/AAAA records pointed at the current public IP (dynamic DNS), or maintains static MX/TXT/CNAME records. Idempotent — no-op if the record already matches.
metadata:
  clawdbot:
    emoji: "☁️"
    requires: ["node"]
    credentials: "CLOUDFLARE_API_TOKEN env or ~/.credentials/cloudflare.env with Zone:Read + DNS:Edit scopes"
---

# Cloudflare DNS Sync

Generic, idempotent Cloudflare DNS record updater. Most common use: keep a self-hosted mail server or service reachable on a dynamic IP (Virgin Media, mobile broadband) by auto-updating an A record to the current public IP.

## When to use

- **Dynamic DNS (DDNS)** — ISP hands out a changing IP; you want `mail.yourdomain.com` or `home.yourdomain.com` to stay pointed at it.
- **Periodic DNS validation** — confirm MX, SPF, DKIM, DMARC records stay as intended, re-assert if drift is detected.
- **Orchestrated setup** — bring up DNS records as part of a deployment script, idempotently.

## Not when

- You're happy with Cloudflare's dashboard. This is for automation.
- You're using Route 53 / other DNS providers. Wrong skill.

## Install

```bash
cd ~/clawd/skills/cloudflare-dns-sync
pnpm install
pnpm run build
```

## Credentials

Create a Cloudflare API token at https://dash.cloudflare.com/profile/api-tokens with:
- **Zone:Read** on the target zones
- **DNS:Edit** on the target zones

Write it to `~/.credentials/cloudflare.env`:
```
CLOUDFLARE_API_TOKEN=<your-token>
```

Or per-zone: `~/.credentials/cloudflare-<zone>.env` (e.g. `cloudflare-example.com.env`).

Or pass `--api-token <tok>` on the CLI, or set `CLOUDFLARE_API_TOKEN` in the process env.

## Usage

### Dynamic IP for a mail server

```bash
cloudflare-dns-sync \
  --zone example.com \
  --record mail.example.com \
  --type A
# auto-detects current public IP; updates record if changed; no-op if same
```

### Static MX record pointing multiple domains at mail.example.com

```bash
cloudflare-dns-sync \
  --zone example.com \
  --record example.com \
  --type MX \
  --content mail.example.com \
  --priority 10 \
  --no-proxied
```

### TXT record (SPF)

```bash
cloudflare-dns-sync \
  --zone example.com \
  --record example.com \
  --type TXT \
  --content "v=spf1 mx -all"
```

### Dry run — preview the change without making it

```bash
cloudflare-dns-sync --zone example.com --record mail.example.com --type A --dry-run
```

## Output (stdout JSON)

```json
{ "ok": true, "action": "noop", "record": "mail.example.com", "type": "A", "content": "82.46.12.3", "id": "abc..." }
```

Actions:
- `noop` — record already matched; nothing changed
- `updated` — existing record updated; also includes `previousContent`
- `created` — no record existed; new one created

## Scheduling (DDNS)

To run every 5 minutes on a systemd-based Linux host:

```ini
# /etc/systemd/system/ddns-mail.service
[Unit]
Description=Cloudflare DDNS sync for mail.example.com
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=your-user
EnvironmentFile=~/.credentials/cloudflare.env
ExecStart=~/clawd/skills/cloudflare-dns-sync/bin/cloudflare-dns-sync \\
  --zone example.com \\
  --record mail.example.com \\
  --type A

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/ddns-mail.timer
[Unit]
Description=Run Cloudflare DDNS every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
Unit=ddns-mail.service

[Install]
WantedBy=timers.target
```

Activate:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ddns-mail.timer
```

Or as a plain cron entry:
```
*/5 * * * * ~/clawd/skills/cloudflare-dns-sync/bin/cloudflare-dns-sync --zone example.com --record mail.example.com --type A >> /var/log/ddns-mail.log 2>&1
```

## What it does under the hood

1. Resolves the target `content` — either from `--content` or by auto-detecting the current public IP (for A/AAAA).
2. Looks up the zone by name via `GET /zones?name=...`.
3. Looks up the existing record via `GET /zones/{id}/dns_records?name=...&type=...`.
4. Compares `content` / `ttl` / `proxied` / `priority`. If all match → noop.
5. Otherwise: `PUT` to update, or `POST` to create.

IP detection tries (in order): `api.ipify.org`, `ifconfig.co/ip`, `ifconfig.me/ip`, `icanhazip.com`. 5-second timeout each. IPv6 endpoints if `--type AAAA`.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `zone 'X' not found in Cloudflare account` | Token's scope doesn't include that zone | Re-issue token with `Zone:Read` on all target zones |
| `Cloudflare API: [9103] Unknown X-Auth-Key or X-Auth-Email` | Using Global API Key instead of scoped Token | Generate a Token (recommended), update env file |
| `could not detect public IP` | All IP-check endpoints unreachable (firewall / outage) | Retry; check egress; pass explicit `--content` |
| `[9106] Zone Lockdown Rule matched` | Your IP is outside allowed ranges | Add an `IP Access Rules` entry or disable Zone Lockdown |
