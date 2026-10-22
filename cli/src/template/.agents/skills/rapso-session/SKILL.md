---
name: rapso-session
description: "Trigger: discuss, analicemos, brainstorm, planeemos, cotización, session, rapso-session. Structured planning sessions with automatic decision capture for architecture discussions, requirement analysis, quotes, and pre-ODD work."
license: MIT
compatibility: pi
metadata:
  author: Stefan-migo
  version: "2.1"
source: github.com/Stefan-migo/rapsodia-code
---

## When to Load

Load when entering **planning mode** — discussing architecture, analyzing requirements, building proposals, estimating, brainstorming, or any conversation where decisions are being made. Invoke explicitly via `/rapso-session` or when the conversation shifts to planning.

Do NOT load during ODD task implementation or quick Q&A.

> **Write authority**: this skill creates, moves and migrates files under `.rapsodia-code/sessions/`. It must run in a session with write access; a read-only or planning-only subagent delegates those writes. Session bookkeeping is knowledge management, not code modification.

## Session Lifecycle

Planning sessions live under `.rapsodia-code/sessions/` in three states:

```
open/            session in progress
ready-for-odd/   closed WITH an ODD handoff; an inbox of pending handoffs
archived/        closed without a handoff, or already consumed by ODD
```

Transition map:

```
open ──close + handoff──> ready-for-odd ──ODD task doc created──> archived
  └────close without handoff────────────────────────────────────> archived
```

The **directory IS the state**. There is no manifest and no status field — a session's location tells you everything.

## Session Protocol

### 1. Init (`session-init`)

When planning mode starts:

a. **Detect topic**: what are we discussing? Name the session.
b. **Check for resume**: look in `.rapsodia-code/sessions/open/` and Engram for an existing session on the same topic before creating a new one.
c. **Create the session directory**: `.rapsodia-code/sessions/open/YYYY-MM-DD-<slug>/` and write `session.md` inside it.
d. **Initialize session.md**:

```markdown
# Session: {topic}
Goal: {what we need to achieve or produce}

## Context
{why this session exists, what we know}

## Decisions
| # | Decision | Rationale | Alternatives |
|---|----------|-----------|-------------|

## Tradeoffs
| Option | Pros | Cons | Verdict |

## Risks
| Risk | Impact | Mitigation |

## Open Questions
- [ ] {question}

## Action Items
- [ ] {who does what}
```

e. **Save to Engram**: `mem_save(type: architecture, topic_key: "cortex-session/{slug}/init", title: "Session: {topic}", content: <structured block — see Save format>)`

### 2. Active Discussion (`discuss`)

Proactively capture these moments WITHOUT asking permission:

| Signal | What to capture | Save to |
|--------|----------------|---------|
| "hacemos X", "mejor Y", "decidido", "let's go with" | Decision with rationale | session.md + `mem_save(type: decision, topic_key: "cortex-session/{slug}/decision/{topic-slug}", content: <structured block>)` |
| Comparing options, weighing pros/cons | Tradeoff table entry | session.md |
| "esto podría ser un problema", "riesgo de" | Risk with mitigation | session.md + `mem_save(type: discovery, topic_key: "cortex-session/{slug}/risk/{topic-slug}", content: <structured block>)` |
| "costaría X", "toma Y tiempo" | Estimate or number | session.md |
| "no sabemos aún", "habría que investigar" | Open question | session.md |

**Save format** — EVERY `mem_save` call (init, discussion, close) carries this structured content envelope (Rapsodia memory standard). A `mem_save` without it does not comply:

```
**What**: one-line summary of what was captured
**Why**: the rationale — user request, bug, or decision driver
**Where**: files or paths affected
**Learned**: gotchas, edge cases, surprises (optional)
```

For a decision, prepend `## Decision: {title}` and list the rejected option under `**Alternatives**`.

**Decision hygiene (MANDATORY)**: when a decision is reversed, do NOT leave the old row as if it were still current. Rewrite the row so the current choice is the Decision, the rejected option moves to Alternatives, and the reversal is noted. A stale decision left in the ledger makes the record lie about the state.

**Frequency**: save to Engram IMMEDIATELY after each significant capture — a decision, a risk, a discovery, a convention, a preference. Do NOT wait and do NOT batch; a deferred save is a lost save. Update session.md at the same time, and read it back after writing to confirm the content landed as intended.

**Topic key discipline (MANDATORY)**: Engram upserts by `topic_key`. Writing twice with the same key **replaces** the earlier content, and only the last write stays reachable through `mem_search` — earlier revisions are not retrievable by any tool. A single shared key across several decisions therefore destroys the session record: a session with four decisions keeps only the fourth.

