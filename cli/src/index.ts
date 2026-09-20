#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { installCommand } from './commands/install';
import { startCommand } from './commands/start';
import { closeCommand } from './commands/close';
import { statusCommand } from './commands/status';
import { updateCommand } from './commands/update';
import { analyzeCommand } from './commands/analyze';
import { worktreeCommand } from './commands/worktree';
import { adoptCommand } from './commands/adopt';
import { formatDefectReport, isExpected } from './utils/defect';
import { CLI_VERSION } from './utils/version';

const program = new Command();

program
  .name('rapso')
  .description('Scaffold and manage project development workflows')
  .version(CLI_VERSION);

program
  .command('init')
  .description('Scaffold a new Rapsodia project')
  .argument('<name>', 'project name')
  .option('--template <type>', 'project template type (default, api, web, cli, lib)', 'default')
  .option('--no-git', 'skip git init')
  .option('--yes', 'skip prompts (auto mode)')
  .option('--force', 'overwrite existing directory')
  .action(async (name, options) => {
    await initCommand(name, options);
  });

program
  .command('install')
  .description('Check and install dependencies')
  .option('--check', 'check only, do not install')
  .action(async (options) => {
    await installCommand(options);
  });

program
  .command('start')
  .description('Start a session: load context and launch opencode')
  .option('--no-prelude', 'skip context pre-load')
  .option('--no-open', 'prepare session without launching opencode')
  .option('--dry-run', 'show what would happen without launching')
  .action(async (options) => {
    await startCommand(options);
  });

program
  .command('close')
  .description('Close a session: summarize, export, cleanup')
  .option('--message <text>', 'session summary text')
  .option('--no-export', 'skip wiki export')
  .option('--retrospective', 'generate session retrospective')
  .action(async (options) => {
    await closeCommand(options);
  });

program
  .command('status')
  .description('Show brain health overview')
  .option('--json', 'output as JSON')
  .action(async (options) => {
    await statusCommand(options);
  });

program
  .command('update')
  .description('Update brain template from latest version')
  .option('--dry-run', 'show changes without applying')
  .option('--force', 'auto-apply all changes')
  .option('--check', 'check if updates are available')
  .action(async (options) => {
    await updateCommand(options);
  });

program
  .command('adopt [path]')
  .description('Install Rapsodia into an existing project')
  .option('--dry-run', 'show the adoption plan without applying it')
  .option('--yes', 'skip prompts and accept owned-file refreshes')
  .option('--force', 'overwrite user-modified owned files')
  .action(async (path, options) => { await adoptCommand(path, options); });

program
  .command('analyze')
  .description('Analyze session patterns and suggest improvements')
  .option('--json', 'output as JSON')
  .option('--sessions <n>', 'number of sessions to analyze', '10')
  .option('--dry-run', 'show what analysis would do without running')
  .action(async (options) => {
    await analyzeCommand(options);
  });

program.addCommand(worktreeCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  if (!isExpected(err)) console.error(formatDefectReport(err, { command: process.argv[2] ?? 'unknown' }));
  process.exitCode = 1;
});
