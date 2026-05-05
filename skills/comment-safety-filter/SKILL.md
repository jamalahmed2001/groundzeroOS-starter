---
name: comment-safety-filter
description: Apply a project-specific safety rulepack (medical-advice, PII, blocklist, length) to an array of items with `.text` fields. Returns each item annotated with a safety block. Use in engagement flows — filter incoming comments AND outgoing reply drafts through the same rulepack.
metadata:
  clawdbot:
    emoji: "🛡️"
    requires: ["node"]
    credentials: "none — stateless filter"
---

# Comment Safety Filter

General-purpose safety filter. Projects author their own rulepack JSON; this skill applies it uniformly — same patterns for incoming comments and outgoing replies.

## Install

```bash
cd ~/clawd/skills/comment-safety-filter
pnpm install
pnpm run build
```

## Usage

```bash
comment-safety-filter \
  --input comments.json \
  --rulepack rules/my-podcast-safety.json \
  --output triaged.json
```

Each item gets a `safety: {passed, reasons[]}` block added. `passed = reasons.length === 0` (empty reasons = safe).

## Rulepack format

```json
{
  "medical_advice_patterns": [
    { "pattern": "\\byou should take\\b", "label": "direct medication instruction" }
  ],
  "pii_patterns": [
    { "pattern": "[\\w.+-]+@[\\w.-]+\\.\\w{2,}", "label": "email" },
    { "pattern": "https?://[^\\s]+", "label": "URL" }
  ],
  "blocklist": ["scam", "crypto rug"],
  "allowlist": ["quoting the paper:"],
  "max_length": 500,
  "flags": "i"
}
```

- **medical_advice_patterns / pii_patterns** — regex sources, tagged with a label that appears in the reason report.
- **blocklist** — exact phrase match, case-insensitive.
- **allowlist** — if any allowlist phrase is found, the item passes unconditionally (useful for quoted-text edge cases).
- **max_length** — hard cap on text length.
- **flags** — regex flags applied to every compiled pattern. Default `i`.

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--input <path>` | **required** | JSON array or `{comments: [...]}` |
| `--rulepack <path>` | **required** | The project's rulepack JSON |
| `--output <path>` | — | Write triaged JSON to this file (otherwise inline in stdout) |

## Error classification

| `error` | Meaning |
|---|---|
| `config` | Missing files, malformed JSON, or invalid regex in rulepack |

## Callers

- Every `universal-engagement` phase — filter incoming comments AND outgoing reply drafts with the same rulepack
- Project-specific engagement directives that want consistent filtering semantics

## See also

- `youtube-comments` — upstream source of comments; same JSON shape as this skill's `--input`
- Vault Overview: `08 - System/Agent Skills/comment-safety-filter - Skill Overview.md`
