---
title: Ajustes do servidor pedidos pela interface
number: 025
priority: medium
tags: [feature, server]
dependencies: [011-web-casca-e-telas.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: pending
created: 2026-11-21
---

# 025 - Ajustes do servidor para a interface

## Overview
Pedidos que surgiram ao construir a interface (spec 011).

## Implementation Tasks
- [ ] `runner.ts`/`stream.ts` — gravar `subagentType` junto de cada id em `tokensByAgent` (o Arsenal mostra codinome em vez de id opaco)
- [ ] `runner.ts`/`http.ts` — motivos de pausa em português (disjuntor: voltas/trocas; teto de uso)
- [ ] `http.ts` — expor o estado do disjuntor (voltas por passo, trocas encadeadas) em `GET /missions/:id`
- [ ] `http.ts` — comentário `: ping` periódico no SSE (heartbeat) e `id:` nos eventos
- [ ] Testes de cada item

## Acceptance Criteria
### Must Have
- [ ] Nenhum teste existente é enfraquecido; `tokensByAgent` continua compatível com missões antigas
## Verification
- `npx vitest run`; `npx tsc --noEmit`; subida real curta do servidor
## Rollback Plan
Reverter os itens.
