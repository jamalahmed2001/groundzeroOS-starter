// onyx doctor — pre-flight checks
// Validates everything needed before first run.
// No config required to run — that's the point.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { readRawFile } from '../vault/reader.js';
import { loadConfig } from '../config/load.js';

interface Check {
  label: string;
  pass: boolean;
  warn?: boolean; // non-blocking issue
  fix?: string;
}

function which(binary: string): boolean {
  try {
    execSync(`which ${binary}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(): Promise<void> {
  const checks: Check[] = [];
  const cwd = process.cwd();
  const configPath = path.join(cwd, 'onyx.config.json');

  // Load .env + config early so env vars are populated for the checks below
  try { loadConfig(); } catch { /* ignore — we'll surface missing fields as failed checks */ }

  // 1. Config file
  const configExists = fs.existsSync(configPath);
  checks.push({
    label: 'onyx.config.json found',
    pass: configExists,
    fix: 'Copy the template: cp onyx.config.json.example onyx.config.json',
  });

  let vaultRoot: string | undefined;
  let agentDriver = 'claude-code';

  if (configExists) {
    try {
      const raw = JSON.parse(readRawFile(configPath) ?? '{}') as Record<string, unknown>;
      vaultRoot = (raw['vault_root'] ?? raw['vaultRoot']) as string | undefined;
      agentDriver = String(raw['agent_driver'] ?? raw['agentDriver'] ?? 'claude-code');
    } catch {
      checks.push({ label: 'onyx.config.json is valid JSON', pass: false, fix: 'Check for syntax errors in onyx.config.json' });
    }
  }

  // 2. .env file (optional but helpful)
  const envExists = fs.existsSync(path.join(cwd, '.env'));
  checks.push({
    label: '.env file found',
    pass: envExists,
    fix: 'cp .env.example .env  then fill in your keys',
  });

  // 3. vault_root set
  const envVaultRoot = process.env['ONYX_VAULT_ROOT'];
  const resolvedVaultRoot = envVaultRoot ?? vaultRoot;
  checks.push({
    label: 'vault_root is configured',
    pass: Boolean(resolvedVaultRoot),
    fix: 'Set vault_root in onyx.config.json, or ONYX_VAULT_ROOT in .env',
  });

  // 4. vault_root exists on disk
  if (resolvedVaultRoot) {
    const vaultExists = fs.existsSync(resolvedVaultRoot);
    checks.push({
      label: `Vault directory exists (${resolvedVaultRoot})`,
      pass: vaultExists,
      fix: `Create the directory or update vault_root: mkdir -p "${resolvedVaultRoot}"`,
    });

    // 4b. vault write access
    if (vaultExists) {
      let writeOk = false;
      try {
        const testPath = path.join(resolvedVaultRoot, '.onyx-write-test');
        fs.writeFileSync(testPath, 'ok');
        fs.unlinkSync(testPath);
        writeOk = true;
      } catch {
        writeOk = false;
      }
      checks.push({
        label: 'Vault write access',
        pass: writeOk,
        fix: `Cannot write to vault root. Check permissions: ls -la "${resolvedVaultRoot}"`,
      });
    }
  }

  // 5. OPENROUTER_API_KEY set
  const apiKey = process.env['OPENROUTER_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'];
  checks.push({
    label: 'OPENROUTER_API_KEY set',
    pass: Boolean(apiKey),
    fix: 'Add OPENROUTER_API_KEY=sk-or-... to your .env file',
  });

  // 5b. Test OpenRouter API key validity
  if (apiKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        checks.push({ label: 'OpenRouter API key is valid', pass: true });
      } else {
        checks.push({
          label: `OpenRouter API key rejected (${res.status})`,
          pass: false,
          fix: 'Check your OPENROUTER_API_KEY at https://openrouter.ai/keys',
        });
      }
    } catch {
      checks.push({
        label: 'OpenRouter API key: network timeout (key status unknown)',
        pass: true,
        warn: true,
        fix: 'Network check timed out — key may still be valid. Verify manually: curl -s https://openrouter.ai/api/v1/models -H "Authorization: Bearer $OPENROUTER_API_KEY" | head -1',
      });
    }
  }

  // 6. Agent binary + auth
  if (agentDriver === 'cursor') {
    const cursorFound = which('cursor');
    checks.push({
      label: 'cursor binary found in PATH',
      pass: cursorFound,
      fix: 'Install Cursor from https://cursor.sh and ensure CLI is in PATH',
    });
    if (cursorFound) {
      checks.push({
        label: 'Cursor auth (session login used automatically)',
        pass: true,
        warn: true,
        fix: 'If agent calls fail, open Cursor and sign in to your account first',
      });
    }
  } else {
    const claudeFound = which('claude');
    checks.push({
      label: 'claude binary found in PATH',
      pass: claudeFound,
      fix: 'Install Claude Code: npm install -g @anthropic-ai/claude-code',
    });
    if (claudeFound) {
      // Session auth: ~/.claude/ credentials OR ANTHROPIC_API_KEY
      const hasApiKey = Boolean(process.env['ANTHROPIC_API_KEY']);
      const sessionDir = path.join(process.env['HOME'] ?? '~', '.claude');
      const hasSession = fs.existsSync(sessionDir) &&
        fs.readdirSync(sessionDir).some(f => f.includes('credentials') || f.includes('auth') || f.endsWith('.json'));
      const authed = hasApiKey || hasSession;
      checks.push({
        label: 'Claude Code authenticated (session or API key)',
        pass: authed,
        warn: !authed,
        fix: 'Run: claude login  — or set ANTHROPIC_API_KEY in .env',
      });
    }
  }

  // 7. Node version >= 18 (for native fetch)
  const nodeVer = process.versions.node.split('.').map(Number);
  const nodeFine = (nodeVer[0] ?? 0) >= 18;
  checks.push({
    label: `Node.js >= 18 (found ${process.versions.node})`,
    pass: nodeFine,
    fix: 'Upgrade Node.js: https://nodejs.org',
  });

  // 8. Dependencies installed
  const nodeModulesExists = fs.existsSync(path.join(cwd, 'node_modules', 'fast-glob'));
  checks.push({
    label: 'Dependencies installed (node_modules)',
    pass: nodeModulesExists,
    fix: 'Run: npm install',
  });

  // 9. Built (dist exists)
  const distExists = fs.existsSync(path.join(cwd, 'dist', 'cli', 'onyx.js'));
  checks.push({
    label: 'Built (dist/cli/onyx.js exists)',
    pass: distExists,
    fix: 'Run: npm run build',
  });

  // 10. Vault health (only if vault is configured and accessible)
  if (resolvedVaultRoot && fs.existsSync(resolvedVaultRoot)) {
    try {
      const { discoverAllPhases, discoverActivePhases } = await import('../vault/discover.js');
      const { loadConfig: lc } = await import('../config/load.js');
      const cfg = lc();

      // 10a. Stuck active phases (locked_at > 10min ago)
      const activePhases = discoverActivePhases(cfg.vaultRoot, cfg.projectsGlob);
      const now = Date.now();
      const stuckPhases = activePhases.filter(p => {
        const la = String(p.frontmatter['locked_at'] ?? '');
        if (!la) return true; // no locked_at = stuck
        const age = now - new Date(la).getTime();
        return age > 10 * 60 * 1000; // > 10 min
      });
      checks.push({
        label: stuckPhases.length === 0
          ? 'No stuck active phases'
          : `${stuckPhases.length} phase(s) stuck in phase-active`,
        pass: stuckPhases.length === 0,
        warn: stuckPhases.length > 0,
        fix: stuckPhases.length > 0
          ? `Run: onyx heal   (will clear stale locks)\n       Stuck: ${stuckPhases.map(p => p.frontmatter['phase_name'] ?? p.path.split('/').pop()).join(', ')}`
          : undefined,
      });

      // 10b. Phases missing project_id
      const allPhases = discoverAllPhases(cfg.vaultRoot, cfg.projectsGlob);
      const missingId = allPhases.filter(p => !p.frontmatter['project_id'] && !p.frontmatter['project']);
      checks.push({
        label: missingId.length === 0
          ? 'All phases have project_id'
          : `${missingId.length} phase(s) missing project_id`,
        pass: missingId.length === 0,
        warn: missingId.length > 0,
        fix: missingId.length > 0 ? 'Run: onyx heal   (will backfill project_id from Overview)' : undefined,
      });

      // 10c. Phase count
      checks.push({
        label: `Vault: ${allPhases.length} phase(s) found`,
        pass: true,
      });

    } catch {
      // vault health checks are best-effort — never fail doctor
    }
  }

  // Print results
  console.log('\nonyx doctor\n');
  let allPass = true;
  for (const check of checks) {
    const icon = check.pass ? (check.warn ? '⚠' : '✓') : '✗';
    console.log(`  ${icon}  ${check.label}`);
    if (!check.pass) {
      if (!check.warn) allPass = false;
      if (check.fix) console.log(`       ${check.warn ? 'Note' : 'Fix'}: ${check.fix}`);
    } else if (check.warn && check.fix) {
      console.log(`       Note: ${check.fix}`);
    }
  }

  if (allPass) {
    console.log('\n  All checks passed. Ready to run:\n');
    console.log('    onyx init "My Project"');
    console.log('    onyx run\n');
  } else {
    console.log('\n  Fix the issues above, then run: onyx doctor\n');
    process.exit(1);
  }
}
