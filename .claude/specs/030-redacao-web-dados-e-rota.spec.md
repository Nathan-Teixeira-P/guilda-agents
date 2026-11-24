---
title: Redação - web, dados e rota
number: 030
priority: medium
tags: [feature, frontend, redacao]
dependencies: [027-redacao-servidor-endpoints.spec.md, 011-web-casca-e-telas.spec.md]
related_prd: .claude/prd/redacao.prd.md
status: pending
created: 2026-11-21
---

# 030 - Redação: web, dados e rota

## Overview
Camada de dados e navegação da tela `#/redacao`: item fixo no menu, cliente da API, lógica pura (filtro por estado, cópia, atualização via SSE). A tela em si é o spec 031.

## Related PRD
- [redacao](../prd/redacao.prd.md) — histórias 1, 16–17, 42

## Prerequisites
- [ ] Spec 027 (endpoints) e shell do spec 011.

## Dependencies
- 027, 011. Bloqueia 031.

## Implementation Tasks
- [ ] `packages/web/src/api.ts` — funções tipadas para os endpoints `/redacao*` (listar, ler, criar, aprovar, ajustes, cancelar, reabrir, excluir, escolher sugestão, URLs de capa)
- [ ] `packages/web/src/logic/redacao.ts` — `filtrarPorEstado`, `rotuloEstado` (pesquisando, rascunho, em revisão do usuário, aprovado, cancelado), `contarPorEstado`, `aplicarEventoArtigo(lista, evento)` para o SSE, `textoParaCopiar(artigo)`
- [ ] `packages/web/src/App.tsx` e `packages/web/src/Shell.tsx` — rota `#/redacao` (e `#/redacao/<slug>`) e item "Redação" fixo no menu, sem exigir projeto
- [ ] `packages/web/test/redacao-logic.test.ts` — filtro, rótulos, evento SSE aplicado, texto a copiar

## Acceptance Criteria
### Must Have
- [ ] Menu mostra "Redação" sem projeto registrado
- [ ] Lógica pura testada sem DOM
- [ ] Rotas existentes continuam funcionando (teste de roteamento atual intacto)

## Verification
- `npx vitest run packages/web`; `npx tsc --noEmit`

## Rollback Plan
Reverter `App.tsx` e `Shell.tsx`; apagar `logic/redacao.ts`, o teste e remover as funções novas de `api.ts`.
