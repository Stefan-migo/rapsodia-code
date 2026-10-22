# pi-migration

Feature branch `odd/pi-migration`. Worktree `../rapsodia-code-odd-pi-migration`.
Proposal and evidence: `docs/pi-migration.md` (read it before any task).
P1 and P2 are delivered on this branch. P3..P5 remain, tracked in `docs/pi-migration.md` §6.

## Specs

- **S1 — Agent retirement.** The human's words: "esos agentes rapsodia-planner, rapsodia-developer ya no lo necesitamos. trabajamos con el orchestrator de gentle ai. asi que deberiamos removerlos."
- **S2 — Ponytail retirement.** "tambien lo mismo con ponytail. paso su tiempo no es necesario tenerlo ahora."
- **S3 — Capability review and Pi configuration.** "primero necesito que me des un overview de cuales son las capacidades de rapsodia-code. y evaluar cual se queda cual se va. ademas de configurar rapsodia code para pi(gentle shell)"
- **S4 — Proposal only first.** Selected option: "Solo la propuesta escrita, no toques nada". The decision document is `docs/pi-migration.md`.
- **S5 — SDD retirement.** Selected option: "Se va completo".
- **S6 — Persona retirement.** "igual creo que se va eventualmente crearemos una nueva persona en gentle shell directo", after asking what `rapso-persona` contains. No Rapsodia persona survives.
- **S7 — Session ownership.** "aqui creo que seria interesante que la sesion se carge cuando abro gentle shell. actualmente no utilizao el cli de rapsodia code para iniciar. simplemente abro opencode y rapsodiacode esta considerado en el flujo. me gustaria que fuera mas o menos lo mismo pero con gentle shell". `rapso` must not launch an agent. Prelude loads on session start.
- **S8 — P1 is the current milestone.** "ok vamos con P1". P1 is repository dogfood only: no `cli/src` changes.
- **S9 — P1 execution decisions.** Worktree: "Sí, con rapso worktree create pi-migration". `openspec/`: "Empaquetar en tar y borrar" — archive to `docs/archive/openspec-2026-10.tar.gz`, then remove the directory.

## Tasks

P1 only. Commit is recorded after the work unit lands.

| ID | Spec | Task | Route | Commit |
|----|------|------|-------|--------|
| T1 | S4, S8 | Write the feature document and carry the proposal into the branch | inline | `191518c` |
| T2 | S5, S9 | Archive `openspec/` to `docs/archive/openspec-2026-10.tar.gz` and delete the directory | inline | `a208433` (+ `diff -r` verification) |
| T3 | S1 | Remove `.opencode/agents/rapso-*.md` and the `agent` entries in `opencode.json` | inline | `c8f19c0`, `ad1b5ca` |
| T3b | S1 | Remove the OpenCode tool and plugin surface (`tools/*`, `plugins/graphify.js`) | inline | `766dc92` |
| T4 | S2 | Remove the Ponytail pack: `.opencode` symlinks, `skills/ponytail-plan`, the `AGENTS.md` section | inline | `8c6adf3`, `f876c38` |
| T5 | S5 | Remove `.opencode/skills/{sdd,graphify}` and every `/sdd-*` reference in `AGENTS.md` | inline | `8c6adf3`, `f876c38` |
| T6 | S3, S6 | Remove `bootstrap` (OpenCode/GSD-bound) and retire the `rapso-persona` symlink | inline | `8c6adf3`, `e1cad81` |
| T7 | S3 | Move `design-system` to `.agents/skills/` and retarget its frontmatter to Pi | inline | `e1cad81` |
| T8 | S3, S7 | Rewrite `AGENTS.md` for Pi: drop identities, Ponytail, SDD, and the OpenCode MCP table; add the prelude rule, Pi resource locations, and CLI `graphify` in the gate | inline | `f876c38` |
| T9 | S8 | Verify P1 (no forbidden references, clean tree, graph check) and record the commits in this table | inline | this document's commit (evidence below) |
| T10 | S1 | Stop merging OpenCode config in `adopt`; share the options contract | inline | `4bb29bf`, `3393682` |
| T11 | S1 | Drop retired paths from manifest ownership and managed ignores; fix duplicate-block handling | inline | `00ea789` |
| T12 | S1 | Provision worktrees from `.agents/skills` | inline | `352723a` |
| T13 | S3 | Share the python fallback and reject executable directories | inline | `4343c87` |
| T14 | S3 | Retarget the post-init hint | inline | `38fad1d` |
| T15 | S3 | Move `rapso-session` and `design-system` to `.agents/skills` with Pi frontmatter | inline | `dc682cd` |
| T16 | S3 | Rewrite the template `AGENTS.md` | inline | `db0bf1b`, `1641d45` |
| T17 | S2, S5 | Retire the agent/command surface, custom tools, config, graphify plugin, ponytail pack, bootstrap/graphify/persona skills, and `setup.sh` | inline | `d4f8f1c`, `d99d4e4`, `9ac8d1e`, `c5fc20d`, `21ab933`, `b2176bd`, `c3ca89c` |
| T18 | S3 | Adapt `install-deps.sh` and `rapso-sync.sh` | inline | `b0f4c5a`, `259ec41` |
| T19 | S8 | Verify P2 and record the evidence | inline | this document's commit (evidence below) |

