import { execFileSync } from '../utils/exec';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { collectFiles, hashFile, hashTemplateFile, substituteVariables, TemplateOptions } from './template';
import { Manifest, ManifestFile, normalizeManifestPath } from './manifest';
import { migrateLegacyState, resolveStatePath, sessionsDir, statePath, PROJECT_STATE_DIR_NAME } from '../utils/state';
import { CLI_VERSION } from '../utils/version';
import { mergeGitignore, OPENCODE_GITIGNORE } from './gitignore';

export const OWNED_PATHS = [
  '.opencode/agents/**', '.opencode/commands/**', '.opencode/tools/**',
  '.opencode/skills/**', '.opencode/plugins/**', '.opencode/mcp-template.json',
  '.opencode/package.json', '.opencode/package-lock.json',
];

export const NEVER_PATHS = ['DESIGN.md', 'SYSTEM-MAP.md', 'USER-GUIDE.md', 'wiki/**', 'scripts/**'];

/** Adopted projects may already carry this heading; matching it avoids duplicate defect sections. */
const LEGACY_DEFECT_HEADING = '## Reporting Cortex Defects';

/**
 * Agent identities this pack renamed. The key is the retired name, the value the one that
 * replaced it. Both live in `agent` entries and in `.opencode/agents/<name>.md`, and adoption
 * must retire both or the consumer runs two generations of the same agent.
 */
const LEGACY_AGENTS: Record<string, string> = {
  'cortex-planner': 'rapso-planner',
  'cortex-developer': 'rapso-developer',
};

export interface AdoptPlan { created: string[]; refreshed: string[]; removed: string[]; leftover: string[]; conflicting: string[]; injected: string[]; seeded: string[]; skipped: string[]; }

interface AdoptOptions { dryRun?: boolean; yes?: boolean; force?: boolean; }

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

