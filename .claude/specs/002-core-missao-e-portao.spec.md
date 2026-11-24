---
title: Máquina de estados da missão e portão de aprovação
number: 002
priority: high
tags: [feature, core, logic]
dependencies: [001-spike-claude-headless.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 002 - Missão e portão de aprovação

## Overview
Módulo puro (sem I/O de rede) com o ciclo de vida da missão e o portão que falha fechado. Base para servidor e agentes.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Missão, Portão de aprovação

## Prerequisites
- [ ] Spec 001 concluído (formato real do stream conhecido)

## Dependencies
- `001-spike-claude-headless.spec.md` — define o que a missão precisa guardar (sessão, custo)

## Implementation Tasks
### 1. Projeto
- [ ] `package.json`, `tsconfig.json`, `vitest.config.ts` na raiz (npm workspaces, Node 24, TS estrito, versões exatas)
### 2. Código (TDD: teste primeiro)
- [ ] `packages/core/src/mission.ts` — schema zod da missão e transições `intake→planejando→aguardando-aprovacao→executando→concluida|parada`; transição inválida lança erro
- [ ] `packages/core/src/gate.ts` — `isApproved(dir)`: só `true` se `approved` existe e é válido; ausente/vazio/malformado/ilegível → `false`
- [ ] `packages/core/test/mission.test.ts`, `gate.test.ts` — uma transição por teste; casos fail-closed do portão; relógio injetado

## Acceptance Criteria
### Must Have
- [ ] Fase 2 inalcançável sem portão válido
- [ ] Campos extras no JSON não quebram o parse (`looseObject`); entrada inválida não lança
### Should Have
- [ ] Escrita de `mission.json` atômica (temp + rename)

## Verification
- `npx vitest run packages/core` e `npx tsc --noEmit`

## Rollback Plan
Apagar `packages/core` e os arquivos de projeto da raiz.
