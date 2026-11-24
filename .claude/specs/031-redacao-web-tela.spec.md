---
title: Redação - web, tela de artigos
number: 031
priority: medium
tags: [feature, frontend, redacao]
dependencies: [030-redacao-web-dados-e-rota.spec.md, 029-redacao-runner-e-prompts.spec.md]
related_prd: .claude/prd/redacao.prd.md
status: pending
created: 2026-11-21
---

# 031 - Redação: tela de artigos

## Overview
Tela `#/redacao`: pedido nos dois modos, lista de artigos por estado, leitor de artefatos, galeria de capas, copiar texto, baixar capa e aprovar/pedir ajustes. Somente leitura do texto (ajustes são pedidos ao agente).

## Related PRD
- [redacao](../prd/redacao.prd.md) — histórias 3–15, 16–28, 30, 33–35, 38, 42–44

## Prerequisites
- [ ] Specs 030 (dados e rota) e 029 (fluxo funcional no servidor).

## Dependencies
- 030, 029.

## Implementation Tasks
- [ ] `packages/web/src/screens/Redacao.tsx` — (a) formulário com modo "Sugerir temas" / "Tema definido": tema, público, tom, palavras (padrão 1200), referências (caminho/texto/link), idioma (pt-BR); estimativa de uso exibida antes de iniciar; (b) lista com filtro por estado, progresso via SSE; (c) detalhe: abas pesquisa (com links e data de acesso), checagem, rascunho, final, versões (até 3); (d) sugestões ranqueadas com fonte, data e "por que vale agora", botão "Escolher"; (e) ações aprovar, pedir ajustes (com comentário), cancelar, reabrir, excluir (com `ConfirmDialog`)
- [ ] `packages/web/src/ui/Capas.tsx` — galeria de capas com pré-visualização do PNG, botão "Baixar capa" (link para o endpoint de capa)
- [ ] `packages/web/src/ui/Leitor.tsx` — reutilizar o leitor existente para markdown; só ajustar se faltar suporte a links (ler o arquivo antes)
- [ ] `packages/web/src/styles.css` — estilos mínimos da tela
- [ ] `packages/web/test/redacao-tela.test.ts` — lista por estado, botão copiar (clipboard simulado), galeria de capas, atualização via SSE, botão aprovar só em "em revisão do usuário"

## Acceptance Criteria
### Must Have
- [ ] Nenhum botão de publicar ou enviar; copiar texto e baixar capa são os únicos caminhos de saída
- [ ] Aviso claro quando a pesquisa não achou fontes confiáveis
- [ ] Aprovar desabilitado fora de "em revisão do usuário"
- [ ] Legível sem cor (estado em texto); `prefers-reduced-motion` respeitado
### Should Have
- [ ] Screenshots da tela em: lista vazia, sugestões, artigo em revisão, artigo aprovado com capa

## Verification
- `npx vitest run packages/web`; `npx tsc --noEmit`; `npx vite build` em `packages/web`; screenshots (skill `/qa` opcional)

## Rollback Plan
Remover `Redacao.tsx`, `Capas.tsx`, estilos e teste; a rota do spec 030 passa a apontar para um aviso vazio ou é removida.
