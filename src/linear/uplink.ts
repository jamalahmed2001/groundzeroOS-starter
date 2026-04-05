import type { ControllerConfig } from '../config/load.js';
import type { VaultBundle } from '../vault/reader.js';
import type { PhaseNode } from '../vault/reader.js';
import { createIssue, updateIssue, getViewerId, getActiveCycleId, findLabelIds, findProjectByName } from './client.js';
import { notify } from '../notify/notify.js';
import { writeFrontmatter, appendToLog } from '../vault/writer.js';
import { stateFromFrontmatter, countTasks } from '../shared/vault-parse.js';

export interface UplinkResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Build a structured Linear issue description from a phase note
function buildIssueDescription(phase: PhaseNode): string {
  const state = stateFromFrontmatter(phase.frontmatter as Record<string, unknown>);
  const { done, total } = countTasks(phase.content);

  // Extract summary
  const summaryMatch = phase.content.match(/## (?:📋 )?Summary([\s\S]*?)(?=\n##|$)/);
  const summary = summaryMatch?.[1]?.trim() || '';

  // Extract acceptance criteria
  const acMatch = phase.content.match(/## (?:✅ )?Acceptance Criteria([\s\S]*?)(?=\n##|$)/);
  const ac = acMatch?.[1]?.trim() || '';

  // Extract tasks (just the checkbox lines)
  const taskLines = phase.content.split('\n')
    .filter(l => /^\s*-\s*\[[ x]\]/i.test(l))
    .slice(0, 30) // cap at 30 to avoid hitting Linear limits
    .join('\n');

  const parts: string[] = [];
  parts.push(`**Status:** ${state} | **Progress:** ${done}/${total} tasks`);
  if (summary) parts.push(`\n## Summary\n\n${summary}`);
  if (taskLines) parts.push(`\n## Tasks\n\n${taskLines}`);
  if (ac) parts.push(`\n## Acceptance Criteria\n\n${ac}`);
  parts.push(`\n---\n*Synced from GroundZeroOS vault*`);

  return parts.join('\n');
}

// Post-atomise sync: vault phases → Linear issues.
// For each phase: if linear_identifier set → update; else → create + write identifier back.
// Notifies: linear_uplink_done
export async function uplinkPhasesToLinear(
  bundle: VaultBundle,
  config: ControllerConfig
): Promise<UplinkResult> {
  if (!config.linear) {
    return { created: 0, updated: 0, skipped: bundle.phases.length, errors: [] };
  }

  const { apiKey, teamId } = config.linear;

  // Resolve the Linear project ID: prefer frontmatter, then search by name
  const overviewLinearId = bundle.overview.exists
    ? String(bundle.overview.frontmatter['linear_project_id'] ?? '')
    : '';
  let linearProjectId = overviewLinearId || undefined;

  // Auto-resolve Linear project by name if not set in frontmatter
  if (!linearProjectId) {
    try {
      linearProjectId = await findProjectByName(apiKey, teamId, bundle.projectId);
      if (linearProjectId) {
        console.log(`  → Resolved Linear project: ${bundle.projectId} → ${linearProjectId}`);
        // Write back so future syncs don't need to re-resolve
        const updatedFm = { ...bundle.overview.frontmatter, linear_project_id: linearProjectId };
        writeFrontmatter(bundle.overview.path, updatedFm);
      }
    } catch { /* non-fatal */ }
  }

  // Auto-resolve: current user, active cycle, and relevant labels
  let assigneeId: string | undefined;
  let cycleId: string | undefined;
  let labelIds: string[] = [];
  try {
    [assigneeId, cycleId, labelIds] = await Promise.all([
      getViewerId(apiKey),
      getActiveCycleId(apiKey, teamId),
      findLabelIds(apiKey, teamId, [/^Creator Experience$/i]),
    ]);
    console.log(`  → Assignee: ${assigneeId ? 'me' : 'none'}, Cycle: ${cycleId ? 'active' : 'none'}, Labels: ${labelIds.length}`);
  } catch (err) {
    console.warn(`  ⚠ Could not resolve assignee/cycle/labels: ${(err as Error).message}`);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Step 1: Ensure a parent issue exists for the project
  // This is the "project overview" issue — all phases become sub-issues of it.
  let parentIssueId = String(bundle.overview.frontmatter['linear_parent_issue_id'] ?? '');

  if (!parentIssueId) {
    // Build a project overview description
    const totalPhases = bundle.phases.filter(p => p.exists).length;
    const completedPhases = bundle.phases.filter(p => p.exists && stateFromFrontmatter(p.frontmatter as Record<string, unknown>) === 'completed').length;
    const phaseList = bundle.phases.filter(p => p.exists).map(p => {
      const num = p.frontmatter['phase_number'] ?? '?';
      const name = String(p.frontmatter['phase_name'] ?? '');
      const state = stateFromFrontmatter(p.frontmatter as Record<string, unknown>);
      const { done, total } = countTasks(p.content);
      return `- [${state === 'completed' ? 'x' : ' '}] **P${num} — ${name}** (${state}, ${done}/${total} tasks)`;
    }).join('\n');

    const overviewSummary = bundle.overview.content
      .match(/## (?:Overview|Description|Summary)([\s\S]*?)(?=\n##|$)/)?.[1]?.trim()
      ?? bundle.overview.content.slice(0, 500);

    const parentDesc = [
      `**Progress:** ${completedPhases}/${totalPhases} phases complete`,
      '',
      '## Overview',
      '',
      overviewSummary.slice(0, 1000),
      '',
      '## Phases',
      '',
      phaseList,
      '',
      '---',
      '*Synced from GroundZeroOS vault*',
    ].join('\n');

    try {
      parentIssueId = await createIssue(apiKey, {
        teamId,
        title: bundle.projectId,
        description: parentDesc,
        projectId: linearProjectId,
        assigneeId,
        cycleId,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
      });
      // Write back to Overview frontmatter
      const updatedOverviewFm = { ...bundle.overview.frontmatter, linear_parent_issue_id: parentIssueId };
      writeFrontmatter(bundle.overview.path, updatedOverviewFm);
      console.log(`  ✓ Parent issue created: ${parentIssueId}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Failed to create parent issue: ${detail}`);
      errors.push(`Parent: ${detail}`);
    }
  } else {
    // Update existing parent issue
    try {
      const totalPhases = bundle.phases.filter(p => p.exists).length;
      const completedPhases = bundle.phases.filter(p => p.exists && stateFromFrontmatter(p.frontmatter as Record<string, unknown>) === 'completed').length;
      const phaseList = bundle.phases.filter(p => p.exists).map(p => {
        const num = p.frontmatter['phase_number'] ?? '?';
        const name = String(p.frontmatter['phase_name'] ?? '');
        const state = stateFromFrontmatter(p.frontmatter as Record<string, unknown>);
        const { done, total } = countTasks(p.content);
        return `- [${state === 'completed' ? 'x' : ' '}] **P${num} — ${name}** (${state}, ${done}/${total} tasks)`;
      }).join('\n');

      await updateIssue(apiKey, parentIssueId, {
        title: bundle.projectId,
        description: `**Progress:** ${completedPhases}/${totalPhases} phases complete\n\n## Phases\n\n${phaseList}\n\n---\n*Synced from GroundZeroOS vault*`,
        teamId,
      });
      console.log(`  ✓ Parent issue updated: ${parentIssueId}`);
    } catch (err) {
      console.error(`  ✗ Failed to update parent: ${(err as Error).message}`);
    }
  }

  // Step 2: Create/update sub-issues for each phase under the parent
  for (const phase of bundle.phases) {
    if (!phase.exists) {
      skipped++;
      continue;
    }

    const phaseNum = phase.frontmatter['phase_number'] ?? '?';
    const phaseName = String(phase.frontmatter['phase_name'] ?? 'Unnamed Phase');
    const title = `P${phaseNum} — ${phaseName}`;
    const description = buildIssueDescription(phase);
    const linearIssueId = String(
      phase.frontmatter['linear_issue_id'] ??
      phase.frontmatter['linear_identifier'] ??
      ''
    );

    try {
      if (linearIssueId !== '') {
        await updateIssue(apiKey, linearIssueId, {
          title,
          description,
          teamId,
        });
        updated++;
        console.log(`  ✓ P${phaseNum} — updated`);
      } else {
        const issueId = await createIssue(apiKey, {
          teamId,
          title,
          description,
          projectId: linearProjectId,
          parentId: parentIssueId || undefined,
          assigneeId,
          cycleId,
          labelIds: labelIds.length > 0 ? labelIds : undefined,
        });

        const updatedFm = { ...phase.frontmatter, linear_issue_id: issueId };
        writeFrontmatter(phase.path, updatedFm);
        created++;
        console.log(`  ✓ P${phaseNum} — created as sub-issue`);
      }

      appendToLog(phase.path, {
        runId: 'uplink',
        event: 'linear_uplink_done',
        detail: `${linearIssueId ? 'Updated' : 'Created'} Linear issue: ${title}`,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ P${phaseNum} — ${detail}`);
      errors.push(`P${phaseNum}: ${detail}`);
      appendToLog(phase.path, {
        runId: 'uplink',
        event: 'linear_uplink_done',
        detail: `Failed: ${detail}`,
      });
      skipped++;
    }
  }

  await notify({
    event: 'linear_uplink_done',
    projectId: bundle.projectId,
    detail: `created:${created} updated:${updated} skipped:${skipped}${errors.length ? ` errors:${errors.length}` : ''}`,
  }, config);

  return { created, updated, skipped, errors };
}
