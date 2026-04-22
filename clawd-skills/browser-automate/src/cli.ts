import { readFile, mkdir } from 'fs/promises';
import { runRecipe } from './engine.js';
import { listRecipes, loadRecipe } from './recipes/index.js';
import { daemonStart, daemonStop, daemonStatus } from './daemon.js';
import type { Recipe, RecipeRunOptions } from './types.js';

// Swallow EPIPE on stdout — happens when consuming processes close the pipe early.
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

const HELP = `browser-automate — generic Playwright automation for sites without an API

Subcommands:
  list
      List built-in recipes.

  daemon start|stop|status
      Manage a persistent debuggable Chrome. 'start' seeds from your daily
      profile on first run, then launches Chrome with --remote-debugging-port.
      Subsequent 'run' commands auto-attach. This is the recommended mode
      for services with fragile session persistence (Suno, Udio, etc.).

  login <recipe>
      Open a visible browser at the recipe's login URL so you can sign in manually.
      Session is persisted per-recipe under ~/.cache/browser-automate/profiles/<recipe>/.
      Close the browser when done.

  run <recipe> [options]
      Run the recipe headlessly against the persisted session.

Options for 'run':
  --args-file <path>        JSON file with the recipe's arguments (preferred for complex args)
  --args-json <json>        Inline JSON string
  --arg key=value           Repeatable; simple string args (booleans as true/false, numbers parsed)
  --recipe-file <path>      Use an external recipe file instead of a built-in name
  --headful                 Show the browser (useful for debugging)
  --timeout-ms <n>          Overall timeout (default 600000 = 10 min)
  --help, -h                Show this help

Output: a single JSON object on stdout with { ok, recipe, data?, error?, durationMs, screenshots? }.
Progress logs go to stderr.

Examples:
  browser-automate login suno
  browser-automate run suno --args-json '{"prompt":"warm piano","outputDir":"/tmp/out","count":2}'
  browser-automate run suno --arg prompt="warm piano" --arg outputDir=/tmp/out --arg count=2
  browser-automate run --recipe-file ./my-recipe.js --args-file ./args.json
`;

function parseArg(raw: string): [string, string | number | boolean] {
  const idx = raw.indexOf('=');
  if (idx < 0) return [raw, true];
  const key = raw.slice(0, idx);
  const val = raw.slice(idx + 1);
  if (val === 'true') return [key, true];
  if (val === 'false') return [key, false];
  if (/^-?\d+(\.\d+)?$/.test(val)) return [key, Number(val)];
  return [key, val];
}

async function resolveArgs(flags: Record<string, string | string[] | boolean | undefined>): Promise<Record<string, unknown>> {
  const acc: Record<string, unknown> = {};
  if (flags['args-file']) {
    const content = await readFile(flags['args-file'] as string, 'utf8');
    Object.assign(acc, JSON.parse(content));
  }
  if (flags['args-json']) {
    Object.assign(acc, JSON.parse(flags['args-json'] as string));
  }
  const kvList = flags['arg'];
  const kvs = Array.isArray(kvList) ? kvList : kvList ? [kvList] : [];
  for (const raw of kvs) {
    if (typeof raw !== 'string') continue;
    const [k, v] = parseArg(raw);
    acc[k] = v;
  }
  return acc;
}

function parseFlags(argv: string[]): { subcmd?: string; recipeName?: string; flags: Record<string, string | string[] | boolean | undefined> } {
  const flags: Record<string, string | string[] | boolean | undefined> = {};
  let subcmd: string | undefined;
  let recipeName: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--') && !a.startsWith('-')) {
      if (!subcmd) subcmd = a;
      else if (!recipeName) recipeName = a;
      continue;
    }
    if (a === '-h' || a === '--help') {
      flags.help = true;
      continue;
    }
    const key = a.replace(/^--/, '');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      // Support repeated flags (--arg x=1 --arg y=2)
      if (flags[key] !== undefined) {
        const prev = flags[key];
        flags[key] = Array.isArray(prev) ? [...prev, next] : [String(prev), next];
      } else {
        flags[key] = next;
      }
      i++;
    }
  }
  return { subcmd, recipeName, flags };
}

async function main(): Promise<void> {
  const { subcmd, recipeName, flags } = parseFlags(process.argv.slice(2));

  if (!subcmd || flags.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (subcmd === 'list') {
    const list = listRecipes();
    process.stdout.write(JSON.stringify({ ok: true, recipes: list }, null, 2) + '\n');
    return;
  }

  if (subcmd === 'daemon') {
    const action = recipeName ?? 'status';
    if (action === 'start') {
      const r = await daemonStart();
      process.stdout.write(JSON.stringify({ ok: true, action: 'start', ...r }) + '\n');
      return;
    }
    if (action === 'stop') {
      const r = await daemonStop();
      process.stdout.write(JSON.stringify({ ok: true, action: 'stop', ...r }) + '\n');
      return;
    }
    if (action === 'status') {
      const r = await daemonStatus();
      process.stdout.write(JSON.stringify({ ok: true, action: 'status', ...r }) + '\n');
      return;
    }
    throw new Error(`unknown daemon action '${action}' — expected start|stop|status`);
  }

  let recipe: Recipe<any, any>;
  if (flags['recipe-file']) {
    recipe = await loadRecipe(flags['recipe-file'] as string);
  } else {
    if (!recipeName) throw new Error(`missing recipe name after subcommand '${subcmd}'`);
    recipe = await loadRecipe(recipeName);
  }

  const args = await resolveArgs(flags);

  // Ensure output dir exists if the recipe takes one
  if (typeof args.outputDir === 'string') await mkdir(args.outputDir, { recursive: true });

  const opts: RecipeRunOptions = {
    loginMode: subcmd === 'login',
    headful: Boolean(flags.headful),
    timeoutMs: Number(flags['timeout-ms'] ?? 600000),
  };

  if (subcmd !== 'login' && subcmd !== 'run') {
    throw new Error(`unknown subcommand '${subcmd}' — expected 'list', 'login', or 'run'`);
  }

  const result = await runRecipe(recipe, args, opts);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exit(1);
}

main().catch((err: unknown) => {
  process.stderr.write(
    JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }) + '\n',
  );
  process.exit(1);
});
