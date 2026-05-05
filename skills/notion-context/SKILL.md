---
name: notion-context
description: Fetch project-scoped context from Notion using the official REST API for use in <workplace>ProjectSync and other orchestrators.
version: 0.1.0
author: <the-author>
metadata:
  clawdbot:
    emoji: 🧱
    requires: [curl, jq]
---

# Notion Context Skill

Fetch structured project context from Notion using the official REST API so orchestrators (e.g. **<workplace>ProjectSync**) can enrich phase roadmaps and knowledge nodes.

## When to Use

- When syncing or atomizing a **<workplace> project** (or any project) and you want additional context from Notion:
  - Product briefs
  - Design specs
  - Implementation notes
  - Checklists or acceptance criteria
- When building/updating vault knowledge nodes and you want to add outbound links to relevant Notion pages.

## Configuration

Create an `.env` for this skill at:

```text
~/clawd/skills/notion-context/.env
```

with at least:

```env
NOTION_API_KEY=secret_xxx              # Notion integration token
NOTION_SEARCH_FILTER=<workplace>            # Optional: string to filter search results
NOTION_MAX_RESULTS=10                  # Optional: cap number of pages per query (default 10)
```

**Permissions:**
- Create a Notion integration in your workspace.
- Share the relevant pages/databases with that integration.
- Use the integration token as `NOTION_API_KEY`.

## API Basics

This skill uses the official Notion REST API:

- Base URL: `https://api.notion.com/v1`
- Version header: `Notion-Version: 2022-06-28` (or newer)
- Auth header: `Authorization: Bearer ${NOTION_API_KEY}`

Primary endpoint used:

```http
POST https://api.notion.com/v1/search
Content-Type: application/json
Authorization: Bearer ${NOTION_API_KEY}
Notion-Version: 2022-06-28

{
  "query": "AI Notes v2",
  "filter": { "value": "page", "property": "object" },
  "sort": { "direction": "descending", "timestamp": "last_edited_time" }
}
```

The script normalizes results to a compact JSON shape suitable for feeding into **project-atomizer** and **vault-graph-builder**.

## CLI Usage

Main script:

```bash
node ~/clawd/skills/notion-context/scripts/fetch-project-context.js \
  --project-name "AI Notes v2" \
  --output /tmp/notion-context-ai-notes-v2.json
```

Flags:
- `--project-name` (required): Name of the project (e.g. Linear project name) to search for.
- `--limit` (optional): Max pages to return (defaults to `NOTION_MAX_RESULTS` or 10).
- `--output` (optional): File path to write JSON to. If omitted, JSON is printed to stdout.

Exit codes:
- `0` — success
- `1` — missing env or invalid args
- `2` — Notion API/network error

## Output Shape

The script returns JSON like:

```json
{
  "project": "AI Notes v2",
  "query": "AI Notes v2",
  "pages": [
    {
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "title": "AI Notes v2 – Design Spec",
      "url": "https://www.notion.so/...",
      "last_edited_time": "2026-03-18T12:34:56.000Z",
      "icon": "📝",
      "cover": null,
      "summary": "Short plain-text preview of the page (first few lines)."
    }
  ],
  "meta": {
    "total": 1,
    "fetched_at": "2026-03-18T12:35:00.000Z"
  }
}
```

**Notes:**
- `summary` is derived from the first few non-empty text blocks if available.
- The skill does **not** fetch entire page bodies; it provides enough signal to:
  - Link out from vault knowledge nodes.
  - Help atomizer name/refine phases.

## Integration with <workplace>ProjectSync

To use this skill inside `fanvue-sync.js`:

1. Add a script reference in the orchestrator:

   ```js
   const SCRIPT = {
     fetchLinear:  ...,
     atomize:      ...,
     buildVault:   ...,
     applyPlan:    ...,
     notionCtx:    resolve(SKILLS, "notion-context/scripts/fetch-project-context.js"),
   };
   ```

2. After `linear-fetch` (once the project is known), call the Notion skill:

   ```js
   // After selecting `project`
   const notionArgs = ["--project-name", project.name];
   const notionResult = runScript(SCRIPT.notionCtx, notionArgs);

   let notionContext = null;
   if (notionResult.ok && notionResult.stdout) {
     try {
       notionContext = JSON.parse(notionResult.stdout);
     } catch {
       console.error("[fanvue-sync] WARN: failed to parse Notion context JSON");
     }
   }
   ```

3. Attach the context to the roadmap **before** atomization (or pass it alongside):

   - Option A: Modify `atomize-project` to accept Notion context via stdin/flags.
   - Option B (simpler): Store separately and only use it in **vault-graph-builder** to add Notion links into the Knowledge node.

Example: in `buildKnowledge`, if `rm.metadata.notion.pages.length > 0`, append a section:

```markdown
## 📎 External Docs (Notion)

- [AI Notes v2 – Design Spec](https://www.notion.so/...)
- [...]
```

## Safety / Limits

- The skill only **reads** from Notion via the REST API.
- It never writes, updates, or deletes Notion content.
- It respects `NOTION_MAX_RESULTS` and uses a single `search` call per invocation (no heavy crawling).

This keeps Notion integration simple, robust, and safe to call inside automation pipelines.
