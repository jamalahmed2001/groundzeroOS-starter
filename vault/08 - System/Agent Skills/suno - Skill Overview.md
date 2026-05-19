---
tags:
  - status-active
  - system
  - skill-doc
graph_domain: system
status: active
skill_name: suno
source_skill_path: ~/clawd/skills/suno/SKILL.md
updated: 2026-05-04T08:33:08Z
up: "[[Skills Hub]]"
---
## 🔗 Navigation

- [[Agent Skills Hub|Agent Skills]]

# suno

> API-shaped CLI for Suno (music generation). Full-library walk, track download, new-track generation, and grouped analytics across persona / model / gen_type / is_public. Drives the signed-in web UI via browser-automate CDP — no paid gateways, no unofficial API keys.

## When a directive should call this

- Generating a backing soundbed or album track under the user's paid Suno Pro subscription
- Listing or downloading previously-generated tracks
- Any "music from prompt" workflow

## When NOT to call this

- Voice / speech synthesis → `elevenlabs-tts`
- Sound effects → use an SFX library directly
- High-volume batch generation — Suno caps per-account; this is one-account work

## How to call it

```bash
# Full-library walk — paginates /api/feed/v2 (0-indexed) via captured bearer; 429 backoff.
# Auto-enriches persona_name; workspace_name filled when --workspace is passed.
suno library [--workspace <id>|default] [--limit 9999] [--since <iso>] [--public-only|--private-only] [--skip-names] [--output tracks.json]

# Workspaces (Suno calls them "projects" internally) with names + clip counts.
suno workspaces [--output ws.json]

# Personas (custom voices) with names.
suno personas [--output personas.json]

suno track --id <uuid>

suno download --id <uuid> --output ./track.mp3 [--with-cover] [--with-metadata]

# Grouped summary — by persona / workspace / project / model / gen_type / user / is_public.
# Uses resolved names when available (via library enrichment), else UUIDs.
suno groups --by persona [--library ./tracks.json] [--output grouped.json] [--min-count 2]

# Move one or more tracks into a workspace. Endpoint: POST /api/project/<src>/clips.
# --from-workspace defaults to 'default' — server figures the real source out from clip_ids.
suno move --track <uuid> --workspace <target-id>
suno move --tracks <uuid1>,<uuid2> --workspace <target-id> [--from-workspace <src-id>] [--dry-run]

# Generate — full surface (direct API: POST /api/generate/v2-web/)
# Default task=vox (lyrics sung). Always returns 2 takes (Suno default).
suno generate \
  --prompt "<lyrics>" \
  --style "<tags>" \
  --title "<optional>" \
  [--model chirp-fenix|chirp-auk|chirp-crow|chirp-v4|chirp-v3] \
  [--persona <uuid> | --persona-name "<name>"] \
  [--workspace <id> | --workspace-name "<name>"] \
  [--instrumental | --vocal] \
  [--negative-tags "<tags>"] \
  [--cover-clip <clip-id> | --continue-clip <clip-id> [--continue-at <sec>]] \
  [--output-dir ./out/] \
  [--dry-run]

# Example — vocal R&B track in a specific persona's voice, auto-move into the Smoke & Tide workspace
suno generate \
  --prompt "Walking home in the rain, thinking of you" \
  --style "neo-soul, 88 BPM, rhodes, warm" \
  --persona-name "Rasta" \
  --workspace-name "Smoke & Tide" \
  --output-dir ./out/

# Create / delete / rename a workspace on Suno
suno create-workspace --name "My New Album" [--description "..."]
suno delete-workspace --workspace <id>    # POST /api/project/trash

# Rename a track (preserves lyrics, caption, cover flags — only title changes)
suno rename-track --track <uuid> --title "New Title"
```

### Track metadata fields

Each track in `library` output has: `id`, `title`, `created_at`, `duration`, `tags`, `is_public`, `audio_url`, `image_url`, `workspace_id`, `workspace_name`, `persona_id`, `persona_name`, `project_id`, `user_id`, `model` (e.g. `chirp-fenix`, `chirp-crow`), `gen_type` (`gen` / `upload` / `edit_v3_export`), `prompt`, `parent_id`, `is_liked`.

