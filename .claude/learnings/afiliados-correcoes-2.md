# afiliados: correções 2 (link de afiliado ML + feed de eventos)

Repo `/home/nathan/Projetos/pessoal/afiliados`. Sem commit, sem WhatsApp/ML/Evolution ao vivo, DRY_RUN intacto, `.env` e `config/niches.json` intocados, `data/ofertas.db` não usado nos testes.

## O que mudou
- **Link de afiliado (só ML)**: `src/affiliate/ml-links.ts` (+ `guard.ts`, `src/links-cli.ts`). Estado em JSON `data/affiliate-links.json` (`AFFILIATE_LINKS_FILE`, 0600, escrita atômica, sem mudança no schema Prisma): `links` (URL canônica -> link curto, source, createdAt), `pending` (fila `aguardando-link`), `lastExport`.
- `affiliateUrl()` do ML: link curto salvo -> senão URL canônica `?matt_word=<etiqueta>&matt_tool=<id>` se `ML_LINK_MODE` for `constructed|auto` -> senão lança `LinkPendingError` (manual-only, padrão). O pipeline registra a oferta em `pending`, não publica e conta `awaitingLink`.
- URL canônica: remove toda query/hash (reco_*, da_*, c_*, id_origin etc.) e mantém o caminho `/p/MLB…`; só hosts mercadolivre/mercadolibre.
- Link curto validado por regex estrita `^https://meli\.la/[A-Za-z0-9_-]{3,40}$` (rejeita http, meli.la.evil.com, javascript:, query).
- Env novo: `ML_AFFILIATE_TOOL_ID` (numérico, obrigatório só em constructed/auto), `ML_LINK_MODE`, `AFFILIATE_LINKS_FILE`, `OPS_REPORTS_DIR`. `.env.example` com placeholders. `matt_tool` agora recebe o ID numérico, `matt_word` a etiqueta.
- Guard final em `publish()`: a única URL da mensagem tem de ser o link e igual ao valor salvo/construído; senão `skipped` ("link guard"). Cobre também URL escrita pelo LLM no corpo. A curadoria continua sem ver o link.
- CLI: `npm run links -- export [arquivo] | import <arquivo> | list | pending`. Import aceita `url<TAB>link` (qualquer ordem) ou só links na ordem do último export (quantidade tem de bater, senão rejeita tudo). Nunca imprime etiqueta/ID.
- **Feed de eventos**: `src/ops/events.ts`. `events.jsonl` em `.claude/ops-reports/` (gitignored, rotaciona em ~1 MB para `.1`), tipos run-inicio/run-fim/erro/orcamento/oferta-publicada/oferta-pulada/aguardando-link; só chave de nicho, contagem e mensagem curta sanitizada (URLs, JIDs, números longos e valores de segredos removidos). Falha de escrita nunca quebra a run. Resumo diário `ops-YYYY-MM-DD.md` (frontmatter data/nichos/status/achados, dia em America/Sao_Paulo) reescrito ao fim de cada run a partir dos eventos do dia. Emitido em `pipeline/run.ts` e `scheduler.ts` (slot descartado, run que lança). Orçamento: evento ao cruzar 80% de `WA_MAX_PER_DAY`.
- Testes: vitest passa a apontar `AFFILIATE_LINKS_FILE` e `OPS_REPORTS_DIR` para o tmp (guard aborta se não).
- Docs: README (en), SETUP (pt-BR), CLAUDE.md (en).

## Verificação
`npm run typecheck`, `npm run build`, `npm test`: 19 arquivos, 161/161 (antes 144). Testes novos: strip de params, rejeição de hosts parecidos, manual-only, auto/constructed, import tolerante, guard (publisher), pending no pipeline, eventos/sanitização/rotação/falha de escrita/resumo.

## O que o dono precisa fazer
1. Definir `ML_AFFILIATE_TOOL_ID` no `.env` (número do `matt_tool` do "link completo") para poder testar constructed.
2. Fluxo padrão (manual-only): rodar o bot, `npm run links -- export`, colar o arquivo no gerador do ML (uma URL por linha), salvar os links curtos na mesma ordem, `npm run links -- import <arquivo>`. Até importar, nada é publicado (fica `aguardando-link`).
3. Testar atribuição: abrir uma URL `<produto>?matt_word=<etiqueta>&matt_tool=<id>` e ver o clique na Central de afiliados; se contar, `ML_LINK_MODE=auto`.
4. Fazer backup de `data/affiliate-links.json` junto com o SQLite.

## Limitações
- Ofertas aguardando link consomem a cota da run (curadas e descartadas). Amazon sem link próprio ainda (guard só checa a URL única na mensagem).
- `mkdirSync(recursive)` em `/proc` trava: não usar `/proc` em teste.
