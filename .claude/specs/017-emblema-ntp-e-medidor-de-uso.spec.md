---
title: Emblema NTP com medidor de uso do Claude
number: 017
priority: medium
tags: [feature, frontend, server, usage]
dependencies: [001-spike-claude-headless.spec.md, 011-web-casca-e-telas.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: in-progress
created: 2026-11-20
---

# 017 - Emblema NTP e medidor de uso

## Overview
O símbolo da guilda é o emblema NTP feito pelo usuário (`assets/emblem-ntp.png`, fundo removido), no centro de dois anéis metálicos: o externo (7 divisões, uma por dia) em prata mostra o uso **semanal** e o interno (5 divisões, uma por hora) em vermelho mostra a janela de **5 horas**, cada um com o tempo que falta para reiniciar. Montagem de referência em `assets/emblem-gauge.svg`. O selo circular completo (`assets/seal-ntp.png`) fica no Salão e no selo de aprovação.

## Related PRD
- [salao-da-guilda](../prd/salao-da-guilda.prd.md) — história 23

## Prerequisites
- [ ] Spec 001: descobrir de onde vem o percentual de uso (hipóteses a confirmar: dados de rate limit no stream-json, no JSON da statusline ou em outro comando do Claude Code). **Se não houver fonte confiável, o medidor mostra "indisponível" em vez de inventar um valor.**

## Implementation Tasks
- [ ] `packages/core/src/usage.ts` (+ teste) — schema `{cincoHoras:{percentual,reiniciaEm}, semana:{percentual,reiniciaEm}}`; `tempoRestante(reiniciaEm, now)` com relógio injetado; faixas de cor (normal, atenção, crítico)
- [ ] `packages/server/src/usage-source.ts` — lê a fonte confirmada no spike; cache curto; erro → `indisponivel`
- [ ] `packages/web/src/guild/Emblem.tsx` — componente do `assets/emblem.svg` com percentuais por props, contagem regressiva ao vivo, tooltip com valores exatos, versão compacta no cabeçalho e grande no Salão
- [ ] Alerta visual (e notificação) quando passar de 80% em qualquer janela

## Acceptance Criteria
### Must Have
- [ ] Percentuais e tempos vêm de fonte real; sem fonte, estado "indisponível"
- [ ] Legível sem cor (texto com % e tempo); `prefers-reduced-motion` respeitado
### Should Have
- [ ] Missão pede confirmação ao usuário se o uso semanal estiver acima de 90%

## Verification
- `npx vitest run`; screenshots do emblema em 0%, 62%, 100% e indisponível

## Rollback Plan
Remover `usage.ts`, `usage-source.ts` e `Emblem.tsx`; o resto da interface não depende deles.

## Notas do spike (spec 001)
- Fonte confirmada: evento `rate_limit_event` no stream-json (`rate_limit_info.unifiedWindows.five_hour|seven_day` com `utilization` 0–1, `resetsAt` epoch s, `status`). Só aparece após uma chamada ao modelo; granularidade grossa. Guardar o último evento com carimbo de hora; descartar se `resetsAt` já passou; sem evento = "indisponível". Atualização sem missão exige um `claude -p` mínimo periódico (~US$ 0,002 cada).
