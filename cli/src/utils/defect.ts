import { readFileSync } from 'fs';
import { join } from 'path';

export class ExpectedError extends Error {}

export function isExpected(error: unknown): boolean {
  return error instanceof ExpectedError;
}

const LEADING = /^[("'`\[{<]*/;
const TRAILING = /[)"'\]}.,;!?]+$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const ASSIGNMENT = /^([^\s=]+)=(.+)$/;
const AUTH_CREDENTIAL = /(Authorization\s*:\s*)?\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SPACED_FLAG = /(^|\s)(-{1,2}[A-Za-z0-9_-]+)\s+(\S+)/g;
const QUOTED_VALUE = /(^|\s)(-{0,2}[A-Za-z0-9_.-]+)(=|\s+)("[^"]*"|'[^']*')/g;
const QUOTED_RUN = /(^|\s)("[^"]*"|'[^']*')/g;
const CREDENTIAL_WORDS = new Set([
  'token', 'secret', 'password', 'passwd', 'pass', 'pwd',
  'apikey', 'privatekey', 'auth', 'credential', 'credentials', 'creds',
]);

function isCredentialFlag(flag: string): boolean {
  const bare = flag.replace(/^-+|=+$/g, '').toLowerCase();
  return CREDENTIAL_WORDS.has(bare.replace(/[-_]/g, ''))
    || bare.split(/[-_]/).some((word) => CREDENTIAL_WORDS.has(word));
}

function scrubUrl(value: string): string {
  const authority = value.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]*)/i)?.[1] ?? '';
  return `${value.slice(0, value.indexOf('://') + 3)}${authority.replace(/^[^/@]*@/, '')}<redacted>`;
}

function scrubValue(value: string, cwd: string, home: string): string | null {
  if (HAS_SCHEME.test(value)) return scrubUrl(value);
  const hasPathPrefix = (path: string): boolean => value === path || value.startsWith(`${path}/`) || value.startsWith(`${path}\\`);
  if (hasPathPrefix(cwd)) return `<cwd>${value.slice(cwd.length)}`;
  if (home && hasPathPrefix(home)) return `<home>${value.slice(home.length)}`;
  if (/^(?:\/|[A-Za-z]:[\\/])/.test(value)) return '<path>';
  return null;
}

function scrubToken(token: string, cwd: string, home: string): string {
  const leading = token.match(LEADING)?.[0] ?? '';
  const rest = token.slice(leading.length);
  const trailing = rest.match(TRAILING)?.[0] ?? '';
  const value = trailing ? rest.slice(0, -trailing.length) : rest;
  if (!value) return token;
  const wrap = (s: string) => `${leading}${s}${trailing}`;

  const redacted = scrubValue(value, cwd, home);
  if (redacted !== null) return wrap(redacted);
  const assignment = value.match(ASSIGNMENT);
  if (assignment) {
    const name = assignment[1] ?? '';
    const assigned = assignment[2] ?? '';
    if (isCredentialFlag(name)) return wrap(`${name}=<redacted>`);
    return wrap(`${name}=${scrubValue(assigned, cwd, home) ?? assigned}`);
  }
  return token;
}

/**
 * `QUOTED_VALUE` only reaches a quoted value that follows a flag, so an absolute path git quoted on
 * its own — `fatal: not a git repository: 'C:\Users\...'` — had its head redacted as a
 * whitespace-delimited token and its tail, the part after the space in the path, left readable.
 *
 * URLs are skipped because the token pass already redacts them, and it would append a second
 * `<redacted>` to what `scrubUrl` produced.
 *
 * ponytail: a path git did NOT quote, containing a space, still splits and leaks its tail. Extend
 * only if a report shows one.
 *
 * A run opens only at the start of a word, so the apostrophe in `it's` cannot pair with the quote
 * that opens the path after it.
 */
function scrubQuotedRun(text: string, cwd: string, home: string): string {
  return text.replace(QUOTED_RUN, (match, lead: string, run: string) => {
    const inner = run.slice(1, -1);
    if (HAS_SCHEME.test(inner) || inner.includes('<redacted>')) return match;
    const redacted = scrubValue(inner, cwd, home);
    return redacted === null ? match : `${lead}${run[0]}${redacted}${run[0]}`;
  });
}

export function scrub(text: string, cwd = process.cwd()): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const withoutAuth = text.replace(AUTH_CREDENTIAL, (_match, header: string | undefined, scheme: string) => `${header ?? ''}${scheme} <redacted>`);
  const withoutQuoted = scrubQuotedRun(withoutAuth.replace(QUOTED_VALUE, (match, lead: string, flag: string, separator: string, raw: string) => {
    if (isCredentialFlag(flag)) return `${lead}${flag}${separator}<redacted>`;
    const inner = raw.slice(1, -1);
    const redactedInner = scrubValue(inner, cwd, home) ?? scrub(inner, cwd);
    return redactedInner === inner ? match : `${lead}${flag}${separator}${redactedInner}`;
  }), cwd, home);
  const withoutFlags = withoutQuoted.replace(SPACED_FLAG, (match, lead: string, flag: string) => isCredentialFlag(flag) ? `${lead}${flag} <redacted>` : match);
  return withoutFlags.split(/(\s+)/).map((token) => token.trim() ? scrubToken(token, cwd, home) : token).join('');
}

export interface DefectContext { command: string; cwd?: string }

/** The payload lands in a public issue body, and a failed build can emit megabytes of stderr. */
const OUTPUT_LIMIT = 4000;

function streamText(value: unknown): string | undefined {
  const text = Buffer.isBuffer(value) ? value.toString('utf-8') : value;
  if (typeof text !== 'string' || !text.trim()) return undefined;
  return text.length > OUTPUT_LIMIT ? `${text.slice(0, OUTPUT_LIMIT)}\n[truncated]` : text;
}

/**
 * `exec.ts` attaches the captured streams and the exit status to the error it throws, and the report
 * carried only `message` — so a failure arrived as a bare `Command failed: git` with the one line
 * that explains it dropped, which is the least diagnosable it can be on Windows. The streams are
 * scrubbed like every other value that reaches this payload.
 */
function execDetail(error: unknown, cwd: string): object {
  const exec = error as { status?: unknown; signal?: unknown; stdout?: unknown; stderr?: unknown };
  const stream = (value: unknown): string | undefined => {
    const text = streamText(value);
    return text === undefined ? undefined : scrub(text, cwd);
  };
  return {
    exitStatus: typeof exec.status === 'number' ? exec.status : undefined,
    signal: typeof exec.signal === 'string' ? exec.signal : undefined,
    stdout: stream(exec.stdout),
    stderr: stream(exec.stderr),
  };
}

export function formatDefectReport(error: unknown, context: DefectContext): string {
  const cwd = context.cwd ?? process.cwd();
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'UnknownError';
  const version = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;
  const payload = {
    rapsoVersion: version,
    command: scrub(context.command, cwd),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    errorName: scrub(name, cwd),
    message: scrub(message, cwd),
    ...execDetail(error, cwd),
  };
  return `\nThis looks like a defect in Rapsodia, not a problem with your project.\nPlease search before opening an issue: https://github.com/Stefan-migo/rapsodia-code/issues\nReport it here: https://github.com/Stefan-migo/rapsodia-code/issues/new\nThe CLI is offline and will not call GitHub. The payload below was scrubbed on a best-effort basis; review it before pasting.\n\n${JSON.stringify(payload, null, 2)}\n`;
}
