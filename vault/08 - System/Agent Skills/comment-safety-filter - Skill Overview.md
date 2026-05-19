---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: comment-safety-filter
source_skill_path: ~/clawd/skills/comment-safety-filter/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# comment-safety-filter

> Apply a project-specific safety rulepack (medical-advice, PII, blocklist, length) to an array of items with `.text` fields. Stateless — projects author their own rulepack JSON.

## When a directive should call this

- Triaging incoming comments before showing them to the reply-drafting step
- Filtering outgoing reply drafts through the **same** rulepack before posting (a reply can be just as unsafe as a comment)
- Any project-specific moderation gate that needs consistent semantics across projects

## When NOT to call this

- Content moderation at ingestion into a CMS — build a proper moderation pipeline
- Semantic toxicity detection — this is a regex-based filter, not an ML classifier
- Sentiment analysis — different problem

## How to call it

```bash
~/clawd/skills/comment-safety-filter/bin/comment-safety-filter \
  --input comments.json \
  --rulepack rules/example-podcast-safety.json \
  --output triaged.json
```

Each item gets a `safety: {passed, reasons[]}` block added. Empty reasons = safe.

## Credentials

None — stateless filter.

## Currently used by

| Project | Directive | What it filters |
|---|---|---|
| Example Podcast | `universal-engagement` | Incoming comments + outgoing replies (same rulepack) |
| Example Cartoon Series | `cartoon-engagement-manager` (when wired) | Same pattern, different rulepack |

## Rulepack authoring

Projects own their rulepack files. Store in the project repo or vault under project-specific paths. The skill itself is agnostic.

**Example Podcast** example patterns (medical context):
- `\\byou should take\\b` — direct medication instruction
- `\\bdosage\\b` — dosage reference
- `\\bconsult (a|your) doctor\\b` — medical referral advice

**Example Cartoon Series** would use a different pack (copyright claim phrases, etc.).

## See also

- [[youtube-comments - Skill Overview|youtube-comments]] — upstream source of comments
