---
title: Prompt da missão e teste real da fase 1
number: 021
priority: high
tags: [feature, server, validation]
dependencies: [010-servidor-http-sse-e-portao.spec.md, 016-registro-de-projetos-e-memoria.spec.md]
related_prd: .claude/prd/core-agentes.prd.md
status: done
created: 2026-11-21
---

# 021 - Prompt da missão e teste real

## Overview
Monta, de forma pura e testada, o prompt que o orquestrador recebe em cada fase (demanda, briefing, notas do projeto, pasta de rascunho, regras) e prova com o `claude` real, a custo mínimo, que a fase 1 gera plano, PRD e specs no rascunho e que a promoção os leva ao projeto.

## Related PRD
- [core-agentes](../prd/core-agentes.prd.md) — Fluxo de duas fases, memória por projeto

## Implementation Tasks
- [ ] `packages/server/src/prompt.ts` (+ teste) — `promptFase1({demanda, briefingPath?, notas?, stagingDir, projetoPath, classe})` e `promptFase2({specs, projetoPath, ...})`: instruções fixas curtas, caminhos em vez de conteúdo, notas do projeto (`project-notes.md`) anexadas com limite, caminho curto para tarefa trivial, "grave só em <stagingDir>", sem commit/push
- [ ] `packages/server/src/http.ts` — usar o prompt na criação da missão (resolve a pergunta do spec 016: as notas entram no prompt da fase 1) e em `adjust`; ajustar os testes que afirmam o prompt
- [ ] `spikes/e2e-fase1.sh` — roda UMA missão real de fase 1 numa demanda mínima em projeto temporário, com teto de uso baixo, e confere que `missions/<id>/out/` tem plano/PRD/specs válidos e que a promoção os leva para `.claude/` do projeto temporário
- [ ] `.claude/learnings/e2e-fase1.md` — resultado, custo em uso do plano, problemas dos prompts dos agentes e ajustes feitos neles

## Acceptance Criteria
### Must Have
- [ ] Prompt não contém conteúdo de arquivos, só caminhos e as notas limitadas
- [ ] Teste real: fase 1 termina em `aguardando-aprovacao` e o pacote promovido passa no `spec-checker`
### Should Have
- [ ] Ajustes nos agentes (`agents/*.md`) que o teste real mostrar necessários, validados por `validate-agents`

## Verification
- `npx vitest run`; `bash spikes/e2e-fase1.sh` (um único run, custo pequeno e anotado)

## Rollback Plan
Remover `prompt.ts`, o script e reverter o uso em `http.ts`.
