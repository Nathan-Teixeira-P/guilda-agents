---
title: Servidor - runner do Claude e parser do stream
number: 009
priority: high
tags: [feature, server, logic]
dependencies: [003-core-disjuntor-e-classificador.spec.md, 005-agentes-direcao-e-documentos.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: done
created: 2026-11-20
---

# 009 - Runner e stream

## Overview
Executa o orquestrador como subprocesso `claude -p` por fase, interpreta o stream-json (custo, tokens, subagentes, ferramentas) e aplica o disjuntor e o teto de gasto no servidor.

## Related PRD
- [salao-da-guilda](../prd/salao-da-guilda.prd.md) — Orquestração por subprocesso, Disjuntor também no servidor

## Prerequisites
- [ ] Spec 001 concluído (flags e fixtures reais)

## Implementation Tasks
- [ ] `packages/server/src/stream.ts` — parser zod `safeParse` (campos extras toleradas) de stream-json → eventos tipados (uso, subagente iniciou/terminou, ferramenta, resultado)
- [ ] `packages/server/src/runner.ts` — fase 1 escreve só em `missions/<id>/out/` (staging, via `--add-dir` + `Edit(<staging>/**)` com `dontAsk`, sem `bypassPermissions`); `spawn(file, args[])` sem shell; fase 1 (sem Edit/Bash) e fase 2 (`--resume`); kill ao estourar disjuntor ou orçamento; `dependências`: `spawn` injetável
- [ ] `packages/server/test/stream.test.ts`, `runner.test.ts` — com fixtures do spec 001 e agente falso (script que emite stream gravado)

## Acceptance Criteria
### Must Have
- [ ] Fase 2 só inicia se `isApproved` for verdadeiro
- [ ] Estouro de disjuntor ou orçamento mata o processo e marca a missão `parada`
- [ ] Linha inválida no stream não derruba o servidor
### Should Have
- [ ] Custo por agente acumulado na missão

## Verification
- `npx vitest run packages/server` (sem `claude` real nem rede)

## Rollback Plan
Remover `packages/server/src/{stream,runner}.ts` e testes.

## Notas do spike (spec 001) — decidir antes de implementar
- `.claude/` é caminho sensível: `acceptEdits`/`dontAsk` bloqueiam escrita lá mesmo com `Edit(.claude/**)`. O contorno testado usa `bypassPermissions` + Bash desabilitado + hook PreToolUse de guarda (risco maior). **Alternativa proposta:** a fase 1 escreve só num diretório de staging fora de `.claude/` (`Edit(<staging>/**)` funciona com `dontAsk`) e o servidor move os artefatos para `<projeto>/.claude/`. **Decidido pelo usuário (2026-11-21): usar a pasta de rascunho.**
- Sempre `--permission-mode` explícito, `--verbose` e `</dev/null`; o fim da missão é a saída do processo e o último `result` não vazio (podem vir vários `result`).
- Estouro de orçamento: `error_max_budget_usd` / `terminal_reason: budget_exhausted`; o gasto passa um pouco do teto. Custo em USD só por modelo (`modelUsage`); por subagente só tokens.
- Detalhes: `.claude/learnings/claude-headless.md`.
- **Conta Pro (sem API):** o custo em USD do stream é de tabela, não cobrança. O limite de verdade é o uso do plano (ver spec 018). Login por assinatura expira: usar `claude setup-token` para execução sem supervisão.
