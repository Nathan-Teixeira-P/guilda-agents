# PRD — Redação (pesquisa, artigos e capas)

## Problem Statement

O usuário precisa, de forma esporádica, pesquisar temas bons para artigos, ou receber um tema já definido e ver pesquisa, texto e imagem prontos. Hoje o hub só tem o fluxo de missões de código, que exige projeto e não tem lugar para conversar sobre conteúdo, ler o texto, ver capas ou acompanhar o estado de cada artigo.

## Solution

Uma tela fixa "Redação" no menu, separada das missões de código e sem exigir projeto de código. Ela usa um espaço de trabalho próprio do hub e oferece dois modos de pedido:

1. **Sugerir temas**: o `researcher` devolve uma lista ranqueada de temas, cada um com fontes, data de acesso e por que vale agora. O usuário escolhe um.
2. **Tema definido**: pesquisa, checagem de fatos, rascunho, edição e capa.

Cada artigo é um item com estado e artefatos legíveis na própria tela. Há um gate de aprovação do usuário antes da edição final. O hub nunca publica nem envia nada. Reaproveita o motor de missões (estágios, SSE, orçamento) com um novo tipo de missão `redacao`.

## User Stories

1. Como usuário, quero um item "Redação" fixo no menu, para chegar ao fluxo de artigos sem passar pelas missões de código.
2. Como usuário, quero usar a Redação sem escolher um projeto de código, para escrever sem depender de repositório.
3. Como usuário, quero pedir "Sugerir temas", para receber ideias quando ainda não sei o assunto.
4. Como usuário, quero que cada sugestão traga fontes com links, para poder verificar de onde veio.
5. Como usuário, quero ver a data de acesso de cada fonte, para saber o quão atual é a informação.
6. Como usuário, quero um "por que vale agora" em cada tema, para decidir rápido.
7. Como usuário, quero que a lista venha ranqueada, para olhar primeiro os melhores temas.
8. Como usuário, quero escolher um tema sugerido com um clique, para seguir direto à pesquisa e escrita.
9. Como usuário, quero pedir "Tema definido" informando o assunto, para o hub pesquisar e escrever sem etapa de sugestão.
10. Como usuário, quero informar público e tom opcionalmente, para o texto sair no estilo certo.
11. Como usuário, quero informar o tamanho desejado, para controlar a extensão do artigo.
12. Como usuário, quero anexar links ou caminhos locais de referência, para o artigo usar meu material.
13. Como usuário, quero colar texto de referência no pedido, para usar conteúdo que não está em arquivo.
14. Como usuário, quero que o idioma padrão seja pt-BR, para não precisar pedir sempre.
15. Como usuário, quero poder trocar o idioma por pedido, para casos eventuais em outro idioma.
16. Como usuário, quero ver a lista de artigos com estado (pesquisando, rascunho, em revisão do usuário, aprovado), para saber onde cada um está.
17. Como usuário, quero acompanhar o progresso em tempo real, para não precisar recarregar a tela.
18. Como usuário, quero ler as notas de pesquisa com links na própria tela, para conferir a base do texto.
19. Como usuário, quero ler o rascunho na própria tela, para revisar sem abrir arquivos.
20. Como usuário, quero ler a versão final na própria tela, para ver o resultado após a edição.
21. Como usuário, quero aprovar ou pedir ajustes no rascunho antes da edição final, para que nada avance sem meu aval.
22. Como usuário, quero escrever comentários ao pedir ajustes, para orientar a reescrita.
23. Como usuário, quero ver os pontos checados e os problemas encontrados pelo `fact-checker`, para confiar nas afirmações.
24. Como usuário, quero que afirmações sem fonte sejam sinalizadas, para não publicar algo sem base.
25. Como usuário, quero uma capa gerada pelo `illustrator` em SVG e PNG 1200x627, para usar direto no LinkedIn.
26. Como usuário, quero uma galeria de capas na tela, para comparar e escolher.
27. Como usuário, quero baixar a capa escolhida, para anexá-la manualmente.
28. Como usuário, quero um botão "copiar texto", para colar o artigo onde eu quiser.
29. Como usuário, quero que o hub nunca publique no LinkedIn nem envie nada, para controlar tudo o que sai.
30. Como usuário, quero ver a estimativa de uso da janela antes de iniciar, para decidir se vale agora.
31. Como usuário, quero que a Redação respeite o teto de uso (pp da janela de 5 h) como as outras missões, para não estourar meu plano.
32. Como usuário, quero que a missão pause ou avise ao chegar no teto, para não ficar sem uso no resto do dia.
33. Como usuário, quero cancelar um artigo em andamento, para parar um gasto que não faz mais sentido.
34. Como usuário, quero retomar um artigo em revisão depois, para trabalhar em sessões esporádicas.
35. Como usuário, quero reabrir um artigo aprovado e pedir nova versão, para atualizá-lo no futuro.
36. Como usuário, quero que cada artigo fique em uma pasta própria no espaço de trabalho do hub, para encontrar tudo em um lugar.
37. Como usuário, quero um identificador legível (slug) por artigo, para reconhecê-lo na lista e na pasta.
38. Como usuário, quero excluir um artigo e seus artefatos, para limpar o que não interessa.
39. Como usuário, quero que caminhos de referência inválidos sejam avisados antes de iniciar, para não perder uma execução.
40. Como usuário, quero que a pesquisa use modelos baratos onde a qualidade permite (sonnet para pesquisa e escrita, haiku para checagem e edição), para poupar uso.
41. Como usuário, quero que o orquestrador saiba o fluxo de redação, para planejar os estágios sem eu explicar.
42. Como usuário, quero filtrar artigos por estado, para achar os que aguardam minha revisão.
43. Como usuário, quero ver o histórico de versões do texto, para comparar rascunho e final.
44. Como usuário, quero um aviso claro quando uma pesquisa não achar fontes confiáveis, para não receber texto inventado.

