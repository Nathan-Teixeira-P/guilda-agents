# Teste real da fase 1 (spec 021)

Reproduzir: `bash spikes/e2e-fase1.sh` (ou `node spikes/e2e-fase1.ts`). Projeto e missões temporários ficam no scratchpad (`e2e-proj`, `e2e-missions`); não toca o hub nem `~/.claude`. Cada execução gasta janela do Claude Pro: o script faz um sonda haiku antes (~US$ 0,002) para ler o `rate_limit_event`.

Demanda: "Adicionar uma CLI que converte temperaturas entre Celsius e Fahrenheit, com testes e README" (média). `claude` 2.1.330, `--agent orchestrator`, teto `--max-budget-usd` 2.00.

## Execução 1 (única)
- Resultado: PASS. Estágio final `aguardando-aprovacao`, sem parada, sem negações de permissão.
- Staging `missions/<id>/out/`: `handoff/map.md`, `handoff/plan.md`, `prd/temp-conv.prd.md`, `specs/001-cli-core.spec.md`, `specs/002-tests-readme.spec.md`, `specs/INDEX.md`. Frontmatter (8 chaves) e 8 seções presentes nos 2 specs (conferido pelo script). O orquestrador relatou que o spec-checker deu ok sem retrabalho.
- `promoteDraft` levou os 6 arquivos para `.claude/` do projeto temporário.
- Consumo do plano: janela de 5 h 39% -> 46% (+7 pontos percentuais); semanal 14% -> 14% (granularidade grossa). Custo de tabela: US$ 0,4145 (sonnet 0,303; opus/planner 0,106; haiku 0,005).
- Tokens por agente (5 subagentes + principal ~220k): o contexto do orquestrador domina o gasto.

## Problemas e ajustes
- `explorer` não tem a ferramenta Write, mas o `explorer.md` mandava gravar o mapa. Corrigido antes da execução: o explorer devolve o mapa na resposta e o orquestrador grava `handoff/map.md` (o `prompt.ts` também diz isso). Funcionou.
- A fase 1 libera só Read/Glob/Grep/Edit(staging) em `dontAsk`; mesmo assim a ferramenta de subagente funcionou (nenhuma negação). Não foi preciso acrescentar `Agent` ao `--allowedTools`.
- O plano vai para `handoff/plan.md` porque `PROMOTE_DIRS` não tem pasta `plan`.
- A resposta final do orquestrador usa `STATUS: aguardando-aprovacao`, não `ok|falhou`; o veredito do spec-checker vem no RESUMO, em texto livre. Não é erro, mas não dá para ler máquina; o script confere a estrutura por conta própria.
- As 4 perguntas ao usuário vieram resolvidas com padrão assumido no PRD (bom: não bloqueou).
