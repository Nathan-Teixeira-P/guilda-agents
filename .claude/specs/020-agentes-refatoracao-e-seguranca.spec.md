---
title: Agentes de refatoração e de segurança
number: 020
priority: medium
tags: [feature, agents, security]
dependencies: [006-agentes-codigo.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-21
---

# 020 - Refatoração e segurança

## Overview
`refactorer` (refatoração só quando necessária, sem mudar comportamento, testes verdes antes e depois) e `security-reviewer` (revisão de segurança somente leitura). Entram na fase 2 como etapas condicionais.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md)

## Implementation Tasks
- [x] `agents/refactorer.md` (sonnet) — só com motivo concreto, máximo 5 arquivos, sem funcionalidade nova, sem commit
- [x] `agents/security-reviewer.md` (sonnet, somente leitura) — segredos, injeção, shell, autenticação/Origin, aprovações, dependências; achados com arquivo:linha, severidade e evidência
- [x] `packages/core/src/models.ts` e `routing.md` — modelos, `READ_ONLY_AGENTS` e fluxo da fase 2
- [x] `agents/orchestrator.md` — security-reviewer só quando o diff toca entrada, autenticação, segredos, shell, rede ou dependências; refactorer só com achado concreto

## Acceptance Criteria
### Must Have
- [x] Validador, testes e typecheck passam; 22 agentes instalados em `~/.claude/agents`
- [x] `security-reviewer` sem Write/Edit/Bash

## Verification
- `node scripts/validate-agents.ts agents`; `npx vitest run`

## Rollback Plan
Apagar os dois agentes, as linhas em `models.ts`/`routing.md` e os symlinks.
