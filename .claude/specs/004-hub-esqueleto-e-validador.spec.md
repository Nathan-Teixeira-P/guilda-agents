---
title: Esqueleto do hub, roteamento e validador de agentes
number: 004
priority: high
tags: [feature, core, config]
dependencies: [002-core-missao-e-portao.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-20
---

# 004 - Esqueleto do hub

## Overview
Arquivos de base do laboratório: regras do hub, registro de projetos, tabela de roteamento, validador e instalador de symlinks dos agentes.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Agentes globais, Modelos, Padrão de resposta

## Prerequisites
- [ ] Spec 002 concluído

## Implementation Tasks
### 1. Arquivos
- [ ] `CLAUDE.md` — em inglês: padrão de tokens (resposta de 10 linhas, caminhos em vez de conteúdo, leitura cirúrgica, um agente uma tarefa), exceções do frontend, regras de segurança (sem commit/publicação sem pedido)
- [ ] `routing.md` — tabela ação→modelo e regra de escalada (2 falhas)
- [ ] ~~`projects.yaml`~~ — removido: os projetos são cadastrados pela interface (spec 016)
- [ ] `scripts/validate-agents.ts` (+ teste) — confere frontmatter, `model` ∈ tabela, ferramentas mínimas, leitores sem escrita, linha do padrão
- [ ] `scripts/install-agents.sh` — `ln -sfn` de `agents/*.md` em `~/.claude/agents`; nunca sobrescreve arquivo que não seja symlink

## Acceptance Criteria
### Must Have
- [ ] Validador falha com agente de leitura que tenha Write/Edit
- [ ] Instalador recusa sobrescrever arquivo real
### Should Have
- [ ] `routing.md` e validador usam a mesma lista de modelos

## Verification
- `npx vitest run scripts` e `bash scripts/install-agents.sh --dry-run`

## Rollback Plan
Remover symlinks criados (`find ~/.claude/agents -lname '*guilda-agents*' -delete`) e os arquivos.
