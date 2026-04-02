import matter from 'gray-matter';
import fs from 'fs';
import path from 'path';
import type { PhaseTag } from '../fsm/states.js';
import { readRawFile } from './reader.js';

// Re-export LogEntry from shared for backward compatibility
export type { LogEntry } from '../shared/types.js';
import type { LogEntry } from '../shared/types.js';

// Rewrite frontmatter on a file. Content body is unchanged.
export function writeFrontmatter(absolutePath: string, frontmatter: Record<string, unknown>): void {
  const raw = readRawFile(absolutePath);
  const existingContent = raw !== null ? matter(raw).content : '';
  const output = matter.stringify(existingContent, frontmatter);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, output, 'utf-8');
}

// ── Log path derivation (single source of truth) ─────────────────────────
// Every file that reads or writes log notes must use these two functions.
// They are exported so that healer, replan, consolidator, executor, and CLI
// all derive the same path — preventing the class of bug where one module
// computes a different filename than the module that created the file.

export function safeFileSegment(s: string): string {
  return String(s)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s-\s/g, ' - ')
    .slice(0, 140);
}

export function deriveLogNotePath(phaseNotePath: string, frontmatter: Record<string, unknown>): string {
  const phasesDir = path.dirname(phaseNotePath);
  const bundleDir = path.dirname(phasesDir);
  const logsDir = path.join(bundleDir, 'Logs');
  const phaseNumber = frontmatter['phase_number'] ?? frontmatter['phase_num'] ?? 0;
  const phaseName = String(frontmatter['phase_name'] ?? frontmatter['phaseTitle'] ?? frontmatter['name'] ?? '');
  const nameSeg = safeFileSegment(phaseName);
  const file = nameSeg ? `L${phaseNumber} - ${nameSeg}.md` : `L${phaseNumber}.md`;
  return path.join(logsDir, file);
}

// Append a timestamped log entry to a log note.
// Creates the log note if it doesn't exist.
export function appendToLog(phaseNotePath: string, entry: LogEntry): void {
  // Read phase note to get phase_number from frontmatter
  let phaseFrontmatter: Record<string, unknown> = {};
  const phaseRaw = readRawFile(phaseNotePath);
  if (phaseRaw !== null) {
    phaseFrontmatter = matter(phaseRaw).data as Record<string, unknown>;
  }

  const logNotePath = deriveLogNotePath(phaseNotePath, phaseFrontmatter);
  fs.mkdirSync(path.dirname(logNotePath), { recursive: true });

  const timestamp = new Date().toISOString();
  const filesLine = entry.filesChanged && entry.filesChanged.length > 0
    ? `\n  files: ${entry.filesChanged.join(', ')}`
    : '';
  const detailLine = entry.detail ? `\n  detail: ${entry.detail}` : '';
  const logLine = `\n- [${timestamp}] **${entry.event}** (run: ${entry.runId})${detailLine}${filesLine}`;

  const existingLog = readRawFile(logNotePath);
  if (existingLog === null) {
    const header = matter.stringify(`\n## Log\n`, {
      type: 'log',
      phase_note: phaseNotePath,
      created_at: timestamp,
    });
    fs.writeFileSync(logNotePath, header + logLine, 'utf-8');
  } else {
    fs.appendFileSync(logNotePath, logLine, 'utf-8');
  }
}

