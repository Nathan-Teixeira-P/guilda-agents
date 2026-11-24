---
title: Ponte para modelo local (Ollama)
number: 014
priority: low
tags: [feature, integration, cost]
dependencies: [003-core-disjuntor-e-classificador.spec.md, 009-servidor-runner-e-stream.spec.md]
related_prd: .claude/prd/integracoes.prd.md
status: done (library only; NOT wired into runner/orchestration - follow-up: call runLocal from runner, read local.enabled from config, persist recordLocal to mission.json)
created: 2026-11-20
---

# 014 - Modelo local

## Overview
Helper opcional que executa só tarefas mecânicas e verificáveis em modelo local, com validação e fallback para o Claude. Desligado por padrão.

## Related PRD
- [integracoes](../prd/integracoes.prd.md)

## Prerequisites
- [ ] Ciclo completo funcionando e custos medidos (specs 001–011); Ollama ativo com os modelos já instalados

## Implementation Tasks
- [ ] `packages/core/src/local-tasks.ts` — lista fechada de tarefas permitidas; fora da lista é recusada
- [ ] `packages/server/src/ollama.ts` — HTTP `127.0.0.1:11434`, timeout, um modelo por vez; fora do ar → fallback
- [ ] `packages/core/src/verify.ts` — verificadores baratos (formato, caminhos existem, tamanho)
- [ ] `packages/core/test/local-tasks.test.ts`, `packages/server/test/ollama.test.ts` — Ollama falso; recusa, verificação, fallback
- [ ] Config `local.enabled: false` e contadores de uso/fallback na `mission.json`

## Acceptance Criteria
### Must Have
- [ ] Nunca roteia código, spec, review, texto final ou decisão para o local
- [ ] Saída inválida ou Ollama fora do ar refaz no Claude (haiku)
### Should Have
- [ ] Economia estimada visível por missão

## Verification
- `npx vitest run`; medir antes/depois em 5 missões reais antes de manter ligado

## Rollback Plan
`local.enabled: false`; remover os arquivos se a economia não compensar.
