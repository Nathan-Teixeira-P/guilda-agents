---
title: Registro de projetos e retomada por nome
number: 016
priority: high
tags: [feature, server, core, memory]
dependencies: [010-servidor-http-sse-e-portao.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: done
created: 2026-11-20
---

# 016 - Registro de projetos e retomada por nome

## Overview
Os projetos são anexados pela interface (URL de repositório ou pasta local) e ficam registrados. O usuário cita só o nome numa demanda e o laboratório resolve o projeto, carrega a memória dele e retoma a última missão. Substitui o `projects.yaml` estático.

## Related PRD
- [salao-da-guilda](../prd/salao-da-guilda.prd.md) — histórias 21 e 22

## Prerequisites
- [ ] Spec 010 concluído

## Implementation Tasks
### 1. Registro (TDD)
- [ ] `packages/core/src/projects.ts` — schema zod `{id, nome, apelidos[], origem(url|pasta), caminho, clickupListUrl?, criadoEm}`; resolução por nome/apelido com normalização (caixa, acento); nome ambíguo → devolve candidatos, nunca escolhe sozinho
- [ ] `packages/server/src/clone.ts` — aceita só `https://` ou `ssh` (git) ou pasta local existente; `spawn('git', ['clone', '--', url, dest])` sem shell; destino em `workspaces/<id>` sob o hub; **nunca roda scripts, install ou hooks do projeto clonado**
- [ ] `packages/server/src/http.ts` — rotas `POST /projects`, `GET /projects`, `DELETE /projects/:id` (só remove o registro; não apaga a pasta)
### 2. Memória e retomada
- [ ] `<projeto>/.claude/agent-notes/` + `project-notes.md` (resumo curto do estado, última missão, próximos passos) atualizado pelo `scribe` ao fim de cada missão; injetado no início da próxima
- [ ] `packages/core/test/projects.test.ts`, `packages/server/test/clone.test.ts` — resolução ambígua, URL inválida (`file://`, flags tipo `--upload-pack=…`), pasta inexistente

## Acceptance Criteria
### Must Have
- [ ] URL fora de `https/ssh` ou iniciada por `-` é recusada
- [ ] "continue o projeto X" resolve X, carrega `project-notes.md` e oferece retomar a última missão
- [ ] Nome ambíguo pergunta ao usuário
### Should Have
- [ ] Campo `clickupListUrl` por projeto (usado pelo intake, spec 013)
- [ ] Notas do projeto limitadas a poucos KB

## Verification
- `npx vitest run`; anexar um repositório pequeno de teste pela API e citar pelo nome

## Rollback Plan
Remover `projects.ts`, `clone.ts`, as rotas e a pasta `workspaces/`.
