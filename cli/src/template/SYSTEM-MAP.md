# Rapsodia 2.5 — System Map

How Rapsodia, Pi, Engram, Graphify, and the project files relate.

---

## Architecture

```
                        ┌──────────────────────────────┐
                        │ Pi project runtime           │
                        │ AGENTS.md + trusted resources│
                        │ Skills + extensions + MCP    │
                        └──────────────┬───────────────┘
                                       │ first user run points to
                                       ▼
                        ┌──────────────────────────────┐
                        │ .rapsodia-code/prelude.md    │
                        │ context built by rapso       │
                        └──────────────┬───────────────┘
                                       │
          ┌────────────────────────────┼──────────────────────────┐
          │                            │                          │
   ┌──────▼──────────┐       ┌────────▼─────────┐      ┌─────────▼─────────┐
   │ Graphify        │       │ Engram           │      │ Rapsodia CLI      │
   │ Code graph      │       │ Session lifecycle│      │ Prepared context │
   │ context in      │       │ owned by         │      │ and wiki export   │
   │ the prelude     │       │ gentle-engram    │      │                   │
   └─────────────────┘       └──────────────────┘      └───────────────────┘
```

Rapsodia prepares local project context and reads Engram context for the prelude. Pi is the agent runtime. `gentle-engram` owns Engram session start, summaries, and passive capture. `rapso start` and `rapso close` do not open or end an Engram session.

---

## Pi Project Surface

| Resource | Role |
|---------|------|
| `AGENTS.md` | Project instructions Pi reads natively; includes the prelude-reading fallback |
| `.agents/skills/` | Project skills; the template ships `rapso-session` and `design-system` |
| `.pi/extensions/` | Project extensions; the template ships `.pi/extensions/rapsodia-context.ts` |
| `.pi/mcp.json` | Optional project MCP server configuration; only active after project trust is granted |
| `.rapsodia-code/` | Local ignored state, including `session.json` and `prelude.md` |

### Context extension lifecycle

The `rapsodia-context` extension runs on Pi session start when project trust allows it to load. It searches for the project state and refreshes `.rapsodia-code/prelude.md` in the background only when the prelude is missing or at least five minutes old. It gives `rapso context` 60 seconds. It is silent if `rapso` is missing or does not recognize that command. On the first user run of the session, it adds a `rapso_context` prompt section pointing to the prelude. It does not open an Engram session. Without project trust, the extension does not load; `AGENTS.md` instructs Pi to read the prelude as the fallback.

---

## Rapsodia CLI and State

| Command | Effect |
|---------|--------|
| `rapso start` | Writes `.rapsodia-code/session.json` and builds `.rapsodia-code/prelude.md` unless `--no-prelude`; by default launches no agent. `--run` opts into launching `RAPSO_AGENT` (default `gentle-shell`). Supports `--dry-run`. |
| `rapso context` | Builds only the prelude. Writes no prepared-context record and launches no agent. Supports `--dry-run`. |
| `rapso close` | Exports the wiki by default, cleans prepared context, and can write a retrospective with `--retrospective`; supports `--message` and `--no-export`. Does not end an Engram session. |
| `rapso status` | Reports prepared-context state and the `gentle-shell` agent, alongside project, Engram, Graphify, wiki, and Node status. |
| `rapso install` | Checks dependencies and prints installation steps; it does not install them. |
| `rapso init`, `update`, `adopt`, `analyze`, `worktree` | Scaffold, update, adopt, analyze, and manage projects/worktrees respectively. |

The complete command set is `init`, `install`, `start`, `context`, `close`, `status`, `update`, `adopt`, `analyze`, and `worktree`. `rapso start` has no `--no-open` option.

`.rapsodia-code/` is local ignored state rather than a Pi plugin directory. `rapso start` prepares a local context record; it does not start a Pi or Gentle Shell session unless `--run` is explicitly supplied to launch the configured agent.

---

## Graphify — Code Graph

Graphify remains the project's code graph. The CLI can read graph context while building the prelude. Refresh the graph with:

```bash
graphify . --update
```

An optional Graphify MCP server can be configured in `.pi/mcp.json`; project trust is required for project MCP configuration. The graph is separate from Engram's persistent memory and the exported `wiki/` snapshot.

---

## Engram — Memory

`gentle-engram` owns Engram session start, summaries, and passive capture. Rapsodia reads Engram context to build `.rapsodia-code/prelude.md`; it does not own or close the Engram session.

---

## Wiki — Obsidian Archive

`rapso close` exports the wiki by default; `--no-export` skips that step. The wiki is an Obsidian-readable snapshot of Engram memory and remains separate from the prepared context and Graphify code graph.

---

## Retired Files and Tools

The OpenCode tree (`.opencode/`), root `opencode.json`, `rapso-planner` and `rapso-developer` agents, Ponytail skill pack, SDD (`openspec/` and `/sdd-*`), `rapso-persona`, and `scripts/setup.sh` are retired and are not part of this Pi runtime. `rapso adopt` and `rapso update` do not delete retired files. They may report paths that need attention; review those reports and remove obsolete files yourself if desired.
