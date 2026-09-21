#!/usr/bin/env bash
# rapso-sync.sh — push the Rapsodia pack into every project on your list.
#
# For each project it:
#   1. Installs the six skills the pack owns into <project>/.opencode/skills/, and removes the
#      stale directory of any skill the pack has renamed (cortex-persona, cortex-session).
#      A pack skill outside that list does not travel.
#   2. Repairs the legacy Cortex references in <project>/AGENTS.md.
#   3. Migrates legacy flat session directories into open|ready-for-odd|archived.
#
# It renames no state store and writes no .gitignore: `rapso adopt` owns both.
#
# Idempotent. Git is your backup: review `git diff` before committing.
#
# Usage: scripts/rapso-sync.sh [--dry-run] [--projects <file>]
#
# Project list format (default: <pack>/projects.txt):
#   one path per line, '#' starts a comment, '~' expands to $HOME.

set -euo pipefail
shopt -s nullglob

PACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECTS_FILE="$PACK_DIR/projects.txt"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN=1; shift ;;
    --projects) PROJECTS_FILE="${2:?--projects needs a file}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

run() {
  if [[ $DRY_RUN -eq 1 ]]; then printf '    [dry-run] %s\n' "$*"; else "$@"; fi
}

[[ -f "$PROJECTS_FILE" ]] || { echo "Project list not found: $PROJECTS_FILE" >&2; exit 1; }

# Copy the pack's skills over the project's copies. Project-local skills that
# the pack does not own (e.g. component-adapter) are left untouched.
sync_skills() {
  local target="$1/.opencode/skills"
  [[ -d "$target" ]] || { echo "  - no .opencode/skills, skipped"; return 0; }
  local name src dest
  local -a pack_skills=(rapso-persona rapso-session ponytail-review ponytail-audit ponytail-debt ponytail-help)
  local -a installed=()
  for name in "${pack_skills[@]}"; do
    # The skills live in the CLI template, the one store the published package ships.
    src="$PACK_DIR/cli/src/template/.opencode/skills/$name"
    if [[ ! -f "$src/SKILL.md" ]]; then
      echo "    missing pack skill: $name"
      continue
    fi
    dest="$target/$name"
    if [[ -f "$dest/SKILL.md" && ! -L "$dest" ]] && cmp -s "$src/SKILL.md" "$dest/SKILL.md"; then
      installed+=("$name")
      continue
    fi
    [[ -L "$dest" ]] && run rm -f "$dest"
    run mkdir -p "$dest"
    run cp "$src/SKILL.md" "$dest/SKILL.md"
    echo "    skill: $name"
    installed+=("$name")
  done
  for name in "${installed[@]}"; do
    case "$name" in
      rapso-persona) dest="$target/cortex-persona" ;;
      rapso-session) dest="$target/cortex-session" ;;
      *) continue ;;
    esac
    if [[ -L "$dest" ]]; then
      run rm -f "$dest"
      echo "    stale skill removed: $(basename "$dest")"
    elif [[ -d "$dest" ]]; then
      run rm -rf "$dest"
      echo "    stale skill removed: $(basename "$dest")"
    fi
  done
}

repair_agents() {
  local file="$1/AGENTS.md"
  [[ -f "$file" ]] || { echo "  - no AGENTS.md, skipped"; return 0; }
  local legacy_token=0
  local token
  for token in cortex-persona cortex-session cortex-init cortex-sync 'cortex worktree' 'cortex close' \
    'cortex adopt' 'cortex init' 'cortex start' 'cortex status' 'cortex update' 'cortex install' \
    'cortex analyze' 'Cortex skill pack' '<!-- cortex:start -->' '<!-- cortex:end -->'; do
    if [[ "$(<"$file")" == *"$token"* ]]; then
      legacy_token=1
      break
    fi
  done
  if [[ $legacy_token -eq 0 ]]; then
    echo "  - AGENTS.md has no legacy token, skipped"
    return 0
  fi
  local tmp
  tmp="$(mktemp)"
  cp "$file" "$tmp"
  local -a rewrites=(
    's|cortex-persona|rapso-persona|g'
    's|cortex-session|rapso-session|g'
    # `cortex-init` is deliberately absent. Its rename target, `/rapso-init`, has been retired:
    # rewriting a legacy token onto a path that no longer exists moves a dead reference without
    # giving the reader a live one, so the retired spelling is left exactly as found.
    's|cortex-sync|rapso-sync|g'
    's|cortex worktree|rapso worktree|g'
    's|cortex close|rapso close|g'
    's|cortex adopt|rapso adopt|g'
    's|cortex init|rapso init|g'
    's|cortex start|rapso start|g'
    's|cortex status|rapso status|g'
    's|cortex update|rapso update|g'
    's|cortex install|rapso install|g'
    's|cortex analyze|rapso analyze|g'
    's|Cortex skill pack|Rapsodia skill pack|g'
    's|<!-- cortex:start -->|<!-- rapso:start -->|g'
    's|<!-- cortex:end -->|<!-- rapso:end -->|g'
  )
  local expression
  for expression in "${rewrites[@]}"; do
    run sed -i -e "$expression" "$file"
  done
  if [[ $DRY_RUN -eq 0 ]]; then
    echo "    AGENTS.md changed lines:"
    diff -u "$tmp" "$file" || true
  else
    echo "    AGENTS.md rewrite planned"
  fi
  rm -f "$tmp"
}

