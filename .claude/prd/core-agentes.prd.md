# PRD — Núcleo de agentes (core-agentes)

## Problem Statement

Hoje cada demanda (código no trabalho, pesquisa para artigos, operação do projeto afiliados) é feita numa sessão única e longa do Claude Code: o contexto cresce, um modelo caro faz até tarefas mecânicas, não há plano aprovado antes de gastar tokens com implementação, e nada impede que agentes entrem em loop. Não existe visão de quanto cada etapa custou.

## Solution

Um laboratório de 22 agentes pequenos e especializados, globais (valem em qualquer projeto), coordenados por um **orquestrador** que roda como sessão principal headless. Fluxo em duas fases com portão de aprovação do usuário:

1. **Arquitetura** (somente leitura de código): intake → explorer → planner (+ frontend-architect) → prd-writer → spec-writer → spec-checker. Entrega um pacote para o usuário ler.
2. **Execução** (só após o selo do usuário): spec-runner → explorer → coder / frontend-builder → tester → reviewer.

O custo é contido por desenho: tabela fixa ação→modelo, contexto curto por agente, caminho curto para tarefas triviais, limite de voltas, teto de gasto por missão, notas persistentes por agente e comunicação por arquivos de handoff.

## User Stories

1. Como usuário, quero descrever uma demanda em texto, para que o laboratório planeje antes de executar.
2. Como usuário, quero receber um pacote (plano, design, PRD, specs) para ler e aprovar, para que nada seja implementado sem meu aval.
3. Como usuário, quero pedir ajustes no pacote com um comentário, para que a fase 1 recomece com meu feedback.
4. Como usuário, quero que a execução só comece após aprovação explícita, para ter controle de custo e de escopo.
5. Como usuário, quero que tarefas triviais (correção de uma linha) pulem PRD e spec, para não pagar o overhead do pipeline.
6. Como usuário, quero um teto de uso do plano por missão (em pontos percentuais da janela de 5 horas), para que nenhuma missão esgote meu limite do Claude Pro.
7. Como usuário, quero que o orquestrador pare e me pergunte após 2 voltas de retrabalho entre coder/tester/reviewer, para evitar loops caros.
8. Como orquestrador, quero uma tabela ação→modelo, para não gastar tokens decidindo o modelo caso a caso.
9. Como orquestrador, quero escalar o modelo quando um passo falha duas vezes, para resolver sem intervenção.
10. Como agente, quero ler apenas os arquivos de que preciso e receber caminhos em vez de conteúdo, para manter o contexto curto.
11. Como agente, quero devolver STATUS/RESUMO/ARQUIVOS/PRÓXIMO em até 10 linhas, para que o orquestrador acumule pouco contexto.
12. Como agente, quero registrar objeções no handoff, para que o orquestrador arbitre desacordos entre agentes.
13. Como agente, quero notas persistentes por projeto, para não reexplicar o contexto a cada sessão.
14. Como usuário, quero agentes de leitura (explorer, ops, reviewer) estritamente somente leitura, para segurança.
15. Como usuário, quero que commit, push, publicação e envio de mensagens nunca aconteçam sem eu pedir, para evitar ações irreversíveis.
16. Como usuário, quero um registro de projetos (`projects.yaml`), para que o orquestrador saiba onde rodar cada demanda.
17. Como usuário, quero agentes de frontend que fujam do padrão de brevidade, para ter ideias fortes na arquitetura e acabamento alto na execução.
18. Como usuário, quero que o `frontend-builder` valide a interface no navegador (screenshot desktop/mobile, console), para não receber UI quebrada.
19. Como usuário, quero um agente `ops` para o projeto afiliados, para acompanhar falhas sem rodar tudo à mão.
20. Como usuário, quero learnings salvos em `<projeto>/.claude/learnings/`, para o conhecimento ficar no projeto.

## Implementation Decisions

