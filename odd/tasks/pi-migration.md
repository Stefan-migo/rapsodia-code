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
| T1 | S4, S8 | Write the feature document and carry the proposal into the branch | inline | pending |
| T2 | S5, S9 | Archive `openspec/` to `docs/archive/openspec-2026-10.tar.gz` and delete the directory | inline | pending |
| T3 | S1 | Remove `.opencode/agents/rapso-*.md` and the `agent` entries in `opencode.json` | inline | pending |
| T4 | S2 | Remove the Ponytail pack: `.opencode` symlinks, `skills/ponytail-plan`, the `AGENTS.md` section | inline | pending |
| T5 | S5 | Remove `.opencode/skills/{sdd,graphify}` and every `/sdd-*` reference in `AGENTS.md` | inline | pending |
| T6 | S3, S6 | Remove `bootstrap` (OpenCode/GSD-bound) and retire the `rapso-persona` symlink | inline | pending |
| T7 | S3 | Move `design-system` to `.agents/skills/` and retarget its frontmatter to Pi | inline | pending |
| T8 | S3, S7 | Rewrite `AGENTS.md` for Pi: drop identities, Ponytail, SDD, and the OpenCode MCP table; add the prelude rule, Pi resource locations, and CLI `graphify` in the gate | inline | pending |
| T9 | S8 | Verify P1 (no forbidden references, clean tree, `graphify update`) and record the commits in this table | inline | pending |

P2..P5 (template port, CLI port, session integration, migration and docs) are out of scope here and
stay in `docs/pi-migration.md` §6.

## Log

- **L1** (original request, verbatim): "Hey chat. acabo de instalar gentle shell en esta laptop y me gustaria revisar algunos aspectos de rapsodia code, para hacerlo funcionar en gentle shell correctamente. ademas quiero reevaluar algunas capacidades que tiene rapsodia code. como por ejepmlo esos agentes rapsodia-planner, rapsodia-developer ya no lo necesitamos. trabajamos con el orchestrator de gentle ai. asi que deberiamos removerlos. tambien lo mismo con ponytail. paso su tiempo no es necesario tenerlo ahora. \n\nentonces primero necesito que me des un overview de cuales son las capacidades de rapsodia-code. y evaluar cual se queda cual se va. ademas de configurar rapsodia code para pi(gentle shell)"
- **L2** (scope): selected "Solo la propuesta escrita, no toques nada". `docs/pi-migration.md` written; no code changed.
- **L3** (SDD): selected "Se va completo".
- **L4** (persona): "aqui necesito que me expliques que tiene el Rapso persona. para entenderlo. igual creo que se va eventualmente crearemos una nueva persona en gentle shell directo". Explained `rapso-persona`: identity, language contract, Ponytail, 5-step gate, graphify, capture rules. The operational parts are duplicated in `AGENTS.md`; the identity is what D4 retires.
- **L5** (session): quoted verbatim in S7. Designed as: Pi extension on `session_start` refreshes `.rapsodia-code/prelude.md`; `gentle-engram` owns session lifecycle; `rapso` never launches an agent.
- **L6** (approval): "ok vamos con P1".
- **L7** (execution decisions): worktree "Sí, con rapso worktree create pi-migration"; `openspec/` "Empaquetar en tar y borrar".
- **L8** (exploration correction): `bootstrap` was marked KEEP in the proposal, but reading `.opencode/skills/bootstrap/SKILL.md` shows 28 OpenCode/GSD/`.planning` references and agent-team generation. It is now DROP; `docs/pi-migration.md` was corrected before the first commit.