P3..P5 (CLI session surface, session integration, migration and docs) are out of scope here and
stay in `docs/pi-migration.md` §6.

## Verification

Run inside `../rapsodia-code-odd-pi-migration` on branch `odd/pi-migration`.

1. Retired surface is gone:

   ```
   $ for p in .opencode opencode.json skills/ponytail-plan openspec; do [ -e "$p" ] && echo "PRESENT: $p" || echo "absent: $p"; done
   absent: .opencode
   absent: opencode.json
   absent: skills/ponytail-plan
   absent: openspec
   ```

2. The three headings `engine/adopt.ts` extracts by exact text still exist in `AGENTS.md`:

   ```
   $ grep -n "^## ODD Worktrees\|^## Reporting Rapsodia Defects\|^### 5-Step Execution Gate (MANDATORY)" AGENTS.md
   83:### 5-Step Execution Gate (MANDATORY)
   150:## ODD Worktrees
   178:## Reporting Rapsodia Defects
   ```

3. Typecheck still passes (proves the branch state builds; no TypeScript changed in P1):

   ```
   $ cd cli && npm run typecheck
   > tsc --noEmit
   (exit 0)
   ```

4. The graph still builds after 49 source files were deleted:

   ```
   $ graphify . --update
   [graphify extract] Pruned 297 node(s) from 49 deleted or excluded source file(s).
   [graphify extract] wrote graphify-out/graph.json: 863 nodes, 1395 edges, 90 communities
   (exit 0)
   ```
   `graphify-out/` is gitignored; the authoritative graph in the main worktree is refreshed after
   the merge, not from this branch.

5. Live references to retired surface, excluding historical records and P2 scope. The search covered
tracked files minus `cli/src/template/**` (P2), `odd/tasks/**` (past ODD records), `wiki/**`
(generated snapshot), `README.md` and `docs/COMPETITIVE-ANALYSIS.md` (P5 docs) and
`docs/pi-migration.md` (the proposal names what it retires). One live hit remained:
`scripts/rapso-sync.sh:47` lists the retired pack skills. It reads them from
`cli/src/template/.opencode/skills`, which P1 does not touch, so rewriting it now would break it
before P2 exists. Recorded as a P2 follow-up below.

6. Working tree clean after the last commit:

   ```
   $ git status
   On branch odd/pi-migration
   nothing to commit, working tree clean
   ```

### P2 — template port

Run from the worktree after `npm run build`.

1. `npm run typecheck` from `cli/`: `tsc --noEmit`, exit 0.
2. `npm run build`: `node esbuild.config.js`, exit 0.
3. `init` into a fresh scratch directory:

   ```
   $ node cli/dist/index.js init demo-pi --no-git --yes
   OK .agents/skills/rapso-session/SKILL.md
   OK .agents/skills/design-system/SKILL.md
   absent .opencode
   absent opencode.json
   absent scripts/setup.sh
   headings=3
   Ponytail=0  rapso-planner=0  execute_script=0  /sdd-new=0
   ```

4. `adopt --dry-run` on a fake legacy consumer (project `AGENTS.md` section, `opencode.json` with a
   cortex-managed `rapso-planner` plus an unrelated agent, `.opencode/agents/rapso-planner.md`,
   `.opencode/skills/bootstrap/SKILL.md`):

   ```
   Created (2): .agents/skills/design-system/SKILL.md, .agents/skills/rapso-session/SKILL.md
   Injected (2): AGENTS.md, .gitignore
   Seeded (3): .rapsodia-code/sessions/.gitignore, odd/tasks/.gitkeep, .rapsodia-code/manifest.json
   opencode.json untouched by dry run: YES
   ```

   After `adopt --yes`: `opencode.json` unchanged, the project's `## Rules` section kept, the three
   headings injected once, both skills present.

5. `bash -n scripts/rapso-sync.sh` → exit 0. `shellcheck` is not installed, so this is the check
   actually run.

### Review slice

P1 landed 9 commits and ~1625 authored changed lines. P2 added 19 commits and roughly 1690 more
(mostly deletions plus two template rewrites). Cumulatively the branch is ~3300 authored lines across
29 commits. That is past the ~400-line review slice. The delivery strategy for a slice this size is a
PR, and push/PR creation is the human's decision, so the boundary is recorded here and the branch
waits for it.

### Follow-ups discovered during the migration

- `scripts/rapso-sync.sh` is fixed: it syncs the two surviving skills into `.agents/skills` and
  reports retired pack skills instead of removing them. Consumer migration stays in P5.
