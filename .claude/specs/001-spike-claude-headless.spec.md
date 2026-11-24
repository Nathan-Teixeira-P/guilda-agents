---
title: Spike do Claude Code headless
number: 001
priority: high
tags: [spike, core, infra]
dependencies: []
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 001 - Spike do Claude Code headless

## Overview
Confirma, rodando de verdade, que o Claude Code 2.1.x aceita o modo usado por todo o laboratório: `claude -p --agent … --output-format stream-json`, `--resume`, `--max-budget-usd`, `--permission-mode` e `--allowedTools`. Nada do resto deve ser construído antes disso.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — "Validar antes de confiar"

## Prerequisites
- [ ] `claude` instalado e logado (v2.1.330 já presente)

## Implementation Tasks
### 1. Spike
- [ ] `spikes/headless.sh` — roda um agente de teste em `-p` com stream-json, `--session-id` fixo e `--max-budget-usd 0.10`
- [ ] Confirmar: (a) `--agent` carrega agente de `~/.claude/agents`; (b) stream-json traz custo/tokens por turno e eventos de subagente (Agent tool); (c) `--resume <id>` continua a sessão; (d) o teto de orçamento interrompe de fato; (e) `--allowedTools` bloqueia Edit/Bash em modo `-p` sem pedir prompt; (f) escrita só em `.claude/` é possível com a regra de permissão correta.
- [ ] `tests/fixtures/stream-*.jsonl` — gravar saídas reais (mínimas) para uso nos testes dos specs 009+

### 2. Registro
- [ ] `.claude/learnings/claude-headless.md` — resultado de cada item (a–f), flags exatos, o que falhou e o contorno

## Acceptance Criteria
### Must Have
- [ ] Cada item (a–f) tem resultado registrado (confirmado, ou refutado com alternativa)
- [ ] Fixtures reais commitadas, sem dados sensíveis
### Should Have
- [ ] Custo medido do spike anotado

## Verification
- Rodar `bash spikes/headless.sh` e conferir o learning. Gasto esperado: centavos.

## Rollback Plan
Remover `spikes/` e as fixtures. Se algum item for refutado, ajustar os PRDs antes de seguir.
