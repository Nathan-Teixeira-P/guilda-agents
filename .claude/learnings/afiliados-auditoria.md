# Auditoria: afiliados (oferta-bot)

Data: 2026-11-21. Repo auditado (somente leitura): `/home/nathan/Projetos/pessoal/afiliados`. Nenhuma alteração, nenhum commit, nenhuma chamada a ML/Amazon/Evolution. Valores de `.env` e JIDs de grupos não aparecem aqui (`<redacted>`).

## Veredito: NÃO PRONTO para rodar diário

O desenho é bom e o núcleo é sólido: score contra o histórico do próprio produto, link de afiliado injetado após a IA, rodapé de divulgação em toda mensagem, orçamento global por número, DRY_RUN por padrão, isolamento de falha por nicho. Mas há bloqueadores operacionais que fazem o bot não subir, ou rodar vazio, e nenhum dado real foi coletado ainda. O banco tem 5 nichos sincronizados e 0 produtos, 0 preços, 0 publicações e 0 RunLogs. As credenciais de ML, Amazon e Evolution API no `.env` ainda são placeholders. Depois de corrigir os itens críticos e altos e acumular dias de dry-run, passa a "pronto com ressalvas".

## Resultados de comando

| Comando | Resultado |
|---|---|
| `npm run typecheck` | OK, sem erros |
| `npm run build` (feito com `--outDir` no scratchpad, sem tocar no repo) | OK |
| `npm test` como está | **28 falhas, 103 passam**, e é perigoso (ver C1 e C3) |
| `npm test` com `PRISMA_QUERY_ENGINE_LIBRARY` apontando para o engine 3.0.x, banco copiado e `--no-file-parallelism` | **137/137 passam** (2 execuções seguidas) |
| Os mesmos testes com paralelismo de arquivos ligado | 4 falhas intermitentes (corrida no banco compartilhado) |
| Testes batem na rede? | Não. undici/providers/Evolution são mockados |
| `npm audit --omit=dev` | 3 high: `undici` 5.x (e `@fastify/busboy`), `zod` 3.x (DoS por coleção grande). Correção exige major (undici 6+/7, zod 4) |
| Versões | Node 24.22 no host (engines `>=20`), Prisma 5.22, vitest 1.6, node-cron 4.6 |

## Checklist de prontidão

| Item | Estado |
|---|---|
| Roteamento por nicho (busca por nicho, envio só ao grupo do nicho) | Parcial. Estrutura correta, mas a checagem defensiva é tautológica (A5) |
| Teto de cross-post (`MAX_GROUPS_PER_PRODUCT_PER_DAY`) | OK (`dedupe.ts:99-107`); contado só sobre `sent` (M5) |
| Agenda escalonada (8h, 9h, 11h, 14h, 17h) | OK no config; fixa e sem jitter (M6) |
| Orçamento global diário (`WA_MAX_PER_DAY` 1-60, por instância) | OK. Soma das cotas é 17 e o teto é 20 |
| Score honesto (preço contra mediana própria) | OK com ressalvas (M2, M3) |
| Rodapé de afiliado em toda mensagem | OK (`templates.ts:11-16,61`) |
| Link injetado após a IA; o LLM nunca vê o link | OK; texto do LLM não é checado contra URLs (A6) |
| DRY_RUN padrão | OK (`env.ts` usa `'true'` como default e `.env` tem `true`) |
| Ollama padrão com fallback determinístico | OK, mas o fallback sobrepõe o veto do LLM (A4) |
| SQLite com persistência e RunLog | OK; RunLog não registra erro de nicho (A7) |
| Cron em America/Sao_Paulo | Cron sim; o casamento de nichos não (C2) |
| Degradação se a chave Amazon cair | Parcial. Chave revogada degrada; chave ausente derruba o boot (A8) |
| Refresh de token ML | Quebrado entre reinícios (C4) |
| Rate limits | OK (Amazon 1100 ms global, ML retry/Retry-After, throttle WA 25-70 s) |
| Idempotência, dedup, cooldown | OK; risco de duplicata em timeout do Evolution (M4) |
| Falha de um nicho não derruba a run | OK (`run.ts:182-186` e `runSlot` com try/finally) |
| Shutdown limpo | Parcial (M7) |
| Redação de segredos nos logs | OK para os campos comuns; só em stdout (B2) |
| Alerta e monitoramento | Ausente (A7, seção "Formato ops-reports") |
| Backup do SQLite | Ausente (A10) |
| Start em produção (pm2, systemd, docker) | **Ausente**. Não há unit, ecosystem nem Dockerfile |
| `.env.example` completo | Quase. Falta `NICHES_FILE`; traz `WHATSAPP_GROUP_JID` morto |
| README e SETUP corretos | Parcial (ver A8 e B4) |

