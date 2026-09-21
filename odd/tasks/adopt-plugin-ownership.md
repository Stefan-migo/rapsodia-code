# adopt-plugin-ownership

## Objective

Make `rapso adopt` install and correctly wire `.opencode/plugins/graphify.js`, and stop it from
leaving a stale absolute plugin path that points outside the project.

## Problem

The template ships `.opencode/plugins/graphify.js`, but `.opencode/plugins/**` is absent from
`OWNED_PATHS` in `cli/src/engine/adopt.ts`. Two consequences, both verified live in the published
`rapsodia-code@1.0.2` (`dist/index.js:6647`):

1. `adopt` never installs the plugin into an existing project, because the install loop and the
   manifest both filter through `isOwned`.
2. `mergeJson` identifies "our" plugin entry by `resolve(targetDir, entry) === resolve(targetDir,
   '.opencode/plugins/graphify.js')`. A pack-era entry written as an **absolute** path resolves to
   itself and therefore never matches. The entry survives adoption and keeps loading the plugin
   from whatever checkout installed it.

Observed in `D:\proyect\OpttiusV2`, whose `.opencode/opencode.json` carries:

```json
"plugin": ["C:/Users/El Mismisimo/.cortex/.opencode/plugins/graphify.js"]
```

That is the retired Cortex clone. The pack-native path `.opencode/plugins/graphify.js` does not
exist there, so the stale absolute entry is the only live one.

## Why

`adopt` is the supported path for bringing an existing project onto the pack. A defect here means
every adopted project runs its graphify plugin from a foreign tree, or runs none at all — and the
project can never converge onto its own copy, because `update` only manages what the manifest
tracks and the manifest is built from `isOwned`.

## Scope

In scope:

- `cli/src/engine/adopt.ts` — `OWNED_PATHS`, and the `plugin` block of `mergeJson`.

Out of scope (unchanged, deliberately):

- Retired skills (`cortex-persona`, `cortex-session`, `ponytail-plan`) are still not removed by
  `adopt`. Pre-existing, unrelated to this defect.
- `NEVER_PATHS`, the agent retirement logic, and the `mcp` merge are untouched.

## Constraints

- No test harness exists in this repository. Verification is `npm run typecheck`, `npm run build`,
  and a live `adopt --dry-run` executed against `D:\proyect\OpttiusV2`.
- Do not weaken the file's existing safety principle: never remove a config entry while the file
  behind it is missing. The new drop path honours it.
- Atomic commits, at most 5 staged files each.

## Tasks

- [x] T1 — Add `.opencode/plugins/**` to `OWNED_PATHS` so the plugin is installed and tracked in
  the manifest.
- [x] T2 — In `mergeJson`, drop a plugin entry that resolves outside the project and names the
  pack's own plugin path, but only when this project's copy is installed.
- [x] T3 — `npm run typecheck` and `npm run build` in `cli/`.
- [x] T4 — Prove it live: run the built CLI's `adopt --dry-run` against `D:\proyect\OpttiusV2` and
  confirm the stale `.cortex` absolute entry is gone and `.opencode/plugins/graphify.js` is planned
  as created.

## Acceptance criteria

1. `.opencode/plugins/graphify.js` appears in the adopt plan as **created** for a project that
   lacks it.
2. `mergeJson` drops the absolute `.cortex` entry when the local copy is installed, and leaves the
   plugin list with exactly the in-project entry.
3. A project whose `plugin` array is absent, non-array, or holds a foreign non-graphify entry is
   left alone in the same way it was before this change.
4. `npm run typecheck` and `npm run build` pass with the real output reported.

## Progress

T1 and T2 implemented in `cli/src/engine/adopt.ts`. T3 and T4 verified — see Verification below.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` (from `cli/`) | see Evidence |
| Build | `npm run build` (from `cli/`) | see Evidence |
| Live dry run | built `adopt --dry-run` in `D:\proyect\OpttiusV2` | see Evidence |

Real command output is recorded in the Evidence section below, not summarised.

## Evidence

**T3 — typecheck** (`npm run typecheck` from `cli/`):

```
> rapsodia-code@1.0.2 typecheck
> tsc --noEmit

--- exit: 0 ---
```

**T3 — build** (`npm run build` from `cli/`):

```
> rapsodia-code@1.0.2 build
> node esbuild.config.js

--- exit: 0 ---
```

`dist/index.js` written (250554 bytes) and its `OWNED_PATHS` now carries
`.opencode/plugins/**`.

**T4a — the stale absolute entry, proven end to end.** A throwaway project was created holding only
`.opencode/opencode.json`:

```json
{ "$schema": "https://opencode.ai/config.json",
  "plugin": ["C:/Users/El Mismisimo/.cortex/.opencode/plugins/graphify.js"] }
```

A real (non-dry-run) `adopt --yes` was run against it with the build above. The plan listed
`.opencode/plugins/graphify.js` under **Created**, and the resulting file carried:

```json
"plugin": [".opencode/plugins/graphify.js"]
```

The retired `~/.cortex` absolute path is gone and exactly one in-project entry remains. The fixture
was deleted afterwards.

**T4b — `D:\proyect\OpttiusV2` dry run with the build.** `.opencode/plugins/graphify.js` now appears
under `Created (13)`. Run against the published 1.0.2 it did not appear at all.

**Unrelated discrepancy found while comparing the two plans (NOT introduced by this change).**
`cli/src/template/.opencode/tools/node_modules/.gitkeep` ships inside the published npm package but
is not tracked in git — `.gitignore`'s `node_modules/` swallows it. A dry run from a repo checkout
therefore omits it, while a dry run from the published package lists it under Created. Confirmed
with `git ls-files cli/src/template/.opencode/tools/`, which returns four files and no `.gitkeep`.
Out of scope here; recorded so the plan difference is not later mistaken for a regression.

**The shipped file was proven reachable.** `cli/src/template/.opencode/plugins/graphify.js` is
tracked (`git ls-files`), not ignored (`git check-ignore` exits 1) and present in the published
package — so adding `.opencode/plugins/**` to `OWNED_PATHS` does reach consumers.

## Next step

Record Evidence, commit the work unit on `odd/adopt-plugin-ownership`, then decide whether to cut
the release that carries the fix before adopting `OpttiusV2`.