- `init --force` warns that it overwrites the directory but only removes `.git`, then copies the
  template over the existing files. gga flagged the mismatch between the message and the behavior.
  Fixing it changes destructive behavior (clear the directory vs reword the warning), so it needs a
  human decision; not part of P2.
- P3 remains: `start`, `close`, `status`, `install`, and the command descriptions still name
  OpenCode; `close` still rewrites `opencode.json`; `status` still runs `opencode --version`.
- `SYSTEM-MAP.md`, `USER-GUIDE.md`, and `README.md` still describe the OpenCode surface (P5).
- gga produced two false positives in P2: it claimed `exec.ts` used an unimported `execFileSync`
  (the function is defined in the same file and typecheck passes) and treated a read-only review as a
  verification gap. Treat its prose-level claims as advisory.
- `.gga` is configured with `Provider: opencode`. `gga` still runs from the pre-commit hook, so the
  hook depends on OpenCode being installed. That is a Pi-configuration item (P5).
- The main worktree's `graphify-out/` still describes the pre-retirement tree until the graph is
  refreshed after the merge.

## Log

- **L1** (original request, verbatim): "Hey chat. acabo de instalar gentle shell en esta laptop y me gustaria revisar algunos aspectos de rapsodia code, para hacerlo funcionar en gentle shell correctamente. ademas quiero reevaluar algunas capacidades que tiene rapsodia code. como por ejepmlo esos agentes rapsodia-planner, rapsodia-developer ya no lo necesitamos. trabajamos con el orchestrator de gentle ai. asi que deberiamos removerlos. tambien lo mismo con ponytail. paso su tiempo no es necesario tenerlo ahora. \n\nentonces primero necesito que me des un overview de cuales son las capacidades de rapsodia-code. y evaluar cual se queda cual se va. ademas de configurar rapsodia code para pi(gentle shell)"
- **L2** (scope): selected "Solo la propuesta escrita, no toques nada". `docs/pi-migration.md` written; no code changed.
- **L3** (SDD): selected "Se va completo".
- **L4** (persona): "aqui necesito que me expliques que tiene el Rapso persona. para entenderlo. igual creo que se va eventualmente crearemos una nueva persona en gentle shell directo". Explained `rapso-persona`: identity, language contract, Ponytail, 5-step gate, graphify, capture rules. The operational parts are duplicated in `AGENTS.md`; the identity is what D4 retires.
- **L5** (session): quoted verbatim in S7. Designed as: Pi extension on `session_start` refreshes `.rapsodia-code/prelude.md`; `gentle-engram` owns session lifecycle; `rapso` never launches an agent.
- **L6** (approval): "ok vamos con P1".
- **L7** (execution decisions): worktree "Sí, con rapso worktree create pi-migration"; `openspec/` "Empaquetar en tar y borrar".
- **L8** (exploration correction): `bootstrap` was marked KEEP in the proposal, but reading `.opencode/skills/bootstrap/SKILL.md` shows 28 OpenCode/GSD/`.planning` references and agent-team generation. It is now DROP; `docs/pi-migration.md` was corrected before the first commit.
- **L9** (P1 delivered): 9 commits on `odd/pi-migration` (`191518c`..`a94e272`). The four retired paths are absent, the adopt injection headings survive, `npm run typecheck` passes, and `graphify . --update` rebuilt the graph after pruning 49 deleted sources. `openspec/` was deleted in the main worktree only after `diff -r` proved the committed tar matched it. Follow-ups recorded above; none of them block P1.
- **L10** (P2 approved and redefined): "vamos con P2". P2 was scoped as the template port plus the readers whose deletion would otherwise break the CLI, because `adopt.ts:70` read `cli/src/template/opencode.json` on every adoption. Delegated to `gentle-ai-worker`; the writer role refused deletion and commits and changed nothing, so P2 was implemented inline by the parent. Report fallback: the writer role was unusable for this unit.
- **L11** (gga-driven fixes): gga reviewed every TypeScript commit. It found and the parent fixed: `AdoptPlan` formatting, duplicated managed blocks in `mergeGitignore`, `pythonCommand` living in one file while `resolvePythonCommand` lived in another, the duplicated `AdoptOptions` declaration, and `isFile()` accepting an executable directory. Two findings were false positives and one (`init --force`) is a pre-existing behavior change deferred to the human.
- **L12** (P2 delivered): 19 commits (`4bb29bf`..`259ec41` plus the earlier template commits `dc682cd`, `db0bf1b`, `b0f4c5a`, `d4f8f1c`, `d99d4e4`, `9ac8d1e`, `c5fc20d`, `21ab933`, `b2176bd`, `c3ca89c`, `1641d45`). Typecheck and build pass; a fresh `init` produces no `.opencode`, no `opencode.json`, no `setup.sh`, both `.agents/skills`, and the three injectable headings; `adopt` on a legacy consumer leaves its `opencode.json` untouched and keeps its `AGENTS.md` content.
