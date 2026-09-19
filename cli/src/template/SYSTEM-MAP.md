# Rapsodia 2.5 — System Map

How every component of the Rapsodia 2.5 executive system works, when to use it, and how to maintain it.

---

## Architecture

```
                         ┌──────────────────────────┐
                         │  FRONTAL LOBE (Planning)  │
                         │     Gentle AI SDD (/sdd-*)│
                         │     SDD change artifacts  │
                         │     @Rapso-Planner       │
                         └──────────┬───────────────┘
                                    │ hands off change
          ┌─────────────────────────┼──────────────────────────┐
          │                         │                          │
   ┌──────▼──────────┐    ┌───────▼──────────┐    ┌─────────▼─────────┐
   │  PARIETAL LOBE   │    │  HIPPOCAMPUS     │    │ OCCIPITAL LOBE    │
   │  (Spatial)       │    │  (Memory)        │    │ (Archive)         │
   │                   │    │                   │    │                   │
   │  Graphify        │    │  Engram MCP      │    │  wiki/ (export)   │
   │  query_graph     │    │  mem_save/search │    │  .md snapshots    │
   │  god_nodes       │    │  mem_judge       │    │  from Engram      │
   │  graph.json      │    │  session lifecycle│   │                   │
   └──────────────────┘    └───────────────────┘    └──────────────────┘
                                    │
                                    │
   @Rapso-Developer (executes across all lobes via 5-Step Gate)
```

## Identity Quick Reference

```
┌──────────────────┬──────────────────────┬────────────────────┐
│   IDENTITY       │  @Rapso-Planner     │ @Rapso-Developer  │
├──────────────────┼──────────────────────┼────────────────────┤
│   Permissions    │  Read-only + research│ Full (edit, bash)  │
│   Model          │  Claude Sonnet 4     │ Claude Sonnet 4    │
│   Primary tool   │ rapso-session        │ /sdd-apply         │
│   Memory         │  mem_session_start   │ mem_save results   │
│   Code access    │  Read only           │ Edit + write       │
│   When to use    │  Planning, research  │ Building, testing  │
└──────────────────┴──────────────────────┴────────────────────┘
```

---

## 1. FRONTAL LOBE — Gentle AI SDD (Planning)

**What it is:** A structured spec-driven development workflow. Specs define WHAT before HOW.

**Commands (invoked by @Rapso-Planner):**

| Command | Purpose | Output |
|---------|---------|--------|
| `rapso-session` skill | Structure planning discussions | Session context |
| `/sdd-new` | Start a structured change | Change proposal |
| `/sdd-ff` | Fast-forward planning | Spec, design, and tasks artifacts |
| `/sdd-status` | Check change state | Current change status |
| `/sdd-apply` | Execute the change tasks | Code and apply progress |
| `/sdd-verify` | Verify the implementation and artifacts | Verify report |
| `/sdd-archive` | Close and preserve a completed change | Archive report |

**When to use:** Every feature, every task. Always spec first, then build.

---

## 2. PARIETAL LOBE — Graphify (Code Understanding)

**What it is:** A knowledge graph that shows how everything in your codebase connects.

**Commands:**

| Command | When |
|---------|------|
| `{PYTHON_COMMAND} -m graphify.serve graphify-out/graph.json` | Start graph MCP server |
| `query_graph` | Query for relevant nodes before editing |
| `god_nodes` | Find highest-degree concepts |
| `/graphify . --update` | Rebuild graph after code changes |

**Output:** `graphify-out/` — graph.html, GRAPH_REPORT.md, graph.json

**Mandatory use:** BEFORE every code edit session, run query_graph to understand what you're touching.

---

## 3. HIPPOCAMPUS — Engram (Memory)

**What it is:** Persistent SQLite memory with FTS5 search, session lifecycle, and conflict detection.

**Tools (19 MCP tools):**

| Category | Tools |
|----------|-------|
| Save | `mem_save`, `mem_update`, `mem_delete`, `mem_suggest_topic_key` |
| Search | `mem_search`, `mem_context`, `mem_timeline`, `mem_get_observation` |
| Sessions | `mem_session_start`, `mem_session_end`, `mem_session_summary`, `mem_save_prompt` |
| Utilities | `mem_stats`, `mem_doctor`, `mem_capture_passive`, `mem_current_project` |
| Conflict | `mem_judge`, `mem_compare`, `mem_merge_projects` |

