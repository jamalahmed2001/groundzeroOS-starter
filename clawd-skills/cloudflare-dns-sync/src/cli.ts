/**
 * cloudflare-dns-sync — idempotent Cloudflare DNS record updater.
 *
 * Typical use: keep an A record pointed at the current public IP of a
 * dynamic-IP host (Virgin Media, mobile broadband, etc.) so services like
 * self-hosted mail servers stay reachable.
 *
 * Idempotent: if the record already matches the desired value, does nothing.
 */

import { readFile } from 'fs/promises';

function fail(msg: string, code = 1): never {
  process.stderr.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  process.exit(code);
}

interface Args {
  zone: string;           // e.g. example.com
  record: string;         // e.g. mail.example.com
  recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT';
  content?: string;       // explicit value (if missing for A/AAAA, auto-detect public IP)
  ttl: number;            // seconds; 1 = automatic
  proxied: boolean;       // Cloudflare orange-cloud proxy (MX/TXT/SSH: false)
  priority?: number;      // MX only
  apiToken?: string;      // override; else read from env/credentials
  credFile?: string;      // path to creds env file
  dryRun: boolean;
}

const HELP = `cloudflare-dns-sync — idempotent Cloudflare DNS record updater

Usage:
  cloudflare-dns-sync --zone <zone> --record <fqdn> [--type A] [--content <value>] [flags]

Common uses:
  # Dynamic IP: point mail.example.com at the current public IP (auto-detect).
  cloudflare-dns-sync --zone example.com --record mail.example.com --type A

  # Static MX: point example.com MX at mail.example.com with priority 10.
  cloudflare-dns-sync --zone example.com --record example.com --type MX \\
    --content mail.example.com --priority 10 --no-proxied

  # TXT (SPF): set a strict SPF record.
  cloudflare-dns-sync --zone example.com --record example.com --type TXT \\
    --content "v=spf1 mx -all" --no-proxied

Flags:
  --zone <str>         Zone name, e.g. example.com (required)
  --record <str>       Full record name, e.g. mail.example.com (required)
  --type <A|AAAA|CNAME|MX|TXT>   Defaults to A
  --content <str>      Record value. If omitted for A/AAAA, auto-detect public IP.
  --ttl <n>            TTL in seconds. 1 = Cloudflare automatic. Default 1.
  --proxied            Enable Cloudflare proxy (orange cloud). Default: no proxy.
  --no-proxied         Explicit disable (default; shown for clarity).
  --priority <n>       MX priority (required for MX).
  --api-token <str>    Cloudflare API token with Zone:Read + DNS:Edit.
                       Or set CLOUDFLARE_API_TOKEN env. Or use --cred-file.
  --cred-file <path>   Dotenv file with CLOUDFLARE_API_TOKEN=...
                       Default: ~/.credentials/cloudflare.env if present.
  --dry-run            Print what would change. Don't call the API.
  --help

Output (stdout JSON):
  { ok: true, action: "noop"|"created"|"updated", record: "...", type: "...", content: "...", id: "..." }
`;

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { recordType: 'A', ttl: 1, proxied: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case '--zone': out.zone = next; i++; break;
      case '--record': out.record = next; i++; break;
      case '--type': out.recordType = next as Args['recordType']; i++; break;
      case '--content': out.content = next; i++; break;
      case '--ttl': out.ttl = Number(next); i++; break;
      case '--priority': out.priority = Number(next); i++; break;
      case '--api-token': out.apiToken = next; i++; break;
      case '--cred-file': out.credFile = next; i++; break;
      case '--proxied': out.proxied = true; break;
      case '--no-proxied': out.proxied = false; break;
      case '--dry-run': out.dryRun = true; break;
      case '--help': case '-h': process.stdout.write(HELP); process.exit(0);
      default:
        if (a.startsWith('--')) fail(`unknown flag '${a}'`);
    }
  }
  if (!out.zone) fail('--zone required');
  if (!out.record) fail('--record required');
  if (out.recordType === 'MX' && out.priority === undefined) fail('--priority required for MX records');
  return out as Args;
}

