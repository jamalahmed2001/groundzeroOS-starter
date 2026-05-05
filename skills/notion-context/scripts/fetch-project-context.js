#!/usr/bin/env node

/**
 * fetch-project-context.js
 *
 * Fetch project-scoped context from Notion using the official REST API.
 *
 * Usage:
 *   NOTION_API_KEY=secret_xxx node fetch-project-context.js \
 *     --project-name "AI Notes v2" \
 *     --limit 10 \
 *     --output /tmp/notion-context-ai-notes-v2.json
 */

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const NOTION_API = "https://api.notion.com/v1/search";
const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";

async function fetchNotion(query, limit) {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error("[notion-context] ERROR: NOTION_API_KEY is not set");
    process.exit(1);
  }

  const maxResults = limit || parseInt(process.env.NOTION_MAX_RESULTS || "10", 10) || 10;

  const body = {
    query,
    filter: { value: "page", property: "object" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: maxResults,
  };

  let res;
  try {
    res = await fetch(NOTION_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[notion-context] Network error: ${err.message}`);
    process.exit(2);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`[notion-context] HTTP ${res.status}: ${text}`);
    process.exit(2);
  }

  const json = await res.json();
  return json.results || [];
}

function extractTitle(notionPage) {
  const titleProp = notionPage.properties?.Name || notionPage.properties?.title;
  const rich = titleProp?.title || titleProp?.rich_text || [];
  const plain = rich.map((r) => r.plain_text || "").join("");
  return plain || notionPage.id;
}

function extractSummary(notionPage) {
  // We don't fetch full block data here; summary is limited to the title for now.
  // This can be upgraded later to call the blocks endpoint if needed.
  return extractTitle(notionPage);
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        "project-name": { type: "string" },
        limit: { type: "string" },
        output: { type: "string" },
      },
      strict: false,
    }));
  } catch (err) {
    console.error(`[notion-context] Arg parse error: ${err.message}`);
    process.exit(1);
  }

  const projectName = values["project-name"];
  if (!projectName) {
    console.error("[notion-context] ERROR: --project-name is required");
    process.exit(1);
  }

  const limit = values.limit ? parseInt(values.limit, 10) : undefined;

  const filterString = process.env.NOTION_SEARCH_FILTER || "";
  const searchQuery = filterString ? `${projectName} ${filterString}` : projectName;

  const results = await fetchNotion(searchQuery, limit);

  const pages = results
    .filter((r) => r.object === "page")
    .map((p) => ({
      id: p.id,
      title: extractTitle(p),
      url: p.url,
      last_edited_time: p.last_edited_time,
      icon: typeof p.icon === "string" ? p.icon : p.icon?.emoji ?? null,
      cover: p.cover?.external?.url || p.cover?.file?.url || null,
      summary: extractSummary(p),
    }));

  const out = {
    project: projectName,
    query: searchQuery,
    pages,
    meta: {
      total: pages.length,
      fetched_at: new Date().toISOString(),
    },
  };

  const json = JSON.stringify(out, null, 2);

  if (values.output) {
    try {
      writeFileSync(values.output, json, "utf8");
      console.error(`[notion-context] Written to ${values.output}`);
    } catch (err) {
      console.error(`[notion-context] Failed to write output file: ${err.message}`);
      process.exit(1);
    }
  } else {
    process.stdout.write(json + "\n");
  }
}

main().catch((err) => {
  console.error(`[notion-context] FATAL: ${err.message}`);
  process.exit(2);
});
