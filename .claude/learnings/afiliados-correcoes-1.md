# afiliados: correções 1 (C1-C4, A1)

Repo: `/home/nathan/Projetos/pessoal/afiliados`. Sem commit. Nenhuma chamada a ML/Amazon/Evolution; DRY_RUN nunca alterado para false. `.env` e `config/niches.json` intocados.

## O que mudou
- **C1 (Prisma/OpenSSL 3.5)**: o Prisma 5.22 detecta OpenSSL 3.x como "1.1.x". `src/db/client.ts` agora define `PRISMA_QUERY_ENGINE_LIBRARY` apontando para o engine `debian-openssl-3.0.x` já gerado (só se a variável não estiver definida e o arquivo existir). Sem upgrade de Prisma, sem novo binaryTarget. `prisma db push` já funcionava.
- **C2 (.env)**: `src/config/env.ts` começa com `import 'dotenv/config'` (dotenv já era dependência). `scheduler` e `evolution` importam sem erro; `groups`/`schedule` sobem do zero.
- **C3 (testes x banco real)**: `vitest.config.ts` + `test/{paths,guard,global-setup}.ts`. Testes usam `$TMPDIR/oferta-bot-test/test.db` (recriado via `prisma db push` a cada `npm test`), `ML_TOKEN_FILE` temporário, `DRY_RUN=true`, `fileParallelism: false`. `guard.ts` (setupFile em todo worker) aborta se `DATABASE_URL` não for o banco temporário ou contiver `ofertas.db`.
- **C4 (rotação do refresh token ML)**: `providers/mercadolivre/auth.ts` grava o token rotacionado em `ML_TOKEN_FILE` (novo env, default `data/ml-token.json`), escrita atômica (tmp + rename), modo 0600, nunca logado. É lido no boot antes de `ML_REFRESH_TOKEN`; é ignorado se o token do `.env` mudou (impressão digital sha256) ou se o arquivo estiver corrompido. Falha de escrita gera log de erro sem o valor. `.env.example` ganhou `ML_TOKEN_FILE`.
- **A1 (fuso e casamento de slot)**: `niches/registry.ts` ganhou `cronSlotMatches` (cron de 5 campos completo: listas, faixas, passos, dia do mês/mês/dia da semana) avaliado em America/Sao_Paulo via Intl, independente do TZ do host. `nichesDueAt(date, windowMinutes=0)` usa esse casamento; novo `nichesForSlot(slot)`. O scheduler agora passa o slot exato do cron: `runSlot({ slot })` roda os nichos daquele slot, sem recasar horário (VPS em UTC funciona). CLI `run` aceita `--slot="0 9 * * *"`; sem a flag usa janela de 10 min em SP.

## Arquivos
src/db/client.ts, src/config/env.ts, src/providers/mercadolivre/auth.ts (+ auth.test.ts novo), src/niches/registry.ts (+ test), src/pipeline/run.ts (+ test, mock), src/scheduler.ts (+ test), src/index.ts, .env.example, vitest.config.ts, test/*.

## Verificação
- `npm run typecheck` e `npm run build`: OK.
- `npm test`: 17 arquivos, 144/144 passam (antes: 28 falhas e risco de apagar o banco). `data/ofertas.db` intacto (mesmo tamanho).
- Guard provado: `DATABASE_URL=file:../data/ofertas.db` no `guard.ts` lança "Refusing to run tests".
- Smoke com cópia do banco em tmp e `DRY_RUN=true`: `niches`, `stats`, `run --dry-run --slot="0 3 * * *"` (nenhum nicho, logo nenhuma chamada externa) funcionam; import de scheduler/evolution carrega o `.env`. `groups` e `run` com nicho real não foram executados (chamariam a API ao vivo).
- Testes novos: rotação/persistência/0600/reuso após restart/fingerprint/corrompido; cron em SP com instantes UTC explícitos (09:00 SP = 12:00Z), listas, passos, faixas, fronteira de meia-noite UTC; scheduler com timezone SP e slot repassado.

## O que resta
- Slot atrasado pelo guard `isRunning` continua sendo descartado (spec diz "nunca enfileirar"); só o log avisa.
- `data/ml-token.json` precisa de backup junto com o SQLite (A10).
- Fora do escopo, ainda abertos: A2-A10 (keywords por loja, price_asc, veto do LLM, ops-reports, systemd/postinstall/lockfile, backup), M*, B*.
- O workaround do engine depende do arquivo `.so` 3.0.x gerado em `node_modules/.prisma/client`; rodar `npm run db:generate` após `npm install` em host novo.
