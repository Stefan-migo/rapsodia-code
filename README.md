# Rapsodia

Rapsodia is the `rapso` CLI for preparing project context, managing Rapsodia template files, analyzing session patterns, and creating isolated ODD worktrees. The Pi runtime reads project instructions from `AGENTS.md`, skills from `.agents/skills/`, and trusted project extensions from `.pi/extensions/`.

The repository is [Rapsodia](https://github.com/Stefan-migo/rapsodia-code).

## Install

```bash
npm install -g rapsodia-code
```

Node.js 18 or newer is required. `rapso install` checks dependencies and prints installation steps; it does not install dependencies.

## Quick start

Create a project without interactive prompts or a Git repository:

```bash
rapso init demo --no-git --yes
cd demo
rapso start
```

`rapso start` writes local prepared-context state to `.rapsodia-code/session.json` and builds `.rapsodia-code/prelude.md`. It does not open an Engram session or launch an agent by default. Open the project in Pi; read the prelude before the first task. To opt in to launching the configured agent (`RAPSO_AGENT`, default `gentle-shell`) after preparation, use `rapso start --run`.

For an existing project, install the workflow files in place:

```bash
rapso adopt --yes
```

## Commands

| Command | Description |
|---------|-------------|
| `rapso init` | Scaffold a new Rapsodia project |
| `rapso install` | Check dependencies and print installation steps (does not install) |
| `rapso start` | Write the prepared-context record and build the prelude; launch an agent only with `--run` |
| `rapso context` | Build only the prelude; no prepared-context record or agent |
| `rapso close` | Export the wiki, clean up prepared context, and optionally write a retrospective |
| `rapso status` | Report prepared context and the `gentle-shell` agent, along with project/tool health |
| `rapso update` | Check or update Rapsodia template files |
| `rapso adopt` | Install Rapsodia into an existing project |
| `rapso analyze` | Analyze session patterns and suggest improvements |
| `rapso worktree` | Create and manage isolated ODD worktrees |

`rapso start` supports `--no-prelude`, `--run`, and `--dry-run`; it has no `--no-open` option. `rapso context` supports `--dry-run`. `rapso close` supports `--message`, `--no-export`, and `--retrospective`. Run `rapso <command> --help` for command-specific options. Run `rapso worktree --help` for its worktree operations.

## Pi resources

- `AGENTS.md` is the project instruction file Pi reads natively.
- Project skills live in `.agents/skills/`; the template includes `rapso-session` and `design-system`.
- Project extensions live in `.pi/extensions/`; the template includes `rapsodia-context.ts`. Pi loads project extensions only after project trust is granted.
- Optional project MCP servers can be configured in `.pi/mcp.json`; this too requires project trust.
- `.rapsodia-code/` contains local ignored state, including the prepared-context record and prelude.

The `rapsodia-context` extension refreshes the prelude in the background when a Pi session starts if the existing prelude is at least five minutes old or missing. The refresh has a 60-second timeout. It stays quiet if `rapso` is unavailable or is too old to recognize `rapso context`. On the first user run of a session, it adds a `rapso_context` prompt section pointing Pi to the prelude. Without project trust, the extension does not load; follow the prelude-reading rule in `AGENTS.md` instead.

`gentle-engram` owns Engram session start, summaries, and passive capture. Rapsodia reads Engram context when building the prelude; `rapso start` and `rapso close` do not start or end an Engram session. Graphify remains the code graph; refresh it with `graphify . --update`. An optional Graphify MCP server can be configured in `.pi/mcp.json`.

The retired OpenCode configuration and resources, SDD files and commands, Ponytail skill pack, `rapso-persona`, and `scripts/setup.sh` are not part of this runtime. `adopt` and `update` do not delete retired files; review any paths they report and remove obsolete files yourself if desired.

## License

MIT. See [LICENSE](LICENSE).
