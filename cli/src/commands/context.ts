import { error, heading, info, success } from '../utils/logger';
import { buildPrelude } from '../engine/context';
import { findProjectRoot, readProjectName } from '../engine/project';
import { PROJECT_STATE_DIR_NAME } from '../utils/state';

interface ContextOptions {
  dryRun?: boolean;
}

/**
 * Refresh the context prelude without preparing a session, generating an id, or launching an
 * agent. It is the non-interactive entry point a Pi extension calls on session start, so it must
 * stay free of side effects beyond the prelude file itself.
 */
export async function contextCommand(options: ContextOptions): Promise<void> {
  heading('Rapsodia Context Prelude');

  const projectDir = findProjectRoot(process.cwd());
  if (!projectDir) {
    error('Not inside a Rapsodia project. Run `rapso init <name>` first.');
    process.exit(1);
  }

  const projectName = readProjectName(projectDir);
  info(`Project: ${projectName}`);
  info(`Directory: ${projectDir}`);

  if (options.dryRun) {
    heading('Dry Run — No Actions Taken');
    info('The following would happen:');
    info(`  1. Build the context prelude (${PROJECT_STATE_DIR_NAME}/prelude.md):`);
    info('     - Engram recent context');
    info('     - Graphify codebase report');
    info('     - Project manifest info');
    info('No prepared-context record is written and no agent is launched.');
    return;
  }

  await buildPrelude(projectDir, projectName);
  success(`Prelude ready: ${PROJECT_STATE_DIR_NAME}/prelude.md`);
}