## Achados priorizados

### Críticos

**C1. O Prisma Client não carrega neste host.**
- Evidência: `niches`, `stats`, `run` e 28 testes falham com "could not locate the Query Engine for runtime debian-openssl-1.1.x". O client foi gerado para `debian-openssl-3.0.x`, e o host tem OpenSSL 3.5.5 com Node 24 e Prisma 5.22.
- Correção mínima: no `schema.prisma`, `binaryTargets = ["native","debian-openssl-3.0.x"]` e rodar `prisma generate`; ou subir o Prisma para 6.x; ou exportar `PRISMA_QUERY_ENGINE_LIBRARY` no serviço. Validar com `npx tsx src/index.ts niches`.

**C2. `schedule` e `groups` abortam no boot porque `.env` não é carregado.**
- Evidência: `src/config/env.ts` faz `envSchema.parse(process.env)` sem `dotenv` (`dotenv` só é importado nos `*.test.ts`). `import('./src/scheduler.ts')` e `import('./src/whatsapp/evolution.ts')` falham com "ML_CLIENT_ID: Required...". `run` só funciona por acidente: `pipeline/run.ts:1` importa `db/client`, e o `@prisma/client` carrega o `.env` antes de `env.ts` avaliar. `scheduler.ts:3` importa `env` primeiro e quebra.
- Correção mínima: primeira linha de `env.ts` com `import 'dotenv/config'`, ou o serviço com `node --env-file=.env dist/index.js schedule`.

**C3. `npm test` apaga o banco de produção.**
- Evidência: `src/db/client.test.ts:8-23` faz `deleteMany({})` em todas as tabelas, e outros testes fazem o mesmo, usando o `DATABASE_URL` do `.env` (`data/ofertas.db`). Se o C1 for corrigido, rodar `npm test` zera nichos, histórico de preços e publicações, incluindo o histórico acumulado do dry-run. Não existe `vitest.config`, nem setup que force banco de teste, nem `fileParallelism: false`. Só não aconteceu aqui porque o engine falha.
- Correção mínima: `vitest.config.ts` com `env: { DATABASE_URL: 'file:./data/test.db' }` mais `fileParallelism: false` e um `pretest` com `prisma db push` nesse banco. Os testes têm que abortar se o `DATABASE_URL` não contiver `test`.

**C4. A rotação do refresh token do ML não é persistida.**
- Evidência: `providers/mercadolivre/auth.ts:34,65-71` guarda o token novo só em memória e apenas avisa no log. O ML invalida o refresh token antigo a cada uso. Se o bot rodar via `run` por cron do sistema (cada execução é um processo novo), a segunda execução falha com 401 do `/oauth/token`. No modo residente (`schedule`), o primeiro reinício depois de uma rotação também falha.
- Impacto: o ML fica sem ofertas e o bot segue "ok", porque os erros de busca viram `[]` (A7).
- Correção mínima: gravar o token rotacionado em `data/ml-token.json` (0600, escrita atômica) e lê-lo antes de `ML_REFRESH_TOKEN`.

### Altos

**A1. `nichesDueAt` ignora o fuso e casa só hora e minuto exatos.**
- Arquivo: `niches/registry.ts:181-211`, chamado em `pipeline/run.ts:238`; o cron é registrado em `scheduler.ts:133` com `TIMEZONE`.
- Evidência: usa `date.getHours()` e `getMinutes()` do fuso do processo. Os campos de dia, mês e dia da semana são ignorados (variáveis lidas e não usadas). Expressões como `0 9,15 * * *` ou `*/30` dão `parseInt` errado. Este host está em -03 e funciona; num VPS em UTC o cron dispara às 9h de São Paulo, `nichesDueAt` vê hora 12 e nada é publicado, com `status: completed`. Se um slot atrasa por causa do guard `isRunning`, ele é perdido sem registro.
- Correção mínima: `runGuardedSlot(slot)` recebe o slot do cron e `runSlot({ niches: nichos com esse slot })`. Assim não há re-casamento de horário. Para `run` manual, aceitar `--slot="0 9 * * *"` ou uma janela de ±10 min calculada em `America/Sao_Paulo`.

