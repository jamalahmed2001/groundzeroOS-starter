import { describe, expect, it } from 'vitest';
import { applyRules, type RulePack } from '../src/client.js';

const MANIPLUS_RULES: RulePack = {
  medical_advice_patterns: [
    { pattern: '\\byou should take\\b', label: 'direct medication instruction' },
    { pattern: '\\bdosage\\b',          label: 'dosage reference' },
  ],
  pii_patterns: [
    { pattern: '[\\w.+-]+@[\\w.-]+\\.\\w{2,}', label: 'email' },
    { pattern: 'https?://[^\\s]+',             label: 'URL' },
  ],
  blocklist: ['scam', 'crypto rug'],
  allowlist: ['quoting the paper:'],
  max_length: 500,
};

describe('applyRules', () => {
  it('passes a benign comment', () => {
    const result = applyRules([{ id: 'c1', text: 'Loved the episode, really helpful!' }], MANIPLUS_RULES);
    expect(result[0].safety.passed).toBe(true);
    expect(result[0].safety.reasons).toEqual([]);
  });

  it('flags medical-advice pattern with the correct label', () => {
    const result = applyRules([{ id: 'c1', text: 'You should take metformin before meals.' }], MANIPLUS_RULES);
    expect(result[0].safety.passed).toBe(false);
    expect(result[0].safety.reasons).toContain('medical_advice: direct medication instruction');
  });

  it('flags PII (email + URL)', () => {
    const result = applyRules([
      { id: 'c1', text: 'Email me at foo@example.com' },
      { id: 'c2', text: 'Check https://example.com/stuff' },
    ], MANIPLUS_RULES);
    expect(result[0].safety.reasons).toContain('pii: email');
    expect(result[1].safety.reasons).toContain('pii: URL');
  });

  it('flags blocklist phrase (case-insensitive)', () => {
    const result = applyRules([{ id: 'c1', text: 'This is a SCAM' }], MANIPLUS_RULES);
    expect(result[0].safety.passed).toBe(false);
    expect(result[0].safety.reasons).toContain('blocklist: scam');
  });

  it('allowlist bypasses all other checks', () => {
    const result = applyRules([
      { id: 'c1', text: 'Quoting the paper: "you should take 500mg twice daily"' },
    ], MANIPLUS_RULES);
    expect(result[0].safety.passed).toBe(true);
    expect(result[0].safety.reasons).toContain('allowlisted');
  });

  it('flags empty text', () => {
    const result = applyRules([{ id: 'c1', text: '   ' }], MANIPLUS_RULES);
    expect(result[0].safety.passed).toBe(false);
    expect(result[0].safety.reasons).toContain('empty text');
  });

  it('flags length exceeding max_length', () => {
    const result = applyRules([{ id: 'c1', text: 'x'.repeat(600) }], MANIPLUS_RULES);
    expect(result[0].safety.reasons).toContain('exceeds max_length (600 > 500)');
  });

  it('accumulates multiple reasons on a single comment', () => {
    const result = applyRules([
      { id: 'c1', text: 'You should take dosage of 5mg at foo@scam.com' },
    ], MANIPLUS_RULES);
    expect(result[0].safety.passed).toBe(false);
    expect(result[0].safety.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('empty rulepack passes everything non-empty', () => {
    const result = applyRules([{ id: 'c1', text: 'hello world' }], {});
    expect(result[0].safety.passed).toBe(true);
  });

  it('returns the original item reference alongside safety block', () => {
    const items = [{ id: 'c1', text: 'ok', author: 'alice' }];
    const result = applyRules(items, MANIPLUS_RULES);
    expect(result[0].item).toBe(items[0]);
    expect(result[0].item).toMatchObject({ author: 'alice' });
  });
});
