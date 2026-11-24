#!/usr/bin/env bash
# Symlink agents/*.md into ~/.claude/agents. Never overwrites a non-symlink. --dry-run to preview.
set -euo pipefail
src="${LAB_AGENTS_SRC:-$(cd "$(dirname "$0")/.." && pwd)/agents}"
dest="${LAB_AGENTS_DEST:-$HOME/.claude/agents}"
dry=0; [[ "${1:-}" == "--dry-run" ]] && dry=1

shopt -s nullglob
files=("$src"/*.md)
for f in "${files[@]}"; do
  t="$dest/$(basename "$f")"
  if [[ -e "$t" && ! -L "$t" ]]; then
    echo "refusing to overwrite non-symlink: $t" >&2; bad=1
  fi
done
[[ -z "${bad:-}" ]] || exit 1

(( dry )) || mkdir -p "$dest"
for f in "${files[@]}"; do
  t="$dest/$(basename "$f")"
  if (( dry )); then echo "would link $t -> $f"; else ln -sfn "$f" "$t"; echo "linked $t"; fi
done
