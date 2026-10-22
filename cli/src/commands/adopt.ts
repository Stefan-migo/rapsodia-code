import { existsSync } from 'fs';
import { resolve, join } from 'path';
import * as readline from 'readline';
import { adoptProject, isDirty } from '../engine/adopt';
import type { AdoptOptions } from '../engine/adopt';
import { error, heading, info, success, warn } from '../utils/logger';

const TEMPLATE_DIR = join(__dirname, '..', 'src', 'template');

function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveAnswer) => rl.question(`${question} (y/N): `, (answer) => { rl.close(); resolveAnswer(/^y(es)?$/i.test(answer.trim())); }));
}

export async function adoptCommand(path: string | undefined, options: AdoptOptions): Promise<void> {
  const targetDir = resolve(path || process.cwd());
  if (!existsSync(targetDir)) { error(`Directory not found: ${targetDir}`); process.exit(1); }
  const dirty = isDirty(targetDir);
  if (dirty === true) {
    // A hard refusal here would make adopt impossible to re-run: adopt itself leaves the
    // working tree dirty, so the second run would always need --force. The structural
    // protections cover the real risk: an owned file whose content differs from what Rapsodia
    // last recorded is never replaced unless --force is given, and the merge targets
    // (AGENTS.md, .gitignore) are merged in place, never reset to the template.
    // So this informs instead of blocking.
    warn('Working tree is dirty. Rapsodia writes only its own files and the merge targets it merges into (AGENTS.md, .gitignore); uncommitted work anywhere else is left alone.');
  } else if (dirty === undefined) {
    warn('Could not determine whether the working tree is dirty. Rapsodia will still classify existing files before writing.');
  }
  if (!options.yes && !options.dryRun && !(await promptYesNo(`Adopt Rapsodia into "${targetDir}"?`))) { info('Adoption cancelled.'); return; }
  const plan = adoptProject(targetDir, options, TEMPLATE_DIR);
  heading(options.dryRun ? 'Rapsodia Adoption Plan (dry run)' : 'Rapsodia Adoption');
  for (const [label, items] of [['Created', plan.created], ['Refreshed', plan.refreshed], ['Removed', plan.removed], ['Leftover', plan.leftover], ['Conflicting', plan.conflicting], ['Overwritten', plan.overwritten], ['Injected', plan.injected], ['Seeded', plan.seeded], ['Skipped', plan.skipped]] as const) {
    info(`${label} (${items.length}):`); items.forEach((item) => info(`  ${item}`));
  }
  for (const file of plan.overwritten) warn(`File was overwritten: ${file}`);
  if (plan.leftover.length > 0) {
    // Report the outcome, never prescribe it: these paths are the project's own, and no flag
    // overwrites them. The human decides what to do with the retired identity left behind.
    warn(`${plan.leftover.length} retired path(s) kept because their content differs from what Rapsodia wrote.`);
  }
  if (plan.conflicting.length > 0) {
    // Report the outcome, never prescribe it: after a forced overwrite the conflicts are gone, so
    // telling the user to re-run with --force would replace the only signal that it just happened.
    if (!options.force || options.dryRun) warn('Conflicting files are project-owned. Re-run with --force to overwrite them.');
  }
  if (options.dryRun) warn('Dry run — no changes applied.'); else success('Rapsodia adopted successfully.');
}
