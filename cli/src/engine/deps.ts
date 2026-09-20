import { commandAvailable, execFileSync, resolvePythonCommand } from '../utils/exec';

export interface DepStatus {
  name: string;
  installed: boolean;
  version?: string;
  required: boolean;
}

interface CommandResult {
  stdout: string;
  exitCode: number;
}

function run(command: string, args: string[]): CommandResult {
  try {
    const stdout = execFileSync(command, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout: String(stdout).trim(), exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    const output = err.stdout || err.stderr || '';
    return {
      stdout: (typeof output === 'string' ? output : output.toString()).trim(),
      exitCode: err.status ?? 1,
    };
  }
}

export function checkDeps(): DepStatus[] {
  const results: DepStatus[] = [];

  const node = run('node', ['--version']);
  results.push({
    name: 'Node.js',
    installed: node.exitCode === 0,
    version: node.stdout.replace(/^v/, ''),
    required: true,
  });

  if (node.exitCode === 0) {
    const nodeMajor = parseInt(node.stdout.replace(/^v/, '').split('.')[0], 10);
    if (nodeMajor < 18) {
      results[results.length - 1].installed = false;
    }
  }

  // Resolving on PATH replaces `which`/`command -v`, which do not exist in cmd.exe.
  const engramInstalled = commandAvailable('engram');
  results.push({
    name: 'Engram',
    installed: engramInstalled,
    version: engramInstalled ? 'found' : undefined,
    required: true,
  });

  // Graphify's MCP server is a Python module, so detection has to prove that a real interpreter
  // can import it — not assume the interpreter is named `python3`, which Windows does not guarantee.
  const python = resolvePythonCommand();
  const graphifyInstalled = python ? run(python, ['-c', 'import graphify']).exitCode === 0 : false;
  results.push({
    name: 'Graphify',
    installed: graphifyInstalled,
    required: true,
  });

  return results;
}
