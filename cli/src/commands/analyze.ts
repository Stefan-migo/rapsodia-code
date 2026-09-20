import { execFileSync } from '../utils/exec';
import { info, success, warn, error, heading } from '../utils/logger';
import { findProjectRoot, readProjectName } from '../engine/project';

interface AnalyzeOptions {
  json?: boolean;
  sessions?: string;
  dryRun?: boolean;
}

interface AnalyzeResult {
  project: string;
  sessionsAnalyzed: number;
  period: { from: string; to: string };
  frequency: number;
  averageDuration: string;
  commonThemes: string[];
  gaps: string[];
  suggestions: string[];
}

function extractThemes(text: string): Map<string, number> {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'not',
    'no', 'nor', 'none', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'he', 'she', 'it', 'they', 'them', 'this', 'that', 'these', 'those',
    'if', 'then', 'than', 'so', 'about', 'into', 'over', 'after', 'before',
    'between', 'under', 'during', 'without', 'through', 'up', 'down',
    'out', 'off', 'above', 'below', 'just', 'also', 'very', 'too',
    'session', 'sessions', 'project', 'summary', 'start', 'end', 'close',
    'opencode', 'rapso', 'done', 'get', 'got', 'per', 'set', 'let',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return freq;
}

export async function analyzeCommand(options: AnalyzeOptions): Promise<void> {
  heading('Rapsodia Session Analysis');

  const projectDir = findProjectRoot(process.cwd());
  if (!projectDir) {
    error('Not inside a Rapsodia project');
    process.exit(1);
  }

  const projectName = readProjectName(projectDir);
  info(`Project: ${projectName}`);

  const sessionCount = parseInt(options.sessions || '10', 10);
  info(`Analyzing last ${sessionCount} sessions...`);

  if (options.dryRun) {
    info('');
    info('Dry run — analysis would:');
    info('  1. Run `engram context` to fetch session data');
    info('  2. Extract session frequency patterns');
    info('  3. Compute word frequency from session summaries');
    info('  4. Detect missing tool gaps (Graphify, Engram)');
    info('  5. Generate suggestions report');
    return;
  }

  let engramOutput = '';
  try {
    engramOutput = execFileSync('engram', ['context', projectName], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e: any) {
    warn(`Engram context unavailable: ${e.message}`);
  }

  const sessionsAnalyzed = options.dryRun ? sessionCount : 0;
  const commonThemes: string[] = [];
  const gaps: string[] = [];
  const suggestions: string[] = [];

  if (engramOutput) {
    const themes = extractThemes(engramOutput);
    const sorted = [...themes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [word, count] of sorted) {
      if (count >= 2) {
        commonThemes.push(word);
      }
    }

    const lower = engramOutput.toLowerCase();
    if (lower.includes('graphify') || lower.includes('graph not') || lower.includes('no graph')) {
      gaps.push('graphify');
      suggestions.push('Run `graphify . --update` to enable code awareness');
    }
    if (lower.includes('sdd') || lower.includes('no tasks')) {
      gaps.push('sdd');
      suggestions.push('Use `/sdd-new` before starting complex features');
    }
    if (lower.includes('engram') && (lower.includes('fail') || lower.includes('unavail') || lower.includes('not found'))) {
      gaps.push('engram');
    }
  } else {
    gaps.push('No session data available');
    suggestions.push('Complete a few sessions to generate meaningful analysis');
  }

  if (suggestions.length === 0) {
    suggestions.push('Continue with current workflow — no major gaps detected');
  }

  const result: AnalyzeResult = {
    project: projectName,
    sessionsAnalyzed,
    period: { from: '—', to: '—' },
    frequency: 0,
    averageDuration: '—',
    commonThemes: commonThemes.slice(0, 5),
    gaps,
    suggestions,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  heading('Analysis Report');

  console.log(`Project:          ${result.project}`);
  console.log(`Sessions:         ${result.sessionsAnalyzed === 0 ? 'No data available' : result.sessionsAnalyzed}`);
  console.log(`Period:           ${result.period.from} to ${result.period.to}`);
  console.log(`Frequency:        ${result.frequency > 0 ? `${result.frequency.toFixed(1)}/day` : '—'}`);
  console.log(`Avg Duration:     ${result.averageDuration}`);
  console.log('');

  if (result.commonThemes.length > 0) {
    console.log('Common Themes:');
    for (const theme of result.commonThemes) {
      console.log(`  - ${theme}`);
    }
  } else {
    console.log('Common Themes:  — (insufficient data)');
  }
  console.log('');

  if (result.gaps.length > 0) {
    console.log('Gaps Detected:');
    for (const gap of result.gaps) {
      console.log(`  ⚠ ${gap}`);
    }
    console.log('');
  }

  console.log('Suggestions:');
  for (const s of result.suggestions) {
    console.log(`  ${s}`);
  }
}
