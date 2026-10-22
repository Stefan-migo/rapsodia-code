# Rapsodia → Pi (Gentle Shell) Migration

Status: **proposal, not approved.** No code has been changed for this document.
Scope: make Rapsodia a first-class workflow pack for Pi / Gentle Shell, and retire the
OpenCode-only surface that the orchestrator (`gentle-ai`) already owns.

Evidence in this document was read from the working tree at `main` (`03c2da3`), the installed
CLI (`rapso 1.0.3`), `engram 2.2.1`, and the Pi documentation shipped with
`@earendil-works/pi-coding-agent`.

## 1. Decisions already taken by the human

| ID | Decision |
|----|----------|
| D1 | `rapso-planner` and `rapso-developer` are retired. Pi's `gentle-ai` orchestrator plus subagents replace them. |
| D2 | The Ponytail pack is retired: `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-help`, `ponytail-plan`, its `AGENTS.md` section, and its section inside `rapso-persona`. |
| D3 | SDD is retired completely: `openspec/`, `skills/sdd`, and every `/sdd-*` reference. ODD is the only workflow. |
| D4 | `rapso-persona` is retired. A future persona will live in Gentle Shell / `gentle-ai`, not in Rapsodia. |
| D5 | Pi owns the session lifecycle. `rapso` must not launch an agent, and the Rapsodia context must be present when Gentle Shell opens — the same shape the human has today with OpenCode: open the agent, and the project context is already in the flow. |

## 2. Capability inventory

Verdicts: **KEEP** (port as-is), **ADAPT** (keep the capability, change the platform
integration), **DROP** (retire), **DEFER** (keep, but not part of this migration).

### 2.1 CLI commands (`cli/src/commands`, `cli/src/index.ts`)

| Command | What it really does | OpenCode coupling | Verdict |
|---|---|---|---|
| `init <name>` | Scaffolds a project from `cli/src/template` | `.opencode/` paths, `opencode.json` | **ADAPT** |
| `adopt [path]` | Installs Rapsodia into an existing project: merges `AGENTS.md` sections, seeds MCP entries, retires legacy agents | Strong (`engine/adopt.ts`) | **ADAPT** — highest-value command for existing repos |
| `update` | Manifest-diff template refresh with user-modified detection (`--dry-run`, `--force`, `--check`) | Paths only (`engine/manifest.ts`) | **ADAPT** |
| `start` | Generates a session id, opens an Engram session over stdio MCP, builds `.rapsodia-code/prelude.md` (Engram `mem_context` + Graphify report + manifest, scored, 4k budget), then **spawns `opencode`** | `start.ts:97` | **ADAPT** — keep prelude production, drop the launch |
| `close` | `mem_session_end` + `mem_save`, wiki export, retrospective, and removes a legacy `prelude` instruction from `opencode.json` | `close.ts:15-32, 89-102` (legacy cleanup only) | **ADAPT** — keep wiki export + retrospective, drop the config rewrite |
| `status` | Health: session, manifest, Engram (`engram stats`), Graphify freshness by commit evidence, wiki mtime, node, and `opencode --version` | `status.ts:137-140, 188-189` | **ADAPT** |
| `analyze` | Session-pattern analysis over `.rapsodia-code/sessions` | None | **KEEP** |
| `worktree` | Sibling worktree `../<repo>-odd-<slug>` on `odd/<slug>`, dependency install, skill linking, protected cleanup | Copies `.opencode/` and links canonical skills (`worktree.ts:57, 209-256`) | **ADAPT** — the git engine is portable; only the file-copy part changes |
| `install` | Dependency check: node, graphify python module, `.opencode/tools` npm deps | Small | **ADAPT** |
| defect report | Scrubbed public-issue payload (`utils/defect.ts`) | None | **KEEP** — has an explicit privacy contract in `AGENTS.md` |

`engine/context.ts` and `engine/session.ts` — the real value: Engram MCP client, prelude scoring,
retrospective generation — have **no** OpenCode dependency. They port unchanged.

### 2.2 Template content (`cli/src/template`)

