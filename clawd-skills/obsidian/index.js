#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Default vault locations to search
const DEFAULT_VAULTS = [
  path.join(os.homedir(), 'Obsidian'),
  path.join(os.homedir(), 'Documents', 'Obsidian'),
];

async function findVault(vaultPath = null) {
  if (vaultPath) {
    const stats = await fs.stat(vaultPath).catch(() => null);
    if (stats && stats.isDirectory()) {
      return vaultPath;
    }
    throw new Error(`Not a directory: ${vaultPath}`);
  }

  // Search for default vaults
  for (const vault of DEFAULT_VAULTS) {
    const stats = await fs.stat(vaultPath).catch(() => null);
    if (stats && stats.isDirectory()) {
      return vault;
    }
  }

  throw new Error('No Obsidian vault found. Specify vault path or create one in ~/Obsidian/');
}

async function readNote(noteName, vaultPath = null) {
  const vault = await findVault(vaultPath);
  const notePath = path.join(vault, `${noteName}.md`);

  try {
    const content = await fs.readFile(notePath, 'utf-8');
    return content;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Note not found: ${noteName}`);
    }
    throw err;
  }
}

async function writeNote(noteName, content, vaultPath = null) {
  const vault = await findVault(vaultPath);
  const notePath = path.join(vault, `${noteName}.md`);

  await fs.writeFile(notePath, content, 'utf-8');
  return `Note saved: ${noteName}`;
}

async function listNotes(vaultPath = null) {
  const vault = await findVault(vaultPath);
  const files = await fs.readdir(vault);

  const notes = files
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3));

  return notes;
}

async function searchNotes(query, vaultPath = null) {
  const vault = await findVault(vaultPath);
  const notes = await listNotes(vault);
  const results = [];

  for (const note of notes) {
    const content = await readNote(note, vault);
    if (content.toLowerCase().includes(query.toLowerCase())) {
      // Get first line as title/preview
      const lines = content.split('\n');
      const firstLine = lines.find(l => l.trim() && !l.startsWith('#')) || '';
      results.push({
        note,
        preview: firstLine.substring(0, 100)
      });
    }
  }

  return results;
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    switch (command) {
      case 'read': {
        const noteName = args[1];
        const vaultPath = args[2] || null;
        const content = await readNote(noteName, vaultPath);
        console.log(content);
        break;
      }
      case 'write': {
        const noteName = args[1];
        const vaultPath = args[3] || null;
        // Read content from stdin or remaining args
        let content;
        if (process.stdin.isTTY) {
          content = args[2] || '';
        } else {
          content = await new Promise(resolve => {
            let data = '';
            process.stdin.on('data', chunk => data += chunk);
            process.stdin.on('end', () => resolve(data));
          });
        }
        const result = await writeNote(noteName, content, vaultPath);
        console.log(result);
        break;
      }
      case 'list': {
        const vaultPath = args[1] || null;
        const notes = await listNotes(vaultPath);
        console.log(notes.join('\n'));
        break;
      }
      case 'search': {
        const query = args[1];
        const vaultPath = args[2] || null;
        const results = await searchNotes(query, vaultPath);
        console.log(JSON.stringify(results, null, 2));
        break;
      }
      default:
        console.log('Usage: obsidian <read|write|list|search> [args...]');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { readNote, writeNote, listNotes, searchNotes, findVault };