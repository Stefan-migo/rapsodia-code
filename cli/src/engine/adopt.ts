import { execFileSync } from '../utils/exec';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { collectFiles, hashFile, hashTemplateFile, substituteVariables, TemplateOptions } from './template';
import { Manifest, ManifestFile, normalizeManifestPath } from './manifest';
import { migrateLegacyState, resolveStatePath, sessionsDir, statePath, PROJECT_STATE_DIR_NAME } from '../utils/state';
import { CLI_VERSION } from '../utils/version';
import { mergeGitignore } from './gitignore';

/**
 * The template paths Rapsodia owns. Pi reads project skills from `.agents/skills/` and project
 * extensions from `.pi/extensions/`, so those are the only surfaces adoption may create, refresh, or
 * report as owned. The retired `.opencode/` tree is no longer ours: a consumer that still carries one
 * keeps it, and Pi ignores it.
 */
export const OWNED_PATHS = ['.agents/skills/**', '.pi/extensions/**'];

export const NEVER_PATHS = ['DESIGN.md', 'SYSTEM-MAP.md', 'USER-GUIDE.md', 'wiki/**', 'scripts/**'];

/** The pre-Pi surface Rapsodia wrote or depended on. It is reported, never deleted. */
const RETIRED_ROOTS = ['.opencode', 'openspec', 'opencode.json', 'scripts/setup.sh'];

/**
 * Paths the pack itself put in a project, whatever the manifest of the version that created it
 * happened to record. A project adopted at 1.0.0 and synced by later versions carries pack files the
 * manifest never saw, and reporting those as the project's own asked the human to re-decide things
 * the pack already decided. A name is evidence, not proof, and nothing here deletes anything.
 */
const PACK_PATHS = [
  '.opencode/.gitignore',
  '.opencode/agents',
  '.opencode/commands',
  '.opencode/mcp-template.json',
  '.opencode/node_modules',
  '.opencode/opencode.json',
  '.opencode/package.json',
  '.opencode/package-lock.json',
  '.opencode/plugins',
  '.opencode/skills',
  '.opencode/tools',
  'opencode.json',
  'scripts/setup.sh',
];

/** Skills the pack shipped. A project skill carrying one of these names is still only reported. */
const PACK_SKILLS = [
  'bootstrap',
  'design-system',
  'graphify',
  'ponytail-audit',
  'ponytail-debt',
  'ponytail-help',
  'ponytail-plan',
  'ponytail-review',
  'rapso-persona',
  'rapso-session',
  'sdd',
];

/** Adopted projects may already carry this heading; matching it avoids duplicate defect sections. */
const LEGACY_DEFECT_HEADING = '## Reporting Cortex Defects';

export interface AdoptPlan {
  created: string[];
  refreshed: string[];
  removed: string[];
  leftover: string[];
  conflicting: string[];
  injected: string[];
  seeded: string[];
  skipped: string[];
  overwritten: string[];
}

export interface AdoptOptions {
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
}

function matches(path: string, pattern: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');
  if (normalizedPattern.endsWith('/**')) return normalizedPath === normalizedPattern.slice(0, -3) || normalizedPath.startsWith(normalizedPattern.slice(0, -2));
  return normalizedPath === normalizedPattern;
}

function isOwned(path: string): boolean { return OWNED_PATHS.some((pattern) => matches(path, pattern)); }

/**
 * Report the retired surface one entry at a time, classified by whether Rapsodia ever wrote inside
 * it: a manifest-recorded file, a path the pack shipped, or a pack skill name. Those entries are
 * `removed`, and the human can delete them once the project no longer uses OpenCode. Everything else
 * is `leftover`: the project's own content, such as a skill it added under `.opencode/skills`, which
 * no flag may touch. Nothing here deletes anything, and the plan stays one line per entry so it
 * remains readable on a project with a large tree.
 */
