import { ChildProcess } from 'child_process';
import { spawn } from './exec';
import { createInterface, Interface } from 'readline';
import { warn } from './logger';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

export class MCPClient {
  private process: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;

  constructor(
    private command: string,
    private args: string[] = [],
  ) {}

  async initialize(): Promise<void> {
    return new Promise<void>((outerResolve, outerReject) => {
      try {
        this.process = spawn(this.command, this.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Piped so a verbose server cannot write over our own stdout, and drained so it cannot
        // fill the pipe and block: a full pipe stops the child, and a stopped child never answers.
        this.process.stderr?.resume();

        this.rl = createInterface({ input: this.process.stdout! });

        this.rl.on('line', (line: string) => {
          let msg: any;
          try {
            msg = JSON.parse(line);
          } catch {
            // A line that is not JSON breaks the link between a request id and its answer. Saying
            // so beats dropping it: the alternatives are an unexplained timeout, or silence.
            warn(`MCP server sent a line that is not JSON: ${line.slice(0, 200)}`);
            return;
          }
          if (msg.id != null && this.pending.has(msg.id)) {
            const entry = this.pending.get(msg.id)!;
            clearTimeout(entry.timer);
            this.pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(msg.error.message || 'MCP error'));
            } else {
              entry.resolve(msg.result);
            }
          }
        });

        this.process.on('error', (err: Error) => {
          this.rejectAll(err);
          outerReject(err);
        });

        this.process.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
          // Every in-flight request dies with the process, a clean exit included: nothing will ever
          // answer it, and waiting out each timer would report a timeout instead of the cause.
          const err = new Error(`MCP process exited with ${code === null ? `signal ${signal}` : `code ${code}`}`);
          this.rejectAll(err);
          if (code !== 0) outerReject(err);
        });

        this.process.stdin!.on('error', (err: Error) => {
          this.rejectAll(err);
          outerReject(err);
        });

        const id = this.nextId++;
        const timer = setTimeout(() => {
          this.pending.delete(id);
          outerReject(new Error('MCP initialize timed out'));
        }, 5000);

        this.pending.set(id, {
          resolve: () => {
            try {
              this.sendNotification('notifications/initialized');
              outerResolve();
            } catch (err) {
              // The handshake is not complete if the server never learns it is initialized, and a
              // throw here would escape the readline handler instead of failing the call.
              outerReject(err instanceof Error ? err : new Error(String(err)));
            }
          },
          reject: outerReject,
          timer,
        });

        this.process.stdin!.write(JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'rapso-cli', version: '1.0.1' },
          },
        }) + '\n');
      } catch (err) {
        outerReject(err);
      }
    });
  }

  async callTool(name: string, args: any = {}): Promise<any> {
    // Checked rather than asserted: this method is public, and calling it before `initialize()` or
    // after `close()` used to fail with an uncontrolled runtime error instead of a clear one.
    const stdin = this.process?.stdin;
    if (!stdin) throw new Error('MCP client is not initialized');

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP tool call "${name}" timed out`));
      }, 5000);

      this.pending.set(id, { resolve, reject, timer });

      try {
        stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name, arguments: args },
        }) + '\n');
      } catch (err) {
        // A request that never left the client must not sit in `pending` waiting out its timer.
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async close(): Promise<void> {
    // Nothing answers an in-flight request once the process is gone. Settling them here stops their
    // callers from waiting out a timer that reports the symptom instead of the cause.
    this.rejectAll(new Error('MCP client closed'));
    this.rl?.close();
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = null;
    this.rl = null;
  }

  private sendNotification(method: string, params?: any): void {
    const stdin = this.process?.stdin;
    if (!stdin) throw new Error('MCP client is not initialized');
    stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  private rejectAll(err: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}
