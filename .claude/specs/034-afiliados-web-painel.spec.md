---
title: Afiliados - web, painel de nichos, agenda e saúde
number: 034
priority: medium
tags: [feature, frontend, afiliados]
dependencies: [033-afiliados-servidor.spec.md, 032-afiliados-core-schema-e-agenda.spec.md, 011-web-casca-e-telas.spec.md]
related_prd: .claude/prd/afiliados-painel.prd.md
status: pending
created: 2026-11-21
---

# 034 - Afiliados: painel web

## Overview
Substitui o placeholder atual de `#/afiliados` (`screens/Afiliados.tsx` mostra só "sem relatório") por quatro seções: Grupos e nichos, Agenda 24h, Saúde e Aplicar mudanças. O hub não executa nada do projeto: mostra `npm run niches:sync` e o status "pendente de sincronizar".

## Related PRD
- [afiliados-painel](../prd/afiliados-painel.prd.md) — histórias 1–48

## Prerequisites
- [ ] Specs 032 e 033; rota `#/afiliados` e item de menu já existem (App.tsx/Shell.tsx).

## Dependencies
- 033, 032, 011.

## Implementation Tasks
- [ ] `packages/web/src/api.ts` — funções para os endpoints `/afiliados/*` (nichos, gravar com `hash`/`mtimeMs`, revelar jid, backups, restaurar, sugerir agenda, info, relatórios, sincronizado)
- [ ] `packages/web/src/logic/afiliados.ts` — manter `estadoAfiliados` (compatível com `pele.test.ts`) e acrescentar: edição de nicho com erros por campo (espelho do spec 032), rascunho de mudanças, resumo ML/Amazon por nicho, linhas da agenda 24h, alerta de concentração e total diário vs. limite (usa `agenda.ts`)
- [ ] `packages/web/src/screens/Afiliados.tsx` — (1) Grupos e nichos: lista (rótulo, jid mascarado com "revelar" sob demanda no editor, ligado/desligado, prioridade), editar palavras/categorias/`minDealScore`/`maxPerRun`, adicionar, remover com `ConfirmDialog`, aviso de conflito com "recarregar", restaurar backup; (2) Agenda: linha do tempo 24h `America/Sao_Paulo` por nicho, horas desejadas, intervalo mínimo (padrão 45), sugestão aceitável/ajustável, cron com prévia em linguagem natural, alerta de concentração, total estimado vs. `WA_MAX_PER_DAY` (informativo); (3) Saúde: último relatório do `ops` e do `deal-auditor` com data/hora, mensagem se não houver, `DRY_RUN` com destaque quando desligado; (4) Aplicar: comando `npm run niches:sync` com botão copiar, badge "pendente de sincronizar", botão "marcar sincronizado"
- [ ] `packages/web/src/styles.css` — estilos mínimos (linha do tempo, destaque DRY_RUN desligado)
- [ ] `packages/web/test/afiliados.test.ts` — lógica e telas: erros por campo, mascaramento (o jid completo não aparece sem revelar), conflito, agenda, estado "sem afiliados configurado" com instruções, ausência de qualquer botão/ação de envio ou de alterar `DRY_RUN`; ajustar `pele.test.ts` apenas se o placeholder antigo for asserido (6º arquivo, declarar no commit)

## Acceptance Criteria
### Must Have
- [ ] Sem projeto afiliados: aviso com instrução de como configurar (não erro)
- [ ] Nenhuma ação de envio de WhatsApp, execução de comando ou mudança de `DRY_RUN` na interface
- [ ] Depois de salvar, aparece "pendente de sincronizar" e o comando com copiar
- [ ] Texto e rótulos legíveis sem cor; `prefers-reduced-motion` respeitado
### Should Have
- [ ] Screenshots: nichos, agenda com alerta de concentração, saúde sem relatório, DRY_RUN desligado

## Verification
- `npx vitest run packages/web`; `npx tsc --noEmit`; `npx vite build` em `packages/web`

## Rollback Plan
Reverter `Afiliados.tsx`, `logic/afiliados.ts`, `styles.css` e `api.ts` para o placeholder anterior (git); apagar o teste novo.
