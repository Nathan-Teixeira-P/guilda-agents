---
title: Redação - orquestrador e contrato dos agentes
number: 028
priority: medium
tags: [feature, agents, redacao]
dependencies: [026-redacao-nucleo.spec.md, 007-agentes-pesquisa-escrita-ops.spec.md, 015-agente-illustrator.spec.md]
related_prd: .claude/prd/redacao.prd.md
status: pending
created: 2026-11-21
---

# 028 - Redação: orquestrador e contrato dos agentes

## Overview
Ensinar o `orchestrator` o fluxo da Redação. Os agentes de conteúdo (`researcher`, `fact-checker`, `writer`, `editor`, `illustrator`) NÃO são editados: o contrato de saída da Redação (nomes de arquivo e campos) é passado no prompt de cada estágio (spec 029), o que preserva o comportamento e o roteamento de modelos (researcher/writer: sonnet; fact-checker/editor: haiku; illustrator: conforme `routing.md`) e não afeta as missões de código.

## Related PRD
- [redacao](../prd/redacao.prd.md) — histórias 3–8, 29, 40–41, 44

## Prerequisites
- [ ] Specs 007 e 015 concluídos; spec 026 define os nomes dos artefatos.

## Dependencies
- 026, 007, 015. Bloqueia 029.

## Implementation Tasks
- [ ] `agents/orchestrator.md` — nova seção "Redação" (curta): (1) modo sugerir temas = só `researcher` produz `sugestoes.json` ranqueada (`tema`, `motivo`, `fontes[{url, acessadoEm}]`, `rank`); (2) tema definido = `researcher` (`pesquisa.md`) → `fact-checker` (`checagem.md`) → `writer` (`rascunho.md`) → gate do usuário → `editor` (`final.md`) → `illustrator` (`capa.svg` + `capa.png` via `scripts/render-cover.sh`); (3) nunca publicar, agendar ou enviar; (4) sem fontes confiáveis, parar e avisar; (5) referências locais: somente leitura, só as pastas informadas; não reexplicar os agentes de código
- [ ] `scripts/validate-agents.test.ts` — asserção de que o `orchestrator` cita os 5 agentes da Redação e a regra de nunca publicar (ler o teste antes; não enfraquecer os existentes)

## Acceptance Criteria
### Must Have
- [ ] `npx tsx scripts/validate-agents.ts` passa; `tools` e `model` de todos os agentes inalterados
- [ ] Seção descreve o gate e a regra "nunca publicar"
- [ ] Nomes de arquivo idênticos aos de `ARTEFATOS` (spec 026)

## Verification
- `npx vitest run scripts`; `npx tsc --noEmit`; revisão do diff (apenas seção nova)

## Rollback Plan
Reverter `agents/orchestrator.md` e o teste (git). Reinstalar agentes com `scripts/install-agents.sh` se já instalados.
