# Afiliados (oferta-bot): nichos propostos (somente Mercado Livre)

Data: 2026-11-22. Pesquisa de mercado e proposta. Nada foi enviado, nenhum commit, `config/niches.json` e `.env` não foram lidos. Os 20 nichos abaixo foram adicionados a `afiliados/config/niches.example.json` com `enabled: false`, JIDs placeholder (`1203630000000001NN@g.us`) e campos Amazon vazios (Amazon fica para depois; manter `browseNodeIds: []` e `keywords: []`). O arquivo valida contra `parseNichesFile` (zod), `npm run typecheck` e `npm test -- src/niches` passam.

## 1. O que foi (e não foi) verificado

Acessado em 2026-11-22. A API pública `api.mercadolibre.com/sites/MLB/categories` devolve 403 (PolicyAgent) para WebFetch e curl sem token, e as páginas de developers do ML também deram 403. Os IDs abaixo foram confirmados apenas por trechos da lista oficial citados em buscas; tratar como "verificado por busca, conferir com token antes de produção".

| ID | Nome | Fonte | Situação |
|---|---|---|---|
| MLB1430 | Calçados, Roupas e Bolsas | [docs ML](https://developers.mercadolivre.com.br/pt-br/categorizacao-de-produtos) (via busca) | verificado |
| MLB1574 | Casa, Móveis e Decoração | idem | verificado |
| MLB1276 | Esportes e Fitness | idem | verificado |
| MLB1246 | Beleza e Cuidado Pessoal | [lista MLB](https://api.mercadolibre.com/sites/MLB/categories) (via busca) | verificado |
| MLB1071 | Animais | idem | verificado |
| MLB1384 | Bebês | idem | verificado |
| MLB1132 | Brinquedos e Hobbies | idem | verificado |
| MLB1144 | Games | idem (busca) | verificado |
| MLB1648 | Informática | idem (busca) | verificado |
| MLB5726 | Eletrodomésticos | idem (busca) | verificado |
| MLB263532 | Ferramentas (uma página diz "Ferramentas e Construção") | idem (busca) | verificado, nome varia |
| MLB1055 | Celulares e Smartphones | [exemplo best-sellers](https://developers.mercadolivre.com.br/mais-vendidos-no-mercado-livre) (via busca) | verificado |
| MLB1039 | Câmeras e Acessórios | busca | verificado, não usado |

Atenção ao template existente: `esporte` usa `MLB1577` e `casa` usa `MLB5617`. Não consegui confirmar esses dois; as fontes dão Esportes = MLB1276 e Casa = MLB1574. **A verificar** antes de ligar o DRY_RUN real desses nichos (não alterei, é config existente). `MLB5672` (automotivo) e `MLB1000` (tecnologia) não foram reconfirmados aqui.

Sem ID verificado, `categoryIds` ficou vazio e a busca depende de keywords: as 3 modas (subcategorias de MLB1430, a verificar para não cross-postar tudo igual), pescaria, camping-outdoor, ciclismo, motos (subcategorias a verificar), cozinha-utilidades (subcategoria de Casa), escolar e os sazonais. Para obter os IDs: com token ML, `GET /sites/MLB/categories/MLB1430` lista as filhas; ou `GET /sites/MLB/domain_discovery/search?q=vara de pescar`. Nunca inventar ID.

## 2. Programa de afiliados do ML: comissão e elegibilidade

Fontes: [DivulgaNinja 2026](https://www.divulganinja.com.br/blog/quanto-mercado-livre-paga-afiliados-comissoes-2026), [TecMundo](https://www.tecmundo.com.br/mercado/401868-como-ser-afiliado-do-mercado-livre.htm), [Hotmart](https://hotmart.com/pt-br/blog/afiliado-mercado-livre), todas acessadas em 2026-11-22. São blogs, não a tabela oficial (portal de afiliados, não acessível por 403). Os números divergem entre fontes; **a verificar no painel oficial**.

- Comissão é percentual sobre o preço do produto, varia por categoria e campanha; frete e encargos fora da base. Referência de mercado: moda 6-8%, beleza 6-8% (TecMundo cita até 16%), casa 4-7%, ferramentas 4-6%, brinquedos 5-7%, esportes 4-6%, pet 5-7%, eletrônicos/informática 3-5%, celulares 2-4%, eletrodomésticos 3-5%, bebês até 14% (TecMundo).
- Venda direta do produto indicado ou da mesma categoria paga cheio; venda indireta de outra categoria paga metade (Hotmart).
- Produtos usados, anúncios grátis e links para home/categorias/busca/carrinho não geram comissão; encurtador externo é proibido. Comissão é confirmada após entrega e janela de devolução (30-60 dias).
- **Risco de conta: conflito sobre WhatsApp.** Uma página oficial indexada ([Mercado Livre](https://www.mercadolivre.com.br/l/afiliados-aproveite-o-programa)) foi resumida pela busca como listando WhatsApp/Telegram como canal não permitido, enquanto blogs dizem que é permitido. Não consegui abrir a página (403). **Conferir os termos oficiais antes de investir em grupos**, pois afeta o projeto inteiro.
- Não encontrei lista oficial de categorias não comissionadas. Suplementos: não verifiquei política; ver risco na seção 4.

Sazonalidade (acessado 2026-11-22): Dia das Mães é a maior data do 1º semestre (moda, beleza, perfumes, eletrônicos) ([Loggi](https://www.loggi.com/conteudos/empreendedorismo/calendario-sazonal/)); Black Friday 2024 movimentou R$ 9,38 bi no fim de semana ([E-Commerce Brasil](https://www.ecommercebrasil.com.br/artigos/importancia-de-datas-sazonais-para-o-e-commerce-como-estas-datas-pesam-no-sell-out-dos-negocios)); ventiladores/ar-condicionado sobem no verão ([Nubimetrics](https://academia.nubimetrics.com/br/aproveitar-sazonalidade-vendas)). Dia das Crianças e volta às aulas: sem fonte nesta busca, tratar como hipótese comum do varejo (a verificar).

## 3. Nichos propostos

Todos: `enabled: false`, `instance: ofertas-01`, ML apenas. `maxPerRun` 2 (3 no sazonal Black Friday). Keywords completas estão no JSON; abaixo só as principais. Potencial é julgamento meu a partir das faixas de comissão acima e do perfil de compra recorrente, não dado medido.

### Onda 1 (ligar primeiro)

| key | Público | categoryIds | minScore | Slot | Pri. | Potencial |
|---|---|---|---|---|---|---|
| moda-feminina | mulheres 18-50 | vazio (a verificar, filhas de MLB1430) | 50 | `0 11 * * *` | 9 | alta |
| moda-masculina | homens 18-45 | vazio (a verificar) | 50 | `0 13 * * *` | 9 | média |
| moda-infantil | pais de 0-12 anos | vazio (a verificar) | 50 | `0 19 * * *` | 8 | média |
| pescaria | pescadores de fim de semana | vazio (a verificar) | 55 | `0 16 * * *` | 8 | média |
| pet | donos de cães/gatos | MLB1071 | 48 | `0 7 * * *` | 9 | alta |
| beleza-perfumaria | perfumes, maquiagem, pele | MLB1246 | 50 | `0 15 * * *` | 9 | alta |
| ferramentas | reparos e autônomos | MLB263532 | 55 | `0 10 * * *` | 8 | média |
| cozinha-utilidades | cozinha e casa prática | vazio | 50 | `0 12 * * *` | 8 | alta |

Justificativas e riscos:
- **moda-feminina** (alta): maior volume de compra e comissão 6-8% (DivulgaNinja). Risco: falsificação em marcas, tamanho/devolução alta (comissão estornada), preço de "de/por" inflado pelo vendedor. Usar keywords genéricas, evitar marcas famosas.
- **moda-masculina** (média): demanda estável, menos impulso que a feminina. Mesmos riscos (réplicas de tênis/relógio).
- **moda-infantil** (média): compra recorrente (crescimento) e picos no Dia das Crianças e volta às aulas. Risco: tamanho e segurança de produto; filtrar marcas pouco confiáveis.
- **pescaria** (média): nicho fiel, ticket médio e margem boas, pouca concorrência de grupos de oferta. Risco: público pequeno, sazonal (piracema nov-fev limita pesca em rios em vários estados, a verificar), importados sem marca.
- **pet** (alta): compra recorrente (ração, areia) e comissão 5-7%. Risco: ração em kg tem pouca variação de preço, então o score pode rejeitar muito; vitamina/medicamento veterinário é sensível, evitar.
- **beleza-perfumaria** (alta): comissão alta segundo as fontes (6-16%), ticket baixo/médio, datas fortes. Risco: perfume falsificado/"inspirado", produto próximo do vencimento, cosmético sem registro Anvisa; preferir lojas oficiais.
- **ferramentas** (média): ticket médio, público fiel a marcas. Comissão 4-6%. Risco: nome da categoria varia (a verificar), ferramentas elétricas falsificadas, frete caro.
- **cozinha-utilidades** (alta): air fryer, panelas e organizadores têm alta rotatividade e descontos reais frequentes. Risco: sobreposição com o nicho `casa` (cross-post, limite de 2 grupos/dia); definir que `casa` fica só com móveis e decoração.

### Ondas 2 e 3 (depois de 2-3 semanas sem incidente na onda 1)

| key | Onda | categoryIds | minScore | Pri. | Potencial e risco |
|---|---|---|---|---|---|
| informatica | 2 | MLB1648 | 58 | 8 | média: comissão baixa (3-5%) mas ticket alto; margem fina e preço volátil; overlap com `tecnologia` |
| celulares | 2 | MLB1055 | 60 | 8 | média: comissão 2-4%; preço muito disputado, avaliar só se `tecnologia` não cobrir |
| games | 2 | MLB1144 | 58 | 6 | média: público engajado; risco de jogo/conta pirata e variação rápida |
| bebe | 2 | MLB1384 | 52 | 7 | alta: comissão até 14% (TecMundo, a verificar), compra recorrente (fraldas); risco de itens de segurança falsificados (bebê conforto) |
| eletrodomesticos | 2 | MLB5726 | 58 | 7 | média: ticket alto, comissão 3-5%, sazonal (ventilador no verão); frete pesado |
| brinquedos | 2 | MLB1132 | 50 | 6 | média: pico Dia das Crianças e Natal; risco de réplica de marca e item sem selo Inmetro |
| camping-outdoor | 3 | vazio | 55 | 7 | média: sazonal (verão/feriados); sinergia com pescaria |
| ciclismo | 3 | vazio | 55 | 6 | baixa/média: público pequeno, ticket alto |
| motos | 3 | vazio | 55 | 6 | média: público grande, mas capacete sem certificação Inmetro é risco; overlap com `automotivo` |
| escolar | 3 | vazio | 45 | 5 | média sazonal: dez-fev e jul; ocioso no resto do ano (ligar só na janela) |
| black-friday | sazonal | vazio | 65 | 4 | alta em nov: ligar de 1 nov a 2 dez; score alto para filtrar "falso desconto" |
| natal | sazonal | vazio | 55 | 4 | média: nov-dez; risco de entrega após 25/12 (checar prazo) |

Fora da lista: **suplementos/fitness** (não adicionado). Rendimento incerto, risco de produto sem registro, promessas de saúde e política de afiliados do ML não verificada. Se o dono quiser, tratar dentro de `esporte` apenas com acessórios (coqueteleira, halter), sem suplemento.

Os slots dos nichos das ondas 2 e 3 estão em horas livres (06h, 18h, 20h, 21h) para `ciclismo`, `informatica`, `games`, `bebe`; os demais (camping, celulares, eletrodomesticos, motos, escolar, brinquedos, black-friday, natal) repetem uma hora usada: **reatribuir o slot ao ligar**, mantendo ≥45 min entre qualquer par de nichos ativos.

## 4. Quantos grupos por dia o volume suporta

Dados: `.env.example` tem `WA_MAX_PER_DAY=20` (válido 1-60, obrigatório, nunca ilimitado), `WA_MAX_PER_RUN=3`, atraso entre mensagens até 70 s; cross-post limitado por `MAX_GROUPS_PER_PRODUCT_PER_DAY=2`; um único número serve todos os grupos, o orçamento é global (CLAUDE.md do afiliados). A soma atual de `maxPerRun` dos 5 nichos reais é 17 de 20.

Conta: cota diária / `maxPerRun` = grupos ativos. Com 20 mensagens/dia e 2 por grupo, são **10 grupos/dia**; com 1 por grupo, 20. Número recém-criado ou em dry-run recente deve ficar no limite baixo. Recomendação:
- Fase inicial: `WA_MAX_PER_DAY=20`. Até 10 grupos ativos com 2 posts, ou mais grupos com 1.
- Subir para 30 só após 2-3 semanas sem aviso/queda de sessão no WhatsApp; 40 como teto prático. Subir em passos de 5-10 e observar.
- Mais grupos com menos posts por grupo é melhor que o inverso para o público, mas aumenta tráfego para o mesmo número; é o total de envios/dia que dispara risco de banimento. Mensagens idênticas em vários grupos e horário fixo no minuto 0 são padrões detectáveis (auditoria M6: adicionar jitter de 0-12 min antes da onda 1).
- Orçamento da onda 1: 8 novos x 2 = 16. Para caber em 20, **desativar `roupas`** (substituído pelas 3 modas) e reduzir os 4 nichos antigos a `maxPerRun: 1` (= 4), total 20. Alternativa: subir `WA_MAX_PER_DAY` para 25-30 depois do aquecimento.
- Cada nicho 1 slot/dia; com ≥45 min entre slots e até 70 s por mensagem, uma rodada de 2 mensagens dura poucos minutos, então não há sobreposição.

## 5. Agenda escalonada da onda 1 (America/Sao_Paulo)

Intervalo de 60 min entre slots. Nichos antigos mantêm seus horários; `roupas` (11h) sai e entra `moda-feminina`.

| Horário | Nicho | Origem | Msgs |
|---|---|---|---|
| 07:00 | pet | novo | 2 |
| 08:00 | tecnologia | atual | 1 |
| 09:00 | automotivo | atual | 1 |
| 10:00 | ferramentas | novo | 2 |
| 11:00 | moda-feminina | novo (substitui roupas) | 2 |
| 12:00 | cozinha-utilidades | novo | 2 |
| 13:00 | moda-masculina | novo | 2 |
| 14:00 | esporte | atual | 1 |
| 15:00 | beleza-perfumaria | novo | 2 |
| 16:00 | pescaria | novo | 2 |
| 17:00 | casa | atual | 1 |
| 19:00 | moda-infantil | novo | 2 |

Total 20 msgs/dia. Observações: o scheduler hoje casa nicho por hora/minuto exato (auditoria A1); corrigir `nichesDueAt` antes de ligar muitos slots. Os nichos de manhã cedo (07h) e noite (19h) pegam público diferente do horário comercial.

## 6. Plano de rollout

1. Pré-requisitos: conferir termos oficiais do afiliado sobre WhatsApp (seção 2); conferir IDs de categoria com token; ter links `meli.la` (`ML_LINK_MODE=manual-only` enfileira como `aguardando-link`); corrigir A1/A2/A4 da auditoria.
2. Por nicho novo: copiar a entrada do `niches.example.json` para `config/niches.json`, ainda com `enabled: false` e JID placeholder. Rodar `DRY_RUN=true` e `enabled: true` por **5-7 dias** para formar histórico de preço (o score exige 7 dias distintos) e inspecionar RunLog/ops feed: quantas ofertas passam, relevância, falsificação.
3. Só então criar o grupo no WhatsApp, adicionar o número do bot como admin, cadastrar o JID real pelo painel Afiliados do hub, trocar o placeholder em `niches.json` e `npm run niches` (sync).
4. Ligar `DRY_RUN=false` para um nicho por vez, 1 nicho novo a cada 2-3 dias, acompanhando erros e bloqueios; começar com `maxPerRun: 1` e subir para 2.
5. Gatilhos de parada: qualquer aviso do WhatsApp, queda de sessão do Evolution, ou saída de membros em massa: pausar todos os grupos e reduzir `WA_MAX_PER_DAY`.
6. Ondas 2/3 só depois de 2-3 semanas estáveis; `black-friday` ligar em 1 nov (desligar 2 dez) e `natal` em nov-dez; `escolar` em dez-fev e jul; desligar fora da janela.
7. Amazon: manter `browseNodeIds`/`keywords` vazios nestes nichos até a integração existir.

## 7. Não verificado, resumo

- Tabela oficial de comissão e política sobre WhatsApp (403).
- Subcategorias para moda, pescaria, camping, ciclismo, motos, cozinha: sem ID, só keywords.
- `MLB1577` (esporte) e `MLB5617` (casa) do template existente.
- Nomes exatos de MLB263532 e MLB1055; sazonalidade do Dia das Crianças e volta às aulas; piracema por estado.
