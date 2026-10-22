import { spawn } from '../utils/exec';
import { info, success, warn, error, heading } from '../utils/logger';
import { generateSessionId, prepareContext } from '../engine/session';
import { buildPrelude } from '../engine/context';
import { findProjectRoot, readProjectName } from '../engine/project';
import { migrateLegacyState, PROJECT_STATE_DIR_NAME } from '../utils/state';

interface StartOptions {
  prelude?: boolean;
  dryRun?: boolean;
  run?: boolean;
}

const DEFAULT_AGENT = 'gentle-shell';

export async function startCommand(options: StartOptions): Promise<void> {
  heading('Rapsodia Context Start');

  const projectDir = findProjectRoot(process.cwd());
  if (!projectDir) {
    error('Not inside a Rapsodia project. Run `rapso init <name>` first.');
    process.exit(1);
  }

  for (const move of migrateLegacyState(projectDir)) info(`State migration: ${move}`);

  const projectName = readProjectName(projectDir);
  info(`Project: ${projectName}`);
  info(`Directory: ${projectDir}`);

  const agent = process.env.RAPSO_AGENT || DEFAULT_AGENT;
  const sessionId = generateSessionId();
  info(`Context: ${sessionId}`);

  if (options.dryRun) {
    heading('Dry Run — No Actions Taken');
    info('The following would happen:');
    info('  1. Generate the prepared-context id');
    info(`  2. Write ${PROJECT_STATE_DIR_NAME}/session.json (local state, no Engram session)`);
    if (options.prelude !== false) {
      info(`  3. Build context prelude (${PROJECT_STATE_DIR_NAME}/prelude.md):`);
      info('     - Engram recent context');
      info('     - Graphify codebase report');
      info('     - Project manifest info');
    } else {
      info('  3. Skip context prelude (--no-prelude)');
    }
    if (options.run) {
      info(`  ${options.prelude !== false ? 4 : 3}. Launch ${agent}`);
    } else {
      info('  Run the agent yourself, or pass --run to launch it.');
    }
    return;
  }

  prepareContext(projectDir, sessionId, projectName);

  if (options.prelude !== false) {
    await buildPrelude(projectDir, projectName);
  }

  if (!options.run) {
    heading('Context Prepared');
    success('Prepared the project context without launching an agent');
    info(`Context: ${sessionId}`);
    info(`Prelude: ${PROJECT_STATE_DIR_NAME}/prelude.md`);
    info('Open your agent (gentle-shell) and read the prelude before the first task.');
    info('Run `rapso close` when done to export the wiki and clean up.');
    return;
  }

  if (!process.stdout.isTTY) {
    warn('Not a TTY terminal — the agent may not display correctly.');
  }

  heading(`Launching ${agent}`);
  info(`Context: ${sessionId}`);
  info('');

  const child = spawn(agent, [], {
    cwd: projectDir,
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err: Error) => {
    error(`Failed to launch ${agent}: ${err.message}`);
    info('Set RAPSO_AGENT to an agent binary available on PATH.');
    process.exit(1);
  });

  child.on('exit', (code: number | null) => {
    heading('Agent Exited');
    if (code === 0) {
      success(`${agent} completed`);
    } else {
      warn(`${agent} exited with code ${code}`);
    }
    info('Run `rapso close` to export the wiki and finalize the prepared context.');
    process.exit(code === null ? 1 : code);
  });
}