| Piece | Verdict | Reason |
|---|---|---|
| `AGENTS.md` | **ADAPT** | Pi reads it natively. Remove "Two Identities", Ponytail, the OpenCode MCP table, and SDD; keep ODD, the 5-step gate, ODD worktrees, PR policy, the defect contract, and Graphify |
| `.opencode/agents/rapso-planner.md`, `rapso-developer.md` | **DROP** | D1 |
| `opencode.json` (agents + 4 MCP servers + plugin) | **DROP as a file** | Pi reads `mcp.json` with `mcpServers`. Engram is already provided globally by `gentle-engram`; `context7` and `github` are user-level choices, not project scaffolding |
| `ponytail-*` skills | **DROP** | D2 |
| `rapso-persona` | **DROP** | D4 — it duplicates and contradicts the `gentle-pi` persona |
| `rapso-session` | **KEEP** | Planning protocol; aligns with ODD. Review that it does not duplicate `gentle-ai`'s Ask/deciding step |
| `bootstrap` | **DROP** | Not platform neutral: it generates OpenCode primary agents, GSD commands, `.planning/` state, and edits `opencode.json`. It contradicts D1 and D3 |
| `design-system` | **ADAPT** | Portable, but its frontmatter declares `compatibility: opencode`; retarget to Pi when moved |
| `graphify` skill | **DROP from the scaffold** | Already installed for Pi at `~/.agents/skills/graphify`, and `graphify install --platform pi` exists. Shipping it duplicates it |
| `.opencode/tools/execute_script.ts` | **DROP** | Pi `codemode` replaces it |
| `.opencode/tools/wiki-link.ts`, `wiki-search.ts` | **DROP** | `mem_search` + wiki index + grep cover it |
| `.opencode/plugins/graphify.js` | **DROP** | No OpenCode plugin API in Pi; Graphify goes through skill + CLI + optional MCP |
| `.opencode/commands/new-project.md`, `cortex-init.md` | **DROP** | `cortex-init.md` points at `/home/stefan/Cortex/cortex-init.sh` and `agent: gentle-orchestrator`. Dead |
| `scripts/setup.sh` | **DROP** | Writes `.planning/` and instructs `/new-project`. Pure Cortex legacy |
| `scripts/install-deps.sh` | **ADAPT** | Drop the `.opencode/tools` section |
| `scripts/engram-export-wiki.sh` | **KEEP** | `engram obsidian-export --vault wiki/` is agent-agnostic |
| `wiki/` + `.obsidian/` | **KEEP** | Works with any agent |
| `SYSTEM-MAP.md`, `USER-GUIDE.md` | **DEFER** | Not platform-coupled; review separately |

### 2.3 Repository-level

`odd/tasks`, `.githooks` (atomicity gate + `gga`), `.gga`, `graphify-out/` → **KEEP**. They are this
repository's policy, not Pi's. `openspec/` and `skills/sdd` → **DROP** (D3). The dogfooded
`.opencode/` tree and root `opencode.json` → **DROP**.

## 3. The real coupling surface

OpenCode touches 10 CLI files, not the architecture:

```
cli/src/commands/start.ts:68-69,81-83,92-115   spawn('opencode') + messages
cli/src/commands/status.ts:37,88,137-140,188    opencode --version
cli/src/commands/close.ts:15-32,89-102          opencode.json rewrite
cli/src/commands/init.ts:120                    "opencode" hint
cli/src/commands/install.ts:35                  "run opencode" hint
cli/src/commands/analyze.ts:34                  'opencode' stopword (cosmetic)
cli/src/engine/gitignore.ts:21,26,82            .opencode ignores
cli/src/engine/worktree.ts:57,209-210,232-256   skill links + package copies
cli/src/engine/manifest.ts:33,76                adopted-path exclusions
cli/src/engine/adopt.ts:11-13,70,94,175-194,213 OWNED_PATHS, legacy agents, merge
cli/src/index.ts:44-46                          option descriptions
```

Everything else in `cli/src` is platform neutral.

## 4. Target shape of a Pi project

```
project/
  AGENTS.md                  # workflow contract; Pi reads it natively
  DESIGN.md
  .agents/skills/            # project-scoped, versioned, managed by `rapso update`
    rapso-session/SKILL.md
    bootstrap/SKILL.md
    design-system/SKILL.md
  .pi/mcp.json               # optional; only if a project wants Graphify as MCP
  .rapsodia-code/            # ignored local state: manifest, config, sessions, prelude
  odd/tasks/                 # ODD spec documents
  wiki/                      # Engram → Obsidian export
  scripts/
    install-deps.sh
    engram-export-wiki.sh
  graphify-out/
```

Notes:

