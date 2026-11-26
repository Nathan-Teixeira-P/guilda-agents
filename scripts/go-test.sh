#!/usr/bin/env bash
# Memory-contained `go test` for phase 2 agents: one run at a time, hard RAM cap, closed argument list
# (flags such as -exec or -toolexec would run arbitrary programs). Usage: go-test.sh ./pkg/x/ [-run Name] [-v]
set -euo pipefail
die() { echo "go-test: $*" >&2; exit 2; }
args=() pkgs=0
while (($#)); do
  case $1 in
    -v) args+=("$1") ;;
    -run) [[ ${2-} =~ ^[A-Za-z0-9_/|^$.]+$ ]] || die "invalid -run pattern"; args+=(-run "$2"); shift ;;
    *)
      [[ $1 =~ ^\./[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*(/\.\.\.)?/?$ ]] || die "name a package like ./pkg/services/ (got: $1)"
      [[ $1 =~ ^\./ent(/|$) ]] && die "./ent is too heavy to test here"
      args+=("$1"); pkgs=$((pkgs + 1)) ;;
  esac
  shift
done
((pkgs)) || die "name at least one package"
exec flock "${XDG_RUNTIME_DIR:-/tmp}/guilda-go-test.lock" \
  systemd-run --user --scope --quiet -p MemoryMax=6G -p MemorySwapMax=2G -- \
  env CGO_ENABLED=1 GOMAXPROCS=2 GOMEMLIMIT=4GiB go test -p 1 "${args[@]}"
