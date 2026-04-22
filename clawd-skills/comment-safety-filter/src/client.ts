export interface RulePattern {
  /** Regex pattern source — compiled with flags from the rulepack (default `i`). */
  pattern: string;
  /** Short human label for the reason report. */
  label: string;
}

export interface RulePack {
  /** Medical-advice language patterns (ManiPlus, health creators). */
  medical_advice_patterns?: RulePattern[];
  /** PII patterns (phone, email, SSN-like). */
  pii_patterns?: RulePattern[];
  /** Domain-specific disallow phrases (exact match, case-insensitive). */
  blocklist?: string[];
  /** Whitelist that bypasses all pattern checks (for quoted-text edge cases, etc). */
  allowlist?: string[];
  /** Hard length cap — comments/replies longer than this fail. */
  max_length?: number;
  /** Flags applied to every compiled regex. Default "i". */
  flags?: string;
}

export interface Triaged<T> {
  item: T;
  safety: { passed: boolean; reasons: string[] };
}

interface ItemLike { id?: string; text?: string }

/**
 * Apply a rulepack to a list of items (comments, replies, any object with `.text`).
 * Returns the original items annotated with a `safety` block.
 *
 * Empty/whitespace-only text fails with reason 'empty text'.
 * Allowlisted items pass unconditionally (skip all other checks).
 */
export function applyRules<T extends ItemLike>(items: T[], rules: RulePack): Triaged<T>[] {
  const flags = rules.flags ?? 'i';
  const medical = (rules.medical_advice_patterns ?? []).map(p => ({ re: new RegExp(p.pattern, flags), label: p.label }));
  const pii     = (rules.pii_patterns              ?? []).map(p => ({ re: new RegExp(p.pattern, flags), label: p.label }));
  const blocklist = (rules.blocklist ?? []).map(s => s.toLowerCase());
  const allowlist = (rules.allowlist ?? []).map(s => s.toLowerCase());
  const maxLen = rules.max_length;

  return items.map((item) => {
    const text = (item.text ?? '').trim();
    const lower = text.toLowerCase();
    const reasons: string[] = [];

    if (allowlist.some(s => lower.includes(s))) {
      return { item, safety: { passed: true, reasons: ['allowlisted'] } };
    }
    if (text.length === 0) reasons.push('empty text');
    if (maxLen !== undefined && text.length > maxLen) reasons.push(`exceeds max_length (${text.length} > ${maxLen})`);
    for (const { re, label } of medical) if (re.test(text)) reasons.push(`medical_advice: ${label}`);
    for (const { re, label } of pii)     if (re.test(text)) reasons.push(`pii: ${label}`);
    for (const b of blocklist) if (lower.includes(b))       reasons.push(`blocklist: ${b}`);

    return { item, safety: { passed: reasons.length === 0, reasons } };
  });
}