**A2. Palavras-chave misturadas entre ML e Amazon (bug de busca).**
- Arquivos: `registry.ts:76,91` (`keywords = [...ml.keywords, ...amazon.keywords]`), `providers/mercadolivre/provider.ts:26`, `providers/amazon/provider.ts:27`.
- Evidência: os dois providers recebem a lista unida. Com os budgets (ML 6, Amazon 2) e a ordem categoria-primeiro: a Amazon usa 1 browse node + a 1ª keyword **do ML**, e nunca usa as suas próprias `amazon.keywords`. O ML recebe keywords da Amazon. `config/niches.json` tem 1 categoria + 4 keywords do ML e 1 node + 2-3 keywords da Amazon por nicho. O schema do Prisma também não tem colunas separadas.
- Correção mínima: guardar `mlKeywords` e `amazonKeywords` separados (colunas novas ou JSON `{ml, amazon}`), e cada provider ler a sua.

**A3. Busca do ML ordenada por `price_asc` seleciona o lixo mais barato.**
- Arquivo: `providers/mercadolivre/provider.ts:97`.
- Evidência: pega só os `limit` itens de menor preço da categoria (acessórios e itens duvidosos), o que raramente são as melhores ofertas. Junto com o gate de confiabilidade (`score.ts:91`), a maioria é descartada e o histórico fica ralo: os mesmos itens baratos têm de reaparecer em 7 dias distintos para sair do fallback (cap 60).
- Correção mínima: usar a ordenação padrão (relevância) ou `sold_quantity_desc`, e pós-filtrar por `original_price`. Validar no dry-run quantos itens passam.

**A4. O fallback da curadoria anula o veto do LLM e a checagem de relevância.**
- Arquivo: `curation/curator.ts:239-241` (`results.length === 0` leva a `fallbackCuration`) e `:187-193` (JSON inválido leva ao fallback dos top-N).
- Evidência: se o LLM rejeita todos os candidatos como fora do nicho, o código publica os top-N mesmo assim. Não existe filtro determinístico de relevância, e a busca por keyword no ML não é restrita à categoria. Esse é um caminho real para "oferta errada no grupo certo".
- Correção mínima: quando o LLM respondeu válido com `picks` vazio, devolver `[]` (publicar nada). Usar fallback só quando o LLM falhou de verdade, e nesse caso restringir a candidatos vindos de busca por categoria (`matchedBy === 'category'`).

**A5. A checagem defensiva de roteamento é tautológica.**
- Arquivos: `whatsapp/publisher.ts:126` e `pipeline/run.ts:172`.
- Evidência: o item é montado com `groupJid: niche.groupJid` e o publisher compara `item.groupJid !== item.niche.groupJid`, o mesmo objeto. Nunca dispara em produção; só o teste unitário o força. Não há comparação com o JID registrado no banco nem com os grupos reais da instância.
- Correção mínima: no publisher, reler o nicho por `key` no banco (ou do `niches.json`) e comparar o `groupJid` real. Opcional: validar na subida (uma vez por run) que cada `groupJid` aparece em `fetchGroups`.

**A6. O texto do LLM não é checado contra links, telefones e percentuais inventados.**
- Arquivo: `curator.ts:90-107` (só cupom e valores em R$).
- Evidência: uma resposta com `https://...` ou "70% OFF" passa na validação. O link de afiliado é injetado separado, mas um link do LLM iria junto na mensagem. O prompt também inclui título de produto como dado não confiável (injeção de prompt).
- Correção mínima: rejeitar `/https?:|www\.|wa\.me|\b\d{8,}\b/i` e qualquer `%` diferente do desconto real calculado; ao rejeitar, usar o template.

