---
title: Agente illustrator (imagem do artigo)
number: 015
priority: medium
tags: [feature, agents, content]
dependencies: [007-agentes-pesquisa-escrita-ops.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 015 - Agente illustrator

## Overview
Agente que cria a imagem de capa do artigo do LinkedIn, trabalhando junto com `researcher` e `writer`. A imagem deve ilustrar a ideia central do texto e ser limpa: poucos elementos, muito espaço livre, uma só ideia visual. Gera **SVG** (vetorial, barato em tokens) e renderiza em PNG 1200x627 com o Chrome headless já instalado, sem dependência nova nem API paga.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Pesquisa e escrita

## Prerequisites
- [ ] Spec 007 concluído (`researcher`, `writer`)
- [ ] `google-chrome` disponível (presente em `/usr/bin/google-chrome`)

## Dependencies
- `007-agentes-pesquisa-escrita-ops.spec.md` — o `illustrator` recebe o rascunho/tese do `writer` e as notas do `researcher`

## Implementation Tasks
### 1. Agente
- [ ] `agents/illustrator.md` (sonnet; Read, Write em `<projeto>/.claude/artigos/<slug>/`, Bash só para o render) — lê o rascunho e extrai UMA metáfora visual; escreve `capa.svg`; renderiza `capa.png`; devolve 2 variações curtas para o usuário escolher
- [ ] Regras de estilo no próprio agente: no máximo 3 elementos principais e 3 cores, paleta da marca se existir, texto na imagem no máximo 6 palavras (ou nenhum), contraste AA, margem segura para o recorte do LinkedIn, sem logos de terceiros, sem rostos de pessoas reais

### 2. Render
- [ ] `scripts/render-cover.sh` — `google-chrome --headless --screenshot=… --window-size=1200,627` sobre o SVG; falha com mensagem clara se o Chrome faltar
- [ ] `scripts/render-cover.test.ts` — SVG de exemplo gera PNG 1200x627 não vazio

### 3. Fluxo
- [ ] `routing.md` — linha `illustrator → sonnet`; orquestrador chama `researcher → writer → fact-checker → illustrator → editor`

## Acceptance Criteria
### Must Have
- [ ] PNG final com 1200x627, arquivo abaixo de 1 MB
- [ ] Ilustra o tema do artigo (a metáfora é explicada em uma linha no retorno)
- [ ] Nunca publica nem envia a imagem
### Should Have
- [ ] Duas variações para escolha; o usuário pode pedir ajuste de cor ou composição
- [ ] Passa no `validate-agents`

## Verification
- `npx vitest run scripts`; gerar a capa de um artigo de teste e abrir o PNG (screenshot) para conferir legibilidade e limpeza

## Rollback Plan
Apagar `agents/illustrator.md`, `scripts/render-cover.*`, a linha em `routing.md` e o symlink.