One key per captured item:

| Capture | Topic key |
|---|---|
| session init | `cortex-session/{slug}/init` |
| each decision | `cortex-session/{slug}/decision/{topic-slug}` |
| each risk | `cortex-session/{slug}/risk/{topic-slug}` |
| free-form context | `cortex-session/{slug}/context` |
| session close report | `cortex-session/{slug}` — written once, at close |

`{topic-slug}` is a short stable slug identifying that specific item (`build-order`, `package-manager`). Never reuse a slug for a different decision: a reversal gets a new slug and the old key is superseded, never overwritten.

### 3. Close (`session-close`)

When the session wraps up:

a. **Consolidate**: read session.md, compile all sections
b. **Generate report**: `.rapsodia-code/sessions/open/YYYY-MM-DD-<slug>/report.md` with:
   - Executive summary
   - All decisions (flattened)
   - Risks and tradeoffs
   - **ODD readiness**: what's ready to become an `odd/tasks/<feature>.md`
   - Next steps
c. **Ask the handoff question (MANDATORY, explicit)**: ask the user *"Does this session close with an ODD handoff?"* Do NOT auto-detect from the report — a heuristic over free text misroutes sessions and destroys trust in the layout.
d. **Move the session** — the directory IS the state:
   - **Yes** → `mv .rapsodia-code/sessions/open/<slug> .rapsodia-code/sessions/ready-for-odd/<slug>`
   - **No**  → `mv .rapsodia-code/sessions/open/<slug> .rapsodia-code/sessions/archived/<slug>`
e. **Engram final**: `mem_save(type: architecture, topic_key: "cortex-session/{slug}", title: "{topic} — session report", content: <the full report in the structured block — see Save format>)`
f. **Session summary**: `mem_session_summary` with comprehensive summary
g. **Present** concise summary to user

## ODD Handoff

The `report.md` generated by `session-close` seeds `odd/tasks/<feature>.md` and is the input for ODD task implementation. Gentle AI SDD remains available when the human explicitly asks for it, but it is no longer the default continuation.

**Consume the inbox (MANDATORY)**: when an ODD task doc is CREATED from a session's report, move that session to archived — its handoff has been picked up:

```
mv .rapsodia-code/sessions/ready-for-odd/<slug> .rapsodia-code/sessions/archived/<slug>
```

`ready-for-odd/` is an inbox, not a tracker: it must empty as ODD task docs are created. List it with `ls .rapsodia-code/sessions/ready-for-odd/`. The CLI's `cleanupWorktree` also archives the matching pending handoff, so a session whose worktree is cleaned up does not need a second manual move.

## Migration

Projects that ran the previous sync may hold the legacy `.cortex-sessions/ready-for-sdd/` directory. `scripts/rapso-sync.sh` migrates it once to `ready-for-odd/` without overwriting a colliding session in the target; collisions remain in the legacy directory and are reported. Reading both directory names is forbidden — this migration is the only path.

Older sessions live flat at `.rapsodia-code/sessions/<slug>/`. Migrate them once with this rule:

| Has | Destination |
|-----|-------------|
| `session.md` + `report.md` | `archived/` |
| only `session.md` | `open/` |
| neither (deliverables only) | `archived/` |

Do NOT touch directories already inside `open/`, `ready-for-odd/`, or `archived/` — the migration is idempotent. `scripts/rapso-sync.sh` runs it automatically for every project on the list.

## Artifacts

```
.rapsodia-code/sessions/
  open/
    YYYY-MM-DD-<topic-slug>/
      session.md      — updated live during discussion
      report.md       — generated at close (ODD-ready)
  ready-for-odd/
    YYYY-MM-DD-<topic-slug>/   — closed with a pending ODD handoff
  archived/
    YYYY-MM-DD-<topic-slug>/   — closed, no handoff, or consumed by ODD
```

## Rules

1. **Save proactively**: don't wait for permission. If a decision was made, capture it.
2. **One session per topic**: don't create multiple files for one conversation.
3. **Close before coding**: end the session before switching to ODD task implementation.
4. **Engram is source of truth**: session.md is a courtesy artifact; Engram is the persistent record.
5. **No over-capture**: skip trivial clarifications, focus on decisions with weight.
6. **Resume support**: before init, check `.rapsodia-code/sessions/open/` and Engram for an existing session on the same topic.
7. **The directory is the state**: never leave a closed session in `open/`.
8. **Decision hygiene**: a reversed decision is superseded, never left as current.
9. **Write authority**: only a write-capable session touches files; a read-only or planning-only subagent delegates.
