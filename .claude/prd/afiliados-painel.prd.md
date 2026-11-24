# PRD — Painel de Afiliados

## Problem Statement

O projeto afiliados já roda diariamente: pesquisa produtos por nicho no Mercado Livre e na Amazon e publica no grupo de WhatsApp de cada nicho. Mas a configuração (grupos, palavras-chave, categorias, horários) está em um arquivo JSON editado à mão, sem validação visual, sem visão dos horários ao longo do dia e sem lugar para ver a saúde da operação. O usuário vai ter vários grupos de temas diferentes e precisa distribuir os horários de forma intercalada, sem concentrar volume, porque isso aumenta o risco de banimento do WhatsApp.

## Solution

Um painel `#/afiliados` no hub, separado das missões e da Redação. A execução diária, a pesquisa por nicho e o envio continuam no repositório afiliados (fonte da verdade); o hub não reimplementa nada disso. O painel oferece:

1. **Grupos e nichos**: listar e editar os nichos, lendo e gravando a configuração de nichos do projeto afiliados.
2. **Agenda**: linha do tempo de 24 h com os horários de cada nicho e sugestão de horários intercalados, traduzidos para cron.
3. **Saúde**: último relatório do agente `ops` e auditoria do `deal-auditor`, somente leitura.
4. **Aplicar mudanças**: depois de salvar, mostra o comando que o usuário roda no afiliados e o status "pendente de sincronizar".

O hub nunca envia WhatsApp, nunca executa código do afiliados, nunca reinicia processos e nunca liga o envio real.

## User Stories

