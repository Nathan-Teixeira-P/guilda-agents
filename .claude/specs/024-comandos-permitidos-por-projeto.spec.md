---
title: Comandos permitidos por projeto na fase 2
number: 024
priority: high
tags: [feature, server, security]
dependencies: [016-registro-de-projetos-e-memoria.spec.md, 023-entrada-do-servidor-e-comando-unico.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: done
created: 2026-11-21
---

# 024 - Comandos permitidos por projeto

## Overview
Na fase 2 o Bash só roda comandos de uma lista permitida (`testCommands`). Hoje o servidor não passa nenhuma lista, então `coder` e `tester` não conseguem rodar testes. Cada projeto passa a ter a sua lista, com padrões seguros sugeridos a partir do `package.json`.

## Implementation Tasks
- [ ] `packages/core/src/projects.ts` (+ teste) — campo `comandos: string[]` no projeto; `validarComando(c)` com lista fechada de formato: prefixos `npm test`, `npm run <script>`, `npx vitest`, `npx tsc`, `node --test`, `pytest`, `go test`, `cargo test`, `make test`; recusa `;`, `&&`, `|`, `>`, `<`, `$(`, crases, quebra de linha, `sudo`, `rm`, `curl`, `wget`, `git push`, `git commit`
- [ ] `packages/server/src/projects-store.ts` + `http.ts` — `POST /projects` aceita `comandos`; `PATCH /projects/:id/comandos`; `GET /projects/:id/sugestoes` lê `package.json` do projeto (sem executar nada) e sugere `npm test`, `npx tsc --noEmit` e scripts `lint`/`build` se existirem
- [ ] `packages/server/src/http.ts` — a fase 2 passa os comandos do projeto ao runner; sem lista, a fase 2 roda sem Bash e a missão avisa no SSE ("sem comandos de teste configurados")
- [ ] Testes: validação (injeção, encadeamento), sugestões, passagem ao runner

## Acceptance Criteria
### Must Have
- [ ] Nenhum comando fora da lista fechada chega ao `--allowedTools`
- [ ] Sugestão nunca executa código do projeto
### Should Have
- [ ] Aviso claro quando não há comandos configurados

## Verification
- `npx vitest run`; `npx tsc --noEmit`

## Rollback Plan
Remover o campo `comandos` e as rotas.
