# pi-migration

Feature branch `odd/pi-migration`. Worktree `../rapsodia-code-odd-pi-migration`.
Proposal and evidence: `docs/pi-migration.md` (read it before any task).
This document is split into phases P1..P5; only P1 is in scope for the current milestone.

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
| T4 | S2 | Remove the Ponytail pack: `.opencode` symlinks, `skills/ponytail-plan`, the `AGENTS.md` section | inline | `8c6adf3`, `f876c38` |
| T5 | S5 | Remove `.opencode/skills/{sdd,graphify}` and every `/sdd-*` reference in `AGENTS.md` | inline | `8c6adf3`, `f876c38` |
| T6 | S3, S6 | Remove `bootstrap` (OpenCode/GSD-bound) and retire the `rapso-persona` symlink | inline | `8c6adf3`, `e1cad81` |
| T7 | S3 | Move `design-system` to `.agents/skills/` and retarget its frontmatter to Pi | inline | `e1cad81` |
| T8 | S3, S7 | Rewrite `AGENTS.md` for Pi: drop identities, Ponytail, SDD, and the OpenCode MCP table; add the prelude rule, Pi resource locations, and CLI `graphify` in the gate | inline | `f876c38` |
| T9 | S8 | Verify P1 (no forbidden references, clean tree, graph check) and record the commits in this table | inline | this document's commit (evidence below) |

P2..P5 (template port, CLI port, session integration, migration and docs) are out of scope here and
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

### Review slice

P1 landed 8 commits and ~1551 authored changed lines (mostly deletions and the proposal). That is
past the ~400-line review slice. The delivery strategy for a slice this size is a PR, and push/PR
creation is the human's decision, so the boundary is recorded here and the branch waits for it.

### Follow-ups discovered in P1 (belong to later phases)

- `scripts/rapso-sync.sh:47` still syncs `rapso-persona` and `ponytail-*` from the CLI template
  (P2), and writes `.opencode/skills` instead of `.agents/skills` (P2/P3).
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
- **L9** (P1 delivered): 8 commits on `odd/pi-migration` (`191518c`..`f876c38`). The four retired paths are absent, the adopt injection headings survive, `npm run typecheck` passes, and `graphify . --update` rebuilt the graph after pruning 49 deleted sources. `openspec/` was deleted in the main worktree only after `diff -r` proved the committed tar matched it. Follow-ups recorded above; none of them block P1.
