---
title: Agentes de direção e documentos
number: 005
priority: high
tags: [feature, agents]
dependencies: [004-hub-esqueleto-e-validador.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 005 - Direção e documentos

## Overview
`orchestrator`, `planner`, `prd-writer`, `spec-writer`, `spec-checker`. Cada um com no máximo ~30 linhas: função, entrada, saída, limites.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Fluxo de duas fases

## Prerequisites
- [ ] Spec 004 concluído

## Implementation Tasks
- [ ] `agents/orchestrator.md` — sessão principal; classifica (caminho curto), consulta `routing.md`, aplica disjuntor, media handoffs, pergunta ao usuário em decisão de produto; nunca implementa
- [ ] `agents/planner.md` (opus) — pedido/briefing → plano; usa o mapa do `explorer` fornecido pelo orquestrador (subagente não cria subagente)
- [ ] `agents/prd-writer.md` (sonnet) — plano → PRD em `<projeto>/.claude/prd/`
- [ ] `agents/spec-writer.md` (sonnet) — PRD → specs numerados em `<projeto>/.claude/specs/` + `INDEX.md`
- [ ] `agents/spec-checker.md` (haiku, somente leitura) — confere seções, dependências e tamanho; devolve `ok|falhou`

## Acceptance Criteria
### Must Have
- [ ] Todos passam no `validate-agents`
- [ ] Orchestrator usa só Agent, Read, Grep, Glob e Write em `.claude/` na fase 1
### Should Have
- [ ] Teste de fumaça: pedido pequeno gera PRD e specs coerentes em um projeto de teste

## Verification
- `npx tsx scripts/validate-agents.ts`; rodar um pedido de exemplo e conferir os arquivos

## Rollback Plan
Apagar os 5 arquivos e os symlinks.
