---
title: Redação - núcleo (tipos, estados, gate, versões)
number: 026
priority: high
tags: [feature, core, redacao]
dependencies: [002-core-missao-e-portao.spec.md, 018-limite-por-uso-do-plano.spec.md]
related_prd: .claude/prd/redacao.prd.md
status: pending
created: 2026-11-21
---

# 026 - Redação: núcleo

## Overview
Lógica pura (sem I/O) da Redação em `packages/core`: pedido, slug, estados do artigo, gate de aprovação, lista de artefatos, política de 3 versões e validação de sugestões. Sem servidor nem interface (specs 027+).

## Related PRD
- [redacao](../prd/redacao.prd.md) — histórias 9–16, 21–24, 33–38, 43–44

## Prerequisites
- [ ] Specs 002 e 018 concluídos (estágios da missão e teto de uso).

## Dependencies
- 002, 018. Bloqueia 027, 028, 029.

## Decisões fixadas
- Tipo de missão `redacao`: campo opcional `kind: "redacao"` em `Mission` (já é `looseObject`; ausente = missão de código). `project` recebe o valor fixo `"redacao"` (sem projeto de código).
- Mapa estágio da missão → estado do artigo: `planejando` = pesquisando/rascunho; `aguardando-aprovacao` = em revisão do usuário (o gate); `executando` = edição final e capa; `concluida` = aprovado; `parada` = cancelado.
- Tamanho padrão ~1200 palavras, configurável por pedido; idioma padrão `pt-BR`; 1 capa por artigo; 3 versões de texto mantidas.
- Referências locais: só pastas que o usuário informar explicitamente, leitura apenas.

## Implementation Tasks
- [ ] `packages/core/src/redacao.ts` — `PedidoRedacao` (zod): `modo: "sugerir"|"definido"`, `tema?` (obrigatório em `definido`), `publico?`, `tom?`, `palavras` (padrão 1200, inteiro 200–5000), `referencias[]` (`{tipo:"caminho"|"texto"|"url", valor}`), `idioma` (padrão `pt-BR`)
- [ ] mesmo arquivo — `slugDoTema(tema, existentes)`: minúsculas sem acento, `[a-z0-9-]{1,64}` (compatível com `PROJECT_ID`/`MISSION_ID`), sufixo `-2`, `-3` se colidir
- [ ] mesmo arquivo — `EstadoArtigo` e `estadoDoArtigo(stage, pausada?)`; `podeAvancar(estado, acao)` com ações `aprovar | pedir-ajustes(comentario) | cancelar | reabrir`; a edição final (`executando`) só abre com `aprovar` explícito (reaproveita `transition(..., {approved})` de `mission.ts`); `reabrir` só de aprovado/cancelado e gera nova versão
- [ ] mesmo arquivo — `ARTEFATOS` (nomes fixos: `pesquisa.md`, `checagem.md`, `rascunho.md`, `final.md`, `capa.svg`, `capa.png`, `artigo.json`) e `caminhoDentro(dirArtigo, rel)` que recusa `..`, absolutos e symlink de saída (usa `path.relative`)
- [ ] mesmo arquivo — `podarVersoes(lista, max = 3)`: mantém as 3 mais recentes, nunca remove a versão atual
- [ ] mesmo arquivo — `validarSugestoes(json)`: cada item exige `tema`, `motivo` ("por que vale agora"), `fontes[]` (cada uma com `url` e `acessadoEm` ISO) e `rank`; ordem por `rank` crescente; item sem fonte é recusado
- [ ] `packages/core/src/redacao.test.ts` — casos de cada função acima (inclui colisão de slug, `..` em caminho, gate sem aprovação, poda de versões, sugestão sem data de acesso)

## Acceptance Criteria
### Must Have
- [ ] Transição para edição final sem `aprovar` lança erro
- [ ] `caminhoDentro` recusa qualquer caminho que saia da pasta do artigo
- [ ] Missões antigas (sem `kind`) continuam válidas; testes existentes intactos
- [ ] Pedido `definido` sem `tema` é recusado; padrões (1200, pt-BR) aplicados
### Should Have
- [ ] Mensagens de erro por campo em português

## Verification
- `npx vitest run packages/core`; `npx tsc --noEmit`

## Rollback Plan
Remover `redacao.ts` e o teste; reverter o campo opcional `kind` se tiver sido adicionado a `mission.ts` (arquivos tocados: 3).