function classifyRetiredSurface(targetDir: string, manifestPaths: Set<string>): { removed: string[]; leftover: string[] } {
  const removed: string[] = [];
  const leftover: string[] = [];

  const normalized = (absolute: string): string => relative(targetDir, absolute).replace(/\\/g, '/');

  // Early exit on the first recorded file: a retired tree can carry node_modules or a 3.8 MB
  // openspec directory, and the plan only needs to know whether Rapsodia wrote inside it.
  // This whole function is a report: an unreadable directory must degrade to "we cannot classify
  // it", never abort an adoption.
  const readDirectory = (absolute: string): string[] | null => {
    try {
      return readdirSync(absolute);
    } catch {
      return null;
    }
  };

  const isDirectory = (absolute: string): boolean => {
    try {
      return lstatSync(absolute).isDirectory();
    } catch {
      return false;
    }
  };

  // `lstat` and an explicit symlink refusal: a link can point outside the project, and a link to an
  // ancestor would recurse forever on a project that keeps one under `.opencode`.
  const holdsRecordedFile = (absolute: string): boolean => {
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch {
      return false;
    }
    if (stat.isSymbolicLink()) return false;
    if (!stat.isDirectory()) return manifestPaths.has(normalized(absolute));
    for (const entry of readDirectory(absolute) ?? []) {
      if (holdsRecordedFile(join(absolute, entry))) return true;
    }
    return false;
  };

  const isPackEntry = (path: string): boolean => {
    if (PACK_PATHS.includes(path)) return true;
    const skillPrefix = '.opencode/skills/';
    return path.startsWith(skillPrefix) && PACK_SKILLS.includes(path.slice(skillPrefix.length));
  };

  const record = (absolute: string): void => {
    const path = normalized(absolute);
    (isPackEntry(path) || holdsRecordedFile(absolute) ? removed : leftover).push(path);
  };

  for (const root of RETIRED_ROOTS) {
    const absolute = join(targetDir, root);
    let stat;
    // `existsSync` answers false for a broken symlink, which would hide it from the plan; `lstat`
    // distinguishes "absent" from "present but dangling".
    try {
      stat = lstatSync(absolute);
    } catch {
      continue;
    }
    // `.opencode` is expanded so each skill stays visible next to the ones Rapsodia wrote. A
    // symlinked root is reported as one entry and never expanded: its contents are not ours.
    if (root !== '.opencode' || stat.isSymbolicLink() || !stat.isDirectory()) {
      record(absolute);
      continue;
    }
    const entries = readDirectory(absolute);
    if (!entries) {
      record(absolute);
      continue;
    }
    for (const entry of entries) {
      const child = join(absolute, entry);
      const skills = entry === 'skills' && isDirectory(child) ? readDirectory(child) : null;
      if (skills) {
        for (const skill of skills) record(join(child, skill));
      } else {
        record(child);
      }
    }
  }

  return { removed: removed.sort(), leftover: leftover.sort() };
}

function getDate(): string { return new Date().toISOString().split('T')[0]; }

