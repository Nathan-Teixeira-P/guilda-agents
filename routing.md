# Routing

Lab runs on a single Claude Pro account (no API). The real limit is plan usage (5-hour and weekly windows), so: prefer sonnet/haiku, opus rarely, and at most 1 subagent in parallel by default.

## Models

- opus: only `planner` and `frontend-architect`.
- sonnet: code, review, PRD, spec, research, writing, `frontend-builder`, `illustrator`.
- haiku: reading, checking, summarizing.

## Agent to model

| Agent | Model |
|---|---|
| `orchestrator` | sonnet |
| `intake` | haiku |
| `planner` | opus |
| `frontend-architect` | opus |
| `prd-writer` | sonnet |
| `spec-writer` | sonnet |
| `spec-checker` | haiku |
| `explorer` | haiku |
| `coder` | sonnet |
| `frontend-builder` | sonnet |
| `reviewer` | sonnet |
| `tester` | haiku |
| `debugger` | sonnet |
| `researcher` | sonnet |
| `fact-checker` | haiku |
| `writer` | sonnet |
| `editor` | haiku |
| `ops` | haiku |
| `deal-auditor` | haiku |
| `scribe` | haiku |
| `illustrator` | sonnet |
| `refactorer` | sonnet |
| `security-reviewer` | sonnet |

## Article flow

`researcher → writer → fact-checker → illustrator → editor`

## Escalation

No agent changes its own model. Only the orchestrator may escalate a model, and only after 2 failures of the same step.

## Code flow (phase 2)

`explorer → coder → tester → security-reviewer (only when the diff touches input, auth, secrets, shell, network or dependencies) → reviewer → refactorer + tester (only when a concrete finding justifies it)`
