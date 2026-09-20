import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { commandAvailable, execFileSync } from '../utils/exec';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { ExpectedError } from '../utils/defect';
import { sessionsDir, statePath, stateDir, SESSIONS_DIR_NAME, LEGACY_SESSIONS_DIR_NAME } from '../utils/state';

export interface WorktreeRecord {
  path: string;
  head: string;
  branch?: string;
}

export class CleanupRefusalError extends ExpectedError {
  readonly paths: string[];
  readonly preservedPaths: string[];

  constructor(message: string, paths: string[], preservedPaths: string[] = []) {
    super(`${message}: ${paths.join(', ')}`);
    this.name = 'CleanupRefusalError';
    this.paths = paths;
    this.preservedPaths = preservedPaths;
  }
}

interface MergeMarker { branch: string; mergeSha: string }

export interface CleanupReport { preservedPaths: string[] }

interface ProtectedUntrackedPaths { preservedPaths: string[]; lossPaths: string[] }

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function gitPath(root: string, args: string[]): string {
  return resolve(root, git(root, args));
}

const CANONICAL_SKILLS = ['rapso-persona', 'rapso-session', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-help'];

function symlinkOrCopy(source: string, link: string, recursive: boolean, symlinkTarget = relative(dirname(link), source)): void {
  try {
    symlinkSync(symlinkTarget, link);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EACCES' && code !== 'EPERM') throw error;
    cpSync(source, link, recursive ? { recursive: true } : undefined);
  }
}

// The canonical skills live in the CLI template, because that is the only store the published
// package ships. They used to live in `<repo>/skills/`, which `cli/package.json` never carried, so
// a project created by `rapso init` received none of them. Resolving the source against the new
// worktree produced links that only resolved inside Rapsodia, after deleting whatever already
// occupied the destination.
function canonicalSkillsRoot(root: string): string | null {
  const canonical = join(root, 'cli', 'src', 'template', '.opencode', 'skills');
  return CANONICAL_SKILLS.some((name) => existsSync(join(canonical, name, 'SKILL.md'))) ? canonical : null;
}

function repositoryRoot(root: string): string {
  const candidate = resolve(root);
  return resolve(git(candidate, ['rev-parse', '--show-toplevel']));
}

export function isMainWorktree(root: string): boolean {
  const candidate = resolve(root);
  return gitPath(candidate, ['rev-parse', '--git-dir']) ===
    gitPath(candidate, ['rev-parse', '--git-common-dir']);
}

export function assertNotMainWorktree(root: string): void {
  if (isMainWorktree(root)) {
    throw new ExpectedError(`Refusing to operate on the main worktree: ${resolve(root)}`);
  }
}

function worktreePath(slug: string, root: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new ExpectedError('Slug must contain lowercase letters, numbers, and hyphens.');
  const main = repositoryRoot(root);
  return join(dirname(main), `${basename(main)}-odd-${slug}`);
}

function sameContent(left: string, right: string): boolean {
  const leftStat = lstatSync(left);
  const rightStat = lstatSync(right);
  if (leftStat.isDirectory() !== rightStat.isDirectory() || leftStat.isFile() !== rightStat.isFile()) return false;
  if (leftStat.isFile()) return readFileSync(left).equals(readFileSync(right));
  if (!leftStat.isDirectory()) return false;
  const leftEntries = readdirSync(left).sort();
  const rightEntries = readdirSync(right).sort();
  if (leftEntries.join('\0') !== rightEntries.join('\0')) return false;
  return leftEntries.every((entry) => sameContent(join(left, entry), join(right, entry)));
}

function hasArchivedTwin(protectedPath: string, main: string): boolean {
  try {
    const archiveRoot = join(main, 'openspec', 'changes', 'archive');
    if (!existsSync(archiveRoot) || !lstatSync(archiveRoot).isDirectory()) return false;
    const entries = readdirSync(archiveRoot, { recursive: true }) as string[];
    return entries.some((entry) => {
      try { return sameContent(protectedPath, join(archiveRoot, entry)); } catch { return false; }
    });
  } catch {
    return false;
  }
}

function handoffCandidates(main: string, target: string, slug: string): string[] {
  const candidates: string[] = [];
  for (const readyRoot of [
    join(sessionsDir(target), 'ready-for-odd'), join(sessionsDir(main), 'ready-for-odd'),
    join(target, LEGACY_SESSIONS_DIR_NAME, 'ready-for-odd'), join(main, LEGACY_SESSIONS_DIR_NAME, 'ready-for-odd'),
  ]) {
    if (!existsSync(readyRoot) || !lstatSync(readyRoot).isDirectory()) continue;
    for (const entry of readdirSync(readyRoot)) {
      if (new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${slug}$`).test(entry)) {
        const candidate = join(readyRoot, entry);
        if (lstatSync(candidate).isDirectory()) candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function protectedUntrackedPaths(target: string, main: string, candidates: string[]): ProtectedUntrackedPaths {
  const candidateRoots = candidates.map((candidate) => resolve(candidate));
  const output = git(target, ['ls-files', '--others', '--exclude-standard', '-z']);
  const preservedPaths: string[] = [];
  const lossPaths: string[] = [];
  for (const path of output.split('\0').filter(Boolean)) {
    const absolute = resolve(target, path);
    const normalized = path.replace(/\\/g, '/');
    const isOpenSpec = normalized === 'openspec' || normalized.startsWith('openspec/');
    const isSessionState = [SESSIONS_DIR_NAME, LEGACY_SESSIONS_DIR_NAME]
      .some((dir) => normalized === dir || normalized.startsWith(`${dir}/`));
    const isOdd = normalized === 'odd' || normalized.startsWith('odd/');
    if (!isOpenSpec && !isSessionState && !isOdd) continue;
    if (candidateRoots.some((candidate) => absolute === candidate || absolute.startsWith(`${candidate}${sep}`))) continue;
    const mainCopy = resolve(main, path);
    if (existsSync(mainCopy) && sameContent(absolute, mainCopy)) continue;
    if (isOpenSpec && hasArchivedTwin(absolute, main)) preservedPaths.push(path);
    else lossPaths.push(path);
  }
  return { preservedPaths, lossPaths };
}

function archiveHandoff(source: string, main: string): void {
  const name = basename(source);
  const archived = join(sessionsDir(main), 'archived', name);
  if (existsSync(archived)) {
    if (!sameContent(source, archived)) throw new CleanupRefusalError('Refusing to reconcile differing archived handoff content', [relative(main, source), relative(main, archived)]);
    rmSync(source, { recursive: true, force: true });
    return;
  }
  const temporaryArchive = `${archived}.tmp-${process.pid}`;
  mkdirSync(dirname(archived), { recursive: true });
  rmSync(temporaryArchive, { recursive: true, force: true });
  cpSync(source, temporaryArchive, { recursive: true });
  try {
    renameSync(temporaryArchive, archived);
  } catch (error) {
    if (!existsSync(archived)) throw error;
    rmSync(temporaryArchive, { recursive: true, force: true });
    if (!sameContent(source, archived)) throw new CleanupRefusalError('Refusing to reconcile differing archived handoff content', [relative(main, source), relative(main, archived)]);
  }
  rmSync(source, { recursive: true, force: true });
}

export async function createWorktree(slug: string, root: string): Promise<string> {
  const main = repositoryRoot(root);
  if (!isMainWorktree(main)) throw new ExpectedError('Worktree creation must start from the main worktree.');
  const target = worktreePath(slug, main);
  if (existsSync(target)) throw new ExpectedError(`Worktree path already exists: ${target}`);

  git(main, ['fetch', 'origin', 'main']);
  git(main, ['worktree', 'add', '-b', `odd/${slug}`, target, 'origin/main']);
  const branch = `branch.odd/${slug}`;
  for (const key of ['merge', 'remote', 'mergeOptions', 'pushRemote']) {
    try { git(main, ['config', '--unset', `${branch}.${key}`]); } catch { /* absent config is expected */ }
  }
  return target;
}

function copyIfPresent(source: string, target: string): void {
  if (existsSync(source)) {
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
}

function installDependencies(directory: string): void {
  if (!existsSync(join(directory, 'package.json'))) return;
  // `npm ci` is reproducible but needs a lockfile. A project that has never installed has
  // none, so resolve fresh rather than silently installing nothing.
  const command = existsSync(join(directory, 'package-lock.json')) ? 'ci' : 'install';
  try {
    execFileSync('npm', [command], { cwd: directory, stdio: 'inherit' });
  } catch {
    throw new ExpectedError(`Failed to install dependencies in ${directory} (npm ${command}).`);
  }
}

function refreshRegistry(worktree: string, mainRoot: string): void {
  if (commandAvailable('gentle-ai')) {
    execFileSync('gentle-ai', ['skill-registry', 'refresh', '--cwd', worktree], { cwd: worktree, stdio: 'ignore' });
  } else {
    const rows = CANONICAL_SKILLS
      .filter((name) => existsSync(join(worktree, '.opencode', 'skills', name, 'SKILL.md')))
      .map((name) => `| ${name} | ${join(worktree, '.opencode', 'skills', name, 'SKILL.md')} | project |`)
      .join('\n');
    mkdirSync(join(worktree, '.atl'), { recursive: true });
    writeFileSync(join(worktree, '.atl', 'skill-registry.md'), `# Skill Registry — worktree\n\nSource: ${mainRoot}\n\n| Name | Path | Scope |\n|------|------|-------|\n${rows}\n`);
  }
}

export function provisionWorktree(worktree: string, mainRoot: string): void {
  const target = repositoryRoot(worktree);
  const main = repositoryRoot(mainRoot);
  assertNotMainWorktree(target);
  if (target === main) throw new ExpectedError('Provisioning requires a separate worktree.');
  if (gitPath(target, ['rev-parse', '--git-common-dir']) !== gitPath(main, ['rev-parse', '--git-common-dir'])) {
    throw new ExpectedError('Worktree does not belong to the requested main repository.');
  }

  const graphSource = join(main, 'graphify-out');
  if (existsSync(graphSource) && existsSync(join(graphSource, 'GRAPH_REPORT.md'))) {
    const graphSnapshot = join(target, 'graphify-out');
    rmSync(graphSnapshot, { recursive: true, force: true });
    copyIfPresent(graphSource, graphSnapshot);
  }
  copyIfPresent(join(main, '.opencode', 'package.json'), join(target, '.opencode', 'package.json'));
  copyIfPresent(join(main, '.opencode', 'package-lock.json'), join(target, '.opencode', 'package-lock.json'));
  copyIfPresent(join(main, '.opencode', 'tools', 'package.json'), join(target, '.opencode', 'tools', 'package.json'));
  copyIfPresent(join(main, '.opencode', 'tools', 'package-lock.json'), join(target, '.opencode', 'tools', 'package-lock.json'));
  installDependencies(join(target, '.opencode'));
  installDependencies(join(target, '.opencode', 'tools'));
  installDependencies(join(target, 'cli'));

  const skillsSource = canonicalSkillsRoot(target) ?? canonicalSkillsRoot(main);
  if (skillsSource) {
    const skillsDir = join(target, '.opencode', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    for (const entry of CANONICAL_SKILLS) {
      const source = join(skillsSource, entry);
      if (!existsSync(join(source, 'SKILL.md'))) continue;
      const link = join(skillsDir, entry);
      const existing = (() => { try { return lstatSync(link); } catch { return undefined; } })();
      // A real directory is the project's own tracked copy; only a link is Rapsodia's to replace.
      if (existing && !existing.isSymbolicLink()) continue;
      if (existing) rmSync(link, { force: true });
      symlinkOrCopy(source, link, true);
    }
  }

  copyIfPresent(join(main, 'commands'), join(target, '.opencode', 'commands'));
  refreshRegistry(target, main);
  for (const file of ['.env.local', 'projects.txt']) {
    const link = join(target, file);
    if (existsSync(link) || (() => { try { lstatSync(link); return true; } catch { return false; } })()) rmSync(link, { force: true });
    if (existsSync(join(main, file))) symlinkOrCopy(join(main, file), link, false, join(relative(target, main), file));
  }
  mkdirSync(stateDir(target), { recursive: true });
  writeFileSync(statePath(target, 'worktree.json'), JSON.stringify({ branch: git(target, ['branch', '--show-current']), source: main, provisionedAt: new Date().toISOString() }, null, 2) + '\n');
}

export function listWorktrees(root: string): WorktreeRecord[] {
  const output = git(repositoryRoot(root), ['worktree', 'list', '--porcelain']);
  return output.split('\n\n').filter(Boolean).map((block) => {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    const head = block.match(/^HEAD (.+)$/m)?.[1];
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    if (!path || !head) throw new Error('Invalid git worktree porcelain output.');
    return { path, head, branch };
  });
}

export function cleanupWorktree(slug: string, root: string, remote: boolean): CleanupReport {
  const main = repositoryRoot(root);
  if (!isMainWorktree(main)) throw new ExpectedError('Cleanup must start from the main worktree.');
  const target = worktreePath(slug, main);
  const candidates = handoffCandidates(main, target, slug);
  if (candidates.length > 1) throw new CleanupRefusalError('Ambiguous session handoff; refusing cleanup', candidates.map((candidate) => relative(main, candidate)));
  const { preservedPaths, lossPaths } = protectedUntrackedPaths(target, main, candidates);
  if (lossPaths.length > 0) throw new CleanupRefusalError('Refusing cleanup because untracked artifacts would be lost', lossPaths, preservedPaths);
  if (candidates.length === 1) archiveHandoff(candidates[0], main);
  git(main, ['worktree', 'remove', '--force', target]);
  git(main, ['branch', '-D', `odd/${slug}`]);
  if (remote) git(main, ['push', 'origin', '--delete', `odd/${slug}`]);
  return { preservedPaths };
}

/** Refresh the authoritative graph only after delivery recorded and verified a merged ODD work PR. */
export function refreshMainAfterMerge(slug: string, root: string, markerPath: string): void {
  const main = repositoryRoot(root);
  if (!isMainWorktree(main)) throw new ExpectedError('Graph refresh requires the main worktree.');
  const markerFile = resolve(markerPath);
  const markerRelative = relative(main, markerFile);
  if (markerRelative.startsWith('..') || markerRelative === '') {
    throw new ExpectedError('Merge marker must be inside the main repository.');
  }
  const marker = JSON.parse(readFileSync(markerFile, 'utf-8')) as MergeMarker;
  if (marker.branch !== `odd/${slug}` || !/^[0-9a-f]{40,64}$/.test(marker.mergeSha)) {
    throw new ExpectedError('Merge marker does not identify the requested branch and SHA.');
  }
  try {
    git(main, ['merge-base', '--is-ancestor', marker.mergeSha, 'HEAD']);
  } catch {
    throw new ExpectedError('Expected merged SHA is not present on main.');
  }
  execFileSync('graphify', ['.', '--update'], { cwd: main, stdio: 'inherit' });
  rmSync(markerFile, { force: true });
}