- Pi discovers project skills in `.agents/skills/` and user skills in `~/.agents/skills/`. Project
  scope is preferable because `rapso update` can manage it with the manifest.
- Engram needs no project entry: `~/.gentle-shell/agent/mcp.json` already declares it, and
  `gentle-engram` injects the memory protocol into the system prompt.
- `graphify` is verified working on this machine: `python3 -m graphify.serve --graph
  graphify-out/graph.json`. It can be a project MCP entry, or stay skill+CLI only. Projects with a
  `.pi/mcp.json` require project trust.
- `.pi/` is not owned by `rapso` unless the project explicitly opts in; `OWNED_PATHS` must say so.

## 5. Session lifecycle under D5

Today: `rapso start` produces `.rapsodia-code/prelude.md` and then launches the agent; `AGENTS.md`
tells the model to detect and use that file. The human says they never run `rapso start` — they open
the agent and Rapsodia is "already in the flow". Under Pi, the equivalent is:

**Retire `start` as a launcher. Keep prelude production as a separate, non-interactive capability.**
Two implementation options:

| Option | Mechanism | Trade-off |
|---|---|---|
| A. Instruction-only | `AGENTS.md`: "at session start, if `.rapsodia-code/prelude.md` exists, read it". A `rapso context` command (or `rapso start --no-open`, which already exists) refreshes it manually or from a git hook | Zero new runtime surface; the prelude goes stale unless someone refreshes it |
| B. Pi extension | A small `rapsodia-context` extension on the `session_start` event runs the prelude refresh in the background and injects it as a prompt section | Truly "loads when I open Gentle Shell"; costs one extension to maintain and must not block the first prompt |

Recommendation: **B, with A as the fallback path.** The extension only calls the existing prelude
engine; it must not open an Engram session, because `gentle-engram` already owns session start,
summary, and passive capture. Two owners of one session would double-write memory.

Consequences:

- `rapso close` loses `mem_session_end`/`mem_save` (owned by `gentle-engram`) and the
  `opencode.json` rewrite. It keeps: wiki export, retrospective, state cleanup. It must no longer
  require a `rapso`-created session.
- `status` reports `gentle-shell` (and Engram/Graphify/wiki) instead of `opencode`.
- The Engram MCP client in `engine/session.ts` stays for prelude production, not for lifecycle.

## 6. Work plan (when approved)

Ordered so each phase is independently reviewable. Each phase is one work unit, and D1–D5 mean the
retirement phases are contract changes (Task Size high risk item 3) and get their own commits.

### P0 — This document
No code.

### P1 — Repository dogfood (no CLI changes)
1. Delete `.opencode/` and root `opencode.json`.
2. Delete `skills/ponytail-plan/`.
3. Delete `openspec/`; remove `/sdd-*` and SDD mentions from `AGENTS.md`.
4. Move surviving skills to `.agents/skills/`.
5. Rewrite `AGENTS.md`: drop "Two Identities", Ponytail, the OpenCode MCP table, and SDD; add the
   prelude rule and Pi-native resource locations.

### P2 — Template port (`cli/src/template`)
1. `.opencode/skills/{rapso-session,bootstrap,design-system}` → `.agents/skills/`.
2. Delete agents, ponytail skills, persona skill, graphify skill, tools, plugins, commands,
   `opencode.json`, `scripts/setup.sh`.
3. Rewrite template `AGENTS.md` to match P1.
4. Optionally ship `.pi/mcp.json` as a documented, non-owned example.

### P3 — CLI port
1. `engine/adopt.ts`: `OWNED_PATHS` → `.agents/skills/**`; add a retirement list for every dropped
   path; restrict `opencode.json` handling to entries marked `__managed_by: cortex`; never delete a
   user's file.
2. `engine/manifest.ts`: adopted exclusions for `.pi/`, `AGENTS.md`, `.gitignore`.
3. `engine/gitignore.ts`: `.opencode/*` → `.agents/*` where needed; keep `.rapsodia-code/`.
4. `engine/worktree.ts`: link/copy `.agents/skills` and `.pi/` instead of `.opencode/` and its npm
   packages; drop the `node_modules` install for tools.
5. `commands/start.ts`: `--run` becomes opt-in and the agent binary is configurable
   (`RAPSO_AGENT`, default `gentle-shell`); default becomes prepare-only.
