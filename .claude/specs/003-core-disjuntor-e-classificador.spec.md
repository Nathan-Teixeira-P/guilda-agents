---
title: Disjuntor de voltas e classificador de tamanho
number: 003
priority: high
tags: [feature, core, logic, cost]
dependencies: [002-core-missao-e-portao.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 003 - Disjuntor e classificador

## Overview
Dois módulos puros que controlam o custo: o disjuntor que para loops e o classificador que decide o caminho curto.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Disjuntor, Caminho curto, Teto de gasto

## Prerequisites
- [ ] Spec 002 concluído

## Implementation Tasks
### 1. Código (TDD)
- [ ] `packages/core/src/breaker.ts` — `voltas por spec ≤ 2`, `trocas encadeadas ≤ 8`, reset quando o usuário intervém; devolve `{ok}` ou `{parar, motivo}`; relógio injetado
- [ ] `packages/core/src/classify.ts` — `trivial | media | grande` por critérios fixos (arquivos estimados, UI, ambiguidade); constantes nomeadas
- [ ] `packages/core/src/budget.ts` — acumula custo por agente/missão a partir de eventos de uso; `excedeu(teto)`
- [ ] `packages/core/test/{breaker,classify,budget}.test.ts` — limites exatos (2 ok, 3 para; 8 ok, 9 para), reset, classificação de exemplos

## Acceptance Criteria
### Must Have
- [ ] Estouro de limite sempre devolve `parar` com motivo legível
- [ ] Classificador determinístico (mesma entrada, mesma saída)
### Should Have
- [ ] Limites configuráveis por missão, com padrão do PRD

## Verification
- `npx vitest run packages/core`

## Rollback Plan
Remover os três módulos e testes.
