# Rapsodia 2.5 — Tool-Driven Executive Reasoning

## Brain Lobe Architecture

```
Frontal Lobe (Planning)     → rapso-session + ODD — odd/tasks/<feature>.md
Parietal Lobe (Spatial)     → Graphify — codebase graph before editing
Hippocampus (Memory)        → Engram — persistent SQLite memory via MCP
Occipital Lobe (Archive)    → wiki/ — Obsidian-readable snapshot exported from Engram
```

## Two Identities

| Agent | Role | Permissions |
|-------|------|-------------|
| `@Rapso-Planner` | Human interaction, spec drafting, research, knowledge management | Read-only + webfetch + task |
| `@Rapso-Developer` | Technical execution, code writing, testing, quality gates | Full (edit, bash, write, task) |

Switch with Tab: Planner (read-only) / Developer (full tools).

## Tool-Belt (MCP + CLI + Custom Tools)

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
| `query_graph` | Query knowledge graph for relevant nodes |
| `god_nodes` | Find highest-degree concepts |
| `{PYTHON_COMMAND} -m graphify.serve <graph>` | MCP server for graph queries |
| `/graphify . --update` | Rebuild graph after code changes |

### Gentle AI SDD (Frontal Lobe — Planning)

These commands remain available when explicitly requested; ODD is the default continuation.

| Command | Purpose |
|---------|---------|
| `rapso-session` skill | Discuss and structure planning work with the user |
| `/sdd-new` | Start a new structured change |
| `/sdd-ff` | Fast-forward a change through its planning phases |
| `/sdd-status` | Check change state and available next steps |
| `/sdd-apply` | Implement the change tasks |
| `/sdd-verify` | Run diagnostics against the implementation and artifacts |
| `/sdd-archive` | Close and preserve a completed change |
| `/sdd-init` | Initialize SDD context for a project |
| `/sdd-onboard` | Walk through the SDD workflow on an existing project |

### Code-Sandbox (Execution)
| Tool | Purpose |
|------|---------|
| `execute_script` | Run TypeScript/JavaScript in Node.js sandbox for multi-step logic |

## Session Flow

### Start (CLI handles this)
1. `rapso start` → creates session, pre-loads context from Engram + Graphify, launches OpenCode
2. Agent detects `.rapsodia-code/prelude.md` and uses it as working context

### Work
1. Planner closes planning with an ODD handoff (`rapso-session`). After explicit per-feature human consent, create the implementation worktree **first** (`rapso worktree create <slug>`, from `origin/main`); the ODD task doc `odd/tasks/<feature>.md` is created **inside** that worktree and committed on branch `odd/<slug>`, reaching main through the PR
2. Planner hands the ODD handoff to Developer via `@Rapso-Developer`
3. Developer runs graphify check before editing code
4. Developer executes modified 5-Step Gate per task

### 5-Step Execution Gate (MANDATORY)
```
Step 1: GRAPH CHECK — query_graph before editing
Step 2: ATOMIC COMMIT — one concern per commit, ≤5 files
Step 3: VERIFY — the checks this project actually configures (typecheck, build, tests); never claim a check that does not exist
Step 4: SPEC CHECK — only when SDD was explicitly used (/sdd-verify is optional diagnostics under ODD)
Step 5: FINALIZE — mem_save + rapso close --message "<summary>"
```

### End (Agent handles finalization)
1. `@Rapso-Developer` calls mem_save for all discoveries
2. `@Rapso-Developer` runs: bash("rapso close --message "<summary>"")
   → This calls mem_session_summary + wiki export + cleanup

## Active MCP Servers
| Server | Purpose | Status |
|--------|---------|--------|
| Engram | Persistent memory (19 tools) | Enabled |
| Graphify | Codebase knowledge graph | Enabled |

Optional: sequential-thinking, context7, github — enable in `opencode.json` as needed.

## Skills
| Skill | When to load |
|-------|-------------|
| `skill({name:"bootstrap"})` | Specializing this template for the project — interview, research, agent team. Reached with `/new-project` |
| `skill({name:"graphify"})` | Before any code editing |
| `skill({name:"design-system"})` | When building UI |

## Knowledge Capture Discipline
Save to Engram immediately when you encounter:
- **decision**: Architecture or design decisions with rationale
- **bugfix**: Root cause and fix for bugs
- **pattern**: Reusable patterns discovered
- **architecture**: System architecture insights
- **discovery**: Unexpected findings
- **learning**: Lessons learned during development

## Coding Standards
- Run the project's configured checks (typecheck, build, tests) before considering work complete
- Follow existing project conventions
- Atomic commits: one concern per commit, descriptive messages
- Add tests when the project has a test harness; never claim coverage that does not exist
- NEVER commit secrets or credentials

## Ponytail — Post-Write Simplification Check

Ponytail operates on code that already exists and asks whether the same behavior can be expressed more simply. It never decides whether a feature should exist, which dependency gets added, which pattern is used, or how the system is structured.

- Never remove, reduce, or alter behavior the task authorized. Report it as a finding instead; the human decides.
- When deletion and addition both work and the authorized behavior stays identical, delete.
- If the simpler form requires changing the design, dependencies, or structure, that is a finding for the human, not an edit.
- Apply these rules during implementation only; they are not an approval checkbox, a receipt, a line-count target, or a replacement for RDD/native review.

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

## Project
This is the **{PROJECT_NAME}** project, created on {DATE}.
