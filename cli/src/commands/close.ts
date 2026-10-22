import { existsSync } from 'fs';
import * as readline from 'readline';
import { step, info, success, warn, heading } from '../utils/logger';
import { getSessionInfo, exportWiki, clearPreparedContext, generateRetrospective, saveRetrospective } from '../engine/session';
import { resolveGraphifyPaths } from '../engine/project';

interface CloseOptions {
  message?: string;
  export?: boolean;
  retrospective?: boolean;
}

function promptForSummary(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('');
    rl.question('Session summary (Ctrl+D to skip): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function closeCommand(options: CloseOptions): Promise<void> {
  heading('Rapsodia Close');

  const projectDir = process.cwd();
  const sessionInfo = getSessionInfo(projectDir);

  if (sessionInfo) {
    info(`Prepared context: ${sessionInfo.sessionId}`);
    info(`Started: ${sessionInfo.startedAt}`);
    info(`Project: ${sessionInfo.projectName}`);
  } else {
    info('No prepared context found in this directory; finalizing what exists.');
  }
  info('');

  if (options.export !== false) {
    step('Exporting wiki');
    exportWiki(projectDir);
  }

  step('Cleaning up prepared context');
  try {
    const removed = clearPreparedContext(projectDir);
    if (removed > 0) {
      success(`Removed ${removed} prepared-context file(s)`);
    } else {
      info('Nothing to clean up');
    }
  } catch (e: any) {
    warn(`Failed to clean up prepared context: ${e.message}`);
  }

  let summary = options.message;
  if (!summary && options.retrospective && process.stdin.isTTY) {
    summary = await promptForSummary();
  }

  if (options.retrospective) {
    step('Generating session retrospective');
    const warnings: string[] = [];
    if (!existsSync(resolveGraphifyPaths(projectDir).graphJson)) {
      warnings.push('Graphify report not found at session start');
    }
    const startedAt = sessionInfo?.startedAt ? new Date(sessionInfo.startedAt) : undefined;
    const retroContent = generateRetrospective(projectDir, summary || '', warnings, startedAt);
    const retroPath = saveRetrospective(projectDir, retroContent);
    success(`Retrospective saved: ${retroPath}`);
  }

  heading('Context Finalized');
  success('Prepared context finalized');
  if (summary) {
    info(`Summary: ${summary}`);
  }
}
