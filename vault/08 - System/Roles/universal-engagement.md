---
title: Universal Engagement Directive
type: directive
version: 1.0
applies_to: [engagement, community, general]
tags: [directive, engagement, community, cross-project]
up: "[[Roles Hub]]"
---

## 🔗 Navigation

**UP:** [[08 - System/Agent Directives/Agent Directives Hub.md|Agent Directives Hub]]

# Universal Engagement Directive

> **Functions:** Fetch comments from a published video, filter them through a project-specific safety rulepack, generate reply suggestions, and post approved replies. Every creator-project — Example Podcast (medical-safety rules), Example Cartoon Series (copyright rules), Suno Albums (community rules) — uses the same mechanical pipeline with a different rulepack file.

This directive captures the **mechanical** engagement pipeline: fetch → filter → suggest → post. Which replies get approved and what voice they use are project decisions, made via the project's safety rulepack and voice doc — not by this directive.

---

## When this directive is used

Set on a phase: `directive: universal-engagement`

Used on phases that:
- Read recent comments from a YouTube video, TikTok post, or Instagram reel
- Triage comments for safety issues (medical advice, hate speech, PII, spam)
- Draft reply suggestions for human approval
- Post approved replies after an operator sign-off phase

**Not appropriate for:**
- Community management at scale (brand reputation, crisis response) — human domain
- Cross-platform unified inbox — this directive handles one platform per call
- Follower outreach (DMs / cold engagement) — explicit separate directive needed, higher-risk

---

## What you read first

1. **Project Overview** — the voice rules, audience, and what topics are off-limits
2. **Project Safety Rulepack** — the rule file the filter uses. Path is project-specific; the phase should name it. Format: JSON with `{medical_advice_patterns, pii_patterns, blocklist, allowlist, max_length}`.
3. **The phase file** — the platform, video/post ID, and how many comments to fetch
4. **Shared skill docs**:
   - [[youtube-comments - Skill Overview|youtube-comments]] (when built)
   - [[comment-safety-filter - Skill Overview|comment-safety-filter]] (when built)

---

## Functions this agent executes

### 1. Fetch comments from the source platform

```bash
~/clawd/skills/youtube-comments/bin/youtube-comments \
  --account-ref <project-account-ref> \
  --video-id <YT video id> \
  --max 50 \
  --since <ISO timestamp — defaults to last-run> \
  --output comments.json
```

Emits `comments.json` — array of `{id, author, text, timestamp, parent_id}`.

### 2. Filter through the project safety rulepack

```bash
~/clawd/skills/comment-safety-filter/bin/comment-safety-filter \
  --input comments.json \
  --rulepack <path to project's rulepack.json> \
  --output triaged.json
```

Every comment gets a `safety: {passed, reasons[]}` block added. Comments that fail the filter are **excluded** from the reply-suggestion queue.

### 3. Draft reply suggestions (agent reasoning — not a skill)

- Read `triaged.json`
- For each passing comment, draft a reply consistent with the project's voice doc
- Run the draft *itself* through the safety filter (a reply can be just as unsafe as a comment)
- Write an approval queue file: `approval/<episode-id>-replies.json`

### 4. Post approved replies (after a human approval phase)

```bash
~/clawd/skills/youtube-comments/bin/youtube-comments \
  --account-ref <project-account-ref> \
  --post-reply \
  --comment-id <parent> \
  --text "<approved reply text>"
```

- Only post replies whose `approved: true` flag was set by a human in the approval phase.
- Record each posted reply's `reply_id` back in the queue file.

---

## Credentials

Same pattern as `universal-publisher` — `~/.credentials/youtube-<account-ref>.env` etc. Never write tokens to any vault file.

---

## Error handling

| `error` | Meaning | Action |
|---|---|---|
| `config` | Missing rulepack, video ID, or creds | Block |
| `auth` | Expired/revoked OAuth token | Block — refresh creds |
| `quota` | Daily API quota exhausted | Block — retry tomorrow |
| `rate_limit` | 429 | Back off, retry after 1h |
| `policy` | Platform refused the reply (spam-filter heuristic) | Block — operator review |
| `upstream` | 5xx | Retry once, then block |

---

## Data access

| Resource | Setup | What it provides |
|---|---|---|
| YouTube Data API v3 | `~/.credentials/youtube-<ref>.env` | Comment list + reply post |
| TikTok engagement API | `~/.credentials/tiktok-<ref>.env` (when available) | Currently read-only; reply skill TBD |
| Project rulepack JSON | Per-project path in phase frontmatter | Safety patterns applied per-project |

---

## Output

**Write back to the phase file:**

- `## Comments fetched` — count, platform, since-timestamp
- `## Safety filter results` — counts for passed / blocked (and top reasons for blocked)
- `## Reply queue` — path to the approval queue file
- After the approval-phase round trip: `## Replies posted` with each `reply_id` and `parent_id`

**Rulepack format (canonical):**

```json
{
  "medical_advice_patterns": [{ "pattern": "\\byou should take\\b", "label": "direct medication instruction" }],
  "pii_patterns": [{ "pattern": "[\\w.+-]+@[\\w.-]+\\.\\w{2,}", "label": "email" }],
  "blocklist": ["<exact phrase>"],
  "allowlist": ["<exact phrase>"],
  "max_length": 500
}
```

Projects author their own rulepack. Example Podcast's medical-advice list goes in the Example Podcast project dir; Example Cartoon Series ships copyright-phrase patterns; and so on.

---

## Human handoff — when to block

Block and write `## Human Requirements` when:
- The project's rulepack path doesn't resolve (phase misconfigured)
- A reply draft repeatedly fails the safety filter for the same comment (operator needs to see it)
- A comment includes a direct mention of a medical emergency, self-harm, or legal threat — escalate to human review immediately, do not attempt a reply

Clean run: `<!-- None — phase completed successfully -->`.

---

## Must not do

- Post a reply that hasn't been through an approval phase. No "auto-posting" even for safe-looking drafts.
- Reply to a comment that failed the safety filter.
- Use a different rulepack than the phase specifies — projects pick their own rules.
- Write safety patterns directly into this directive. Patterns are project-specific data, not directive logic.
- Skip the self-filter on drafts. The draft must pass the same filter as the incoming comment.