1. Como usuário, quero um item "Afiliados" no menu, para chegar à configuração sem abrir o outro repositório.
2. Como usuário, quero ver a lista de nichos com nome do grupo, estado (ligado ou desligado) e prioridade, para ter a visão geral.
3. Como usuário, quero dar a cada nicho o nome salvo do grupo como rótulo, para reconhecê-lo sem decorar identificadores.
4. Como usuário, quero informar o identificador do grupo (jid), para o afiliados saber para onde enviar.
5. Como usuário, quero que o jid apareça mascarado na tela, para não expor dado sensível em captura de tela.
6. Como usuário, quero poder revelar o jid de um nicho sob demanda ao editá-lo, para conferir o valor quando preciso.
7. Como usuário, quero editar palavras-chave por nicho, para ajustar o que se busca em cada tema.
8. Como usuário, quero editar categorias do Mercado Livre e da Amazon por nicho, para buscar nas duas plataformas separadamente.
9. Como usuário, quero editar a nota mínima da oferta (minDealScore) por nicho, para controlar a qualidade.
10. Como usuário, quero editar o máximo de ofertas por execução (maxPerRun), para controlar o volume por grupo.
11. Como usuário, quero ligar e desligar um nicho, para pausar um grupo sem apagá-lo.
12. Como usuário, quero adicionar um novo nicho, para cobrir mais um tema ou grupo.
13. Como usuário, quero remover um nicho com confirmação, para evitar perdas por engano.
14. Como usuário, quero que a edição seja validada por um espelho do schema do afiliados, para não gravar configuração que quebre a execução.
15. Como usuário, quero ver mensagens de erro claras por campo, para corrigir rápido.
16. Como usuário, quero que o painel falhe nos testes se o espelho divergir do schema real do afiliados, para não ficar desatualizado em silêncio.
17. Como usuário, quero que cada gravação faça backup do arquivo anterior, para poder voltar atrás.
18. Como usuário, quero que a gravação seja atômica, para nunca ficar com arquivo pela metade.
19. Como usuário, quero que o painel recuse gravar se o arquivo mudou desde que o abri (mtime e hash), para não sobrescrever edição concorrente.
20. Como usuário, quero um aviso de conflito com opção de recarregar, para resolver sem perder minhas mudanças sem querer.
21. Como usuário, quero restaurar um backup anterior pela tela, para desfazer uma configuração ruim.
22. Como usuário, quero que o painel nunca leia nem grave o arquivo de variáveis de ambiente, para proteger segredos.
23. Como usuário, quero ver uma linha do tempo de 24 h no fuso America/Sao_Paulo, para visualizar os horários de todos os nichos.
24. Como usuário, quero ver os horários de cada nicho (cronSlots) em linhas separadas, para identificar sobreposições.
25. Como usuário, quero informar as horas que desejo para cada nicho, para o painel propor os horários.
26. Como usuário, quero que o painel sugira horários intercalados entre nichos, para espalhar o volume.
27. Como usuário, quero configurar o intervalo mínimo entre envios, para ajustar o espaçamento.
28. Como usuário, quero um alerta quando muitos envios caem na mesma janela, para evitar concentração de volume.
29. Como usuário, quero ver o limite diário de envios por número (WA_MAX_PER_DAY) como informação, para dimensionar maxPerRun e horários.
30. Como usuário, quero ver o total estimado de envios por dia contra esse limite, para saber se estou perto de estourar.
31. Como usuário, quero que o painel traduza os horários escolhidos em expressões cron, para não escrevê-las à mão.
32. Como usuário, quero aceitar ou ajustar a sugestão antes de salvar, para manter o controle.
33. Como usuário, quero ver a prévia em linguagem natural de cada cron (por exemplo "todo dia às 09:30"), para conferir a tradução.
34. Como usuário, quero ver o último relatório do agente `ops`, para saber se a operação está saudável.
35. Como usuário, quero ver a auditoria mais recente do `deal-auditor`, para acompanhar a qualidade das ofertas.
36. Como usuário, quero ver a data e hora de cada relatório, para saber o quão recente é.
37. Como usuário, quero uma mensagem clara quando ainda não existir relatório, para entender que ainda não foi gerado.
38. Como usuário, quero que a saúde seja somente leitura, para o painel não alterar nada ao consultar.
39. Como usuário, quero ver o comando a rodar no afiliados para sincronizar nichos e reiniciar o scheduler, para aplicar as mudanças com segurança.
40. Como usuário, quero um botão copiar no comando, para colar no terminal.
41. Como usuário, quero ver o status "pendente de sincronizar" depois de salvar, para lembrar que a mudança ainda não está valendo.
42. Como usuário, quero marcar manualmente "sincronizado", para limpar o aviso depois de rodar o comando.
43. Como usuário, quero ver o estado do DRY_RUN do afiliados no painel, para saber se o envio é de teste ou real.
44. Como usuário, quero que o painel nunca ligue o envio real, para que isso só aconteça por decisão minha no afiliados.
45. Como usuário, quero um destaque visual quando o DRY_RUN estiver desligado, para não ser pego de surpresa.
46. Como usuário, quero que o painel funcione sem o caminho do afiliados configurado mostrando um aviso e como configurá-lo, para entender o que falta.
47. Como usuário, quero que o hub nunca envie mensagem de WhatsApp, para o risco de banimento ficar só no afiliados.
48. Como usuário, quero ver um resumo por nicho de plataforma (ML e Amazon) com categorias e palavras, para checar a cobertura.

## Implementation Decisions

