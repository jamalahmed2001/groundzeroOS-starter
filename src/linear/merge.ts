import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { writeFrontmatter } from '../vault/writer.js';
import { setManagedBlock, hasManagedBlock } from '../vault/managedBlocks.js';

/** Find an existing phase note that has a matching linear_issue_id or linear_identifier. */
export function findExistingPhaseByLinearId(phasesDir: string, linearId: string): string | null {
  if (!fs.existsSync(phasesDir)) return null;
  const files = fs.readdirSync(phasesDir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(phasesDir, f), 'utf-8');
      const fm = matter(raw).data as Record<string, unknown>;
      if (fm['linear_issue_id'] === linearId || fm['linear_identifier'] === linearId) {
        return path.join(phasesDir, f);
      }
    } catch { continue; }
  }
  return null;
}

/**
 * Merge Linear data into an existing phase note.
 *
 * Linear wins on:  frontmatter (phase_name, linear_issue_id), ## Overview managed block
 * Vault wins on:   ## Tasks, ## Acceptance Criteria, ## Blockers, ## Human Requirements,
 *                  ## Decisions, and any other human-edited sections
 *
 * The ## Overview section body is wrapped in a managed block on first merge.
 * Subsequent merges overwrite only the managed block content.
 */
export function mergeLinearIntoPhase(
  phaseNotePath: string,
  linearTitle: string,
  linearDescription: string,
  linearId: string,
): void {
  const raw = fs.readFileSync(phaseNotePath, 'utf-8');
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  // 1. Frontmatter — Linear wins on phase_name + issue ids
  const updatedFm: Record<string, unknown> = {
    ...fm,
    phase_name:        linearTitle,
    linear_issue_id:   linearId,
    linear_identifier: linearId, // keep legacy in sync
  };
  writeFrontmatter(phaseNotePath, updatedFm);

  // 2. Body — update the managed block inside ## Overview
  //    Re-read after frontmatter write so we work on current content
  const freshRaw = fs.readFileSync(phaseNotePath, 'utf-8');
  const freshParsed = matter(freshRaw);
  let body = freshParsed.content;

  const descContent = linearDescription.trim() || '_No description provided._';

  if (hasManagedBlock(body, 'linear-overview')) {
    // Block exists — overwrite it in place (vault content outside is untouched)
    body = setManagedBlock(body, 'linear-overview', descContent);
  } else {
    // First time merge — find the ## Overview heading and inject the managed block
    // inside it, replacing any bare text that was there
    const overviewHeadingRe = /^## Overview\s*$/m;
    if (overviewHeadingRe.test(body)) {
      // Replace the section body up to the next heading
      body = body.replace(
        /(## Overview\s*\n)([\s\S]*?)(\n## |\n---|\s*$)/,
        (_match, heading, _oldBody, tail) => {
          const managedBlock = `<!-- GZOS_MANAGED_START:linear-overview -->\n${descContent}\n<!-- GZOS_MANAGED_END:linear-overview -->`;
          return `${heading}${managedBlock}\n${tail}`;
        },
      );
    } else {
      // No ## Overview section — append one with a managed block
      body = `${body.trimEnd()}\n\n## Overview\n\n<!-- GZOS_MANAGED_START:linear-overview -->\n${descContent}\n<!-- GZOS_MANAGED_END:linear-overview -->\n`;
    }
  }

  const newRaw = matter.stringify(body, updatedFm);
  fs.writeFileSync(phaseNotePath, newRaw, 'utf-8');
}
