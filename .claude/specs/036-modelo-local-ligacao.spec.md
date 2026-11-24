---
title: Modelo local - ligação (verificador por entrada, CLI, servidor, tester)
number: 036
priority: medium
tags: [feature, cost, server, agents, security]
dependencies: [014-integracao-ollama-local.spec.md, 024-comandos-permitidos-por-projeto.spec.md]
related_prd: .claude/prd/integracoes.prd.md
status: done
created: 2026-11-21
---

# 036 - Modelo local: ligação

## Overview
A 014 entregou as peças (runLocal, verificadores, cliente Ollama, contadores) mas nada as usa. Esta spec liga o mínimo para economizar o plano Claude Pro sem perda de qualidade: o resultado local só vale se um verificador DETERMINÍSTICO derivado da ENTRADA passar; senão entra um filtro determinístico (sem modelo, zero tokens Claude).

## Implementation Tasks
- [x] `verify.ts` — `inputDerivedTerms`: toda linha-chave do log bruto (FAIL, ✗, Error:, AssertionError, expected, arquivo:linha, exit code, resumo Tests passed/failed) tem de estar na saída; `local-tasks.ts` usa isso em `compact-test-log` (+ maxSize); import `.ts` para rodar no Node
- [x] `tokensSaved` = estimativa (chars/4 da entrada menos a saída que entra no contexto do Claude)
- [x] `packages/server/src/local-config.ts` — `local.json` do hub ({enabled:false, model:qwen2.5:3b, port:11434}), escrita atômica, `local-stats.jsonl` (task, via, tokensSaved, ms; nunca conteúdo), agregação
- [x] `scripts/local.ts` — `node scripts/local.ts <task> <arquivo>`; só `compact-test-log` e `list-relevant-files`; arquivo dentro do cwd, sem symlink, com teto de tamanho; log curto (<60 linhas e <2000 chars) passa direto; desligado/Ollama fora/verificador reprova => filtro determinístico, exit 0; stdout só com o resultado
- [x] `http.ts` — `GET/PUT /local` (enabled, model validado contra `GET 127.0.0.1:<port>/api/tags`), `GET /local/stats`; mesmas regras de Host/Origin; 501 sem hubDir
- [x] `runner.ts` — fase 2 permite exatamente `Bash(node <hub abs>/scripts/local.ts compact-test-log:*)` e `...list-relevant-files:*`; `agents/tester.md` ganha a regra de uso
- [x] Testes com Ollama falso (sem modelo real); smoke manual opcional com qwen2.5:3b

- [x] `ollama-lifecycle.ts` (server, importado também por `scripts/local.ts`) — `ensureUp` (Ollama já no ar => usa e NUNCA mata; fora => viabilidade MemAvailable >= tamanho*1.3+1 GiB, spawn `ollama serve` sem shell, espera /api/tags, registro atômico em `ollama-lifecycle.json`), `release` (unload `keep_alive:0`; SIGTERM só se registrado e `/proc/<pid>/cmdline` for `ollama serve`), reaper no hub (15 s, ocioso > 60 s, relógio injetável, solta também em `close()`), limpeza de registro velho no start; `keep_alive:'60s'` em todo generate
- [x] `local-active.json` ({task, model, agent, since}, atômico, ignorado após 120 s) escrito pelo CLI; `GET /local/status` (estado, startedByHub, modeloCarregado, viavel, emUso, ultimoUso, elegiveis, fora); evento SSE `local` (ligado/desligado/em-uso/ocioso) por watcher de 1 s; tabela fechada `LOCAL_ELIGIBLE`/`LOCAL_FORA` no core (só `tester` → `compact-test-log`; `list-relevant-files` fica fora porque o tester não tem Write para criar o arquivo de entrada)
- [x] `node scripts/local.ts run <cmd...>` — `validarComando` + comandos salvos do projeto (env `LAB_LOCAL_COMMANDS` posto pelo runner), sem shell, timeout, teto de saída, compacta e imprime `exit code: N` por último; allowlist da fase 2 ganha `Bash(node <hub>/scripts/local.ts run:*)`; `tester.md` atualizado

## Acceptance Criteria
### Must Have
- [x] Saída do modelo que perde uma linha de falha é rejeitada e vira fallback determinístico
- [x] Padrão desligado; Ollama só em 127.0.0.1; nada de conteúdo no log de estatísticas
- [x] Nenhum teste existente enfraquecido; `validate-agents` passa
## Verification
- `npx vitest run`; `npx tsc --noEmit`; `node scripts/validate-agents.ts agents`
## Rollback Plan
Reverter os itens; `local.json` ausente = desligado.
