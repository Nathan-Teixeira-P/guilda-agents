---
title: Estágio pausada e retomada após disjuntor
number: 022
priority: high
tags: [feature, core, server]
dependencies: [021-prompt-da-missao-e-teste-real.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-21
---

# 022 - Estágio pausada e retomada

## Overview
O disjuntor e o teto de uso do plano devem "parar e perguntar". `parada` é terminal hoje. Cria `pausada` (retomável com comentário do usuário), mantendo `parada` como encerramento definitivo (botão Parar).

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Disjuntor; [design do Salão](../design/salao.md) §14.1 e §15

## Implementation Tasks
- [ ] `packages/core/src/mission.ts` (+ teste) — estágio `pausada` com motivo; transições `planejando|executando → pausada`, `pausada → planejando|executando` (executando só com portão `approved` válido), `pausada → parada`; `parada` continua terminal
- [ ] `packages/server/src/runner.ts` — disjuntor e orçamento passam a pausar (não encerrar); Parar do usuário vai a `parada`
- [ ] `packages/server/src/http.ts` — `POST /missions/:id/resume` (comentário opcional, só em `pausada`; retoma a fase em que parou com o comentário no prompt); recuperação ao reiniciar: missões em andamento viram `pausada` ("servidor reiniciado") e não mais `parada`
- [ ] Testes: transições válidas e inválidas, retomada fail-closed (sem `approved` não retoma a fase 2), motivo preservado

## Acceptance Criteria
### Must Have
- [ ] `parada` nunca volta a executar; `pausada` só retoma com o usuário
- [ ] Fase 2 não retoma sem o portão válido
### Should Have
- [ ] Motivo da pausa (disjuntor, teto do plano, reinício) exposto no JSON e no SSE

## Verification
- `npx vitest run`; `npx tsc --noEmit`

## Rollback Plan
Reverter `pausada` em `mission.ts`, `runner.ts` e `http.ts`.
