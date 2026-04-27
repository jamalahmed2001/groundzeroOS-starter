---
name: publishing
type: profile
version: 1.0
required_fields:
  - target_platforms
  - scheduled_publish_at
phase_fields:
  - publish_target
  - publish_status
init_docs:
  - Distribution Config
tags: [onyx-profile]
up: Profiles Hub
allowed_shell:
  - ls
  - test
  - grep
  - cat
  - mkdir
  - find
  - which
  - bun
  - node
  - npm
denied_shell:
  - rm
  - mv
  - cp
  - dd
  - mkfs
  - chmod
  - chown
  - sudo
---
## 🔗 Navigation

**UP:** [[08 - System/Profiles/Profiles Hub.md|Profiles Hub]]

# Profile: publishing

> For phases that ship a finished artefact to one or more platforms — uploading, scheduling, posting, monitoring early signals. The artefact already exists; the publishing phase moves it from "produced" to "live".

This profile is usually a *late phase* of a content / video / audio project, not a standalone project. The earlier phases produce the artefact; phases on this profile push it out.

---

## When to use this profile

- A phase calls `youtube-publish`, `tiktok-publish`, `instagram-publish`, `spotify-creators`, `music-distro`, or `rss-publish`.
- A phase posts to social platforms via browser automation.
- A phase generates per-platform metadata (titles / descriptions / tags / thumbnails) and queues them for upload.
- A phase fans out a single artefact to multiple platforms with platform-specific settings.

For comment / reply / engagement work that happens *after* publish, see the engagement-manager directive on the same profile.

---

## Required Overview / phase fields

```yaml
profile: publishing
target_platforms: [youtube, tiktok, spotify-podcasts]   # which platforms to fan out to
scheduled_publish_at: 2026-04-30T08:00:00Z              # null for "publish on phase complete"
```

Per-phase:

```yaml
publish_target: youtube                                 # one of target_platforms; one phase per platform
publish_status: queued | uploading | scheduled | live | blocked
```

---

## Acceptance gate

Before a publishing phase transitions to `completed`:

1. **Live verified.** The published resource is reachable at the URL the platform returned (don't trust the upload API's 200 — fetch the URL and confirm).
2. **Metadata correct.** Title, description, tags, scheduling all match the artefact's `## Metadata` section's row for this platform.
3. **No paid-action auto-submission.** Music distributor releases, paid promotions, anything that costs money — the phase records the wizard left at the review step and surfaces a `pending operator confirm` blocker. The operator clicks Confirm; only then does the phase complete.
4. **Publish ledger updated.** The artefact note's `## Publish Ledger` table gains a row for this platform with URL / ID / timestamp.

---

## Bundle structure

Publishing usually doesn't get its own bundle — phases on this profile sit inside the artefact's existing bundle (`Episodes/E01/Phases/E01 - Publish.md`).

When publishing *is* a standalone project (rare — e.g. a back-catalogue rollout campaign), the bundle is:

```
01 - Projects/<Campaign>/
├── <Campaign> - Overview.md
├── <Campaign> - Knowledge.md
├── Phases/
│   └── P<N> - Publish <artefact-name> to <platform>.md
└── Logs/
```

---

## Default directives

| Phase shape | Default directive |
|---|---|
| Metadata curation | [[08 - System/Agent Directives/metadata-curator.md\|metadata-curator]] |
| Launch day fan-out | [[08 - System/Agent Directives/launch-ops.md\|launch-ops]] |
| Post-publish engagement | [[08 - System/Agent Directives/engagement-manager.md\|engagement-manager]] |
| Analytics post-mortem | analyst (project-specific or `data-analyst` directive) |

---

## Skills the profile expects on PATH

- `youtube-publish` — YouTube videos / shorts
- `tiktok-publish` — TikTok videos
- `instagram-publish` — Instagram Reels / posts
- `spotify-creators` — Spotify for Creators podcast episodes
- `music-distro` — distributor releases (always stops at review step)
- `rss-publish` — podcast RSS feed regeneration
- `analytics-pull` — post-publish metrics
- `comment-safety-filter` — for engagement triage
- `browser-automate` — for any platform without a dedicated publish skill (CDP-attached recipe)

---

## Forbidden patterns at the profile level

- Auto-clicking the final "Confirm & Distribute" / "Confirm & Pay" button on any paid action.
- Posting outside `scheduled_publish_at`'s window (early or late).
- Using a different account than the project's distribution config declares.
- Treating a 200 from an upload API as proof of live — verify by fetching the resource URL.
