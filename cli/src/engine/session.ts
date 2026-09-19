import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { execFileSync, commandAvailable } from '../utils/exec';
import { MCPClient } from '../utils/mcp';
import { info, success, warn, step } from '../utils/logger';
import { readProjectName, resolveGraphifyPaths } from './project';
import { stateDir, statePath, resolveStatePath, PROJECT_STATE_DIR_NAME } from '../utils/state';

export interface SessionInfo {
  sessionId: string;
  projectName: string;
  startedAt: string;
  preludeFile: string;
}

export interface Retrospective {
  content: string;
  filePath: string;
}

export function generateSessionId(): string {
  const date = new Date().toISOString().split('T')[0];
  const suffix = randomBytes(4).toString('hex');
  return `rapso-${date}-${suffix}`;
}

export async function openSession(projectDir: string, sessionId: string): Promise<boolean> {
  step('Opening Engram session via MCP');

  const projectName = readProjectName(projectDir);

  try {
    const client = new MCPClient('engram', ['mcp']);
    try {
      await client.initialize();
      await client.callTool('mem_session_start', { id: sessionId });
    } finally {
      await client.close();
    }
    success('Engram session started');
  } catch (e: any) {
    warn(`Engram MCP not available: ${e.message || 'unknown error'}`);
    info('Continuing without session tracking');
  }

  step('Writing session metadata');
  const rapsodiaDir = stateDir(projectDir);
  if (!existsSync(rapsodiaDir)) {
    mkdirSync(rapsodiaDir, { recursive: true });
  }

  const sessionInfo: SessionInfo = {
    sessionId,
    projectName,
    startedAt: new Date().toISOString(),
    preludeFile: `${PROJECT_STATE_DIR_NAME}/prelude.md`,
  };

  writeFileSync(
    join(rapsodiaDir, 'session.json'),
    JSON.stringify(sessionInfo, null, 2),
    'utf-8',
  );

  success(`Session ${sessionId} opened`);
  return true;
}

export async function closeSession(
  projectDir: string,
  sessionId: string,
  summary?: string,
): Promise<boolean> {
  step('Finalizing Engram session');

  try {
    const client = new MCPClient('engram', ['mcp']);
    try {
      await client.initialize();

      if (summary) {
        try {
          await client.callTool('mem_session_summary', {
            session_id: sessionId,
            content: summary,
          });
          success('Session summary saved');
        } catch (e: any) {
          warn(`Failed to save session summary: ${e.message}`);
        }
      }

      try {
        await client.callTool('mem_session_end', { id: sessionId });
        success('Session ended via Engram');
      } catch (e: any) {
        warn(`Failed to end session via Engram: ${e.message}`);
      }
    } finally {
      await client.close();
    }
  } catch (e: any) {
    warn(`Engram MCP not available: ${e.message}`);
  }

  step('Exporting to wiki');
  try {
    // Gating on the file alone made the `engram` fallback below unreachable on Windows: the
    // template ships the script, but a native Windows box has no `bash` to run it, so the whole
    // export fell through to the catch and degraded to a warning.
    const scriptPath = join(projectDir, 'scripts', 'engram-export-wiki.sh');
    if (existsSync(scriptPath) && commandAvailable('bash')) {
      execFileSync('bash', [scriptPath], {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 30000,
      });
      success('Wiki export complete');
    } else {
      execFileSync('engram', ['obsidian-export', '--vault', 'wiki'], {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 30000,
      });
      success('Wiki export complete');
    }
  } catch (e: any) {
    warn(`Wiki export skipped: ${e.message}`);
  }

  step('Cleaning up session files');
  const sessionPath = resolveStatePath(projectDir, 'session.json');
  try {
    if (sessionPath && existsSync(sessionPath)) {
      unlinkSync(sessionPath);
      success('Session file cleaned up');
    }
  } catch (e: any) {
    warn(`Failed to clean up session file: ${e.message}`);
  }

  return true;
}

export function getSessionInfo(projectDir: string): SessionInfo | null {
  const sessionPath = resolveStatePath(projectDir, 'session.json');
  if (!sessionPath || !existsSync(sessionPath)) {
    return null;
  }

  try {
    const raw = readFileSync(sessionPath, 'utf-8');
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}

export function generateRetrospective(
  projectDir: string,
  sessionInfo: SessionInfo,
  summary: string,
  warnings: string[],
): string {
  const startDate = new Date(sessionInfo.startedAt);
  const endDate = new Date();
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = Math.floor(durationMs / 3600000);
  const durationMinutes = Math.floor((durationMs % 3600000) / 60000);
  const durationStr = durationHours > 0
    ? `${durationHours}h ${durationMinutes}m`
    : `${durationMinutes}m`;

  const dateStr = startDate.toISOString().split('T')[0];

  const gaps: string[] = [];
  const suggestions: string[] = [];

  const warnText = warnings.join(' ').toLowerCase();
  if (warnText.includes('graphify') || !existsSync(resolveGraphifyPaths(projectDir).graphJson)) {
    gaps.push('Graphify report not found at session start');
    suggestions.push('Run `graphify . --update` to enable code structure awareness');
  }
  if (warnText.includes('sdd')) {
    gaps.push('SDD change artifacts not found');
    suggestions.push('Use `/sdd-new` before starting complex features');
  }
  if (warnText.includes('engram')) {
    gaps.push('Engram MCP unavailable during session');
    suggestions.push('Ensure Engram MCP is available for memory persistence');
  }

  if (gaps.length === 0) {
    gaps.push('None detected');
  }
  if (suggestions.length === 0) {
    suggestions.push('Continue with current workflow — no major gaps detected');
  }

  return `# Session Retrospective

**Session**: ${sessionInfo.sessionId}
**Project**: ${sessionInfo.projectName}
**Date**: ${dateStr}
**Duration**: ${durationStr}

## Summary
${summary || 'No summary provided'}

## What Went Well
- Session completed successfully
${summary ? `- Goal: ${summary}` : ''}

## What Could Be Improved
${gaps.map((g) => `- ${g}`).join('\n')}

## Context Gaps
${gaps.map((g) => `- ${g}`).join('\n')}

## Suggestions for Next Session
${suggestions.map((s) => `- ${s}`).join('\n')}
`;
}

export function saveRetrospective(projectDir: string, content: string): string {
  const retroDir = statePath(projectDir, 'retrospectives');
  mkdirSync(retroDir, { recursive: true });

  const match = content.match(/\*\*Session\*\*: (.+)/);
  const sessionId = match ? match[1].trim() : `session-${Date.now()}`;
  const dateStr = new Date().toISOString().split('T')[0];

  const fileName = `${dateStr}-${sessionId}.md`;
  const filePath = join(retroDir, fileName);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