- **Agentes globais** vivem neste repo (fonte da verdade) e são ligados por symlink em `~/.claude/agents`. Cada agente lê o `CLAUDE.md` e o `.claude/` do projeto onde atua.
- **Orquestrador é a sessão principal** (`claude --agent orchestrator`), porque subagentes não criam subagentes. Os demais 21 são subagentes.
- **Comunicação entre agentes** por arquivos de handoff na pasta da missão; o orquestrador media. Objeção é um registro no handoff; o orquestrador decide ou pergunta ao usuário se for decisão de produto.
- **Modelos**: opus só em `planner` e `frontend-architect`; sonnet em código, review, PRD, spec, pesquisa, escrita, `frontend-builder`; haiku em leitura, checagem, resumo. Tabela única em `routing.md`; nenhum agente sobe ou desce de modelo sozinho; escalada só pelo orquestrador após 2 falhas.
- **Padrão de resposta** de até 10 linhas (STATUS/RESUMO/ARQUIVOS/PRÓXIMO); detalhes vão para arquivo. Exceção: `frontend-architect` e `frontend-builder`.
- **Ferramentas mínimas por agente** no frontmatter; leitores sem Write/Edit/Bash de escrita.
- **Missão** é a unidade de trabalho: id, projeto, estágio (`intake`, `planejando`, `aguardando-aprovacao`, `executando`, `concluida`, `parada`), sessão, custo acumulado, voltas por passo. Estado em `missions/<id>/mission.json` no hub; artefatos (PRD, specs, design, handoff) no `.claude/` do projeto alvo.
- **Portão de aprovação falha fechado**: sem o arquivo `approved` (ausente, malformado, ambíguo, timeout), a fase 2 não inicia.
- **Fase 1 é somente leitura de código**: os agentes escrevem só numa pasta de rascunho da missão (`missions/<id>/out/`), nunca no projeto; sem Bash. O servidor valida e move os artefatos (PRD, specs, design, handoff) para `<projeto>/.claude/` ao fim da fase 1 (decisão do usuário, motivo: `.claude/` é caminho sensível no Claude Code e o contorno exigiria `bypassPermissions`).
- **Disjuntor**: no máximo 2 voltas de retrabalho por spec; no máximo 8 trocas encadeadas de handoff sem intervenção do usuário; ao estourar, a missão vai para `parada` e pergunta ao usuário. Inspirado no disjuntor do repositório agents-office (HOP_LIMIT 8), aplicado a missões.
- **Orçamento é o uso do plano, não dólar.** O laboratório roda só na conta Claude Pro do usuário (login por assinatura, sem API key). O dólar do stream é custo de tabela, apenas informativo. O limite real são as janelas de 5 horas e semanal, lidas do `rate_limit_event` (spike 001). Regras: não iniciar missão se a janela de 5 horas já passou de um limiar; cada missão tem um teto em pontos percentuais da janela que pode consumir; ao chegar nele (ou perto do fim da janela) a missão pausa e avisa; o `--max-budget-usd` fica só como rede de segurança. Priorizar sonnet/haiku, opus raramente, e pouco paralelismo, porque subagentes em paralelo queimam a janela mais rápido.
- **Caminho curto**: o orquestrador classifica a demanda (trivial/média/grande) por critérios fixos (arquivos tocados estimados, presença de UI, ambiguidade); trivial vai direto ao `coder` + `tester`.
- **Notas por agente e projeto** em `<projeto>/.claude/agent-notes/<agente>.md`, injetadas no início da tarefa, limitadas a poucos KB; o agente só acrescenta fatos não deriváveis do código.
- **Validar antes de confiar**: o primeiro spec é um spike que confirma os flags do Claude Code necessários (`--agent`, `--output-format stream-json`, `--resume`, `--max-budget-usd`, `--permission-mode`, `--allowedTools`) em modo `-p`.
- Roster: orchestrator, intake, planner, frontend-architect, prd-writer, spec-writer, spec-checker, explorer, coder, frontend-builder, reviewer, tester, debugger, researcher, fact-checker, writer, editor, ops, deal-auditor, scribe, illustrator, refactorer, security-reviewer (22 arquivos; o roteamento é feito pelo próprio orquestrador).

## Testing Decisions

- Um bom teste verifica comportamento externo (arquivos produzidos, estágio da missão, exit codes), nunca o texto exato dos prompts.
- Lógica pura (classificador de tamanho, máquina de estados da missão, disjuntor, tabela de roteamento) fica em módulos sem I/O, com relógio injetado, testados com vitest.
- Validador de agentes: script que confere cada `agents/*.md` (frontmatter válido, `model` na tabela, ferramentas mínimas, leitores sem escrita, linha do padrão presente).
- O portão testa o caminho fail-closed: ausente, vazio, malformado → nega.
- Prior art: os testes `*Logic` e de aprovação fail-closed do repositório agents-office como referência de estilo.

## Out of Scope

- Interface gráfica (PRD `salao-da-guilda`).
- ClickUp e modelo local (PRD `integracoes`).
- Memória compartilhada entre projetos, banco de dados, SDK próprio de orquestração.
- Agente de envio de mensagens (o envio do afiliados continua no próprio projeto).

## Further Notes

- Projeto `afiliados` (`/home/nathan/Projetos/pessoal/afiliados`) já roda com cron e Evolution API (WhatsApp não oficial, risco de banimento); o laboratório só opera e audita.
- Agentes são em português e em formato markdown; `CLAUDE.md` do hub em inglês.