async function resolveToken(args: Args): Promise<string> {
  if (args.apiToken) return args.apiToken;
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

  const candidates = [
    args.credFile,
    `${process.env.HOME}/.credentials/cloudflare.env`,
    `${process.env.HOME}/.credentials/cloudflare-${args.zone}.env`,
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      const content = await readFile(path, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^CLOUDFLARE_API_TOKEN=(.*)$/);
        if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch { /* next */ }
  }
  fail('no Cloudflare API token — set CLOUDFLARE_API_TOKEN, --api-token, or write ~/.credentials/cloudflare.env');
}

async function getPublicIP(v6 = false): Promise<string> {
  const endpoints = v6
    ? ['https://api6.ipify.org', 'https://ifconfig.co/ip', 'https://api.my-ip.io/ip']
    : ['https://api.ipify.org', 'https://ifconfig.co/ip', 'https://ifconfig.me/ip', 'https://icanhazip.com'];
  let lastErr: unknown;
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) continue;
      const ip = (await resp.text()).trim();
      if (ip && /^[0-9a-f.:]+$/i.test(ip)) return ip;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`could not detect public IP: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

interface CfZone { id: string; name: string }
interface CfRecord { id: string; name: string; type: string; content: string; ttl: number; proxied: boolean; priority?: number }
interface CfResponse<T> { success: boolean; result: T; errors?: Array<{ code: number; message: string }> }

async function cf<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await resp.json() as CfResponse<T>;
  if (!body.success) {
    const msg = body.errors?.map((e) => `[${e.code}] ${e.message}`).join('; ') ?? `HTTP ${resp.status}`;
    throw new Error(`Cloudflare API: ${msg}`);
  }
  return body.result;
}

async function findZoneId(token: string, zoneName: string): Promise<string> {
  const zones = await cf<CfZone[]>(token, `/zones?name=${encodeURIComponent(zoneName)}`);
  if (zones.length === 0) throw new Error(`zone '${zoneName}' not found in Cloudflare account`);
  return zones[0].id;
}

async function findRecord(token: string, zoneId: string, name: string, type: string): Promise<CfRecord | null> {
  const records = await cf<CfRecord[]>(
    token,
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&type=${type}`,
  );
  return records[0] ?? null;
}

function recordMatches(existing: CfRecord, desired: { content: string; ttl: number; proxied: boolean; priority?: number }): boolean {
  if (existing.content !== desired.content) return false;
  if (existing.ttl !== desired.ttl) return false;
  if (existing.proxied !== desired.proxied) return false;
  if (desired.priority !== undefined && existing.priority !== desired.priority) return false;
  return true;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Resolve content.
  let content = args.content;
  if (!content && (args.recordType === 'A' || args.recordType === 'AAAA')) {
    content = await getPublicIP(args.recordType === 'AAAA');
    process.stderr.write(`[ddns] auto-detected public IP: ${content}\n`);
  }
  if (!content) fail(`--content required for type '${args.recordType}'`);

  if (args.dryRun) {
    process.stdout.write(JSON.stringify({
      ok: true, dryRun: true,
      record: args.record, type: args.recordType, content,
      ttl: args.ttl, proxied: args.proxied, priority: args.priority,
    }) + '\n');
    return;
  }

  const token = await resolveToken(args);
  const zoneId = await findZoneId(token, args.zone);
  const existing = await findRecord(token, zoneId, args.record, args.recordType);

  const desired = { content, ttl: args.ttl, proxied: args.proxied, priority: args.priority };

  if (existing && recordMatches(existing, desired)) {
    process.stdout.write(JSON.stringify({
      ok: true, action: 'noop', record: args.record, type: args.recordType,
      content, id: existing.id,
    }) + '\n');
    return;
  }

  const payload: Record<string, unknown> = {
    type: args.recordType,
    name: args.record,
    content,
    ttl: args.ttl,
    proxied: args.proxied,
  };
  if (args.recordType === 'MX' && args.priority !== undefined) payload.priority = args.priority;

  if (existing) {
    const updated = await cf<CfRecord>(token, `/zones/${zoneId}/dns_records/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    process.stdout.write(JSON.stringify({
      ok: true, action: 'updated', record: updated.name, type: updated.type,
      content: updated.content, id: updated.id,
      previousContent: existing.content,
    }) + '\n');
    return;
  }

  const created = await cf<CfRecord>(token, `/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  process.stdout.write(JSON.stringify({
    ok: true, action: 'created', record: created.name, type: created.type,
    content: created.content, id: created.id,
  }) + '\n');
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
