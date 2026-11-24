---
title: Afiliados - servidor (nichos, backups, ambiente e relatórios)
number: 033
priority: high
tags: [feature, server, api, afiliados, security]
dependencies: [032-afiliados-core-schema-e-agenda.spec.md, 010-servidor-http-sse-e-portao.spec.md, 016-registro-de-projetos-e-memoria.spec.md]
related_prd: .claude/prd/afiliados-painel.prd.md
status: pending
created: 2026-11-21
---

# 033 - Afiliados: servidor

## Overview
Leitura e gravação segura de `config/niches.json` do projeto afiliados anexado, leitura restrita de `DRY_RUN` e `WA_MAX_PER_DAY`, leitura do último relatório do `ops`/`deal-auditor` e estado "pendente de sincronizar". O hub não executa nada do projeto, não envia WhatsApp e não grava o `.env`.

## Related PRD
- [afiliados-painel](../prd/afiliados-painel.prd.md) — histórias 2–6, 14–22, 29–30, 34–47

## Prerequisites
- [ ] Spec 032 (espelho do schema, `mascararJid`).
- [ ] Projeto "afiliados" registrado no hub (id ou nome `afiliados`, campo `caminho`, como já detecta `packages/web/src/logic/afiliados.ts`). Sem ele os endpoints respondem `{configurado:false}` com instrução, não erro.

## Dependencies
- 032, 010, 016. Bloqueia 034 e 035.

## Decisões fixadas
- Comando de sincronizar: `npm run niches:sync` (executado pelo usuário no afiliados; o hub só exibe).
- Manter 10 backups de `niches.json` (`niches.json.<timestamp>.bak` em `<hub>/afiliados-backups/`, fora do afiliados); poda dos mais antigos.
- Relatórios: markdown com frontmatter (`data`, `nichos`, `status`, `achados`) em `<afiliados>/.claude/ops-reports/`; prefixos `ops-YYYY-MM-DD*.md` e `deal-auditor-YYYY-MM-DD*.md`; escolhe o mais recente pelo nome (data).
- Estado de sincronização em `<hub>/afiliados-state.json` (`pendenteSync`, `hashGravado`, `quando`).

## Implementation Tasks
- [ ] `packages/server/src/afiliados-store.ts` — `lerNichos()` (retorna nichos com `groupJid` mascarado + `hash` sha256 e `mtimeMs` do arquivo), `revelarJid(key)` (pedido explícito, nunca em log), `gravarNichos(nichos, {hash, mtimeMs})` (valida com o espelho; recusa 409 se hash/mtime divergirem; backup antes; escrita em temp + `rename`; poda para 10; marca `pendenteSync`; jid mascarado enviado de volta mantém o valor original), `listarBackups()`, `restaurarBackup(id)` (valida o conteúdo, passa pelo mesmo fluxo de backup), `marcarSincronizado()`; caminho do `niches.json` derivado de `caminho` do projeto, fixo `config/niches.json`, sem aceitar caminhos do cliente
- [ ] `packages/server/src/afiliados-info.ts` — `lerInfo()` e `ultimoRelatorio(tipo)`: lê o `.env` do afiliados SOMENTE por allowlist `DRY_RUN` e `WA_MAX_PER_DAY` (parse linha a linha, descarta o resto, nunca devolve nem registra outras chaves); relatórios: pasta ausente/arquivo vazio → `{existe:false}`; parse do frontmatter tolerante
- [ ] `packages/server/src/http.ts` — rotas (incluir `afiliados` na regex de `api`): `GET /afiliados/nichos`, `PUT /afiliados/nichos` (body com `hash`/`mtimeMs`), `GET /afiliados/nichos/:key/jid`, `GET /afiliados/backups`, `POST /afiliados/backups/:id/restaurar`, `POST /afiliados/agenda/sugerir` (cálculo puro do spec 032), `GET /afiliados/info` (`dryRun`, `waMaxPerDay`, `comandoSync`, `pendenteSync`), `POST /afiliados/sincronizado`, `GET /afiliados/relatorios/ops|deal-auditor`; nenhuma rota de envio, execução ou alteração de `DRY_RUN`
- [ ] `packages/server/test/afiliados-store.test.ts` — diretórios temporários e fixtures: backup criado, falha no meio não corrompe (rename atômico), conflito por hash e por mtime recusado, poda para 10, restauração, jid nunca completo nas respostas padrão, `.env` fixture com segredo (a resposta nunca o contém), relatório mais recente, pasta ausente, arquivo vazio

## Acceptance Criteria
### Must Have
- [ ] Nada é escrito no repositório afiliados além de `config/niches.json`; `.env` nunca é aberto para escrita e só 2 chaves saem dele
- [ ] Respostas padrão não trazem `groupJid` completo; logs nunca o contêm
- [ ] Gravação concorrente é recusada com 409 e instrução de recarregar
- [ ] Sem projeto afiliados registrado: `{configurado:false}` com instruções
- [ ] O hub não executa `npm run niches:sync` nem nenhum comando do afiliados
### Should Have
- [ ] Teste garante que nenhuma rota `/afiliados` aceita método de envio ou muda `DRY_RUN`

## Verification
- `npx vitest run`; `npx tsc --noEmit`; subida real curta com fixture em diretório temporário

## Rollback Plan
Reverter `http.ts`; apagar `afiliados-store.ts`, `afiliados-info.ts` e o teste; remover `afiliados-state.json` e `afiliados-backups/` do hub. O `niches.json` do afiliados pode ser restaurado a partir de um backup.
