# Rapsodia 2.5 — Tool-Driven Executive Reasoning

## Brain Lobe Architecture

```
Frontal Lobe (Planning)     → ODD — odd/tasks/<feature>.md
Parietal Lobe (Spatial)     → Graphify — codebase graph before editing
Hippocampus (Memory)        → Engram — persistent SQLite memory
Occipital Lobe (Archive)    → wiki/ — Obsidian-readable snapshot exported from Engram
```

## Runtime — Pi / Gentle Shell

This project runs on Pi through Gentle Shell. `gentle-ai` is the orchestrator and `gentle-engram`
provides memory. There are no primary planner or developer agents: substantial work is delegated to
bounded subagents, and one parent session owns the plan, the task document, and the result.

Where things live:

| Resource | Location |
|---|---|
| This workflow contract | `AGENTS.md` — Pi reads it natively |
| Project skills | `.agents/skills/` |
| User skills | `~/.agents/skills/` (`graphify` lives here) |
| User MCP servers | `~/.gentle-shell/agent/mcp.json` (Engram is already declared) |
| Optional project MCP servers | `.pi/mcp.json` — read only after project trust is granted |
| Project extensions | `.pi/extensions/` — loaded only after project trust is granted |
| Local ignored state | `.rapsodia-code/` (manifest, config, sessions, prelude) |

## Session Context

Pi owns the session lifecycle; `gentle-engram` opens the session, saves summaries, and captures
discoveries. Do not launch an agent through `rapso`, and do not treat `rapso start` as the session
owner.

If `.rapsodia-code/prelude.md` exists when a session starts, read it before the first task: it holds
scored Engram context, the Graphify report, and the project manifest summary.

In a trusted project, `.pi/extensions/rapsodia-context.ts` refreshes that prelude in the background
on session start and points the first run at it. Without project trust the extension does not load,
so run `rapso context` yourself when the prelude is stale. `rapso context` only rewrites the
prelude: it opens no session, writes no prepared-context record, and launches no agent.

## Tool-Belt

### Engram (Hippocampus — Memory)

| Tool | Purpose |
|------|---------|
| `mem_save` | Save structured observation (decision, architecture, bugfix, pattern, discovery, learning) |
| `mem_search` | FTS5 full-text search across all memory |
| `mem_judge` | Resolve conflict candidates returned by mem_save |
| `mem_session_start` | Register session start |
| `mem_session_end` | Mark session complete |
| `mem_session_summary` | Save comprehensive session summary |
| `mem_context` | Recent context from previous sessions |
| `mem_get_observation` | Full untruncated observation content |
| `mem_stats` | Memory system statistics |

### Graphify (Parietal Lobe — Code Understanding)

| Tool | Purpose |
|------|---------|
| `graphify query "<question>"` | Query the knowledge graph for relevant nodes |
| `graphify path "<A>" "<B>"` | Shortest path between two concepts |
| `graphify explain "<concept>"` | Plain-language explanation of a node and its neighbors |
| `graphify . --update` | Refresh the graph after code changes (AST-only, no API cost) |
| `graphify-out/GRAPH_REPORT.md` | God nodes and community structure |
| `{PYTHON_COMMAND} -m graphify.serve --graph graphify-out/graph.json` | Optional MCP server, declared in `.pi/mcp.json` |

### Execution (Code Sandbox)

`codemode` is the Pi code-execution surface for multi-step logic.

## Skills

| Skill | When to load |
|-------|-------------|
| `.agents/skills/rapso-session` | Planning sessions: architecture, requirements, estimates, pre-ODD discussion |
| `.agents/skills/design-system` | When building or reviewing UI |
| `graphify` (user-level) | Before structural code work |

## ODD — Default Workflow

ODD is the only workflow in this project. Spec-Driven Development was retired: there is no
`openspec/`, no `/sdd-*` command, and no SDD spec check. The ODD task document is the specification.

### 5-Step Execution Gate (MANDATORY)

```
Step 1: GRAPH CHECK — read graphify-out/GRAPH_REPORT.md, then graphify query/path before editing
Step 2: ATOMIC COMMIT — one concern per commit, ≤5 files
Step 3: VERIFY — the checks this project actually configures; never claim a check that does not exist
Step 4: REVIEW SLICE — keep work units around 400 authored lines; a high-risk item gets its own commit
Step 5: FINALIZE — mem_save the discoveries
```

`rapso close` still exports the wiki snapshot and the retrospective, and during the migration it also
ends the Engram session. Do not pair it with another `mem_session_end` on the same work.

## Knowledge Capture Discipline

Save to Engram immediately when you encounter a decision, bugfix, pattern, architecture insight,
discovery, or learning. Use this content format:

```
**What**: what was done (one line)
**Why**: what motivated it (bug, request, performance)
**Where**: files or paths affected
**Learned**: gotchas, edge cases, surprises
```

At the end of a session that will be handed off, write a `mem_session_summary` with Goal,
Instructions, Discoveries, Accomplished, Next Steps, and Relevant Files.

## Coding Standards

- Run the project's configured checks (typecheck, build, tests) before considering work complete
- Follow existing project conventions
- Atomic commits: one concern per commit, descriptive messages
- Add tests when the project has a test harness; never claim coverage that does not exist
- NEVER commit secrets or credentials

## ODD Worktrees

During ODD's `Classify` step, substantial work means two or more meaningful implementation steps or progress worth recovering. Code work is born in a sibling worktree (`../<Project>-odd-<slug>`, where `<Project>` is the main worktree's directory name) on branch `odd/<slug>`, not in main. Human consent is explicit and per-feature before invoking `rapso worktree create`; `--yes` is only the consequence of that approval, never a shortcut around it. The ODD task doc `odd/tasks/<feature>.md` is committed on the branch and reaches main through the PR, so it must never live inside a `gentle-ai` managed block.

## Reporting Rapsodia Defects

Rapsodia is a tool you are USING, not the project you are working on.

When you identify a failure that belongs to Rapsodia itself — not to this project, its
configuration, or its environment — say so, and **suggest** opening an issue at
https://github.com/Stefan-migo/rapsodia-code/issues with the evidence: what you ran, what happened,
and the smallest reproduction you have.

- Suggest only. Never open the issue, never run `gh`, and never write to the Rapsodia
  repository from a project workflow. The human decides.
- Only for an identified defect. Do not speculate, and do not suggest an issue for expected
  refusals, for this project's own bugs, or for environment and dependency failures.
- If you cannot tell whether the cause is Rapsodia, say that instead of filing.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## Project

This is the **{PROJECT_NAME}** project, created on {DATE}.
