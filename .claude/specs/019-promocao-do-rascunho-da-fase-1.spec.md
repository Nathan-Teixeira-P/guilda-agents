---
title: Promoção do rascunho da fase 1 para o projeto
number: 019
priority: high
tags: [feature, server, security]
dependencies: [009-servidor-runner-e-stream.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-21
---

# 019 - Promoção do rascunho

## Overview
Ao fim da fase 1 o servidor move os artefatos de `missions/<id>/out/` para `<projeto>/.claude/` (prd, specs, design, handoff, agent-notes). É a única escrita no projeto antes do selo do usuário e é feita pelo servidor, não por agente.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Fase 1

## Prerequisites
- [ ] Spec 009 concluído

## Implementation Tasks
- [ ] `packages/core/src/promote.ts` (+ teste) — lista fechada de subpastas de destino (`prd`, `specs`, `design`, `handoff`, `agent-notes`, `learnings`); recusa caminho com `..`, absoluto, symlink, extensão fora de `.md/.json/.svg/.png`, arquivo acima de um limite; nunca sobrescreve arquivo existente sem registrar (guarda `.bak`)
- [ ] `packages/server/src/promote.ts` — executa a promoção atômica (tudo ou nada) e devolve a lista de arquivos movidos
- [ ] `packages/core/test/promote.test.ts` — traversal, symlink, extensão inválida, arquivo grande, destino existente, falha no meio (não deixa promoção parcial)

## Acceptance Criteria
### Must Have
- [ ] Nenhum arquivo fora da lista fechada chega ao projeto
- [ ] Falha em qualquer arquivo cancela a promoção inteira
### Should Have
- [ ] A lista de arquivos promovidos aparece no pacote da sala de guerra

## Verification
- `npx vitest run`

## Rollback Plan
Remover os dois `promote.ts`; os artefatos continuam em `missions/<id>/out/`.
