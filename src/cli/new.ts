// new.ts — onyx new directive / onyx new profile
//
// onyx new directive <name> [--project <project>]   scaffold a directive stub
// onyx new profile <name>                           scaffold a profile stub

import { loadConfig } from '../config/load.js';
import { discoverAllPhases } from '../vault/discover.js';
import { matchProject } from './phase-ops.js';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function titleCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// onyx new directive <name> [--project <name>]
// ---------------------------------------------------------------------------

const DIRECTIVE_TEMPLATE = (name: string) => `---
title: ${titleCase(name)} Directive
type: directive
version: 1.0
---

# ${titleCase(name)} Directive

> **Functions:** [One sentence — what mechanical, data-driven work this agent performs.]
> This directive captures what is executable without human judgment, not a full professional simulation.

## What you read first
1. Project Overview.md — scope and constraints
2. [Domain context doc, e.g. Source Context / Research Brief / Strategy Context]
3. Project Knowledge.md — prior phase learnings
4. The phase file — what to do this phase

## Functions this agent executes
- [Specific, concrete, executable action]
- [Another action — keep these verifiable, not aspirational]

## Data access
| Source | Setup | What it provides |
|---|---|---|
| [Free API / curl] | None | [Description] |
| [Keyed API] | \`ENV_VAR\` in \`.env\` | [Description] |
| [Build script] | \`pnpm run script\` | [Description] |

*No data sources needed? Work from bundle documents only.*
*See [[08 - System/ONYX Integrations.md]] for available integrations by domain.*

## Output
- **Deliverable:** [What file or document is produced]
- **Location:** [Where in the bundle it goes]
- **Format:** [Markdown / JSON / CSV / other]

## Human handoff — when to block
Block and write \`## Human Requirements\` when:
- [Any judgment call that requires expertise beyond mechanical execution]
- [Any decision that carries professional liability]

## Must not do
- [Hard constraint — something this directive never does]
- [Never produce output that simulates professional advice (legal, medical, financial)]
`;

export async function runNewDirective(name: string, projectName?: string): Promise<void> {
  const config = loadConfig();

  let targetPath: string;

  if (projectName) {
    // Project-local: <bundle>/Directives/<name>.md
    const allPhases = discoverAllPhases(config.vaultRoot, config.projectsGlob);
    const projectPhases = matchProject(allPhases, projectName);
    if (!projectPhases) return;

    const bundleDir = path.dirname(path.dirname(projectPhases.phases[0]!.path));
    const directivesDir = path.join(bundleDir, 'Directives');
    fs.mkdirSync(directivesDir, { recursive: true });
    targetPath = path.join(directivesDir, `${name}.md`);
  } else {
    // System-level: 08 - System/Agent Directives/<name>.md
    targetPath = path.join(config.vaultRoot, '08 - System', 'Agent Directives', `${name}.md`);
  }

  if (fs.existsSync(targetPath)) {
    console.error(`[onyx] Directive already exists: ${targetPath}`);
    console.log('  Edit it directly, or use a different name.');
    return;
  }

  fs.writeFileSync(targetPath, DIRECTIVE_TEMPLATE(name), 'utf-8');

  const scope = projectName ? `project-local (${projectName})` : 'system-level';
  console.log(`[onyx] Created ${scope} directive: ${path.basename(targetPath)}`);
  console.log(`  → ${targetPath}`);

  if (!projectName) {
    console.log('  To use: add  directive: ' + name + '  to any phase frontmatter.');
    console.log('  To use project-locally: onyx new directive ' + name + ' --project "My Project"');
  } else {
    console.log('  To use: add  directive: ' + name + '  to a phase frontmatter in this project.');
  }
  console.log('  See: 08 - System/Agent Directives/Agent Directives Hub.md for the template guide.');
}

// ---------------------------------------------------------------------------
// onyx new profile <name>
// ---------------------------------------------------------------------------

const PROFILE_TEMPLATE = (name: string) => `---
title: ${titleCase(name)} Profile
type: profile
version: 1.0
required_fields:
  - TODO_required_field_1
init_docs:
  - TODO Context Doc
---

# ${titleCase(name)} Profile

> **Domain:** [One sentence — what kind of work this profile handles.]
> **When to use:** [Specific scenario where this profile applies instead of \`general\`.]

## Required fields (Overview.md must have these)

\`\`\`yaml
# Add to your project Overview.md frontmatter:
TODO_required_field_1: ""   # [description of what goes here]
\`\`\`

## Bundle structure

\`onyx init\` creates these files for this profile:

| File | Purpose |
|---|---|
| \`[Project] - Overview.md\` | Goals, scope, required fields |
| \`[Project] - TODO Context Doc.md\` | [Domain-specific context — rename this] |
| \`[Project] - Knowledge.md\` | Accumulated learnings (auto-maintained) |
| \`[Project]/Phases/\` | Phase files |
| \`[Project]/Logs/\` | Execution logs |

## Artifact flow

| Artifact | Produced by | Consumed by | Notes |
|---|---|---|---|
| \`[Project] - TODO Context Doc.md\` | P1 Bootstrap | All phases | [What this doc contains and why every agent needs it] |
| Phase output | Each phase | Next phase or human | [What form does output take? Where does it go?] |
| \`Knowledge.md\` | Every phase | Every subsequent phase | Accumulated learnings. Append only. |

## State transitions

| Transition | Trigger | Gate |
|---|---|---|
| \`backlog → ready\` | Human sets \`phase-ready\` tag | — |
| \`ready → active\` | ONYX dispatches agent | All \`depends_on\` phases completed |
| \`active → completed\` | Agent finishes tasks | [Domain-specific: what must be true for the phase to be done] |
| \`active → blocked\` | Agent cannot proceed | \`## Human Requirements\` written with specific ask |
| \`blocked → ready\` | Human resolves | \`onyx reset "<project>" <phase>\` |

## Suggested directives

Use these on your phases (set \`directive:\` in phase frontmatter):

| Phase type | Directive |
|---|---|
| [Phase type 1] | \`TODO_directive_name\` |
| [Phase type 2] | \`general\` |

*See [[08 - System/Agent Directives/Agent Directives Hub.md]] for all available directives.*

## Human sign-off required for
- [List any decisions that must have human approval before the phase completes]

---

*Note: after creating this profile, add \`'${name}'\` to the PROFILES array in \`src/cli/init.ts\`
so \`onyx init\` offers it in the profile picker.*
`;

export async function runNewProfile(name: string): Promise<void> {
  const config = loadConfig();
  const targetPath = path.join(config.vaultRoot, '08 - System', 'Profiles', `${name}.md`);

  if (fs.existsSync(targetPath)) {
    console.error(`[onyx] Profile already exists: ${targetPath}`);
    console.log('  Edit it directly, or use a different name.');
    return;
  }

  const profilesDir = path.dirname(targetPath);
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.writeFileSync(targetPath, PROFILE_TEMPLATE(name), 'utf-8');

  console.log(`[onyx] Created profile: ${name}`);
  console.log(`  → ${targetPath}`);
  console.log('  Fill in:');
  console.log('    required_fields — what Overview.md must have');
  console.log('    init_docs — context docs onyx init creates for this profile');
  console.log('    Acceptance gate — domain-specific completion criteria');
  console.log('  Then add "' + name + '" to PROFILES in src/cli/init.ts');
  console.log('  See: 08 - System/ONYX - Reference.md → Extending ONYX');
}
