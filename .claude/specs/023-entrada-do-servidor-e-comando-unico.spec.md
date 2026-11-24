---
title: Entrada do servidor e comando único
number: 023
priority: high
tags: [feature, server, infra]
dependencies: [016-registro-de-projetos-e-memoria.spec.md, 022-estagio-pausada-e-retomada.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: done
created: 2026-11-21
---

# 023 - Entrada do servidor e comando único

## Overview
Até aqui o servidor é uma fábrica testada, sem ponto de entrada. Este spec cria o `main` com as dependências reais (runner com `claude` real, store, registro, clone), serve o front-end compilado e entrega `npm start` como comando único.

## Implementation Tasks
- [ ] `packages/server/src/main.ts` — monta `createServer` com os componentes reais; host `127.0.0.1`, porta por `PORT` (padrão 4317); `missions/`, `projects.json` e `workspaces/` na raiz do hub; encerra os processos filhos em SIGINT/SIGTERM
- [ ] `packages/server/src/static.ts` (+ teste) — serve `packages/web/dist` com proteção contra `..`/symlink, tipos MIME, fallback SPA, cabeçalhos de segurança (CSP restritiva, `X-Content-Type-Options`, `Referrer-Policy`); sem a pasta `dist`, mostra uma página simples explicando como compilar
- [ ] `package.json` (raiz) — scripts `start`, `dev:server`, `build:web` (o `web` ainda não existe: o script falha com mensagem clara se faltar); `README.md` — como iniciar, como instalar os agentes, `claude setup-token` para uso sem supervisão, aviso do uso do plano
- [ ] Teste de fumaça (script ou vitest) que sobe o servidor em porta efêmera e confere `GET /missions` e `GET /projects` (listas vazias), Host inválido (403) e bind só em loopback

## Acceptance Criteria
### Must Have
- [ ] `npm start` sobe em `127.0.0.1` e responde; nunca escuta em `0.0.0.0`
- [ ] Servir estáticos não permite sair de `packages/web/dist`
### Should Have
- [ ] README curto e correto

## Verification
- `npx vitest run`; `npx tsc --noEmit`; subir `npm start` e `curl 127.0.0.1:4317/missions`, depois encerrar

## Rollback Plan
Remover `main.ts`, `static.ts`, scripts e README.
