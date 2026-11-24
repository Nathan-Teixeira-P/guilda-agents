---
title: Intake do ClickUp
number: 013
priority: medium
tags: [feature, integration, agents]
dependencies: [005-agentes-direcao-e-documentos.spec.md, 010-servidor-http-sse-e-portao.spec.md]
related_prd: .claude/prd/integracoes.prd.md
status: pending
created: 2026-11-20
---

# 013 - Intake do ClickUp

## Overview
Agente `intake` que lê uma tarefa do ClickUp (somente leitura) e produz o briefing; campo de link na interface; fallback de texto colado.

## Related PRD
- [integracoes](../prd/integracoes.prd.md)

## Prerequisites
- [ ] **Passo manual do usuário**: instalar e autenticar o MCP do ClickUp (`claude mcp add …`); a ferramenta de ClickUp não está instalada hoje

## Implementation Tasks
- [ ] `agents/intake.md` (haiku) — só ferramentas de leitura do ClickUp; grava `missions/<id>/briefing.md` em formato fixo e preserva o link
- [ ] `packages/core/src/briefing.ts` (+ teste) — schema do briefing e validação, a partir de fixture de tarefa
- [ ] `packages/web/src/` — campo de link/texto na Nova missão; sem MCP, só texto colado
- [ ] `docs/clickup.md` — como instalar o MCP e o que é lido; a lista do ClickUp fica no campo `clickupListUrl` do projeto (spec 016)

## Acceptance Criteria
### Must Have
- [ ] Nenhuma escrita no ClickUp
- [ ] Sem MCP ou link inválido, o fluxo cai para texto colado sem erro
### Should Have
- [ ] Briefing traz objetivo, critérios de aceite, anexos e links

## Verification
- `npx vitest run packages/core`; teste manual com uma tarefa real

## Rollback Plan
Remover `intake.md`, `briefing.ts` e o campo na interface.