function mergeJson(content: string, targetDir: string, templateDir: string, retireAgents: string[], created: string[]): { content: string; changed: boolean; removed: string[] } {
  const current = JSON.parse(content || '{}') as Record<string, any>;
  const template = JSON.parse(readFileSync(join(templateDir, 'opencode.json'), 'utf-8')) as Record<string, any>;
  const before = JSON.stringify(current);
  const removed: string[] = [];
  current.agent = current.agent || {};
  for (const name of ['rapso-planner', 'rapso-developer']) {
    const existing = current.agent[name] as Record<string, any> | undefined;
    // Only claim an entry that is absent or already ours. A project agent that happens to
    // share our name is the project's, and silently replacing it would destroy configuration.
    if (existing && existing.__managed_by !== 'cortex') continue;
    current.agent[name] = { ...template.agent[name], __managed_by: 'cortex' };
  }
  // Retire the identity this pack superseded, but only for the names the caller proved safe to
  // retire and only when the entry is provably ours and its replacement is present. A project
  // agent that merely shares a retired name is never touched, and removing the config entry
  // before the replacement exists would leave the project with no agent at all.
  for (const legacy of retireAgents) {
    const entry = current.agent[legacy] as Record<string, any> | undefined;
    if (!entry || entry.__managed_by !== 'cortex') continue;
    if (!current.agent[LEGACY_AGENTS[legacy]]) continue;
    delete current.agent[legacy];
    removed.push(`agent.${legacy}`);
  }
  current.mcp = current.mcp || {};
  for (const name of ['engram', 'graphify']) if (!(name in current.mcp)) current.mcp[name] = template.mcp[name];
  const plugin = '.opencode/plugins/graphify.js';
  // A `plugin` key that is present but not an array belongs to the project; replacing it with
  // an empty array would drop whatever it holds. Only ever seed or extend an array.
  if (Array.isArray(current.plugin)) {
    const pluginIdentity = resolve(targetDir, plugin);
    // A dry run writes nothing, so the file's absence would otherwise hide the swap from the
    // plan. `created` reports it the same way the retired-agent check below already reads it.
    const installed = existsSync(join(targetDir, plugin)) || created.includes(plugin);
    const pluginSuffix = `/${plugin}`;
    let found = false;
    current.plugin = current.plugin.filter((entry) => {
      if (typeof entry !== 'string') return true;
      const resolved = resolve(targetDir, entry);
      if (resolved !== pluginIdentity) {
        // An older adopt wrote this entry as an absolute path into whichever checkout installed
        // it — a retired `~/.cortex` clone, or a sibling project. It names our plugin but
        // resolves outside this project, so it loads code from a tree the project does not own
        // and can never converge onto its own copy. It is dropped only once this project's copy
        // exists, for the same reason a retired agent entry is kept while its replacement is
        // missing: a config entry must never outlive, or precede, the file behind it.
        return !installed || !entry.replace(/\\/g, '/').endsWith(pluginSuffix);
      }
      if (found) return false;
      found = true;
      return true;
    });
    if (!found && installed) current.plugin.push(plugin);
  } else if (current.plugin === undefined && existsSync(join(targetDir, plugin))) current.plugin = [plugin];
  const output = JSON.stringify(current, null, 2) + '\n';
  return { content: output, changed: JSON.stringify(current) !== before, removed };
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

  // A retired agent is safe to remove only when it is provably ours and its replacement is
  // installed. Its file, when it has one, must still carry the bytes the legacy manifest
  // recorded, which is the same evidence that decides `refreshed` above; a file that fails that
  // check is the project's, and its config entry is kept with it, or the consumer would be left
  // with a config entry and no file, or a file and no config entry.
  const retireAgents: string[] = [];
  for (const [legacy, replacement] of Object.entries(LEGACY_AGENTS)) {
    const legacyFile = `.opencode/agents/${legacy}.md`;
    const legacyPath = join(targetDir, legacyFile);
    const replacementFile = `.opencode/agents/${replacement}.md`;
    const replacementInstalled = existsSync(join(targetDir, replacementFile)) || plan.created.includes(replacementFile);
    const fileUntouched = !existsSync(legacyPath) || oldHashes.get(legacyFile) === hashFile(legacyPath);
    if (!replacementInstalled || !fileUntouched) {
      if (existsSync(legacyPath)) plan.leftover.push(legacyFile);
      continue;
    }
    if (existsSync(legacyPath)) {
      plan.removed.push(legacyFile);
      if (!options.dryRun) rmSync(legacyPath, { force: true });
    }
    retireAgents.push(legacy);
  }

  const agentsPath = join(targetDir, 'AGENTS.md');
  const ignorePath = join(targetDir, '.gitignore');
  const configs = [join(targetDir, 'opencode.json'), join(targetDir, '.opencode/opencode.json')].filter((path) => existsSync(path));
  if (configs.length === 0) configs.push(join(targetDir, 'opencode.json'));
  const merges: Array<[string, { content: string; changed: boolean; removed?: string[] }]> = [];
  merges.push([agentsPath, injectSections(existsSync(agentsPath) ? readFileSync(agentsPath, 'utf-8') : '', markdownSections(templateDir, templateOptions))]);
  merges.push([ignorePath, mergeGitignore(existsSync(ignorePath) ? readFileSync(ignorePath, 'utf-8') : '')]);
  for (const path of configs) merges.push([path, mergeJson(existsSync(path) ? readFileSync(path, 'utf-8') : '', targetDir, templateDir, retireAgents, plan.created)]);
  for (const [path, result] of merges) {
    const label = relative(targetDir, path);
    for (const name of result.removed ?? []) plan.removed.push(`${label} → ${name}`);
    if (!result.changed) plan.skipped.push(label);
    else { plan.injected.push(label); if (!options.dryRun) writeFile(path, result.content); }
  }

  const sessionsIgnore = join(sessionsDir(targetDir), '.gitignore');
  // `migrateLegacyState` renames the legacy session store into the new one, so a legacy
  // `.gitignore` already sits at the new path when this check runs. A dry run does not perform
  // that rename, and must still not promise to create a file the real run leaves alone.
  const legacySessionsIgnore = join(targetDir, '.cortex-sessions', '.gitignore');
  // npm never publishes a file named `.gitignore`, so the template cannot carry this one either;
  // adoption seeds it the same way it seeds the session store's.
  const opencodeIgnore = join(targetDir, '.opencode', '.gitignore');
  for (const [path, content, present] of [
    [sessionsIgnore, '*\n', existsSync(sessionsIgnore) || existsSync(legacySessionsIgnore)],
    [opencodeIgnore, OPENCODE_GITIGNORE, existsSync(opencodeIgnore)],
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