- **Divisão de responsabilidades**: a execução diária, a pesquisa por nicho, a publicação, o orçamento por número e o scheduler com alerta de concentração permanecem no afiliados. O hub só lê e grava a configuração de nichos e lê relatórios.
- **Configuração de nichos**: cada nicho tem rótulo (nome salvo do grupo), jid do grupo, instância, categorias e palavras-chave do ML e da Amazon, minDealScore, maxPerRun, cronSlots, enabled e prioridade. O arquivo é ignorado pelo git no afiliados e contém dados sensíveis.
- **Validação**: espelho do schema zod do afiliados dentro do hub, usado em toda gravação. Um teste de conformidade carrega o schema real do afiliados (quando o repositório está disponível) e confirma que aceita e recusa os mesmos casos.
- **Gravação segura**: checar mtime e hash lidos contra o estado atual antes de gravar; conflito recusa a gravação. Backup com marca de tempo antes de cada escrita; escrita em arquivo temporário seguida de renomeação atômica. Número limitado de backups mantidos.
- **Privacidade**: jid mascarado nas respostas do servidor por padrão e revelado só por pedido explícito de edição; nunca registrado em logs. O arquivo de ambiente do afiliados nunca é lido nem escrito; o estado do DRY_RUN e o limite WA_MAX_PER_DAY chegam por um caminho somente leitura e restrito a essas chaves, sem expor outras.
- **Agenda**: linha do tempo de 24 h em America/Sao_Paulo. O usuário informa as horas desejadas; um algoritmo determinístico propõe horários intercalados entre nichos respeitando o intervalo mínimo configurável e evitando concentração. O total diário estimado (maxPerRun versus execuções) é comparado ao WA_MAX_PER_DAY, exibido como informação e alerta, nunca como bloqueio. A saída é convertida em expressões cron, com prévia em linguagem natural.
- **Saúde**: o servidor lê o último relatório gravado pelo agente `ops` em `<afiliados>/.claude/ops-reports/` (caminho definido neste PRD) e a última auditoria do `deal-auditor` na mesma pasta, distinguidas por prefixo de nome com data. Somente leitura. Se a pasta não existir, o painel informa que não há relatório. Criar essa pasta e fazer o `ops` gravar nela é uma mudança no afiliados (ver Further Notes).
- **Aplicar mudanças**: após salvar, o painel marca "pendente de sincronizar" e mostra o comando que o usuário roda no afiliados para sincronizar nichos e reiniciar o scheduler. O hub não executa esse comando nem reinicia processos. O usuário limpa o aviso manualmente.
- **DRY_RUN**: o painel apenas exibe o estado. Não existe ação no hub que altere esse estado ou envie mensagens.
- **Configuração do caminho**: o caminho do repositório afiliados vem de configuração do hub; sem ele, o painel mostra instruções em vez de erro.
- **Servidor**: endpoints para ler nichos (mascarados), gravar com checagem de conflito, listar e restaurar backups, sugerir agenda (cálculo puro), ler relatórios e ler o estado informativo (DRY_RUN e limite diário).
- **Interface**: quatro seções no painel (Grupos e nichos, Agenda, Saúde, Aplicar mudanças).

## Testing Decisions

- Testar o espelho do schema: casos válidos e inválidos por campo, e o teste de conformidade contra o schema real do afiliados.
- Testar a gravação: backup criado, escrita atômica (falha no meio não corrompe), conflito por mtime ou hash recusado, restauração de backup.
- Testar o mascaramento: respostas padrão nunca trazem o jid completo; o arquivo de ambiente nunca é aberto.
- Testar o algoritmo de agenda como função pura: intercalação, intervalo mínimo, alerta de concentração, comparação com o limite diário, geração de cron válido e fuso America/Sao_Paulo.
- Testar a leitura de saúde com pastas de relatório de fixture: último relatório escolhido, pasta ausente, arquivo vazio.
- Testar que o painel não expõe nenhuma ação de envio nem de alteração do DRY_RUN.
- Usar diretórios temporários e fixtures; sem WhatsApp, sem rede e sem afiliados real, exceto o teste de conformidade, que é ignorado com aviso se o repositório faltar.

## Out of Scope

- Qualquer envio de WhatsApp pelo hub e qualquer reimplementação de pesquisa, scheduler ou orçamento.
- Executar comandos do afiliados ou reiniciar o scheduler pelo hub.
- Editar o arquivo de ambiente ou ligar o envio real.
- Criar grupos de WhatsApp ou obter jids automaticamente.
- Mudanças no código do afiliados: viram specs no repositório afiliados somente após aprovação do usuário.

## Further Notes

- Mudança provável no afiliados (a aprovar): o `ops` gravar relatórios na pasta de relatórios acima, e o comando de sincronização de nichos estar documentado e estável.
- Pergunta: qual é o comando exato de sincronizar nichos e reiniciar o scheduler no afiliados hoje?
- Pergunta: como o `deal-auditor` e o `ops` nomeiam e formatam seus relatórios (markdown ou JSON)?
- Pergunta: como o painel lê DRY_RUN e WA_MAX_PER_DAY sem tocar no arquivo de ambiente (por exemplo, um endpoint ou arquivo de status do afiliados)?
- Pergunta: valor padrão do intervalo mínimo entre envios e de backups mantidos?
- Riscos: banimento do WhatsApp por volume ou concentração; vazamento de jids; edição concorrente do arquivo; divergência entre o espelho e o schema real.
- Depende do servidor e da interface do hub; independe do motor de missões.
