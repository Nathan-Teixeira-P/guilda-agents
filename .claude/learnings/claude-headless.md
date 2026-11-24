# Claude Code headless (spike 001)

Testado em 2026-11-21 com `claude` 2.1.330, login por assinatura (OAuth, `authMethod: claude.ai`). Reproduzir: `bash spikes/headless.sh` (projeto temporário, não toca `~/.claude`). Gasto total do spike: cerca de US$ 0,05.

Comando base: `claude -p "<prompt>" --agent <nome> --output-format stream-json --verbose --max-budget-usd 0.10 </dev/null`
- `--verbose` é obrigatório para `stream-json` em `-p`.
- Redirecionar stdin (`</dev/null`), senão o CLI espera 3 s por stdin.
- Há um aviso no stderr de que o login por assinatura expira (data em `credential_expires_at` / `claude auth status`). Para execução não assistida usar `claude setup-token`.

## Resultados

| Item | Resultado |
|---|---|
| (a) `--agent` carrega agente | CONFIRMADO para `<projeto>/.claude/agents/x.md` (cwd no projeto). `~/.claude/agents` NÃO TESTADO (proibido escrever lá); o spec 005 deve validar ao instalar. O `init` mostra `agent_type`. |
| (b) custo/tokens e eventos de subagente | CONFIRMADO, com ressalvas (seção abaixo). |
| (c) `--resume <id>` | CONFIRMADO. `--session-id <uuid>` fixa o id; `--resume <id>` mantém o mesmo `session_id` e lembra o contexto. |
| (d) teto de orçamento | CONFIRMADO. Estoura com exit code 1 e `result` com `subtype: "error_max_budget_usd"`, `is_error: true`, `terminal_reason: "budget_exhausted"`, `errors: ["Reached maximum budget ($0.0001)"]`. A checagem é feita depois do turno, então o gasto passa um pouco do teto (US$ 0,0012 contra 0,0001) e não há `rate_limit_event`. |
| (e) `--allowedTools` bloqueia Edit/Bash sem prompt | CONFIRMADO com `--permission-mode dontAsk --allowedTools Read`: Write, Bash e Edit negados, nada alterado, exit 0. Cada negação gera um evento `system/permission_denied` e entra em `result.permission_denials[]` (`tool_name`, `tool_input`). Com `default` também nega (não há quem responda), mas `dontAsk` é o explícito. |
| (f) escrita só em `.claude/` | REFUTADO pelo caminho simples; CONTORNO funciona. Ver abaixo. |
| (g) `--max-budget-usd` com OAuth | CONFIRMADO: funciona igual. `total_cost_usd` vem preenchido, mas é custo de tabela (`costBasis: "list"`), não cobrança real: serve de contabilidade, não de fatura. |
| (h) eventos de subagente e custo/tokens | CONFIRMADO. Ver abaixo. |

## (f) Escrita restrita a `.claude/`
- `.claude/` é caminho sensível: com `acceptEdits` e `dontAsk`, mesmo com `--allowedTools "Edit(.claude/**)"` (ou caminho absoluto `Edit(//abs/.claude/**)`) a escrita é negada. Exceção da regra só vale para `.claude/agents`, `commands`, `skills`.
- A regra de caminho funciona fora de `.claude/`: `--permission-mode dontAsk --allowedTools Read "Edit(docs/**)"` libera Write e Edit em `docs/` e nega o resto. A forma `Write(docs/**)` NÃO casou; usar `Edit(...)` (cobre Write).
- Contorno validado: `--permission-mode bypassPermissions --disallowedTools Bash --settings '<json com hook PreToolUse>'`, onde o hook (matcher `Write|Edit`) devolve `permissionDecision: "deny"` para qualquer `file_path` fora de `<cwd>/.claude/`. Resultado: `.claude/specs/n.md` criado, `out3.txt` e `a.txt` bloqueados. O script do hook está em `spikes/headless.sh`. O servidor deve fornecer esse hook (spec 002/009).
- `bypassPermissions` sem hook libera tudo: nunca usar sozinho.
- Default do ambiente do usuário é `permissionMode: "auto"`; sempre passar `--permission-mode` explícito.

## (b)/(h) Stream-json: o que existe
Sequência típica: `system/init` -> `assistant`... -> `rate_limit_event` -> `result`. Hooks do usuário geram `system/hook_started|hook_response` (ruído; `--bare` ou filtrar).
- `system/init`: `session_id`, `model`, `tools` (a ferramenta de subagente aparece como `Task`, nos `tool_use` como `Agent`), `permissionMode`, `agent_type`.
- Custo/tokens por turno: cada `assistant` traz `message.usage` (tokens de entrada/saída/cache) mas NENHUM custo em USD. Custo em USD só no `result`: `total_cost_usd` (cumulativo da sessão, inclui subagentes), `usage`, `modelUsage.<modelo>.costUSD` (por modelo), `num_turns`, `duration_ms`. Para custo por agente: tokens do `task_progress`/`task_notification` x tabela de preços, ou `modelUsage`.
- Subagente (Agent tool): `system/task_started` (`task_id`, `tool_use_id`, `subagent_type`, `description`, `prompt`, `is_backgrounded`, `spawn_depth`), `system/task_progress` (`usage.total_tokens`, `tool_uses`, `duration_ms`, `last_tool_name`), `system/task_updated` (`patch.status`), `system/task_notification` (`status`, `usage`, `handback_report.text`, `output_file`). Mensagens do subagente trazem `parent_tool_use_id` (= `tool_use_id` do `task_started`) e `agent_id`. Custo USD por subagente: NÃO existe, só `total_tokens`.
- `result.subagent_stats`: `spawned`, `completed`, `failed`, `by_type`, `max_depth`.
- Armadilha: o subagente rodou em segundo plano (`is_backgrounded: true`) e o stream emitiu TRÊS eventos `result` e vários `init` (o primeiro `result` disse "ainda está rodando", o segundo trouxe a resposta final, o terceiro vazio). O runner (spec 009) não pode tratar o primeiro `result` como fim: considerar o fim quando o processo sair (e o último `result` não vazio). `total_cost_usd` é igual nos três.
- Parar de bloquear em subagente exige cuidado também no teto: `subagent_stats.refused.budget` conta recusas por orçamento.

