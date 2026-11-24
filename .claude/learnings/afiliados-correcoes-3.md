# afiliados — correções 3 (A9 systemd, A10 backup, health de boot)

## O que mudou
- `deploy/oferta-bot.service` (unit de usuário, `node dist/index.js schedule`, `EnvironmentFile=.env`, `TZ=America/Sao_Paulo`, `Restart=on-failure` com `RestartSec=30` e limite de 5 falhas/10 min, `TimeoutStopSec=900` para o SIGTERM esperar o slot, hardening NoNewPrivileges/PrivateTmp/ProtectSystem=strict com ReadWritePaths em `data/` e `.claude/ops-reports`). Sem segredos.
- Backup: `src/ops/backup.ts` + `backup-cli.ts`, `npm run db:backup`. API de backup do `node:sqlite` (Node 24; carregado via `createRequire`, pois `@types/node` 20 não tem typings), origem aberta read-only, cópia em `.partial`, `journal_mode=DELETE` (arquivo único), `PRAGMA integrity_check`, 0600, renomeia, mantém os 14 últimos (`data/backups/ofertas-YYYYMMDD-HHMMSS.db`, ignorado pelo git via `data/`). Se o integrity falha, descarta a cópia. CLI não importa `env.ts` (não exige segredos); usa `DATABASE_URL`.
- Timer opcional: `deploy/oferta-bot-backup.service` + `.timer` (04:00 SP, Persistent).
- Boot: `src/ops/startup.ts` (`logStartup`) chamado em `scheduler.ts`: loga DRY_RUN, ML_LINK_MODE, nº de nichos, `ML_AFFILIATE_TOOL_ID` só como booleano, basename do banco, próximos 3 slots (`getNextRun` do node-cron); alerta se DRY_RUN=false; evento `inicio` (novo tipo em `events.ts`, só chaves/contagem).
- Docs: SETUP.md (seção "Produção (systemd)" + backup), README.md.

## Verificação
`typecheck`, `build`, `npm test` (21 arquivos, 164/164, com guard; testes novos de backup usam só tmp). Smoke manual do backup numa cópia do banco em /tmp (`DATABASE_URL` override): ok, perms 0600. `systemd-analyze verify --user` sem erros nas units. Nada instalado/habilitado; `~/.config/systemd` intocado; `data/ofertas.db` não foi aberto pelos testes.

## Como o dono instala
Seguir SETUP.md "Produção (systemd)": `npm run build`; ajustar `WorkingDirectory`/`EnvironmentFile`/`ReadWritePaths` e o caminho do `node` nas units; copiar `deploy/oferta-bot*.{service,timer}` para `~/.config/systemd/user/`; `systemctl --user daemon-reload && systemctl --user enable --now oferta-bot.service`; `loginctl enable-linger $USER`; logs com `journalctl --user -u oferta-bot -f`. Backup: `enable --now oferta-bot-backup.timer`.

## Ainda aberto
- A9: `postinstall` fora de `scripts` e lockfile no `.gitignore` não foram alterados (mudam o comportamento do install; decisão do dono). WAL/`busy_timeout` do A10 não ativados no app.
- `engines.node` segue `>=20`, mas o backup exige Node >= 23.8.
