import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Behaviour of the `prepack` release gate (`scripts/verify-template-tracked.mjs`).
 *
 * Each case builds a throwaway git repository with its own copy of the gate, so nothing here
 * depends on this repository's index and a stray file in the working tree cannot change a result.
 */
const cliRoot = process.cwd();
const GATE = 'verify-template-tracked.mjs';
const DEFAULT_TEMPLATE = {
  'src/template/AGENTS.md': '# agents\n',
  'src/template/wiki/index.md': '# wiki\n',
};

/** A throwaway repository with `cli/` at its root, mirroring this package's layout. */
function fixture({
  files = DEFAULT_TEMPLATE,
  commit = true,
}: { files?: Record<string, string>; commit?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rapso-gate-'));
  const cli = join(root, 'cli');
  mkdirSync(join(cli, 'scripts'), { recursive: true });
  copyFileSync(join(cliRoot, 'scripts', GATE), join(cli, 'scripts', GATE));
  writeFileSync(join(cli, '.gitignore'), 'node_modules/\n');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(cli, path, '..'), { recursive: true });
    writeFileSync(join(cli, path), body);
  }
  if (commit) {
    git(root, 'init', '-q', '.');
    git(root, 'config', 'user.email', 'gate@example.test');
    git(root, 'config', 'user.name', 'gate');
    git(root, 'add', '-A', '--', 'cli/src/template');
    git(root, 'commit', '-qm', 'base');
  }
  return { root, cli };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function runGate(cli: string): { code: number; output: string } {
  const result = spawnSync(process.execPath, [join(cli, 'scripts', GATE)], {
    cwd: cli,
    encoding: 'utf8',
  });
  // The pass path writes its success line to stdout and its warning to stderr, so both are kept.
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('verify-template-tracked release gate', () => {
  it('passes when every template file is tracked', () => {
    const { cli } = fixture();

    const { code, output } = runGate(cli);

    expect(code).toBe(0);
    expect(output).toContain('all tracked by git');
  });

  it('fails on a gitignored leftover, the historical .opencode defect', () => {
    const { cli } = fixture();
    mkdirSync(join(cli, 'src/template/.opencode/tools/node_modules'), { recursive: true });
    writeFileSync(join(cli, 'src/template/.opencode/tools/node_modules/.gitkeep'), '');

    const { code, output } = runGate(cli);

    expect(code).toBe(1);
    expect(output).toContain('src/template/.opencode/tools/node_modules/.gitkeep');
  });

  it('fails on an untracked symlink inside the template', () => {
    const { cli } = fixture();
    symlinkSync('AGENTS.md', join(cli, 'src/template/aliased.md'));

    const { code, output } = runGate(cli);

    expect(code).toBe(1);
    expect(output).toContain('src/template/aliased.md');
  });

  it('matches tracked names with spaces, newlines and non-ASCII', () => {
    const { cli } = fixture({
      files: {
        'src/template/with space.md': 'a\n',
        'src/template/pägeme.md': 'b\n',
        'src/template/new\nline.md': 'c\n',
      },
    });

    expect(runGate(cli).code).toBe(0);
  });

  it('fails when the template directory is absent', () => {
    const { cli } = fixture({ files: {}, commit: false });

    const { code, output } = runGate(cli);

    expect(code).toBe(1);
    expect(output).toContain('src/template does not exist');
  });

  it('warns and passes when git is unavailable, the documented fail-open', () => {
    const { cli } = fixture({ commit: false });
    writeFileSync(join(cli, 'src/template/stray.md'), '');

    const { code, output } = runGate(cli);

    expect(code).toBe(0);
    expect(output).toContain('Skipping the template ownership check');
  });

  it('does not catch a tracked file deleted from disk, the documented asymmetry', () => {
    const { cli } = fixture();
    unlinkSync(join(cli, 'src/template/AGENTS.md'));

    expect(runGate(cli).code).toBe(0);
  });
});
