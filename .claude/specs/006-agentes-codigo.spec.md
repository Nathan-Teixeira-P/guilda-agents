---
title: Agentes de código
number: 006
priority: high
tags: [feature, agents]
dependencies: [004-hub-esqueleto-e-validador.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 006 - Agentes de código

## Overview
`explorer`, `coder`, `reviewer`, `tester`, `debugger`: o ciclo de implementação com contexto curto.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md)

## Prerequisites
- [ ] Spec 004 concluído

## Implementation Tasks
- [ ] `agents/explorer.md` (haiku, somente leitura) — devolve lista curta de caminhos e um resumo; nunca despeja arquivos
- [ ] `agents/coder.md` (sonnet) — um spec por vez, TDD, lê só o necessário; sem commit
- [ ] `agents/reviewer.md` (sonnet, somente leitura) — revisa o diff contra o spec
- [ ] `agents/tester.md` (haiku) — roda testes/typecheck e devolve só as falhas
- [ ] `agents/debugger.md` (sonnet) — causa raiz de uma falha, com evidência

## Acceptance Criteria
### Must Have
- [ ] `explorer` e `reviewer` sem Write/Edit/Bash de escrita
- [ ] `coder` nunca roda git commit/push
### Should Have
- [ ] Teste de fumaça: spec trivial implementado ponta a ponta num projeto de teste

## Verification
- `npx tsx scripts/validate-agents.ts`

## Rollback Plan
Apagar os 5 arquivos e symlinks.