**A7. Falha silenciosa e sem alerta.**
- Evidência: erros de busca ML e Amazon viram `[]` com log (`ml provider.ts:99-105`), e `RunLog.status` fica `completed` mesmo com todos os nichos falhando. `NicheSummary.error` (`run.ts:184`) nunca vai para o banco, só para o console. Token ML quebrado (C4), Evolution desconectada (viram `skipped`, `publisher.ts:145`) e zero ofertas aparecem como run normal. Não há contador de falhas nem hook de alerta. Há `unhandledRejection` e `uncaughtException` sem handler.
- Correção mínima: acrescentar `errors` (JSON) e `status: 'degraded'` ao RunLog, e escrever o relatório do ops (seção abaixo).

**A8. Amazon: "degrada se a chave faltar" é falso, e o gate de confiabilidade pode rejeitar tudo.**
- Arquivos: `env.ts:14-17` (`AMZ_*` obrigatórios com `min(1)`), `SETUP.md` (promete degradar com chave ausente), `amazon/provider.ts:76-87`, `amazon/client.ts:19-29`, `score.ts:91`.
- Evidência: chave revogada degrada (classe `AmazonConfigError`, único aviso). Chave **ausente** derruba o boot, então não dá para rodar só ML. Além disso, `soldQuantity` nunca é preenchido para Amazon, e `reviewCount` vem de `CustomerReviews.*`; se a PA-API não devolver, toda oferta Amazon é rejeitada por "poucas evidências". Requer validação com resposta real (não verificado aqui).
- Correção mínima: tornar `AMZ_*` opcionais (provider vira `[]` sem eles). Para Amazon, relaxar o gate (exigir `ratingAvg`/`reviewCount` apenas se presente) e confirmar a lista `RESOURCES` com uma chamada real.

**A9. Sem forma de subir em produção.**
- Evidência: não há unit systemd, `ecosystem.config.cjs`, Dockerfile ou compose. O `package.json` tem `"postinstall": "prisma generate"` **fora de `scripts`** (`package.json:24`), então nunca roda. `"prisma.seed"` aponta para `prisma/seed.ts`, que não existe. O `.gitignore` ignora `package-lock.json`, então os installs não são reprodutíveis.
- Correção mínima: unit systemd (`ExecStart=node --env-file=.env dist/index.js schedule`, `Restart=always`, `TimeoutStopSec=1500`, `TZ=America/Sao_Paulo`), mover o `postinstall` para `scripts`, versionar o lockfile.

**A10. Sem backup do SQLite.**
- Evidência: `data/` está no `.gitignore` e não há rotina. É o único histórico de preço, que é o ativo do score honesto (leva semanas para formar).
- Correção mínima: cron diário `sqlite3 data/ofertas.db ".backup 'backups/ofertas-$(date +%F).db'"` com retenção de 14 dias, e ativar `PRAGMA journal_mode=WAL` e `busy_timeout`.

### Médios

