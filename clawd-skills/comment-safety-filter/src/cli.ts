#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { applyRules, type RulePack } from './client.js';

function emitErrAndExit(error: string, message: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error, message }) + '\n');
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'input':    { type: 'string' },
      'rulepack': { type: 'string' },
      'output':   { type: 'string' },
      'help':     { type: 'boolean', short: 'h' },
    },
    strict: true,
  }) as { values: Record<string, string | boolean | undefined> };

  if (values.help) {
    process.stdout.write('comment-safety-filter --input items.json --rulepack rules.json [--output triaged.json]\n');
    process.exit(0);
  }
  if (!values.input)    emitErrAndExit('config', '--input <items.json> required');
  if (!values.rulepack) emitErrAndExit('config', '--rulepack <rules.json> required');

  let items: unknown[];
  try {
    const raw = await readFile(values.input as string, 'utf8');
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : parsed.comments;
    if (!Array.isArray(items)) emitErrAndExit('config', `--input must be a JSON array or {comments: [...]}`);
  } catch (err) {
    emitErrAndExit('config', `Cannot read --input: ${err instanceof Error ? err.message : String(err)}`);
  }

  let rules: RulePack;
  try {
    const raw = await readFile(values.rulepack as string, 'utf8');
    rules = JSON.parse(raw) as RulePack;
  } catch (err) {
    emitErrAndExit('config', `Cannot read --rulepack: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const triaged = applyRules(items as { text?: string }[], rules);
    const passed = triaged.filter(t => t.safety.passed).length;
    const failed = triaged.length - passed;

    if (values.output) {
      await mkdir(path.dirname(path.resolve(values.output as string)), { recursive: true });
      await writeFile(values.output as string, JSON.stringify(triaged, null, 2));
    }

    process.stdout.write(JSON.stringify({
      ok: true,
      total: triaged.length,
      passed,
      failed,
      output: values.output ?? null,
      triaged: values.output ? undefined : triaged,
    }) + '\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof SyntaxError || (err instanceof Error && /Invalid regular expression/i.test(err.message))) {
      emitErrAndExit('config', `Bad rulepack regex: ${message}`);
    }
    emitErrAndExit('unknown', message);
  }
}

main().catch((err) => emitErrAndExit('unknown', err instanceof Error ? err.message : String(err)));
