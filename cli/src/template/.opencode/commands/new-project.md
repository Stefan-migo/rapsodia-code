---
description: Bootstrap this project from the generic template — interview, research, and a specialized agent team
agent: rapso-developer
---

## new-project

Specializes the generic Rapsodia template for this project: a structured interview, research on the
stack and domain, a proposed agent team, and the files that team needs.

**Note**: The procedure lives in the `bootstrap` skill. This command is only a door to it — nothing
here duplicates or replaces it.

### What the agent does

1. **Load the skill** — `skill({name: "bootstrap"})`.
2. **Run its phases in order**: pre-flight check, the interview, the research, the team proposal,
   then generation.
3. **Ask the interview questions one at a time and wait for each answer.** The answers are the
   skill's only input; skipping them produces a generic setup with a specialized name.

### Notes

- Runs as `@Rapso-Developer` because the last phases write files. The interview itself is
  read-only, but a command cannot change identity midway.
- **Do not improvise a bootstrap if the skill is missing.** Say it is not installed and stop.
- Re-running is safe: the skill asks again, and it does not need a second command.
