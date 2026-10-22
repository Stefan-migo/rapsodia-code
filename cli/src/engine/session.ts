import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { execFileSync, commandAvailable } from '../utils/exec';
import { success, warn } from '../utils/logger';
import { readProjectName, resolveGraphifyPaths } from './project';
import { stateDir, statePath, resolveStatePath, PROJECT_STATE_DIR_NAME, LEGACY_PROJECT_STATE_DIR_NAME } from '../utils/state';

/**
 * The prepared-context record. Pi owns the Engram session (`gentle-engram` opens, summarizes, and
 * captures), so this record only says which prelude this project last prepared and when. It is not
 * a session and closing it never talks to Engram.
 */
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

/** Record what `rapso start` prepared. Local state only; no MCP call. */
export function prepareContext(projectDir: string, sessionId: string, projectName: string): void {
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

/**
 * Export Engram memory to the Obsidian vault. A project that ships the template script uses it;
 * a native Windows box has no `bash`, so the direct `engram` call is the fallback rather than a
 * second choice gated behind a file that always exists.
 */
export function exportWiki(projectDir: string): boolean {
  try {
    const scriptPath = join(projectDir, 'scripts', 'engram-export-wiki.sh');
    if (existsSync(scriptPath) && commandAvailable('bash')) {
      execFileSync('bash', [scriptPath], { cwd: projectDir, stdio: 'pipe', timeout: 30000 });
    } else {
      execFileSync('engram', ['obsidian-export', '--vault', 'wiki'], { cwd: projectDir, stdio: 'pipe', timeout: 30000 });
    }
    success('Wiki export complete');
    return true;
  } catch (e: any) {
    warn(`Wiki export skipped: ${e.message}`);
    return false;
  }
}

/** Remove the prepared-context record and the prelude it points at, including the legacy path. */
export function clearPreparedContext(projectDir: string): number {
  const targets = [
    resolveStatePath(projectDir, 'session.json'),
    statePath(projectDir, 'prelude.md'),
    join(projectDir, LEGACY_PROJECT_STATE_DIR_NAME, 'prelude.md'),
  ];
  let removed = 0;
  for (const target of targets) {
    if (target && existsSync(target)) {
      unlinkSync(target);
      removed += 1;
    }
  }
  return removed;
}

export function generateRetrospective(
  projectDir: string,
  summary: string,
  warnings: string[],
  startedAt?: Date,
): string {
  const startDate = startedAt ?? new Date();
  const endDate = new Date();
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = Math.floor(durationMs / 3600000);
  const durationMinutes = Math.floor((durationMs % 3600000) / 60000);
  const durationStr = durationHours > 0
    ? `${durationHours}h ${durationMinutes}m`
    : `${durationMinutes}m`;

  const iso = startDate.toISOString();
  const dateStr = iso.split('T')[0];
  const sessionLabel = `rapso-${iso.slice(0, 16).replace('T', '-').replace(':', '')}`;

  const gaps: string[] = [];
  const suggestions: string[] = [];

  const warnText = warnings.join(' ').toLowerCase();
  if (warnText.includes('graphify') || !existsSync(resolveGraphifyPaths(projectDir).graphJson)) {
    gaps.push('Graphify report not found at session start');
    suggestions.push('Run `graphify . --update` to enable code structure awareness');
  }
  if (warnText.includes('engram')) {
    gaps.push('Engram was unavailable while preparing the context');
    suggestions.push('Ensure Engram is available for memory persistence');
  }

  if (gaps.length === 0) {
    gaps.push('None detected');
  }
  if (suggestions.length === 0) {
    suggestions.push('Continue with current workflow — no major gaps detected');
  }

  return `# Session Retrospective

**Session**: ${sessionLabel}
**Project**: ${readProjectName(projectDir)}
**Date**: ${dateStr}
**Duration**: ${durationStr}

## Summary
${summary || 'No summary provided'}

## What Went Well
- Context prepared and finalized cleanly
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