## Fonte do percentual de uso (spec 017)
EXISTE, em duas fontes oficiais, com o mesmo horário de reset:
1. stream-json, evento `rate_limit_event` (um por execução com chamada de API; não aparece no run que estourou orçamento antes de responder):
   `rate_limit_info.unifiedWindows.five_hour.{utilization,resetsAt,status}` e `...seven_day.{...}`. `utilization` é FRAÇÃO 0..1 (0,14 = 14%), `resetsAt` é epoch em SEGUNDOS, `status` `allowed`. Também `rate_limit_info.{status,rateLimitType,resetsAt,overageStatus,isUsingOverage}`. Granularidade grossa: 0,14 e depois 0,15 em chamadas seguidas.
2. JSON da statusline (só em sessão interativa; em `-p` a statusline NÃO roda): `rate_limits.five_hour.{used_percentage,resets_at}` e `rate_limits.seven_day.{...}`, `used_percentage` inteiro 0..100 (15 e 10 nos mesmos instantes em que o stream dava 0,15 e 0,10), `resets_at` epoch em segundos (mesmo valor do `resetsAt`). Outros campos do JSON: `session_id`, `cwd`, `model`, `cost.total_cost_usd`, `context_window.used_percentage`, `prompt_cache`, `agent.name`, `version`.
NÃO existem: percentual restante pronto, limite absoluto em tokens/mensagens, campo de uso fora das janelas de 5 h e semanal, e nenhum arquivo local (`~/.claude` não guarda uso; `/usage` é só slash command interativo). Outros campos: `overageStatus`/`isUsingOverage` (extra usage, `org_level_disabled` nesta conta).
Consequências: o medidor só tem dado depois de pelo menos uma chamada ao modelo. Para o spec 017, o servidor deve guardar o último `rate_limit_event` visto no stream (carimbo de hora) e mostrar "indisponível" se nunca recebeu um; para atualizar sem missão, rodar um `claude -p` mínimo (custo ~US$ 0,002) a cada N minutos é a única opção sem sessão interativa. Se a janela já reiniciou (`resetsAt` < agora), o valor guardado é inválido.

## Fixtures (`tests/fixtures/`)
Limpas (sem hooks, sem listas de slash commands/mcp, caminhos trocados por `/tmp/spike-proj` e `/home/user`):
- `stream-basic.jsonl`: init, assistant, rate_limit_event, result.
- `stream-subagent.jsonl`: subagente em segundo plano (3 `result`, `task_*`, `parent_tool_use_id`).
- `stream-budget-exceeded.jsonl`: `error_max_budget_usd`.
- `stream-permission-denied.jsonl`: `permission_denied` em `dontAsk`.

## Fase 1 com pasta de rascunho (spec 009, verificado em 2026-11-21)
Testado com `claude` 2.1.330, modelo haiku, projeto temporário. Gasto total da verificação: cerca de US$ 0,013.
- Combinação que FUNCIONA, sem `bypassPermissions`: `--permission-mode dontAsk --add-dir <staging> --allowedTools Read Glob Grep "Edit(/<staging>/**)" --disallowedTools Bash "Edit(/<projeto>/.claude/**)"`, onde `<staging>` = `missions/<id>/out` (caminho absoluto).
- Armadilha: caminho absoluto em regra precisa de DUAS barras iniciais (`Edit(//tmp/x/out/**)`, ou seja `"/" + caminhoAbsoluto`). Com `Edit(/tmp/x/out/**)` (uma barra) a regra é relativa ao projeto e NÃO casa: o Write no staging foi negado.
- Resultado (4 ações pedidas ao modelo, sem prompt interativo, exit 0): (1) Write em `missions/m1/out/ok.md` PERMITIDO (arquivo criado); (2) Write em `<projeto>/.claude/specs/x.md` NEGADO; (3) Write em `<projeto>/docs/y.md` NEGADO; (4) Bash NEGADO/desabilitado (`z.txt` não criado). `result.permission_denials` lista os dois Write negados; Bash com `--disallowedTools` não gera `permission_denied` (a ferramenta some da lista).
- Funciona também com o staging FORA do cwd do projeto (`--add-dir` cobre); é o layout do runner (`missionsDir` separado do projeto).
- O servidor move os artefatos do staging para `<projeto>/.claude/` depois do portão; a fase 1 nunca escreve lá.
- Fase 2 (`--resume`): `Edit(//<projeto>/**)` + `Bash(<comando de teste>:*)` por lista do projeto; negados `Bash(git commit|git push|gh|curl|wget|ssh|scp:*)` e `WebFetch`. NÃO verificada com o `claude` real (só por teste unitário dos argumentos).
- Em `-p`, `--allowedTools`/`--disallowedTools` aceitam vários valores (variádicos); o prompt vai antes deles.
- Assistant com vários blocos repete o mesmo `message.id` e o mesmo `usage`: deduplicar por id ao somar tokens. `task_notification` traz `task_id` (= `agent_id` das mensagens do subagente), não `agent_id`.
