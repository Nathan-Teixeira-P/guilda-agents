---
title: Agentes de pesquisa, escrita e operação
number: 007
priority: medium
tags: [feature, agents]
dependencies: [004-hub-esqueleto-e-validador.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 007 - Pesquisa, escrita e operação

## Overview
`researcher`, `fact-checker`, `writer`, `editor`, `ops`: artigos de LinkedIn e operação do projeto afiliados.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md)

## Prerequisites
- [ ] Spec 004 concluído

## Implementation Tasks
- [ ] `agents/researcher.md` (sonnet) — notas com links e data; sem inventar fonte
- [ ] `agents/fact-checker.md` (haiku) — confere cada afirmação do rascunho contra as notas
- [ ] `agents/writer.md` (sonnet) — rascunho de artigo; nunca publica
- [ ] `agents/editor.md` (haiku) — revisão final de estilo, preservando fatos e a voz
- [ ] `agents/ops.md` (haiku, somente leitura) — lê logs e `RunLog` do projeto informado na tarefa (o afiliados, em `/home/nathan/Projetos/pessoal/afiliados`, é anexado pela interface; spec 016) e reporta falhas

## Acceptance Criteria
### Must Have
- [ ] `ops` não escreve no afiliados nem lê `.env`
- [ ] `writer` nunca publica nem envia
### Should Have
- [ ] Todos passam no validador

## Verification
- `npx tsx scripts/validate-agents.ts`

## Rollback Plan
Apagar os 5 arquivos e symlinks.
