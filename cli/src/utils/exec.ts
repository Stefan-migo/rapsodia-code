import { accessSync, constants } from 'fs';
import { ChildProcess, SpawnOptions, ExecFileSyncOptions, SpawnSyncOptions } from 'child_process';
import crossSpawn from 'cross-spawn';
import { delimiter, isAbsolute, join } from 'path';

function pathEntries(): string[] {
  return (process.env.PATH || '').split(delimiter).filter(Boolean);
}

function isFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a command using PATH and, on Windows, PATHEXT. */
export function resolveExecutable(command: string): string | null {
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  const candidates = isAbsolute(command) || command.includes('/') || command.includes('\\')
    ? [command]
    : pathEntries().map((entry) => join(entry, command));

  for (const candidate of candidates) {
    for (const extension of extensions) {
      const hasWindowsExtension = process.platform === 'win32' &&
        extensions.some((known) => candidate.toLowerCase().endsWith(known.toLowerCase()));
      const path = extension && process.platform === 'win32' && !hasWindowsExtension
        ? `${candidate}${extension}`
        : candidate;
      if (isFile(path)) return path;
    }
  }
  return null;
}

export function commandAvailable(command: string): boolean {
  return resolveExecutable(command) !== null;
}

/**
 * `python3` is not a name Windows guarantees: python.org installs `python.exe` only, and the
 * `python3.exe` alias comes from the Microsoft Store build. Detection must not assume it.
 *
 * The POSIX list is deliberately left as the single pre-Windows candidate — this adds a Windows
 * path, it does not widen POSIX.
 */
export function resolvePythonCommand(): string | null {
  const candidates = process.platform === 'win32'
    ? ['python3', 'python', 'py']
    : ['python3'];
  return candidates.find((candidate) => commandAvailable(candidate)) ?? null;
}

interface ExecFileSyncError extends Error {
  status: number | null;
  stdout: string | Buffer;
  stderr: string | Buffer;
  signal: NodeJS.Signals | null;
}

function commandError(
  command: string,
  result: ReturnType<typeof crossSpawn.sync>,
): ExecFileSyncError {
  const error = result.error || new Error(`Command failed: ${command}`);
  const output = (value: string | Buffer | null): string | Buffer => value ?? '';
  Object.assign(error, {
    status: result.status,
    stdout: output(result.stdout),
    stderr: output(result.stderr),
    signal: result.signal,
  });
  return error as ExecFileSyncError;
}

export function execFileSync<T extends ExecFileSyncOptions = ExecFileSyncOptions>(
  command: string,
  args: string[] = [],
  options?: T,
): any {
  if (options?.shell) {
    throw new Error('shell: true is not supported with an argument array.');
  }
  const result = crossSpawn.sync(command, args, options as SpawnSyncOptions);
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw commandError(command, result);
  }
  return result.stdout ?? '';
}

export function spawn(command: string, args: string[] = [], options?: SpawnOptions): ChildProcess {
  if (options?.shell) {
    throw new Error('shell: true is not supported with an argument array.');
  }
  return crossSpawn(command, args, options);
}