// Tick a task checkbox in a phase note. Matches by line text (index-based).
// Handles special regex characters in task text (backticks, $, [], |, etc.)
// Returns true if found and ticked.
export function tickTask(absolutePath: string, taskLine: string): boolean {
  const raw = readRawFile(absolutePath);
  if (raw === null) return false;

  // Allow both '-' and '*' list markers, and tolerate either [ ] or [x] in the provided taskLine.
  // taskLine may be a multi-line string: "- [ ]\nFiles: ...\nSteps: ..."
  const taskLines = taskLine.split('\n');
  const firstLine = taskLines[0]!;
  const normalizedTarget = firstLine.replace(/^\s*[-*]\s*\[\s*[x ]?\s*\]\s*/i, '').trim();

  const fileLines = raw.split('\n');

  // Case A: single-line task — standard content match
  if (normalizedTarget) {
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i]!;
      if (!/^\s*[-*]\s*\[\s\]/.test(line)) continue;
      const lineText = line.replace(/^\s*[-*]\s*\[\s\]\s*/, '').trim();
      if (lineText === normalizedTarget) {
        fileLines[i] = line.replace(/\[\s\]/, '[x]');
        fs.writeFileSync(absolutePath, fileLines.join('\n'), 'utf-8');
        return true;
      }
    }
    return false;
  }

  // Case B: bare "- [ ]" task — identify by the first continuation line's content
  // e.g. taskLine = "- [ ]\nFiles: app/api/...\nSteps: ..."
  // Find the first non-empty continuation line as the anchor
  const anchor = taskLines.slice(1).map(l => l.trim()).find(l => l.length > 0) ?? '';

  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i]!;
    if (!/^\s*[-*]\s*\[\s\]/.test(line)) continue;
    // The current line is a bare "- [ ]" — check its next non-empty line
    if (line.replace(/^\s*[-*]\s*\[\s\]\s*/, '').trim()) continue; // has inline text, not bare
    if (!anchor) {
      // No anchor available — tick the first bare unchecked box
      fileLines[i] = line.replace(/\[\s\]/, '[x]');
      fs.writeFileSync(absolutePath, fileLines.join('\n'), 'utf-8');
      return true;
    }
    // Check next line matches anchor
    const nextLine = fileLines[i + 1]?.trim() ?? '';
    if (nextLine === anchor || nextLine.startsWith(anchor.slice(0, Math.min(anchor.length, 60)))) {
      fileLines[i] = line.replace(/\[\s\]/, '[x]');
      fs.writeFileSync(absolutePath, fileLines.join('\n'), 'utf-8');
      return true;
    }
  }
  return false;
}

// Set locked_by and locked_at in frontmatter.
// Pass empty string for both to release the lock.
export function setLockFields(absolutePath: string, lockedBy: string, lockedAt: string): void {
  const raw = readRawFile(absolutePath);
  if (raw === null) return;

  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  if (lockedBy === '' && lockedAt === '') {
    delete fm['locked_by'];
    delete fm['locked_at'];
  } else {
    fm['locked_by'] = lockedBy;
    fm['locked_at'] = lockedAt;
  }

  const output = matter.stringify(parsed.content, fm);
  fs.writeFileSync(absolutePath, output, 'utf-8');
}

// Set exactly one phase state tag, removing any other phase-* tags.
// Writes all three representations for backward compat:
//   state: <state>          (canonical — new)
//   tags: [phase-<state>]   (for Obsidian Dataview/graph queries)
//   status: <state>         (legacy — kept for transition period)
export function setPhaseTag(absolutePath: string, tag: PhaseTag): void {
  const raw = readRawFile(absolutePath);
  if (raw === null) return;

  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  const stateValue = tag.replace('phase-', '');

  // Canonical state field
  fm['state'] = stateValue;

  // Remove existing phase-* tags from tags array, add the new one
  const existingTags = Array.isArray(fm['tags']) ? (fm['tags'] as string[]) : [];
  const filtered = existingTags.filter(t => !t.startsWith('phase-'));
  filtered.push(tag);
  fm['tags'] = filtered;

  // Legacy status field (backward compat)
  fm['status'] = stateValue;

  const output = matter.stringify(parsed.content, fm);
  fs.writeFileSync(absolutePath, output, 'utf-8');
}

// Tick all unchecked checkboxes in the ## Acceptance Criteria or ## Verification section.
// For ## Verification, skips the ### Human sub-section (non-blocking).
// Called after all tasks complete — criteria are human-readable success docs,
// not agent-ticked gates. If tasks all passed, we mark criteria as met.
// Strip leading emoji/unicode symbols so "✅ Acceptance Criteria" matches "acceptance criteria"
function normaliseHeading(raw: string): string {
  return raw.replace(/^[\p{Emoji}\p{So}\p{Sk}\s]+/u, '').trim().toLowerCase();
}

export function tickAcceptanceCriteria(absolutePath: string): void {
  const raw = readRawFile(absolutePath);
  if (raw === null) return;

  const lines = raw.split('\n');
  let inSection = false;
  let inHuman = false;

  const result = lines.map(line => {
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2) {
      const t = normaliseHeading(h2[1]!);
      inSection = t === 'acceptance criteria' || t === 'verification';
      inHuman = false;
      return line;
    }
    if (h3 && inSection) {
      inHuman = normaliseHeading(h3[1]!) === 'human';
      return line;
    }
    if (inSection && !inHuman && /^\s*-\s*\[\s\]/.test(line)) {
      return line.replace(/\[\s\]/, '[x]');
    }
    return line;
  });

  fs.writeFileSync(absolutePath, result.join('\n'), 'utf-8');
}