**Always save:** decisions, bugfixes, patterns, architecture insights, discoveries, learnings.

---

## 4. OCCIPITAL LOBE — Wiki (Obsidian Archive)

**What it is:** An Obsidian-readable snapshot of Engram memory. Generated at session end via `scripts/engram-export-wiki.sh`.

**Structure:**
```
wiki/
├── index.md       — Auto-generated catalog
├── log.md         — Chronological export log
├── concepts/      — Technology & domain concepts
├── entities/      — Code entities
├── sources/       — Source document summaries
├── sessions/      — Session summaries
├── decisions/     — ADRs
├── dashboards/    — Automated overviews
└── graph/         — Graphify output (separate)
```

**Export lifecycle:** Engram → `engram export` → `render-engram-to-wiki.mjs` → `wiki/` .md files.

---

## 5. EXECUTION DISCIPLINE (5-Step Gate + Git Hook)

### 5-Step Gate (built into @Rapso-Developer prompt)
```
Step 1: GRAPH CHECK — query_graph before any edit
Step 2: ATOMIC COMMIT — one concern per commit, ≤5 files
Step 3: VERIFY — lint + typecheck + tests (block on failure)
Step 4: SPEC CHECK — /sdd-verify after completion
Step 5: MEMORY — mem_save key learnings
```

### Git Hook (structural enforcement)
`.git/hooks/pre-commit` rejects commits touching >5 files. Keeps atomic discipline mechanical, not just aspirational.

---

## 6. CODE-SANDBOX (execute_script)

**What it is:** A tool that runs TypeScript/JavaScript in a Node.js sandbox for multi-step logic.

**When to use:**
- Prototyping algorithms
- Data transformation / validation
- Running multi-step logic that's impractical as one-liner bash
- Testing TypeScript snippets

**How to use:** Pass a TypeScript/JS string. Returns stdout.

---

## Quick Reference Card

```
┌──────────────────┬──────────────────────┬──────────────────────┐
│   COMPONENT      │    HOW TO USE        │     WHEN TO USE      │
├──────────────────┼──────────────────────┼──────────────────────┤
│ RAPSO-PLANNER    │ Switch to Tab        │ Planning, spec,      │
│                  │                      │ research, memory     │
├──────────────────┼──────────────────────┼──────────────────────┤
│ RAPSO-DEVELOPER  │ Switch to Tab        │ Building, testing,   │
│                  │                      │ implementing specs   │
├──────────────────┼──────────────────────┼──────────────────────┤
│ GENTLE AI SDD    │ /sdd-new + /sdd-ff   │ Every feature task   │
│ Frontal Lobe     │                      │                      │
├──────────────────┼──────────────────────┼──────────────────────┤
│ GRAPHFY          │ query_graph before   │ Before editing,      │
│ Parietal Lobe    │ every edit           │ after refactors      │
├──────────────────┼──────────────────────┼──────────────────────┤
│ ENGRAM           │ mem_save / search    │ Every session        │
│ Hippocampus      │ mem_session_start    │ start/end + on       │
│                  │ mem_session_end      │ discovery            │
├──────────────────┼──────────────────────┼──────────────────────┤
│ WIKI (archive)   │ Read .md files       │ Reference, reading   │
│ Occipital Lobe   │                      │ (not for writing)    │
├──────────────────┼──────────────────────┼──────────────────────┤
│ 5-STEP GATE      │ Automatic in         │ Every task           │
│                  │ Developer prompt     │                      │
├──────────────────┼──────────────────────┼──────────────────────┤
│ GIT HOOK         │ Automatic on commit  │ Every commit         │
│ pre-commit       │                      │                      │
├──────────────────┼──────────────────────┼──────────────────────┤
│ CODE-SANDBOX     │ execute_script       │ Multi-step logic     │
│                  │ tool                 │ prototyping          │
└──────────────────┴──────────────────────┴──────────────────────┘
```

---

## How to Maintain

| Component | Maintenance |
|-----------|-------------|
| Engram | Data is persistent. Run `engram export` for backups. |
| Graphify | Re-run after major refactors: `/graphify . --update` |
| Gentle AI SDD | The dispatcher manages change artifacts. Update the SDD workflow as it evolves. |
| Wiki | Auto-generated. Only maintain export script. |
| Git hooks | `.git/hooks/pre-commit` — edit threshold as needed. |
