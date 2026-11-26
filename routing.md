# Routing

Lab runs on a single Claude Pro account (no API). The real limit is plan usage (5-hour and weekly windows), so: prefer sonnet/haiku, no opus for now, and at most 1 subagent in parallel by default.

## Models

- opus: disabled for now; no agent uses it, not even on escalation.
- sonnet: code, review, PRD, spec, research, writing, `frontend-builder`, `illustrator`.
- haiku: reading, checking, summarizing.

## Agent to model

| Agent | Model |
|---|---|
| `orchestrator` | sonnet |
| `intake` | haiku |
| `planner` | sonnet |
| `frontend-architect` | sonnet |
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

## Classification

The hub checks drafted specs mechanically; `spec-checker` is not part of the mission chain. LEAN demands (docs, config, one-file or small change) run `explorer` + a short plan only: no planner, PRD or specs. FULL demands run the whole chain.

## Escalation

No agent changes its own model. Only the orchestrator may escalate a model, and only after 2 failures of the same step.

## Code flow (phase 2)

`explorer → coder → tester → security-reviewer (only when the diff touches input, auth, secrets, shell, network or dependencies) → reviewer → refactorer + tester (only when a concrete finding justifies it)`
