---
title: Agentes de frontend, escriba e auditor
number: 008
priority: high
tags: [feature, agents, frontend]
dependencies: [004-hub-esqueleto-e-validador.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 008 - Frontend e apoio

## Overview
`frontend-architect` (plano) e `frontend-builder` (execução), que fogem do padrão de brevidade, mais `scribe` e `deal-auditor`.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Agentes de frontend

## Prerequisites
- [ ] Spec 004 concluído

## Implementation Tasks
- [ ] `agents/frontend-architect.md` (opus) — lê o projeto; 2–3 direções com uma ideia ousada cada e recomendação; cobre fluxos, componentes, estados, responsividade, acessibilidade, desempenho; saída em `<projeto>/.claude/design/`
- [ ] `agents/frontend-builder.md` (sonnet) — segue design e spec; reaproveita componentes; valida no navegador (screenshots desktop/mobile, console); propõe melhorias no handoff sem mudar o escopo
- [ ] `agents/scribe.md` (haiku) — escreve learnings em `<projeto>/.claude/learnings/` e atualiza `agent-notes/`
- [ ] `agents/deal-auditor.md` (haiku, somente leitura) — confere se as ofertas enviadas tinham desconto real

## Acceptance Criteria
### Must Have
- [ ] Frontend declara a exceção ao padrão (resposta longa permitida; design em arquivo)
- [ ] `frontend-architect` não edita código
### Should Have
- [ ] Todos passam no validador

## Verification
- `npx tsx scripts/validate-agents.ts`

## Rollback Plan
Apagar os 4 arquivos e symlinks.
