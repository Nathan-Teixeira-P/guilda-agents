---
title: Web - casca e telas funcionais
number: 011
priority: high
tags: [feature, frontend]
dependencies: [010-servidor-http-sse-e-portao.spec.md, 008-agentes-frontend-e-apoio.spec.md, 022-estagio-pausada-e-retomada.spec.md, 023-entrada-do-servidor-e-comando-unico.spec.md, 024-comandos-permitidos-por-projeto.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: done
created: 2026-11-20
---

# 011 - Web: casca e telas

## Overview
Interface funcional primeiro (sem a pele visual): criar missão, quadro, sala de guerra, missão ao vivo e arsenal. A lógica fica em módulos puros.

## Related PRD
- [salao-da-guilda](../prd/salao-da-guilda.prd.md)

## Prerequisites
- [x] Documento de design em `.claude/design/salao.md` (direção A "Duas Luzes"; decisões na §15; ordem de construção na §13)

## Implementation Tasks
- [ ] `packages/web/` — Vite + React + TS, versões exatas; cliente do SSE com reconexão
- [ ] `packages/web/src/logic/*.ts` (+ testes) — agrupamento por estágio, formatação de custo, estado do portão; `now` injetado
- [ ] Telas: Quadro, Nova missão (projeto, demanda, teto de gasto, permissão de commit), Sala de guerra (ler pacote, Aprovar/Pedir ajustes), Missão ao vivo, Arsenal

## Acceptance Criteria
### Must Have
- [ ] Fluxo criar → aprovar → concluir funciona com agente falso (E2E Playwright)
- [ ] Acessível por teclado; `prefers-reduced-motion` respeitado
### Should Have
- [ ] Layout responsivo (desktop e celular), checado com screenshots

## Verification
- `npx vitest run packages/web`; `npx playwright test`; screenshots em duas larguras

## Rollback Plan
Remover `packages/web`.

## Status notes (web polish pass)
- Alarm banners and the "Pausadas" strip were replaced by a bell with counter in the header (`ui/Alarmes.tsx`, `avisosDe` in `logic/alarmes.ts`).
- Salão on mobile keeps the district list (the map stays hidden below 640px).
- New read-only screen `#/afiliados` (`screens/Afiliados.tsx`): empty state only. **Server needs**: an endpoint such as `GET /projects/:id/ops-report` returning the latest `ops` report (text/markdown plus its date) for a registered project; `packages/server/src/http.ts` has no such route today (only `/missions`, `/projects`, `/usage`, `/events`). Then the screen replaces the empty state with the report, and `vite.config.ts` needs no change (`/projects` is already proxied).