// Reset all ticked checkboxes in the ## Acceptance Criteria section back to unchecked.
// Called after a replan so criteria get re-evaluated on the next attempt.
export function resetAcceptanceCriteria(absolutePath: string): void {
  const raw = readRawFile(absolutePath);
  if (raw === null) return;
  const lines = raw.split('\n');
  let inAC = false;
  let inHuman = false;
  const result = lines.map(line => {
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2) {
      const t = normaliseHeading(h2[1]!);
      inAC = t === 'acceptance criteria' || t === 'verification';
      inHuman = false;
      return line;
    }
    if (h3 && inAC) {
      inHuman = normaliseHeading(h3[1]!) === 'human';
      return line;
    }
    if (inAC && !inHuman && /^\s*-\s*\[\s*x\s*\]/i.test(line)) {
      return line.replace(/\[\s*x\s*\]/i, '[ ]');
    }
    return line;
  });
  fs.writeFileSync(absolutePath, result.join('\n'), 'utf-8');
}

// Reset replan_count to 0 in frontmatter (e.g. after human manually sets phase-ready).
export function resetReplanCount(absolutePath: string): void {
  const raw = readRawFile(absolutePath);
  if (raw === null) return;
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  fm['replan_count'] = 0;
  fs.writeFileSync(absolutePath, matter.stringify(parsed.content, fm), 'utf-8');
}

// Write a new file with content (for creating phase notes, log notes, etc.)
export function writeFile(absolutePath: string, content: string): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
}

// Backup phase note + its log note to a timestamped .gzos-backups/ directory.
// Stored OUTSIDE the vault (sibling of vaultRoot) so Obsidian never indexes them.
// Returns the backup directory path.
export function backupPhaseFiles(phaseNotePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bundleDir = path.dirname(path.dirname(phaseNotePath));
  // Walk up to find vaultRoot (the dir that contains the bundle's project folder).
  // bundleDir is typically vaultRoot/XX - Category/Project — go up 2 levels.
  const vaultRoot = path.dirname(path.dirname(bundleDir));
  const backupsRoot = path.join(path.dirname(vaultRoot), '.gzos-backups');
  const backupDir = path.join(backupsRoot, path.basename(vaultRoot), timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const backupPath = path.join(backupDir, path.basename(phaseNotePath));
  if (fs.existsSync(phaseNotePath)) fs.copyFileSync(phaseNotePath, backupPath);

  // Also backup log note — use shared deriveLogNotePath to get the correct path
  const raw = readRawFile(phaseNotePath);
  const fm = raw ? (matter(raw).data as Record<string, unknown>) : {};
  const logPath = deriveLogNotePath(phaseNotePath, fm);
  if (fs.existsSync(logPath)) {
    fs.copyFileSync(logPath, path.join(backupDir, path.basename(logPath)));
  }

  return backupDir;
}

// Write a continue-here checkpoint when the controller is interrupted mid-task.
export function writeCheckpoint(phaseNotePath: string, content: string): void {
  const phasesDir = path.dirname(phaseNotePath);
  const checkpointPath = path.join(phasesDir, `.gzos-continue-${path.basename(phaseNotePath)}`);
  fs.writeFileSync(checkpointPath, content, 'utf-8');
}

// Read a checkpoint written by a prior interrupted run. Returns null if absent.
export function readCheckpoint(phaseNotePath: string): string | null {
  const phasesDir = path.dirname(phaseNotePath);
  const checkpointPath = path.join(phasesDir, `.gzos-continue-${path.basename(phaseNotePath)}`);
  return readRawFile(checkpointPath);
}

// Delete the checkpoint (consumed on resume).
export function clearCheckpoint(phaseNotePath: string): void {
  const phasesDir = path.dirname(phaseNotePath);
  const checkpointPath = path.join(phasesDir, `.gzos-continue-${path.basename(phaseNotePath)}`);
  try { fs.unlinkSync(checkpointPath); } catch { /* ok */ }
}

// Append text to the ## Human Requirements section of a phase note.
// If the section does not exist, it is created at the end of the file.
export function writeHumanRequirement(absolutePath: string, text: string): void {
  const raw = readRawFile(absolutePath);
  if (raw === null) return;

  const lines = raw.split('\n');
  let hrIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s+Human Requirements/i.test(lines[i]!)) {
      hrIdx = i;
      break;
    }
  }

  if (hrIdx === -1) {
    fs.appendFileSync(absolutePath, `\n\n## Human Requirements\n\n${text}\n`);
    return;
  }

  // Find next heading after Human Requirements
  let insertIdx = hrIdx + 1;
  while (insertIdx < lines.length && !lines[insertIdx]!.match(/^#{1,4}\s/)) insertIdx++;
  lines.splice(insertIdx, 0, '', text, '');
  fs.writeFileSync(absolutePath, lines.join('\n'), 'utf-8');
}
