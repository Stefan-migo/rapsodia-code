import { execFileSync } from '../utils/exec';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { collectFiles, hashFile, hashTemplateFile, substituteVariables, TemplateOptions } from './template';
import { Manifest, ManifestFile, normalizeManifestPath } from './manifest';
import { migrateLegacyState, resolveStatePath, sessionsDir, statePath, PROJECT_STATE_DIR_NAME } from '../utils/state';
import { CLI_VERSION } from '../utils/version';
import { mergeGitignore } from './gitignore';

/**
 * The template paths Rapsodia owns. Pi reads project skills from `.agents/skills/`, so that is the
 * only surface adoption may create, refresh, or report as owned. The retired `.opencode/` tree is
 * no longer ours: a consumer that still carries one keeps it, and Pi ignores it.
 */
export const OWNED_PATHS = ['.agents/skills/**'];

export const NEVER_PATHS = ['DESIGN.md', 'SYSTEM-MAP.md', 'USER-GUIDE.md', 'wiki/**', 'scripts/**'];

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
  const plan: AdoptPlan = { created: [], refreshed: [], removed: [], leftover: [], conflicting: [], injected: [], seeded: [], skipped: [] };
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
      if (!options.dryRun && options.force) writeFileSync(target, content);
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
  return plan;
}

export function isDirty(targetDir: string): boolean | undefined {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: targetDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().length > 0; }
  catch { return undefined; }
}
