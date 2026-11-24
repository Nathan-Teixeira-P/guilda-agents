#!/usr/bin/env bash
# Uso: render-cover.sh <entrada.svg> <saida.png>  (renderiza 1200x627 via Chrome headless)
set -euo pipefail
[ $# -eq 2 ] || { echo "uso: render-cover.sh <entrada.svg> <saida.png>" >&2; exit 2; }
[ -f "$1" ] || { echo "erro: SVG não encontrado: $1" >&2; exit 1; }
command -v google-chrome >/dev/null || { echo "erro: google-chrome não encontrado no PATH" >&2; exit 1; }

svg=$(realpath "$1")
mkdir -p "$(dirname "$2")"
out="$(realpath "$(dirname "$2")")/$(basename "$2")"
rm -f "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Página mínima garante 1200x627 exatos, sem margens.
printf '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}img{display:block;width:1200px;height:627px}</style><img src="file://%s">' "$svg" > "$tmp/p.html"

google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --screenshot="$out" --window-size=1200,627 "file://$tmp/p.html" >/dev/null 2>&1 || true
[ -s "$out" ] || { echo "erro: Chrome não gerou $out" >&2; exit 1; }
