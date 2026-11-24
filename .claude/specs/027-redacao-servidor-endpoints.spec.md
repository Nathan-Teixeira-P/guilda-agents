---
title: Redação - servidor (workspace, artigos e endpoints)
number: 027
priority: high
tags: [feature, server, api, redacao, security]
dependencies: [026-redacao-nucleo.spec.md, 010-servidor-http-sse-e-portao.spec.md, 025-ajustes-do-servidor-para-a-interface.spec.md]
related_prd: .claude/prd/redacao.prd.md
status: pending
created: 2026-11-21
---

# 027 - Redação: servidor, workspace e endpoints

## Overview
Armazenamento dos artigos no espaço do hub (`<hub>/redacao/<slug>/`) e endpoints HTTP para criar pedido, listar, ler artefatos, aprovar/pedir ajustes, cancelar, excluir e baixar capa. Não inicia agentes (spec 029 liga o runner).

## Related PRD
- [redacao](../prd/redacao.prd.md) — histórias 2, 16–22, 26–29, 33–38, 42–43

## Prerequisites
- [ ] Spec 026 (tipos, `caminhoDentro`, `podarVersoes`) disponível.

## Dependencies
- 026, 010, 025. Bloqueia 029 e 030.

## Implementation Tasks
- [ ] `packages/server/src/redacao-store.ts` — `createRedacaoStore(dir)`: `criar(pedido)` (slug via 026, cria `redacao/<slug>/` com `artigo.json` gravado de forma atômica: temp + rename, como `writeMission`), `listar(filtroEstado?)`, `ler(slug)`, `lerArtefato(slug, nome)` (nome da lista `ARTEFATOS` + `caminhoDentro`), `registrarVersao`, `excluir(slug)` (só dentro de `redacao/`), `salvarSugestoes/lerSugestoes` em `redacao/_sugestoes/<id>.json`
- [ ] `packages/server/src/http.ts` — rotas (regex de `api` inclui `redacao`): `POST /redacao` (valida `PedidoRedacao`; refere caminhos locais inexistentes ou ilegíveis antes de iniciar, resposta 400 com a lista), `GET /redacao?estado=`, `GET /redacao/:slug`, `GET /redacao/:slug/artefatos/:nome`, `GET /redacao/:slug/capa.png|capa.svg` (cabeçalho `content-type` correto e `content-disposition: attachment`), `POST /redacao/:slug/aprovar`, `POST /redacao/:slug/ajustes` (body `{comentario}` obrigatório), `POST /redacao/:slug/cancelar`, `POST /redacao/:slug/reabrir`, `DELETE /redacao/:slug`, `POST /redacao/sugestoes/:id/escolher` (cria o artigo a partir de um tema sugerido)
- [ ] `packages/server/src/http.ts` — eventos SSE de artigo (`artigo`: slug, estado) pelo canal existente; `id` do slug validado com regex `[a-z0-9-]{1,64}` (400 caso contrário)
- [ ] `packages/server/src/main.ts` — instanciar o store com `join(hub, "redacao")` (`mkdirSync` recursivo)
- [ ] `packages/server/test/redacao-http.test.ts` — diretório temporário, sem rede nem modelo

## Acceptance Criteria
### Must Have
- [ ] Nenhuma rota lê fora de `redacao/<slug>/`; `..` e nome de artefato fora da lista retornam 400/404
- [ ] Aprovar só funciona em "em revisão do usuário" (409 nos demais estados)
- [ ] Referência local fora do que o usuário informou, ou inexistente, é recusada; nada é escrito fora da pasta do artigo
- [ ] Capa baixada tem `image/png` ou `image/svg+xml`; PNG com 1200x627 (cabeçalho IHDR lido no teste)
- [ ] Excluir remove a pasta inteira e só ela
- [ ] Sem rota de publicação ou envio
### Should Have
- [ ] Listagem filtrável por estado

## Verification
- `npx vitest run`; `npx tsc --noEmit`; subida real curta do servidor e `curl` em `/redacao`

## Rollback Plan
Reverter `http.ts` e `main.ts`; apagar `redacao-store.ts`, o teste e a pasta `redacao/` do hub (dados de teste).
