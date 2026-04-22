---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: suno
source_skill_path: ~/clawd/skills/suno/SKILL.md
updated: 2026-04-19
up: Agent Skills Hub
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

# Sequential two-voice duet via continue-clip — persona A sings part 1,
# persona B extends the chosen take with part 2 lyrics. Each part-B take
# renders the FULL assembled duet audio.
suno duet \
  --prompt-a "<part 1 lyrics>" --prompt-b "<part 2 lyrics>" \
  --persona-a-name "Rasta" --persona-b-name "soulful hip - Female" \
  --style "reggae-soul, 82 bpm, rhodes, warm dub bass" \
  --title "Rising Up (Duet)" \
  [--take 1|2|auto] [--continue-at <seconds>] \
  [--workspace-name "Smoke & Tide"] [--output-dir ./out/] [--dry-run]
```

### Duet flow

1. `POST /api/generate/v2-web/` with persona A + `prompt-a` — 2 takes come back.
2. Poll `/api/feed/v3` until both takes are terminal.
3. Pick one take (default `--take auto` = the longer of the two; override with `--take 1|2`).
4. `POST /api/generate/v2-web/` again, this time with `persona_id = B`, `prompt = prompt-b`, `continue_clip_id = selected_take.id`, `continue_at = selected_take.duration` (or `--continue-at <seconds>` to splice mid-clip). Returns 2 continuation takes.
5. Each completed part-B clip contains the full assembled duet audio — downloaded to `--output-dir` and/or moved into `--workspace`.

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

## Prerequisites

- Signed in to `suno.com` in daily Chrome (daemon inherits on first start)
- `browser-automate daemon` running (auto-starts)

## Output

Stdout JSON. `library` returns `{ ok, count, tracks }`; `download` returns `{ ok, mp3Path, bytes, metadata? }`; `generate` returns `{ ok, provider, tracks }` with local file paths.

See `~/clawd/skills/suno/SKILL.md` for full flag reference.
