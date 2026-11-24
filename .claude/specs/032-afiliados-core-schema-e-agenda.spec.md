---
title: Afiliados - espelho do schema e planejador de agenda
number: 032
priority: high
tags: [feature, core, afiliados]
dependencies: [004-hub-esqueleto-e-validador.spec.md]
related_prd: .claude/prd/afiliados-painel.prd.md
status: pending
created: 2026-11-21
---

# 032 - Afiliados: espelho do schema e planejador de agenda

## Overview
Lógica pura em `packages/core`: (1) espelho zod do schema de nichos do projeto afiliados, com teste de conformidade contra o schema real; (2) planejador de agenda (cron intercalado, intervalo mínimo, detecção de concentração, total diário vs. limite). Sem I/O de produção.

## Related PRD
- [afiliados-painel](../prd/afiliados-painel.prd.md) — histórias 9–16, 23–33, 48

## Prerequisites
- [ ] Nenhum bloqueio. Schema de referência: `/home/nathan/Projetos/pessoal/afiliados/src/niches/schema.ts` (exporta `nicheConfigSchema`, `nichesFileSchema`; campos `key`, `label`, `enabled`, `priority`, `groupJid` terminando em `@g.us`, `instance`, `audience?`, `ml{categoryIds,keywords}`, `amazon{browseNodeIds,keywords}`, `minDealScore` 0–100, `maxPerRun` ≥1, `cronSlots` ≥1; ao menos uma fonte de busca; `key` e `groupJid` únicos).

## Dependencies
- 004. Bloqueia 033 e 034.

## Decisões fixadas
- Intervalo mínimo padrão entre envios de nichos: 45 min (configurável).
- Fuso fixo `America/Sao_Paulo` (sem horário de verão atualmente; usar `Intl` com o fuso nomeado ao exibir).

## Implementation Tasks
- [ ] `packages/core/src/niches.ts` — espelho zod (`NicheConfig`, `NichesFile`) com as mesmas regras e mensagens por campo em português; `mascararJid(jid)` (ex.: `1203…@g.us` com miolo oculto)
- [ ] `packages/core/src/niches.test.ts` — casos válidos/ inválidos por campo; conformidade: tenta `import()` dinâmico do `schema.ts` real do afiliados (caminho de `process.env.AFILIADOS_DIR`, padrão o caminho acima), roda os mesmos casos nos dois e compara aceite/recusa; se o arquivo ou suas dependências faltarem, `it.skipIf`/aviso em vez de falhar
- [ ] `packages/core/src/agenda.ts` — funções puras: `horasParaCron(hhmm)` (`"30 9 * * *"`), `descreverCron(cron)` ("todo dia às 09:30"; cron fora do formato simples → "expressão personalizada"), `sugerirAgenda({nichos:[{key, horas, envios}], intervaloMin = 45})` intercalando nichos e respeitando o intervalo, `detectarConcentracao(slots, intervaloMin)` (pares de envios mais próximos que o intervalo), `totalDiario(nichos)` (soma de `maxPerRun` × execuções) comparado a `limiteDiario` (só alerta, nunca bloqueia)
- [ ] `packages/core/src/agenda.test.ts` — intercalação, intervalo mínimo, concentração, total vs. limite, cron válido, determinismo (mesma entrada, mesma saída)

## Acceptance Criteria
### Must Have
- [ ] Espelho aceita/recusa os mesmos casos que o schema real (teste de conformidade) e é ignorado com aviso se o afiliados faltar
- [ ] `sugerirAgenda` determinístico, nunca produz dois envios a menos de `intervaloMin`, ou sinaliza quando for impossível
- [ ] Saída de cron aceita pelo parser de 5 campos usado nos testes
### Should Have
- [ ] `descreverCron` cobre os formatos gerados pelo próprio planejador

## Verification
- `npx vitest run packages/core`; `npx tsc --noEmit`

## Rollback Plan
Apagar os 4 arquivos novos; nada mais depende deles além dos specs 033 e 034.