6. `commands/close.ts`: remove the `opencode.json` rewrite and the hard session requirement.
7. `commands/status.ts`, `install.ts`, `init.ts`, `index.ts`: `opencode` → `gentle-shell`, drop
   `.opencode/tools` checks.
8. `utils/defect.ts`: unchanged.

### P4 — Session integration
1. Add `rapso context` (thin wrapper over `buildPrelude`) if `start --no-open` is too loaded a name.
2. Ship the `rapsodia-context` Pi extension (Option B) or the instruction-only rule (Option A).

Delivered: `rapso context` builds the prelude only (no prepared-context id, no `session.json`, no
agent, `--dry-run` available); `cli/src/template/.pi/extensions/rapsodia-context.ts` refreshes that
prelude in the background on `session_start` (skipping a prelude younger than five minutes, timing
out at 60s, staying silent when `rapso` is absent or predates the command) and points the first user
run at the file through a `rapsodia_context` prompt section. `buildPrelude` now swaps the file in
with one rename, so a reader never sees a half-written prelude. `adopt` owns `.pi/extensions/**`
next to `.agents/skills/**`, so a consumer project receives the extension too. The `AGENTS.md` rule
stays as the untrusted fallback and no longer points at the removed `start --no-open`.

### P5 — Migration and docs
1. Retirement is destructive in adopted projects (high risk item 1). `adopt --dry-run` must print the
   removal plan, and `--force` must remain the only way to overwrite user-modified owned files.
2. Update `README.md` (skill pack table, command table), `cli/src/template/AGENTS.md`,
   `cli/src/template/USER-GUIDE.md`.
3. Rebuild `cli/dist/` (gitignored; the merge does not update it) and bump the version.

## 7. Verification

This repository has **no test harness**: `vitest` is configured in `cli/` with zero test files, and
`npm test` exits 1 with "No test files found". Claiming coverage would be dishonest. The plan uses:

- `npm run typecheck` (from `cli/`)
- `npm run build`
- Manual scenarios in scratch directories, with exact commands and real output:
  - `rapso init demo-pi --no-git --yes` → assert no `.opencode/`, no `opencode.json`, no ponytail
  - `rapso adopt --dry-run` on a scratch project carrying the legacy surface → assert the removal
    plan lists exactly the retired paths and nothing user-owned
  - `rapso update --dry-run` on a project created by the previous version
  - `rapso worktree create/list/cleanup` inside a scratch clone
  - `rapso context` (or `start --no-run`) → inspect `.rapsodia-code/prelude.md`
  - `rapso status` on this repository
- A differential check: run `rapso status` and `rapso analyze` from the base commit in a `mktemp -d`
  copy against the changed build, comparing stdout, stderr, and exit code.

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Removing files from adopted projects is destructive | Dry-run plan, explicit `--force` for user-modified files, only touch `__managed_by: cortex` entries |
| 2 | `adopt.ts` injects three `AGENTS.md` sections by exact heading; renaming a heading silently stops injection | Update `markdownSections()` in the same commit as the `AGENTS.md` rewrite; assert in the scratch scenario |
| 3 | Two owners of the Engram session would double-write memory | D5: `gentle-engram` owns lifecycle; `rapso` only produces the prelude |
| 4 | A `session_start` extension that blocks startup degrades every session | Run the refresh off the critical path; fail soft and log |
| 5 | `.opencode` → `.agents` changes what `rapso update` reports as deleted | Test the upgrade path from a 1.0.3-created project |
| 6 | Project trust gaps: `.pi/mcp.json` and project skills are inert until trust is granted | Document, and never make Rapsodia's core value depend on project-scoped MCP |

## 9. Out of scope

Publishing to npm, GitHub issue/PR creation, `gentle-ai` native review changes, Graphify upstream
behavior, a new Rapsodia persona (D4: it will live in Gentle Shell), and any change to this
repository's PR policy.

## 10. Open questions

1. ~~Option A (instruction-only) or Option B (Pi extension) for the session prelude?~~ Resolved in
   P4: Option B, a project extension shipped in the template, with Option A as the untrusted
   fallback.
2. Does `analyze` still earn its place once `gentle-engram` provides session summaries?
3. Should the wiki export stay part of `rapso close`, or become `rapso wiki export`?
4. Do `SYSTEM-MAP.md` and `USER-GUIDE.md` survive the Pi migration, or are they Cortex-era docs?
