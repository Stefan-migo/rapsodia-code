import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { PROJECT_STATE_DIR_NAME } from '../utils/state';

/**
 * Patterns a generated project owns: its build output and its local secrets. They are written
 * above the managed block so a project can edit them without an adoption replacing them.
 */
export const PROJECT_BASELINE_IGNORES = [
  'node_modules/', 'dist/', 'build/',
  '.env', '.env.local', '*.log', '.DS_Store', 'Thumbs.db',
];

/**
 * Patterns Rapsodia owns. The managed block is regenerated on every adoption, so this list must
 * contain everything Rapsodia puts there and nothing a project wrote.
 */
export const MANAGED_IGNORE_ENTRIES = [
  // The nested sessions store is already covered by the state directory contents rule.
  `${PROJECT_STATE_DIR_NAME}/`, 'graphify-out/',
  '.engram/', '.obsidian/workspace.json',
  '.obsidian/workspace', '__pycache__/', '*.pyc',
  '*.pyo', '.pytest_cache/', '.ruff_cache/', '.mypy_cache/',
];

const MANAGED_START = '# rapso:start';
const MANAGED_END = '# rapso:end';
const MANAGED_HEADER = '# Rapsodia managed entries';
const MANAGED_BLOCK = new RegExp(`${MANAGED_START}[\\s\\S]*?${MANAGED_END}`);

/** The managed block was marked with the retired name; rename the markers on sight. */
const LEGACY_MARKERS: Array<[string, string]> = [
  ['# cortex:start', MANAGED_START],
  ['# cortex:end', MANAGED_END],
];

function injectMarked(content: string, start: string, end: string, block: string): { content: string; changed: boolean } {
  const marker = new RegExp(`${start}[\\s\\S]*?${end}`);
  const replacement = `${start}\n${block}\n${end}`;
  if (marker.test(content)) return { content: content.replace(marker, replacement), changed: content.replace(marker, replacement) !== content };
  return { content: `${content.replace(/\s*$/, '')}\n\n${replacement}\n`, changed: true };
}

/** Every managed block in the file, in order. A duplicated block is stale Rapsodia state. */
function stripManagedBlocks(content: string): string {
  return content.split(new RegExp(MANAGED_BLOCK.source, 'g')).join('');
}

/**
 * Rewrite the managed block in an existing `.gitignore`, leaving everything outside it alone.
 * Idempotent: a file that already carries the current block comes back byte-identical.
 */
export function mergeGitignore(content: string): { content: string; changed: boolean } {
  // Rename the retired markers before looking for the block: an already-adopted file carries the
  // new pair, an unmigrated one the old, and a matcher that knows only one form would append a
  // second block instead of maintaining the one that exists.
  let renamed = content;
  for (const [from, to] of LEGACY_MARKERS) renamed = renamed.split(from).join(to);
  // Remove every managed block before collecting the project-owned lines: with a duplicated
  // block, treating the second one as project content would drop its entries from the regenerated
  // block and leave stale managed state behind.
  const outside = stripManagedBlocks(renamed);
  const existingOutside = new Set(outside.split(/\r?\n/).map((line) => line.trim()));
  const entries = MANAGED_IGNORE_ENTRIES.filter((entry) => !existingOutside.has(entry));
  const block = [MANAGED_HEADER, ...entries].join('\n');
  const result = injectMarked(renamed, MANAGED_START, MANAGED_END, block);
  // Keep the block `injectMarked` wrote or replaced in place and drop later duplicates.
  let seen = false;
  const normalized = result.content.replace(new RegExp(MANAGED_BLOCK.source, 'g'), (match) => {
    if (seen) return '';
    seen = true;
    return match;
  });
  return { content: normalized, changed: normalized !== content };
}

/**
 * The `.gitignore` a generated project starts with: the project baseline, then the block Rapsodia
 * maintains. Adoption uses `mergeGitignore` instead, so it owns only the block and never claims
 * the baseline of a project it did not create.
 */
export function seedGitignore(): string {
  return mergeGitignore(PROJECT_BASELINE_IGNORES.join('\n') + '\n').content;
}

/**
 * npm never publishes a file named `.gitignore`, so no template can carry one and the CLI writes
 * them. Returns the relative paths written, for the caller's report.
 */
export function writeProjectIgnores(targetDir: string): string[] {
  const files: Array<[string, string]> = [
    ['.gitignore', seedGitignore()],
  ];
  for (const [path, content] of files) {
    const target = join(targetDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  }
  return files.map(([path]) => path);
}