## Implementation Decisions

- **Tela e navegação**: rota própria "Redação" no menu, independente do fluxo de missões de código. Seções: novo pedido (dois modos), lista de artigos por estado, detalhe do artigo (notas, rascunho, final, capas).
- **Espaço de trabalho**: pasta própria do hub para a Redação, com uma subpasta por artigo (`redacao/<slug>/`). Não exige projeto de código registrado. O slug é derivado do tema e único.
- **Tipo de missão `redacao`**: novo tipo no motor de missões, reaproveitando estágios, SSE e orçamento. A fase 1 planeja e a fase 2 executa, com gate de aprovação do usuário entre rascunho e edição final.
- **Fluxos**:
  - Sugerir temas: um estágio do `researcher` que devolve a lista ranqueada; o artigo só é criado ao escolher um tema.
  - Tema definido: pesquisa (`researcher`), checagem de fatos (`fact-checker`), rascunho (`writer`), gate do usuário, edição (`editor`), capa (`illustrator`).
- **Estados do artigo**: pesquisando, rascunho, em revisão do usuário, aprovado (mais cancelado). Transições dirigidas pelos estágios e pelas ações do usuário.
- **Artefatos por artigo**: notas de pesquisa com links e data de acesso, relatório de checagem, rascunho, versão final, capas (SVG e PNG 1200x627). Versões anteriores do texto são mantidas.
- **Campos do pedido**: tema ou "sugira", público e tom (opcionais), tamanho, referências (caminhos locais ou texto colado), idioma (pt-BR padrão).
- **Agentes e modelos**: roteamento já definido: `researcher` e `writer` em sonnet; `fact-checker` e `editor` em haiku; `illustrator` conforme seu roteamento atual. Agentes próprios para a redação, sem alterar os agentes das missões de código.
- **Orquestrador**: a especificação do orquestrador passa a ensinar o fluxo de redação (modos, estágios, gate).
- **Orçamento**: mesma regra das missões: estimativa antes de iniciar e teto em pontos percentuais da janela de 5 h.
- **Segurança**: nenhuma publicação nem envio; o texto só sai pelo botão copiar e pelo download da capa, ambos ação do usuário. Referências locais são lidas apenas, sem escrever fora da pasta do artigo.
- **Servidor**: endpoints para criar pedido, listar e ler artigos e artefatos, aprovar ou pedir ajustes, baixar capa. A leitura de artefatos valida que o caminho permanece dentro da pasta do artigo.

## Testing Decisions

- Testar o comportamento externo: criar artigo nos dois modos, transições de estado, gate (a edição final não ocorre sem aprovação), cancelamento e retomada.
- Testar que a lista de sugestões tem campos obrigatórios (fonte, data de acesso, motivo) e ordem de ranking.
- Testar a leitura de artefatos: caminho fora da pasta do artigo é recusado; capa baixada tem o tipo e as dimensões esperadas.
- Testar o teto de uso: a missão não inicia ou pausa quando o orçamento estoura, com o uso simulado.
- Agentes substituídos por saídas fixas (fixtures); sem chamadas reais ao modelo nem à rede.
- Testes da interface: lista por estado, copiar texto, galeria de capas, atualização via SSE.
- Não testar o texto dos prompts dos agentes, só o contrato de saída (arquivos e campos produzidos).

## Out of Scope

- Publicar ou agendar no LinkedIn ou qualquer outra rede; qualquer envio.
- Edição colaborativa do texto dentro da tela (a tela lê; ajustes são pedidos ao agente).
- Geração de imagens além da capa SVG/PNG.
- Métricas de desempenho dos artigos após publicação.
- Pesquisa recorrente ou agendada (o uso é esporádico, sob demanda).

## Further Notes

- Perguntas em aberto: o `illustrator` hoje gera PNG a partir de SVG de forma confiável? Se não, qual ferramenta de conversão é aceitável (sem dependência nova pesada)?
- Pergunta: qual o limite padrão de tamanho do artigo (palavras) e o teto de uso por artigo, se diferente das outras missões?
- Pergunta: quantas capas por artigo (uma ou variações para a galeria)?
- Pergunta: histórico de versões mantém quantas versões?
- Pergunta: referências locais podem apontar para qualquer pasta da máquina ou só para uma lista permitida?
- Depende do núcleo de missões (estágios, SSE, orçamento) e do roteamento de modelos já existente.
