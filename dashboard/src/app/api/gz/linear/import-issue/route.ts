import { NextResponse } from 'next/server';
import { getVaultRoot, getAllProjects } from '@/lib/vault';
import { readConfig } from '@/lib/config';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export const dynamic = 'force-dynamic';

async function gql(apiKey: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000),
  });
  return res.json() as Promise<{ data?: Record<string, unknown>; errors?: { message: string }[] }>;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: { name: string };
  children?: { nodes: Array<{ id: string; title: string; description?: string }> };
}

export async function POST(req: Request) {
  const body = await req.json() as {
    issueId: string;
    targetProject?: string; // existing vault project ID, or omit for new
  };

  const cfg = readConfig();
  const linear = cfg.linear as { api_key?: string } | undefined;
  const apiKey = linear?.api_key ?? process.env['LINEAR_API_KEY'] ?? '';
  if (!apiKey) return NextResponse.json({ error: 'Linear API key not configured' }, { status: 400 });

  const vaultRoot = getVaultRoot();

  // Fetch full issue with children
  const issueQuery = `query($id: String!) {
    issue(id: $id) {
      id identifier title description
      state { name }
      team { key name }
      project { id name description }
      children { nodes { id identifier title description state { name } } }
    }
  }`;

  try {
    const json = await gql(apiKey, issueQuery, { id: body.issueId });
    if (json.errors?.length) {
      return NextResponse.json({ error: json.errors[0]!.message }, { status: 502 });
    }

    const issue = (json.data?.issue as LinearIssue | undefined);
    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });

    // Resolve target project
    const projects = getAllProjects(vaultRoot);
    let bundleDir: string;
    let projectName: string;

    if (body.targetProject) {
      const existing = projects.find(p => p.id === body.targetProject);
      if (!existing) return NextResponse.json({ error: `Project "${body.targetProject}" not found` }, { status: 404 });
      bundleDir = path.dirname(path.resolve(vaultRoot, existing.overviewPath));
      projectName = existing.id;
    } else {
      // Create new project from the issue
      projectName = issue.title;
      const projectsBase = (cfg.projects_glob ?? '').replace(/\{.*?\}/, '').replace('/**', '').split(',')[0]?.trim() || '02 - Fanvue';
      bundleDir = path.join(vaultRoot, projectsBase, projectName);
    }

    const phasesDir = path.join(bundleDir, 'Phases');
    const logsDir = path.join(bundleDir, 'Logs');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);

    // Determine next phase number
    let maxPhase = 0;
    if (fs.existsSync(phasesDir)) {
      for (const f of fs.readdirSync(phasesDir)) {
        const m = f.match(/^P(\d+)/i);
        if (m) maxPhase = Math.max(maxPhase, parseInt(m[1]!, 10));
      }
    }
    const phaseNum = maxPhase + 1;

    // Build tasks from sub-issues or use the issue itself
    const children = issue.children?.nodes ?? [];
    const tasks = children.length > 0
      ? children.map(c => `- [ ] ${c.title}`).join('\n')
      : `- [ ] ${issue.title}`;

    const desc = issue.description?.trim() || '_No description._';
    const childSummaries = children.length > 0
      ? '\n\n**Sub-issues:**\n' + children.map(c => `- ${c.title}${c.description ? `: ${c.description.slice(0, 120)}` : ''}`).join('\n')
      : '';

    // Create or update Overview if new project
    const overviewPath = path.join(bundleDir, `${projectName} - Overview.md`);
    if (!fs.existsSync(overviewPath)) {
      const projectDesc = (issue as unknown as { project?: { description?: string } }).project?.description ?? '';
      fs.writeFileSync(overviewPath, `---
project_id: "${projectName}"
project: "${projectName}"
type: overview
status: planning
tags:
  - gz-project
created: ${today}
---
# ${projectName}

## Description

${projectDesc || desc}

## Scope

### ${issue.title} (\`${issue.identifier}\`)

${desc}${childSummaries}

## Source

Imported from Linear issue: \`${issue.identifier}\`
`, 'utf-8');

      // Create Knowledge + Kanban stubs
      fs.writeFileSync(path.join(bundleDir, `${projectName} - Knowledge.md`), `---\nproject: "${projectName}"\ntype: knowledge\n---\n# Knowledge — ${projectName}\n\n## Learnings\n\n## Decisions\n\n## Gotchas\n`, 'utf-8');
      fs.writeFileSync(path.join(bundleDir, `${projectName} - Kanban.md`), `---\nproject: "${projectName}"\ntype: kanban\n---\n# Kanban — ${projectName}\n`, 'utf-8');
    } else {
      // Append to existing Overview's Scope section
      const raw = fs.readFileSync(overviewPath, 'utf-8');
      const scopeEntry = `\n### ${issue.title} (\`${issue.identifier}\`)\n\n${desc}${childSummaries}\n`;
      if (raw.includes('## Scope')) {
        const updated = raw.replace(/(## Scope[\s\S]*?)(\n## |\n---|$)/, `$1${scopeEntry}$2`);
        fs.writeFileSync(overviewPath, updated, 'utf-8');
      } else {
        const parsed = matter(raw);
        const newContent = parsed.content.trimEnd() + `\n\n## Scope\n${scopeEntry}`;
        fs.writeFileSync(overviewPath, matter.stringify(newContent, parsed.data as Record<string, unknown>), 'utf-8');
      }
    }

    // Create phase note
    const phaseName = issue.title;
    fs.writeFileSync(path.join(phasesDir, `P${phaseNum} - ${phaseName}.md`), `---
project_id: "${projectName}"
project: "${projectName}"
phase_number: ${phaseNum}
phase_name: "${phaseName}"
linear_issue_id: "${issue.id}"
linear_identifier: "${issue.identifier}"
status: backlog
locked_by: ""
locked_at: ""
tags:
  - gz-phase
  - phase-backlog
created: ${today}
---
# P${phaseNum} — ${phaseName}

## Summary

${desc}${childSummaries}

## Human Requirements

(none)

## Tasks

${tasks}

## Acceptance Criteria

- [ ] Define acceptance criteria for this phase

## Blockers

(none)
`, 'utf-8');

    // Create log stub
    fs.writeFileSync(path.join(logsDir, `L${phaseNum} - ${phaseName}.md`), `---
tags: [project-log]
project: "${projectName}"
phase_number: ${phaseNum}
phase_name: "${phaseName}"
created: ${today}
---
# L${phaseNum} — ${phaseName}

## Entries

- [${new Date().toISOString()}] **linear_import** — Created from Linear issue \`${issue.identifier}\`
`, 'utf-8');

    return NextResponse.json({
      ok: true,
      project: projectName,
      phase: `P${phaseNum} - ${phaseName}`,
      tasksCount: children.length || 1,
    });
  } catch (err) {
    return NextResponse.json({ error: `Import failed: ${(err as Error).message}` }, { status: 500 });
  }
}
