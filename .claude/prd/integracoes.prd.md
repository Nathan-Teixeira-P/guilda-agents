# PRD — Integrações (ClickUp e modelo local)

## Problem Statement

As demandas chegam como tarefas do ClickUp com instruções detalhadas; copiar e colar é lento e perde estrutura. Além disso, tarefas mecânicas (resumir logs, compactar saída de testes) consomem tokens de modelos caros sem ganho de qualidade.

## Solution

1. **Intake do ClickUp**: o usuário cola o link da tarefa na interface; um agente `intake` lê a tarefa e produz um briefing curto e estruturado que os demais agentes recebem.
2. **Ponte para modelo local (Ollama)**: um helper opcional executa apenas tarefas mecânicas e verificáveis em modelo local, com checagem barata do resultado e fallback automático para o Claude.

## User Stories

1. Como usuário, quero colar o link de uma tarefa do ClickUp, para iniciar a missão sem copiar texto.
2. Como usuário, quero que o briefing traga objetivo, critérios de aceite, anexos e links, para o planner trabalhar sem voltar ao ClickUp.
3. Como usuário, quero que o laboratório nunca escreva no ClickUp sem eu pedir, para evitar mudanças indesejadas.
4. Como usuário, quero colar o texto da tarefa quando o ClickUp estiver indisponível, para não ficar bloqueado.
5. Como usuário, quero que o briefing preserve o link original, para rastreabilidade.
6. Como usuário, quero que logs e saídas de testes longos sejam compactados por modelo local, para gastar menos tokens.
7. Como usuário, quero que o modelo local nunca escreva código, specs, revisões ou texto final, para a qualidade não cair.
8. Como usuário, quero que a saída do modelo local seja validada e refeita no Claude se falhar, para nunca receber lixo.
9. Como usuário, quero ligar e desligar o modelo local por configuração, para só ativar depois de ver o primeiro ciclo funcionando.
10. Como usuário, quero ver na missão quantas tarefas foram para o local e quanto foi economizado (estimado), para avaliar se vale a pena.
11. Como usuário, quero que o helper respeite o limite de RAM da máquina, para o sistema não travar.
12. Como usuário, quero que se o Ollama estiver fora do ar o fluxo siga com Claude, sem erro.

## Implementation Decisions

- **ClickUp**: usar o MCP do ClickUp apenas para leitura (tarefa, descrição, comentários, anexos). Instalação do MCP é um passo manual do usuário (exige autenticação) documentado no spec. Sem MCP, o fallback é texto colado.
- **Agente `intake`** (haiku): lê a tarefa e grava `missions/<id>/briefing.md` com formato fixo; nenhum outro agente acessa o ClickUp.
- **Ponte local**: módulo puro `localTasks` com lista fechada de tarefas permitidas (compactar log de testes, listar arquivos relevantes por grep, rascunho de mensagem de commit, extrair campos do briefing). Tarefa fora da lista nunca vai ao local.
- **Modelos disponíveis** (já instalados): qwen2.5:7b, qwen2.5:3b, qwen2.5:1.5b, qwen3.5:2b. Máquina com 18 GB de RAM e sem GPU: usar 7b só quando necessário e um modelo por vez; preferir 3b/1.5b para tarefas simples.
- **Validação**: cada tarefa local tem um verificador barato (formato válido, caminhos citados existem, tamanho máximo, termos obrigatórios presentes). Falhou: refaz no Claude (haiku) e conta como fallback.
- **Desligado por padrão** (`local.enabled: false`) até o usuário ativar.
- **Contabilidade** de tarefas locais e fallbacks na `mission.json`.
- Chamada ao Ollama via HTTP local (`127.0.0.1:11434`) com timeout; sem dependências novas.

## Testing Decisions

- Testar a lista fechada de tarefas (tarefa não permitida é recusada), cada verificador (aceita/recusa) e o fallback (Ollama fora do ar, timeout, saída inválida).
- Ollama substituído por servidor HTTP falso nos testes; sem rede real e sem modelo.
- O intake é validado por fixture de tarefa do ClickUp em JSON, conferindo o formato do briefing.

## Out of Scope

- Escrever no ClickUp (comentar, mudar status).
- Modelos remotos baratos como alternativa ao Ollama.
- Fine-tuning ou treinamento.
- Economia relevante com os modelos locais atuais é uma hipótese a medir; não é promessa.

## Further Notes

- Os modelos pequenos disponíveis limitam o ganho a resumos de log e saída de teste.
- Depende do PRD `core-agentes` (missões, handoff) e se integra ao `salao-da-guilda` (campo de link, contadores).