### Endpoint cheat-sheet (for recipe maintenance)

- **Feed (global):** `GET https://studio-api-prod.suno.com/api/feed/v2?page=N` (0-indexed) → `{clips, num_total_results, has_more}`
- **Project (workspace):** `GET https://studio-api-prod.suno.com/api/project/<id>?page=N` (1-indexed!) → `{project_clips: [{clip}], clip_count}`
- **Workspaces list:** `GET /api/project/me?page=N&sort=max_created_at_last_updated_clip`
- **Personas list:** `GET /api/persona/get-personas/?page=N`
- **Playlists list:** `GET /api/playlist/me?page=N`
- **Clip detail:** `GET /api/clips/get_songs_by_ids?ids=<uuid>&ids=<uuid>...`
- **Move tracks into workspace:** `POST /api/project/<src-id>/clips` with body `{"update_type":"move","metadata":{"clip_ids":[...], "target_project_id":"<dest-id>"}}` — valid `update_type` literals: `add | remove | move | pinned`
- **Create workspace:** `POST /api/project` body `{name, description}` → returns `{id, ...}`
- **Trash workspace:** `POST /api/project/trash` body `{project_id}` → 204
- **Rename track (set metadata):** `POST /api/gen/<clip-id>/set_metadata/` body `{title, lyrics, caption, caption_mentions, remove_image_cover, remove_video_cover}` — must preserve lyrics or they blank
- **Generate track:** `POST /api/generate/v2-web/` body `{task: "vox"|"instrumental", prompt, tags, title, mv, persona_id, continue_clip_id, cover_clip_id, make_instrumental, override_fields, transaction_uuid, metadata: {...}}` → returns `{id: task-id, clips: [{id, status: "submitted"}, ...]}`
- **Poll clip status:** `POST /api/feed/v3` body `{filters: {ids: {presence: "True", clipIds: [...]}}, limit}` → statuses: `submitted → queued → streaming → complete | error`

Host is `studio-api-prod.suno.com` (hyphen, not dot).

### Known gaps (roadmap)

- **Rename workspace** endpoint not discovered (all PATCH/PUT variants on `/project/<id>` return 405). Workaround: create new + move tracks + trash old.
- **Delete / trash individual track** not yet sniffed — probably the same `POST /api/project/<ws>/clips` with `update_type: "remove"`.

### Captcha bypass (Cloudflare Turnstile on generate)

Suno wraps `POST /api/generate/v2-web/` in Cloudflare Turnstile. When the body's `token` field is `null` or stale, the endpoint returns `422 {"detail":"Token validation failed."}`.

The skill auto-resolves this transparently:

1. On 422 Token validation failed, it invokes [[captcha-solve - Skill Overview|captcha-solve]] with the known generate sitekey (`0x4AAAAAABd64Cd9aq5C--VE`, extracted from `_next/static/chunks/42598aa6…js` — constant `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`).
2. 2Captcha returns a Turnstile token (~20-90 s, ~$0.02).
3. The skill re-POSTs the same body with `token: <solved>`.
4. If that still fails, it falls back to the DOM flow (`cmdGenerateDom`).

Disable with `--no-captcha` to go straight to DOM fallback. Requires a 2Captcha account configured in `captcha-solve`:

```bash
captcha-solve account add default --provider 2captcha --field API_KEY=<your-key>
```

Auth / signup uses a DIFFERENT Turnstile sitekey (`0x4AAAAAABtnpJo7aKMs9JLQ` — `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY_AUTH`), not relevant here.

## Prerequisites

- Signed in to `suno.com` in daily Chrome (daemon inherits on first start)
- `browser-automate daemon` running (auto-starts)
- **For captcha auto-solve**: 2Captcha API key configured via `captcha-solve account add default --provider 2captcha --field API_KEY=<key>` (optional — falls back to DOM flow without it)

## Output

Stdout JSON. `library` returns `{ ok, count, tracks }`; `download` returns `{ ok, mp3Path, bytes, metadata? }`; `generate` returns `{ ok, provider, tracks }` with local file paths.

See `~/clawd/skills/suno/SKILL.md` for full flag reference.
