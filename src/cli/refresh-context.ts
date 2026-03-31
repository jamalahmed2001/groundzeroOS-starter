import { loadConfig } from '../config/load.js';
import { discoverBundles, readRawFile } from '../vault/reader.js';
import { writeFile, writeFrontmatter } from '../vault/writer.js';
import { setManagedBlock } from '../vault/managedBlocks.js';
import { scanRepo } from './init.js';
import { resolveRepoPath } from '../repos/resolveRepoPath.js';
import matter from 'gray-matter';
import path from 'path';
import fs from 'fs';

export async function runRefreshContext(projectArg?: string): Promise<void> {
  if (!projectArg) {
    console.log('Usage: gzos refresh-context <project-name>');
    return;
  }

  const config = loadConfig();
  const bundles = discoverBundles(config.vaultRoot, config.projectsGlob);
  const bundle = bundles.find(b => b.projectId.toLowerCase().includes(projectArg.toLowerCase()));

  if (!bundle) {
    console.error(`No project found matching "${projectArg}"`);
    process.exit(1);
  }

  const rcPath = path.join(bundle.bundleDir, `${bundle.projectId} - Repo Context.md`);
  const ovPath = path.join(bundle.bundleDir, `${bundle.projectId} - Overview.md`);

  // Resolve repo path (prefer Overview.repo_path; else fuzzy match under config.reposRoot)
  const ovRaw = readRawFile(ovPath);
  const explicitRepoPath = ovRaw
    ? String((matter(ovRaw).data as Record<string, unknown>)['repo_path'] ?? '')
    : '';

  const resolved = resolveRepoPath({
    projectId: bundle.projectId,
    explicitRepoPath,
    reposRoot: config.reposRoot,
  });

  const repoPath = resolved.repoPath;

  if (!repoPath || !fs.existsSync(repoPath)) {
    console.error(`Repo not found. Set repo_path in ${ovPath} or set repos_root in groundzero.config.json (or GZOS_REPOS_ROOT env).`);
    process.exit(1);
  }

  // Write back repo_path if we fuzzily resolved it and Overview lacks a valid value
  if (resolved.source === 'fuzzy' && ovRaw) {
    try {
      const parsed = matter(ovRaw);
      const fm = { ...(parsed.data as Record<string, unknown>), repo_path: repoPath };
      writeFrontmatter(ovPath, fm);
    } catch {
      // non-fatal
    }
  }

  console.log(`Scanning repo: ${repoPath}${resolved.source === 'fuzzy' ? ' (resolved via reposRoot fuzzy match)' : ''}`);
  const scan = scanRepo(repoPath);
  console.log(`Stack: ${scan.stack}`);

  const existing = readRawFile(rcPath);
  let existingFm: Record<string, unknown> = {};

  if (existing) {
    existingFm = matter(existing).data as Record<string, unknown>;
  }
  existingFm['stack'] = scan.stack;

  if (!existing) {
    // Fresh file — build full content with managed blocks
    const body = `\n## 🔗 Navigation\n\n- [[${bundle.projectId} - Overview|Overview]]\n- [[${bundle.projectId} - Docs Hub|Docs Hub]]\n\n# Repo Context — ${bundle.projectId}\n\n## Repo Path\n\nSee Overview frontmatter (\`repo_path\`).\n\n## Stack\n\n<!-- GZOS_MANAGED_START:stack -->\n${scan.stack.trim()}\n<!-- GZOS_MANAGED_END:stack -->\n\n## Key Areas\n\n<!-- GZOS_MANAGED_START:key-areas -->\n${scan.keyAreas.trim()}\n<!-- GZOS_MANAGED_END:key-areas -->\n\n## Architecture Notes\n\n${scan.architectureNotes}\n\n## Agent Constraints\n\n${scan.constraints}\n`;
    writeFile(rcPath, matter.stringify(body, existingFm));
  } else {
    // Existing file — update only the managed blocks; preserve everything else
    let body = matter(existing).content;

    // Stack: update managed block, or upgrade legacy unmanaged section
    if (body.includes('<!-- GZOS_MANAGED_START:stack -->')) {
      body = setManagedBlock(body, 'stack', scan.stack.trim());
    } else {
      // Legacy: replace unmanaged ## Stack section if present
      const stackRe = /(## Stack\s*\n)([\s\S]*?)(?=\n## |\s*$)/;
      if (stackRe.test(body)) {
        body = body.replace(stackRe, `## Stack\n\n<!-- GZOS_MANAGED_START:stack -->\n${scan.stack.trim()}\n<!-- GZOS_MANAGED_END:stack -->\n`);
      } else {
        body = `${body.trimEnd()}\n\n## Stack\n\n<!-- GZOS_MANAGED_START:stack -->\n${scan.stack.trim()}\n<!-- GZOS_MANAGED_END:stack -->\n`;
      }
    }

    // Key Areas: update managed block, or upgrade legacy
    if (body.includes('<!-- GZOS_MANAGED_START:key-areas -->')) {
      body = setManagedBlock(body, 'key-areas', scan.keyAreas.trim());
    } else {
      const kaRe = /(## Key Areas\s*\n)([\s\S]*?)(?=\n## |\s*$)/;
      if (kaRe.test(body)) {
        body = body.replace(kaRe, `## Key Areas\n\n<!-- GZOS_MANAGED_START:key-areas -->\n${scan.keyAreas.trim()}\n<!-- GZOS_MANAGED_END:key-areas -->\n`);
      } else {
        body = `${body.trimEnd()}\n\n## Key Areas\n\n<!-- GZOS_MANAGED_START:key-areas -->\n${scan.keyAreas.trim()}\n<!-- GZOS_MANAGED_END:key-areas -->\n`;
      }
    }

    writeFile(rcPath, matter.stringify(body, existingFm));
  }

  console.log(`Updated: ${rcPath}`);
}