- **M1. `pruneOlderThan` é código morto** (`pricing/history.ts:202`; o spec 006 pedia script npm). Também mortos: `getItems` (ML e Amazon), `curateAll`, `getAllNiches` só no CLI, `resetAmazonConfigWarningForNewRound` nunca chamado (`amazon/provider.ts:106`), então com `schedule` o aviso de Amazon revogada sai uma vez por processo e depois fica mudo. `WHATSAPP_GROUP_JID` é obrigatório no `env.ts:40` e não é usado em lugar nenhum. O log de eventos do Prisma é configurado sem listener (`db/client.ts:16-31`).
- **M2. O preço atual entra no próprio histórico antes do cálculo da mediana** (`run.ts:80-86`: `upsertOfferSnapshot` antes de `getPriceStatsBatch`), o que dilui quedas reais; e produto visto pela primeira vez é sempre rejeitado (preço = mediana). O comportamento é conservador e aceitável, mas não está documentado.
- **M3. O caminho de fallback do score** (menos de 7 dias distintos) usa o desconto anunciado, que é "de" do vendedor, com teto 60. Com limiares de nicho de 48 a 58, um desconto anunciado de 50-60% já aprova. Exige preço abaixo da mediana própria, o que mitiga, mas o `original_price` do ML é controlado pelo vendedor.
- **M4. Risco de mensagem duplicada** (`whatsapp/evolution.ts:31-61`, `publisher.ts:219-232`). O envio é refeito em timeout ou erro de rede, que pode ocorrer depois de o Evolution ter aceitado; o `sendImage` com falha cai no `sendText`. Além disso, se `extractMessageId` falhar depois de um envio real, a Publication vira `failed`, não conta no orçamento nem no cooldown, e a oferta pode sair de novo.
- **M5. Cross-post é checado na filtragem, não no envio.** Nichos no mesmo slot passariam o mesmo produto antes de qualquer `sent` ser gravado. Com 1 nicho por slot hoje não ocorre. Publicações `pending` órfãs após crash não contam em lugar nenhum.
- **M6. Horários fixos todos os dias** (`0 8/9/11/14/17 * * *`). Mensagens exatamente no minuto 0 são um padrão detectável. Adicionar jitter aleatório de 0-12 min.
- **M7. Shutdown** (`scheduler.ts:106-122`): espera a run em curso, que pode durar até ~20 min (17 mensagens x até 70 s). O systemd padrão mata aos 90 s no meio de um envio. `process.once` ignora o segundo SIGINT.
- **M8. `RunLog.instance` usa só a instância do 1º nicho** (`run.ts:245`) e `RunLog.error` não recebe erros por nicho.
- **M9. O ML não é rastreado por qualidade de campo**: `ratingAvg` e `reviewCount` nunca são preenchidos para ML, então o bônus de avaliação nunca vale e só `soldQuantity >= 5` libera o gate de confiabilidade.

### Baixos

- **B1.** `@types/node-cron@3.0.11` está desatualizado em relação ao node-cron 4 (que traz tipos próprios). `engines` diz Node 20 e o host usa 24.
- **B2.** Logs só em stdout, sem arquivo nem rotação. Com `NODE_ENV=development` no `.env` o pino usa `pino-pretty` mesmo em "produção" (`logger.ts:4,40`); o `db/client.ts` também ramifica por `NODE_ENV`. Redação cobre bem os campos comuns, mas só um nível (`*.token`).
- **B3.** Thumbnails do ML são de baixa resolução (`mercadolivre/provider.ts:44`).
- **B4.** O README não explica como levantar `categoryIds`/`browseNodeIds` (spec 003) nem o passo a passo de produção (spec 009, Should Have). O SETUP afirma "implementado, testado e commitado" e "degrada sozinho se a chave Amazon estiver ausente", o que não procede (A8). `SETUP.md` está fora do git. O `DATABASE_URL` default do `env.ts` (`file:./data/ofertas.db`) diverge do `.env` (`file:../data/ofertas.db`, relativo a `prisma/`).
- **B5.** `config/niches.json` (5 nichos, todos `enabled`, 1 slot cada) valida; os JIDs terminam em `@g.us` e são 5 únicos. **Mas têm o padrão do JID falso de exemplo** (SETUP fase 4: ainda não foram trocados por JIDs reais). O `schema.ts` aceita qualquer `@g.us` numérico, então o falso passa na validação.

## Lacunas das specs (INDEX marca tudo como `done`; as caixas das specs seguem `[ ]`)

| Spec | Estado | Lacunas |
|---|---|---|
| 001 fundação | Parcial | `.env` não carregado fora do Prisma (C2); `.env.example` sem `NICHES_FILE` |
| 002 dados | Quase completa | Log do Prisma sem listener (M1); `postinstall` fora de `scripts` (A9) |
| 003 nichos | Parcial | Keywords misturadas (A2); README sem guia de IDs de categoria; `cronSlots` do spec original eram horários simples, o código usa cron de 5 campos |
| 004 ML | Parcial | Rotação do token não persistida (C4); `price_asc` (A3); formato `matt_tool` do link não verificado (o próprio código avisa) |
| 005 Amazon | Parcial | Reset do aviso por rodada nunca chamado (M1); gate de confiabilidade e `RESOURCES` não validados (A8) |
| 006 score | Quase completa | `pruneOlderThan` sem script npm (M1); M2 e M3 |
| 007 curadoria | Parcial | Veto do LLM anulado (A4); validação sem URL e percentual (A6) |
| 008 publicação | Parcial | Roteamento defensivo tautológico (A5); README sem aviso de ban e chip dedicado (está no SETUP e no CLAUDE.md) |
| 009 pipeline | Parcial | `nichesDueAt` (A1); `stats` existe e está ok; Should Have de README e Nice to Have (`--store`, Docker) ausentes; `RunLog` fecha sempre, mas sem erros por nicho (A7) |

