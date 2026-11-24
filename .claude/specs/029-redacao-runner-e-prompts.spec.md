---
title: Redação - runner, prompts e orçamento
number: 029
priority: high
tags: [feature, server, redacao, cost]
dependencies: [027-redacao-servidor-endpoints.spec.md, 028-redacao-agentes-e-orquestrador.spec.md, 022-estagio-pausada-e-retomada.spec.md, 018-limite-por-uso-do-plano.spec.md]
related_prd: .claude/prd/redacao.prd.md
status: pending
created: 2026-11-21
---

# 029 - Redação: runner, prompts e orçamento

## Overview
Liga o tipo de missão `redacao` ao runner existente: prompts por fase, cwd na pasta do artigo, gate entre rascunho e edição final, PNG a partir do SVG via `scripts/render-cover.sh`, estimativa e teto de uso iguais ao das missões.

## Related PRD
- [redacao](../prd/redacao.prd.md) — histórias 17, 25, 30–35, 39–41

## Prerequisites
- [ ] Specs 027 e 028 concluídos; `google-chrome` no PATH (exigido por `render-cover.sh`).

## Dependencies
- 027, 028, 022, 018. Bloqueia 030 e 031.

## Implementation Tasks
- [ ] `packages/server/src/prompt-redacao.ts` — `promptSugestoes(pedido)`, `promptPesquisa(...)`, `promptFase1Redacao(...)` (researcher → fact-checker → writer; reescrita com `comentario` do usuário) e `promptFase2Redacao(...)` (editor → illustrator; a última etapa roda `scripts/render-cover.sh capa.svg capa.png`); referências locais passadas como "somente leitura"; texto do prompt termina com a regra de nunca publicar
- [ ] `packages/server/src/runner.ts` — escolher o prompt por `mission.kind === "redacao"`; `cwd` = `redacao/<slug>/`; reaproveitar `pausada`/retomada; após fase 1 entrar em `aguardando-aprovacao`, após fase 2 em `concluida`; registrar versão de texto (`registrarVersao` + `podarVersoes` = 3); sem Bash fora de `render-cover.sh` no escopo da redação
- [ ] `packages/server/src/http.ts` — `POST /redacao` cria a missão `kind: "redacao"` e inicia a fase 1; devolve a estimativa de uso (mesma função do spec 018) antes de iniciar quando o cliente envia `?estimar=1`; `aprovar` dispara a fase 2; `ajustes` volta a `planejando` com o comentário; `cancelar` aborta o filho
- [ ] `packages/server/test/redacao-runner.test.ts` — agentes por fixture (`SpawnFn` falso, saídas fixas), sem rede nem modelo; uso simulado para o teto

## Acceptance Criteria
### Must Have
- [ ] Edição final (fase 2) nunca roda sem aprovação; o teste tenta e falha
- [ ] Teto de uso estourado: a missão não inicia ou entra em `pausada` com motivo em português
- [ ] Cancelamento e retomada de artigo em revisão funcionam; reabrir cria nova versão e a 4ª poda a mais antiga
- [ ] Sem fontes confiáveis na pesquisa, o artigo não avança e o estado informa o motivo
- [ ] Nenhum teste de missão de código enfraquecido
### Should Have
- [ ] Falha do `render-cover.sh` não perde o SVG; estado de erro claro

## Verification
- `npx vitest run`; `npx tsc --noEmit`; (manual, opcional) um pedido real curto com `researcher` apenas

## Rollback Plan
Reverter `runner.ts` e `http.ts`; apagar `prompt-redacao.ts` e o teste. Missões de código não dependem deles.
