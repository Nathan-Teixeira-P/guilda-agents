---
title: Limite de missão pelo uso do plano (Claude Pro)
number: 018
priority: high
tags: [feature, core, server, cost]
dependencies: [003-core-disjuntor-e-classificador.spec.md, 009-servidor-runner-e-stream.spec.md, 017-emblema-ntp-e-medidor-de-uso.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-21
---

# 018 - Limite pelo uso do plano

## Overview
O laboratório usa a conta Claude Pro (assinatura), não API. O orçamento relevante é o uso das janelas de 5 horas e semanal, lido do `rate_limit_event`. Este spec troca o teto em dólar por teto em pontos percentuais do plano.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Orçamento é o uso do plano

## Prerequisites
- [ ] Spec 017 (fonte de uso) e 009 (runner) concluídos

## Implementation Tasks
- [ ] `packages/core/src/plan-budget.ts` (+ teste) — `podeIniciar(uso, limiar)`, `consumo(usoInicial, usoAtual)` em pontos percentuais, `deveParar(missao, uso, teto)`; sem dado de uso = pergunta ao usuário, nunca assume
- [ ] `packages/server/src/runner.ts` — antes da fase 1 e da fase 2 consulta o uso; pausa a missão (`parada`) ao atingir o teto da missão ou quando a janela passar de 90%
- [ ] `packages/core/src/budget.ts` — manter o dólar só como informativo e rede de segurança (`--max-budget-usd`)
- [ ] Nova missão na interface: campo "quanto do plano posso gastar" (padrão conservador) mostrando o uso atual
- [ ] `routing.md` — regras: opus só no planner/frontend-architect, no máximo 1 subagente em paralelo por padrão

## Acceptance Criteria
### Must Have
- [ ] Missão não inicia com janela de 5 horas acima do limiar sem confirmação do usuário
- [ ] Missão pausa ao consumir o teto de pontos percentuais definido
- [ ] Sem `rate_limit_event` disponível: pede confirmação (não segue às cegas)
### Should Have
- [ ] Estimativa de consumo por tipo de missão, aprendida das missões anteriores

## Verification
- `npx vitest run`; simular `rate_limit_event` com fixtures do spec 001

## Rollback Plan
Voltar ao teto em dólar do spec 003 e remover `plan-budget.ts`.
