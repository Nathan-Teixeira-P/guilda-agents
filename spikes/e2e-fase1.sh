#!/usr/bin/env bash
# One real phase-1 run (uses Claude Pro plan usage). See spikes/e2e-fase1.ts.
exec node "$(dirname "$0")/e2e-fase1.ts"
