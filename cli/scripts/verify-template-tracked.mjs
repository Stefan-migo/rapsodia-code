#!/usr/bin/env node
/**
 * Release gate: the tarball may only carry template files that git tracks.
 *
 * `collectFiles()` walks the filesystem, not the git index, so any file left under
 * `src/template` is packaged and written into every project `rapso init` creates. That is not
 * hypothetical: `src/template/.opencode/tools/node_modules/.gitkeep` survived the OpenCode
 * retirement as an untracked leftover (git ignores `node_modules/`), so `rapso init` recreated the
 * retired `.opencode/` tree in new projects and recorded it in their manifest as Rapsodia-owned.
 *
 * The comparison is deliberately set-based and total: a template file without a git entry is a
 * failure whatever it is named, and no allow-list is maintained here.
 *
 * Wired as `prepack`, so it runs for `npm pack` as well as `npm publish`, including `--dry-run`.
 * When git is unavailable the check warns and passes: it cannot prove a leak, and blocking a
 * legitimate publish from a tarball mirror would be worse than the warning.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE = 'src/template';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file under `dir`, as package-relative POSIX paths. */
function walk(dir, files = []) {
  for (const entry of readdirSync(dir).sort()) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(relative(packageRoot, fullPath).split('\\').join('/'));
    }
  }
  return files;
}

const templateDir = join(packageRoot, TEMPLATE);

if (!existsSync(templateDir)) {
  console.error(`✖ ${TEMPLATE} does not exist, so the package would ship no template at all.`);
  process.exit(1);
}

const onDisk = walk(templateDir);

if (onDisk.length === 0) {
  console.error(`✖ ${TEMPLATE} is empty, so the package would ship no template at all.`);
  process.exit(1);
}

let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z', '--', TEMPLATE], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\0')
    .filter(Boolean);
} catch (error) {
  // Reporting "git is unavailable" for a git that answered and refused would hide the real cause,
  // so the stderr of a git that ran is carried into the warning.
  const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : '';
  const reason = error && error.code === 'ENOENT' ? 'git is not installed' : stderr.split('\n')[0] || String(error?.message ?? error);
  console.warn(
    `⚠ Skipping the template ownership check (${reason}), so the package cannot be compared against the index.`,
  );
  process.exit(0);
}

const trackedPaths = new Set(tracked);
const untracked = onDisk.filter((path) => !trackedPaths.has(path));

if (untracked.length === 0) {
  console.log(`✔ Template ownership check passed: ${onDisk.length} files, all tracked by git.`);
  process.exit(0);
}

console.error('✖ The npm tarball would ship template files that git does not track:');
for (const path of untracked) {
  console.error(`    ${path}`);
}
console.error('');
console.error('  `collectFiles()` walks the filesystem, not the git index, so each of those files is');
console.error('  packaged and written into every project `rapso init` creates.');
console.error('  Delete them, or add them to git if they are meant to ship, then publish again.');
process.exit(1);