# Legacy flat sessions -> open|ready-for-odd|archived. Idempotent.
migrate_sessions() {
  local root="$1/.rapsodia-code/sessions"
  local legacy_store=0
  if [[ ! -d "$root" ]]; then
    root="$1/.cortex-sessions"
    legacy_store=1
  fi
  [[ -d "$root" ]] || { echo "  - no session store, skipped"; return 0; }
  if [[ $legacy_store -eq 1 ]]; then
    echo "    legacy session store detected; rapso adopt owns the store rename"
  fi
  local directory
  for directory in "$root/open" "$root/ready-for-odd" "$root/archived"; do
    [[ -d "$directory" ]] || run mkdir -p "$directory"
  done
  local d name dest moved=0
  local legacy="$root/ready-for-sdd" target="$root/ready-for-odd"
  if [[ -d "$legacy" ]]; then
    local legacy_entry
    for legacy_entry in "$legacy"/*; do
      [[ -e "$legacy_entry" || -L "$legacy_entry" ]] || continue
      name="$(basename "$legacy_entry")"
      if [[ -e "$target/$name" || -L "$target/$name" ]]; then
        echo "    legacy session collision: $name remains in ready-for-sdd/"
      else
        run mv "$legacy_entry" "$target/$name"
        echo "    legacy session: $name -> ready-for-odd/"
      fi
    done
    local remaining=("$legacy"/*)
    if [[ $DRY_RUN -eq 1 ]]; then
      local blocked=0
      for legacy_entry in "${remaining[@]}"; do
        [[ -e "$legacy_entry" || -L "$legacy_entry" ]] || continue
        name="$(basename "$legacy_entry")"
        if [[ -e "$target/$name" || -L "$target/$name" ]]; then
          blocked=1
          break
        fi
      done
      if [[ $blocked -eq 0 ]]; then
        run rmdir "$legacy"
      else
        echo "    legacy directory remains with: ${remaining[*]}"
      fi
    elif ((${#remaining[@]} == 0)); then
      run rmdir "$legacy"
    else
      echo "    legacy directory remains with: ${remaining[*]}"
    fi
  fi
  for d in "$root"/*/; do
    name="$(basename "$d")"
    # Legacy migration only: do not process the old state as a flat session.
    [[ "$name" == ready-for-sdd ]] && continue
    case "$name" in open|ready-for-odd|archived) continue ;; esac
    if [[ -f "$d/session.md" && ! -f "$d/report.md" ]]; then
      dest="$root/open/$name"
    else
      dest="$root/archived/$name"
    fi
    run mv "$d" "$dest"
    echo "    session: $name -> $(basename "$(dirname "$dest")")/"
    moved=$((moved + 1))
  done
  [[ $moved -eq 0 ]] && echo "    session: already migrated"
  return 0
}

echo "Rapsodia sync"
echo "  pack: $PACK_DIR"
echo "  list: $PROJECTS_FILE"
[[ $DRY_RUN -eq 1 ]] && echo "  mode: dry-run (nothing is written)"
echo

while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%%#*}"
  line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  project="${line/#\~/$HOME}"
  echo "▶ $project"
  if [[ ! -d "$project" ]]; then
    echo "  - not found, skipped"
    echo
    continue
  fi
  sync_skills "$project"
  repair_agents "$project"
  migrate_sessions "$project"
  echo
done < "$PROJECTS_FILE"

echo "Done."
