---
title: Servidor - HTTP, SSE e portão
number: 010
priority: high
tags: [feature, server, api]
dependencies: [009-servidor-runner-e-stream.spec.md, 019-promocao-do-rascunho-da-fase-1.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: done
created: 2026-11-20
---

# 010 - HTTP, SSE e portão

## Overview
API local: criar missão, ler pacote, aprovar, pedir ajustes, parar, e SSE com o progresso.

## Related PRD
- [salao-da-guilda](../prd/salao-da-guilda.prd.md)

## Prerequisites
- [ ] Spec 009 concluído

## Implementation Tasks
- [ ] `packages/server/src/http.ts` — `node:http` em `127.0.0.1`; rejeita Host/Origin não locais; rotas `POST /missions`, `GET /missions`, `GET /missions/:id`, `POST /missions/:id/approve|adjust|stop`, `GET /events` (SSE)
- [ ] `packages/server/src/store.ts` — lê/escreve `missions/<id>/mission.json` (atômico), retoma missões ao subir
- [ ] `packages/server/src/watch.ts` — observa artefatos e handoffs do projeto e emite no SSE
- [ ] `packages/server/test/http.test.ts` — rejeição de Host/Origin, aprovar sem estágio correto falha, fluxo com agente falso

## Acceptance Criteria
### Must Have
- [ ] Servidor nunca escuta fora de loopback
- [ ] `approve` só funciona em `aguardando-aprovacao`
- [ ] Missões retomam após reinício
### Should Have
- [ ] Corpo das requisições limitado em tamanho

## Verification
- `npx vitest run packages/server`; subir o servidor e `curl 127.0.0.1:PORT/missions`

## Rollback Plan
Remover os arquivos do servidor e `missions/` do `.gitignore`.
