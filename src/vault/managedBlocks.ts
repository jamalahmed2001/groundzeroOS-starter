/**
 * Managed block system for deterministic vault content refresh.
 *
 * Managed blocks wrap auto-generated content that is safe to overwrite
 * on re-import or re-scan. Human-edited content outside managed blocks
 * is never touched.
 *
 * Syntax in markdown:
 *   <!-- GZOS_MANAGED_START:section_name -->
 *   ...auto-generated content...
 *   <!-- GZOS_MANAGED_END:section_name -->
 */

export const MANAGED_START_TAG = (name: string) => `<!-- GZOS_MANAGED_START:${name} -->`;
export const MANAGED_END_TAG   = (name: string) => `<!-- GZOS_MANAGED_END:${name} -->`;

/** True if content already contains a managed block with this name. */
export function hasManagedBlock(content: string, name: string): boolean {
  return content.includes(MANAGED_START_TAG(name));
}

/**
 * Return the inner content of a managed block (between the markers),
 * or null if the block is absent or malformed.
 */
export function getManagedBlock(content: string, name: string): string | null {
  const start = MANAGED_START_TAG(name);
  const end   = MANAGED_END_TAG(name);
  const si = content.indexOf(start);
  if (si === -1) return null;
  const ei = content.indexOf(end, si + start.length);
  if (ei === -1) return null;
  return content.slice(si + start.length, ei);
}

/**
 * Replace or insert a managed block.
 * If the block exists, overwrites only the content between the markers.
 * If absent, appends it at the end of the content.
 * Content outside managed blocks is never touched.
 */
export function setManagedBlock(content: string, name: string, innerContent: string): string {
  const start = MANAGED_START_TAG(name);
  const end   = MANAGED_END_TAG(name);
  const block = `${start}\n${innerContent.trim()}\n${end}`;

  const si = content.indexOf(start);
  if (si === -1) {
    // Not present — append
    return `${content.trimEnd()}\n\n${block}\n`;
  }

  const ei = content.indexOf(end, si);
  if (ei === -1) {
    // Malformed: start without end — replace from start marker onwards
    return content.slice(0, si) + block;
  }

  return content.slice(0, si) + block + content.slice(ei + end.length);
}
