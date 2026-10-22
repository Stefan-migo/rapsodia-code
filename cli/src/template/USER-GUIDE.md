# Rapsodia 2.5 — User Guide

A practical guide to preparing project context and using Rapsodia with Pi.

---

## Quick Start

From your Rapsodia project, prepare context and open Pi:

```bash
cd {PROJECT_NAME}
rapso start
```

Then open the project in Pi.

`rapso start` writes `.rapsodia-code/session.json` and builds `.rapsodia-code/prelude.md`. It does not open an Engram session or launch an agent. Read the prelude before your first task. To have `rapso start` launch an agent after preparation, opt in with `--run`; it launches `RAPSO_AGENT` or, by default, `gentle-shell`.

If you only want to build or refresh the prelude, use `rapso context`. It does not write a prepared-context record or launch an agent.

---

## Daily Workflow

### Start a session

1. Run `rapso start` in the project. Use `--no-prelude` to skip building the prelude or `--dry-run` to see the planned actions without writing.
2. Start Pi in the project and read `.rapsodia-code/prelude.md` before your first task.
3. In a trusted project, the `rapsodia-context` extension refreshes a missing or five-minute-old prelude in the background and points the first user run at it. Without project trust, the extension does not load; follow the `AGENTS.md` prelude-reading rule and run `rapso context` when needed.

### Build a feature (ODD workflow)

1. Use the `rapso-session` project skill to structure planning discussions when useful.
2. Write and follow the ODD task document for the feature.
3. For substantial work, create an isolated worktree with `rapso worktree create <slug>` after deciding to do so.
4. Implement and verify the task in that worktree, then use your normal Git and review process.

ODD is the workflow described by this project. The retired SDD `/sdd-*` commands and `openspec/` workflow are not available here.

### End a session

1. Let `gentle-engram` handle the Engram session summary and lifecycle.
2. Run `rapso close` to export the wiki and clean up the prepared context. `rapso close` does not end an Engram session.
3. Add `--message "..."` to provide summary text. Add `--retrospective` to write a retrospective; add `--no-export` to skip wiki export.

---

## Tool Reference

### Rapsodia CLI

| Command | What it does |
|---------|-------------|
| `rapso init` | Scaffold a project |
| `rapso install` | Check dependencies and print installation steps; does not install anything |
| `rapso start` | Write `.rapsodia-code/session.json` and build the prelude; `--run` opts into launching `RAPSO_AGENT` (default `gentle-shell`) |
| `rapso context` | Build only the prelude; supports `--dry-run` |
| `rapso close` | Export wiki, clean prepared context, and optionally write a retrospective |
| `rapso status` | Report prepared context and the `gentle-shell` agent, plus project/tool health |
| `rapso update` | Check or update Rapsodia template files |
| `rapso adopt` | Install Rapsodia into an existing project |
| `rapso analyze` | Analyze session patterns and suggest improvements |
| `rapso worktree` | Create and manage isolated ODD worktrees |

`rapso start` also supports `--no-prelude` and `--dry-run`. It does not have a `--no-open` option. `rapso close` supports `--message`, `--no-export`, and `--retrospective`. Use `rapso <command> --help` for other command options.

### Pi project resources

| Resource | Purpose |
|---------|---------|
| `AGENTS.md` | Project instructions Pi reads natively; includes the prelude-reading fallback |
| `.agents/skills/` | Project skills; the template ships `rapso-session` and `design-system` |
| `.pi/extensions/` | Project extensions; the template ships `rapsodia-context.ts` |
| `.pi/mcp.json` | Optional project MCP server configuration; requires project trust |
| `.rapsodia-code/` | Local ignored project state, including the prepared-context record and prelude |

### Engram (Memory)

`gentle-engram` owns the Engram session lifecycle, summaries, and passive capture. Rapsodia only reads Engram context to build the prelude. Do not use `rapso close` as a substitute for ending an Engram session.

### Graphify (Code Understanding)

Graphify remains the code graph. Refresh it with `graphify . --update`. An optional Graphify MCP server can be configured in `.pi/mcp.json` (project trust required).

---

## Architecture (Brain Lobe Model)

```
Frontal Lobe   → ODD task document — Planning
Parietal Lobe  → Graphify — Code understanding
Hippocampus    → Engram — Persistent memory, session lifecycle owned by gentle-engram
Occipital Lobe → wiki/ — Snapshot exported from Engram
```

Rapsodia CLI prepares context; Pi is the project runtime, and `gentle-engram` manages the Engram session.

---

## Obsidian Usage

The `wiki/` directory is an Obsidian vault. `rapso close` exports the wiki by default; use `--no-export` to skip the export. Open the `wiki/` folder in Obsidian to browse it.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| The prelude is missing or stale | Run `rapso context` to build only the prelude |
| The Pi extension does not run | Grant project trust, or follow `AGENTS.md` and refresh the prelude with `rapso context` |
| `rapso install` reports missing dependencies | Follow the printed installation steps; the command does not install them |
| Engram context is unavailable in the prelude | Check that `gentle-engram`/Engram is available; Rapsodia reads context but does not own the session |
| Graphify graph is stale | Run `graphify . --update` |