function markdownSections(templateDir: string, options: TemplateOptions): Array<[string, string]> {
  const source = substituteVariables(readFileSync(join(templateDir, 'AGENTS.md'), 'utf-8'), options);
  const gate = source.match(/### 5-Step Execution Gate \(MANDATORY\)[\s\S]*?(?=\n### |\n## |$)/)?.[0].trim();
  const worktrees = source.match(/## ODD Worktrees[\s\S]*?(?=\n## |$)/)?.[0].trim();
  const defects = source.match(/## Reporting Rapsodia Defects[\s\S]*?(?=\n## |$)/)?.[0].trim();
  return [
    ['## ODD Worktrees', worktrees],
    ['## Reporting Rapsodia Defects', defects],
    ['### 5-Step Execution Gate (MANDATORY)', gate],
  ].filter((section): section is [string, string] => Boolean(section[1]));
}

function injectSections(content: string, sections: Array<[string, string]>): { content: string; changed: boolean } {
  const missing = sections.filter(([heading]) => !content.split(/\r?\n/).some((line) => {
    const currentHeading = line.trim();
    return currentHeading === heading || (heading === '## Reporting Rapsodia Defects' && currentHeading === LEGACY_DEFECT_HEADING);
  }));
  if (missing.length === 0) return { content, changed: false };
  const suffix = missing.map(([, section]) => section).join('\n\n');
  return { content: `${content.replace(/\s*$/, '')}\n\n${suffix}\n`, changed: true };
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

export function adoptProject(targetDir: string, options: AdoptOptions, templateDir: string): AdoptPlan {
  if (!options.dryRun) {
    for (const move of migrateLegacyState(targetDir)) console.log(`State migration: ${move}`);
  }
  const projectName = basename(targetDir) || 'project';
  const templateOptions: TemplateOptions = { projectName, projectType: 'default', date: getDate(), year: new Date().getFullYear().toString() };
  const plan: AdoptPlan = { created: [], refreshed: [], removed: [], leftover: [], conflicting: [], injected: [], seeded: [], skipped: [], overwritten: [] };
  const manifestWritePath = statePath(targetDir, 'manifest.json');
  // Read through the legacy path too: a dry run does not migrate the state directory, so
  // `.rapsodia-code/manifest.json` is absent until the real run renames it. Reading only the new
  // path made the dry run report refreshed files as conflicting and hid every legacy hash.
  const manifestReadPath = resolveStatePath(targetDir, 'manifest.json');
  let oldManifest: Manifest | undefined;
  if (manifestReadPath) {
    try { oldManifest = JSON.parse(readFileSync(manifestReadPath, 'utf-8')) as Manifest; }
    catch { oldManifest = undefined; }
  }
  const oldHashes = new Map((oldManifest?.files || []).map((file) => [normalizeManifestPath(file.path), file.hash]));
  const retired = classifyRetiredSurface(targetDir, new Set([...oldHashes.keys()].map((path) => normalizeManifestPath(path))));
  plan.removed.push(...retired.removed);
  plan.leftover.push(...retired.leftover);

  for (const file of collectFiles(templateDir, templateDir).filter(isOwned)) {
    const source = join(templateDir, file);
    const target = join(targetDir, file);
    const content = file.endsWith('.gitkeep') ? readFileSync(source) : substituteVariables(readFileSync(source, 'utf-8'), templateOptions);
    if (!existsSync(target)) {
      plan.created.push(file);
      if (!options.dryRun) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); }
    } else if (hashTemplateFile(source, templateOptions) === hashFile(target)) {
      plan.skipped.push(file);
    } else if (oldHashes.get(file) === hashFile(target)) {
      plan.refreshed.push(file);
      if (!options.dryRun) writeFileSync(target, content);
    } else {
      plan.conflicting.push(file);
      if (!options.dryRun && options.force) {
        writeFileSync(target, content);
        plan.overwritten.push(file);
      }
    }
  }

  const agentsPath = join(targetDir, 'AGENTS.md');
  const ignorePath = join(targetDir, '.gitignore');
  const merges: Array<[string, { content: string; changed: boolean }]> = [
    [agentsPath, injectSections(existsSync(agentsPath) ? readFileSync(agentsPath, 'utf-8') : '', markdownSections(templateDir, templateOptions))],
    [ignorePath, mergeGitignore(existsSync(ignorePath) ? readFileSync(ignorePath, 'utf-8') : '')],
  ];
  for (const [path, result] of merges) {
    const label = relative(targetDir, path);
    if (!result.changed) plan.skipped.push(label);
    else { plan.injected.push(label); if (!options.dryRun) writeFile(path, result.content); }
  }

  const sessionsIgnore = join(sessionsDir(targetDir), '.gitignore');
  // `migrateLegacyState` renames the legacy session store into the new one, so a legacy
  // `.gitignore` already sits at the new path when this check runs. A dry run does not perform
  // that rename, and must still not promise to create a file the real run leaves alone.
  const legacySessionsIgnore = join(targetDir, '.cortex-sessions', '.gitignore');
  for (const [path, content, present] of [
    [sessionsIgnore, '*\n', existsSync(sessionsIgnore) || existsSync(legacySessionsIgnore)],
    [join(targetDir, 'odd/tasks/.gitkeep'), '', existsSync(join(targetDir, 'odd/tasks/.gitkeep'))],
  ] as const) {
    if (present) plan.skipped.push(relative(targetDir, path));
    else { plan.seeded.push(relative(targetDir, path)); if (!options.dryRun) writeFile(path, content); }
  }
  if (!options.dryRun) {
    const files: ManifestFile[] = collectFiles(templateDir, templateDir).filter(isOwned).map((file) => ({ path: file, hash: hashTemplateFile(join(templateDir, file), templateOptions) }));
    writeFile(manifestWritePath, JSON.stringify({ templateVersion: CLI_VERSION, createdAt: getDate(), projectName, files, excludedPaths: NEVER_PATHS }, null, 2) + '\n');
  }
  if (oldManifest) plan.skipped.push(join(PROJECT_STATE_DIR_NAME, 'manifest.json'));
  else plan.seeded.push(join(PROJECT_STATE_DIR_NAME, 'manifest.json'));
  plan.overwritten.sort();
  return plan;
}

export function isDirty(targetDir: string): boolean | undefined {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: targetDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().length > 0; }
  catch { return undefined; }
}
