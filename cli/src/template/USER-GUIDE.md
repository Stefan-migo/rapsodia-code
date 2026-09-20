# Rapsodia 2.5 — User Guide

Your guide to using the Rapsodia 2.5 tool-driven executive reasoning system with OpenCode.

---

## Quick Start

```bash
cd {PROJECT_NAME}
opencode
```

The system loads automatically. Two agents are available, switch with Tab:

| Agent | Tab | Use for |
|-------|-----|---------|
| `@Rapso-Planner` | Planner | Planning, research, specs, memory |
| `@Rapso-Developer` | Developer | Building, coding, testing, quality |

---

## Daily Workflow

### Start a Session
1. Switch to `@Rapso-Planner`
2. Agent auto-runs `mem_session_start` and `mem_context` to restore context
3. Discuss your goal with the agent

### Build a Feature (ODD default)
```
1. Use the `rapso-session` skill to discuss and structure the goal (Planner)
2. Close with an ODD handoff; after explicit consent, create the worktree:
   rapso worktree create <slug>       (from the main worktree)
3. The ODD task doc odd/tasks/<feature>.md is created INSIDE that worktree
4. Tab to @Rapso-Developer
5. Developer executes via 5-Step Gate:
   ← Graph check → Atomic commit → Verify → Spec check (SDD only) → Memory save
6. Commit on branch odd/<slug> and open the PR

Gentle AI SDD remains available when explicitly requested:
   /sdd-new → /sdd-ff → /sdd-status → /sdd-apply → /sdd-verify → /sdd-archive
```

### End a Session
1. `@Rapso-Developer` saves discoveries: `mem_save`
2. `@Rapso-Planner` runs `mem_session_summary` + `mem_session_end`
3. Run `scripts/engram-export-wiki.sh` to sync to Obsidian vault

---

## Tool Reference

### Engram (Memory — Hippocampus)
| Tool | When |
|------|------|
| `mem_save` | After every decision, bug fix, pattern, discovery |
| `mem_search` | When you need to recall past context |
| `mem_judge` | When mem_save returns conflict candidates |
| `mem_session_start` | Session start |
| `mem_session_end` | Session end |
| `mem_session_summary` | Before closing |

### Gentle AI SDD (Planning — opt-in, on explicit request)
| Command | What it does |
|---------|-------------|
| `/sdd-new` | Start a structured change and its proposal |
| `/sdd-ff` | Produce spec, design, and tasks artifacts |
| `/sdd-status` | Check change state and available next steps |
| `/sdd-apply` | Execute the change tasks |
| `/sdd-verify` | Verify the implementation and artifacts |
| `/sdd-archive` | Close and preserve a completed change |

### Graphify (Code Understanding — Parietal Lobe)
| Command | When |
|---------|------|
| `{PYTHON_COMMAND} -m graphify.serve graphify-out/graph.json` | Start MCP server |
| `query_graph` | Before editing any code |
| `god_nodes` | Find key concepts |
| `/graphify . --update` | After major refactors |

### Code Sandbox
| Tool | Use |
|------|-----|
| `execute_script` | Run TypeScript/JS snippets for prototyping |

### Execution Discipline (5-Step Gate)
Built into `@Rapso-Developer` — fires automatically on every task:
1. **GRAPH CHECK** — query the knowledge graph before editing
2. **ATOMIC COMMIT** — one concern per commit (≤5 files)
3. **VERIFY** — the project's configured checks (never claim one that does not exist)
4. **SPEC CHECK** — only when SDD was explicitly used; /sdd-verify is optional diagnostics
5. **MEMORY** — mem_save key learnings

Plus a pre-commit hook enforces the ≤5-file atomicity gate mechanically.

---

## Architecture (Brain Lobe Model)

```
Frontal Lobe  → ODD (rapso-session) + Gentle AI SDD on request — Planning
Parietal Lobe → Graphify — Code understanding before edits
Hippocampus   → Engram (MCP) — Persistent SQLite memory, 19 tools
Occipital Lobe → wiki/ — Obsidian-readable snapshot from Engram
```

Two agents, four lobes.

---

## Obsidian Usage

The `wiki/` directory is an Obsidian vault. At session end, `scripts/engram-export-wiki.sh` syncs Engram observations to `wiki/engram/` as markdown files with proper frontmatter and [[wikilinks]]. Open the `wiki/` folder in Obsidian for visual graph view and Dataview dashboards.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Agent doesn't load context | Run `mem_context` manually |
| SDD command not found | Check the installed `/sdd-*` commands |
| Engram MCP not connecting | Run `engram mcp --tools=all` to test |
| Graphify graph is stale | Run `/graphify . --update` |
| Pre-commit hook too strict | Edit threshold in `.git/hooks/pre-commit` |
