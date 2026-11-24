# Integração com o ClickUp

O agente `intake` lê uma tarefa do ClickUp e grava `missions/<id>/briefing.md`. O laboratório **nunca escreve no ClickUp** (sem comentar, sem mudar status).

## Instalar o MCP (passo manual)
O MCP do ClickUp exige autenticação e não vem instalado. Siga a documentação oficial do MCP do ClickUp e registre-o com `claude mcp add ...`, usando os parâmetros que a documentação oficial indicar (não copie flags ou URLs de outras fontes). Depois confirme com `claude mcp list` que ele aparece e está autenticado.

## O que é lido
Somente leitura: título e descrição da tarefa, comentários, anexos e links. Viram objetivo, critérios de aceite, anexos e links do briefing; o link original fica em `clickupUrl`.

## Sem MCP ou link inválido
Na tela Nova missão, o campo Demanda aceita o link (`https://app.clickup.com/...`) ou texto livre. Sem o MCP, ou com link inválido, o fluxo trata o conteúdo como texto colado, sem erro: cole o texto da tarefa.

## Lista do ClickUp
A lista `https://app.clickup.com/9013181230/v/l/6-1400460000013508-1` pertence a um projeto ainda a escolher. Quando definido, vai no campo `clickupListUrl` do registro de projetos.