## Formato mínimo proposto para `<afiliados>/.claude/ops-reports/`

O agente `ops` só tem Read, Grep, Glob e não consegue consultar o SQLite, então o bot precisa escrever relatórios em arquivo. Proposta: um arquivo por dia, `YYYY-MM-DD.jsonl` (America/Sao_Paulo), uma linha JSON por `runSlot`, mais `latest.json` com a última linha. Sem segredos, sem JIDs, sem texto de mensagem.

```json
{"ts":"2026-11-21T08:00:03-03:00","runLogId":"...","slot":"0 8 * * *","dryRun":false,
 "status":"ok|degraded|failed","durationMs":184000,
 "niches":[{"key":"tecnologia","seen":42,"candidates":5,"curated":3,"sent":3,"skipped":0,"failed":0,
   "curationSource":"llm|fallback","error":null,
   "providers":{"ML":{"ok":true,"queries":6,"failedQueries":0},"AMZ":{"ok":false,"reason":"AmazonConfigError"}}}],
 "budget":{"usedLast24h":12,"max":20},
 "alerts":["ml_auth_failed","evolution_disconnected","zero_offers","amazon_degraded","budget_exhausted"]}
```

Regras: `status: degraded` quando algum provider falhou, o LLM caiu no fallback, ou `seen == 0` em algum nicho com busca configurada; `failed` quando o RunLog fecha em erro ou há `failed` de envio; o arquivo é apêndice atômico (`appendFile` de linha única); retenção de 30 dias; `alerts` usa um conjunto fechado de códigos, para o `ops` fazer grep por código. Alerta ativo opcional depois: `OPS_WEBHOOK_URL` (POST do `latest.json`) e nunca o próprio número do bot.

## Melhorias recomendadas (ordem de execução e esforço)

1. **C1** engine do Prisma neste host: 0,5 h.
2. **C2** carregar `.env` no `env.ts`: 0,25 h.
3. **C3** isolar o banco de teste (vitest config + guarda): 1 h. Fazer antes de qualquer `npm test`.
4. **C4** persistir o refresh token do ML: 1,5 h.
5. **A1** passar o slot do cron para `runSlot` (remove o casamento por hora): 1,5 h.
6. **A9** unit systemd, `postinstall` em `scripts`, lockfile no git: 1,5 h.
7. **A7** relatório `ops-reports`, `RunLog` com erros e status `degraded`, handlers de `unhandledRejection`: 3 h.
8. **A2** keywords separadas por loja: 2 h.
9. **A4** respeitar o veto do LLM e restringir o fallback: 1 h.
10. **A6** validar URL e percentual no texto do LLM: 1 h.
11. **A5** roteamento defensivo real (reler o nicho no banco, opcional `fetchGroups`): 1,5 h.
12. **A8** `AMZ_*` opcionais e gate da Amazon, mais validação real da PA-API: 2 h.
13. **A3** ordenação do ML e dry-run de calibração: 2 h.
14. **A10** backup diário do SQLite com WAL e `busy_timeout`: 1 h.
15. **M4** reduzir risco de duplicata (não refazer envio em timeout, tratar falha de `messageId` como `sent`): 2 h.
16. **M6, M7** jitter no cron e `TimeoutStopSec` alto (ou parar e retomar com segurança): 1 h.
17. Atualização de dependências (undici 6+, zod 4) e limpeza de código morto (M1, B1): 2 h.
18. Trocar os JIDs falsos pelos reais (`groups` + `niches:sync`), credenciais reais, README de produção: 2 h manual.

Depois do item 7: rodar `run --dry-run` diário por 7 a 14 dias (histórico), ver `ops-reports`, só então primeiro envio real em um grupo de teste com `WA_MAX_PER_DAY=1`. Chip dedicado e aquecido continua pré-requisito.
