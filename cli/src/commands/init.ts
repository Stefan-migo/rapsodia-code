import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { execFileSync } from '../utils/exec';
import { copyTemplate, TemplateOptions } from '../engine/template';
import { writeProjectIgnores } from '../engine/gitignore';
import { generateManifest } from '../engine/manifest';
import { info, success, warn, error, step, heading } from '../utils/logger';
import { addProject } from '../utils/config';
import { PROJECT_STATE_DIR_NAME } from '../utils/state';

interface InitOptions {
  template?: string;
  git?: boolean;
  yes?: boolean;
  force?: boolean;
}

function validateProjectName(name: string): string | null {
  if (!name || name.length === 0) return 'Project name cannot be empty';
  if (process.platform === 'win32' && /[. ]$/.test(name)) return 'Project name cannot end with a dot or space on Windows';
  if (process.platform === 'win32' && /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    return 'Project name is reserved on Windows because it names a device';
  }
  if (/[\s]/.test(name)) return 'Project name cannot contain spaces';
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return 'Project name contains invalid characters';
  if (name === '.' || name === '..') return 'Project name cannot be . or ..';
  if (/^[.-]/.test(name)) return 'Project name cannot start with . or -';
  return null;
}

function getDate(): string {
  return new Date().toISOString().split('T')[0];
}

export async function initCommand(name: string, options: InitOptions): Promise<void> {
  const validationError = validateProjectName(name);
  if (validationError) {
    error(validationError);
    process.exit(1);
  }

  const targetDir = join(process.cwd(), name);

  if (existsSync(targetDir)) {
    if (!options.force) {
      error(`Directory "${name}" already exists. Use --force to overwrite.`);
      process.exit(1);
    }
    warn(`Directory "${name}" already exists. Overwriting...`);
    // Remove stale .git so git init works cleanly
    const oldGitDir = join(targetDir, '.git');
    if (existsSync(oldGitDir)) {
      rmSync(oldGitDir, { recursive: true, force: true });
    }
  }

  const templateType = (options.template as TemplateOptions['projectType']) || 'default';

  heading(`Creating new Rapsodia project: ${name}`);

  const templateOptions: TemplateOptions = {
    projectName: name,
    projectType: templateType,
    date: getDate(),
    year: new Date().getFullYear().toString(),
  };

  step('Copying template files');
  const copiedFiles = copyTemplate(targetDir, templateOptions);
  // npm never publishes a file named `.gitignore`, so no template can carry one and the CLI writes
  // them here. See engine/gitignore.ts for why the content lives in code.
  const writtenIgnores = writeProjectIgnores(targetDir);
  success(`Copied ${copiedFiles.length + writtenIgnores.length} files`);

  step('Generating manifest');
  generateManifest(targetDir, templateOptions);
  success(`${PROJECT_STATE_DIR_NAME}/manifest.json created`);

  step('Initializing git repository');
  if (options.git !== false) {
    // One utility owns process launching, and it never builds a shell command line — the shell
    // strings passed here reintroduced the unescaped-argument class the branch exists to close.
    const git = (...args: string[]): string => execFileSync('git', args, { cwd: targetDir, encoding: 'utf-8', stdio: 'pipe' });
    try {
      git('init');
      try {
        git('config', 'user.email', 'rapsodia@template.local');
        git('config', 'user.name', 'Rapsodia Template');
      } catch {
        // user config might already be set globally, that's fine
      }
      git('add', '-A');
      git('commit', '-m', 'Initial commit from Rapsodia template');
      success('Git repository initialized with initial commit');
    } catch (e) {
      // The utility keeps the captured streams on the error, where `execSync` folded them into
      // `message`; both are searched, and stderr is what the operator needs to see.
      const failure = e as { message?: string; stdout?: unknown; stderr?: unknown };
      const text = (value: unknown): string => typeof value === 'string' ? value : '';
      const stderr = text(failure.stderr);
      // "nothing to commit" is harmless — only warn on real failures
      if (`${failure.message ?? ''}\n${text(failure.stdout)}\n${stderr}`.includes('nothing to commit')) {
        success('Git repository already initialized');
      } else {
        warn(`Git init skipped: ${stderr.trim() || failure.message || String(e)}`);
      }
    }
  } else {
    info('Skipping git init (--no-git)');
  }

  addProject(name);

  heading('Done!');
  info(`Project "${name}" created at ${targetDir}`);
  info('');
  info('Next steps:');
  info(`  cd ${name}`);
  info('  rapso install     # Check and install dependencies');
  info('  opencode          # Launch the agent');
}
