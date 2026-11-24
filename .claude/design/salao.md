# Design — Salão da Guilda

Autor: frontend-architect · Data: 2026-11-21 · Alvo: `packages/web/` (Vite + React + TS)
Base: PRD `salao-da-guilda` (histórias 1–23), PRD `core-agentes`, specs 011, 012, 017, 018; ativos `assets/emblem-ntp.png`, `assets/seal-ntp.png`, `assets/emblem-gauge.svg`; `packages/server/src/stream.ts` e `packages/core/src/{mission,breaker}.ts` (o `http.ts` ainda não existe, então rotas e eventos aqui são propostas).

---

## 0. O que os ativos ditam

- **Emblema NTP**: metal frio (prata e grafite), cortes em vermelho-sangue, silhueta em A com ponta no topo. É sério, pontudo e noturno. Funciona sobre fundo escuro e fica sem vida sobre papel claro.
- **Selo NTP**: bronze envelhecido sobre campo vinho, nós entrelaçados, faixas com lema. É o objeto de "autoridade" e, por isso, combina com o gesto de aprovar.
- **Gauge de referência**: fundo `#241416 → #0c0809`, aro prata, anel semanal `#a9adb3`, anel de 5 h `#c1121f`.

O resultado é uma paleta de **noite, aço, sangue e bronze**, com o **pergaminho** como superfície de leitura. As três direções abaixo partem daí e diferem no que tratam como protagonista.

> Atenção sobre o ativo (precisa ser checado antes do spec 012): na renderização, `seal-ntp.png` mostra um **xadrez cinza de "transparência" que parece gravado nos pixels**, além de rachaduras escuras nos cantos. Se for isso mesmo, o selo vai aparecer com um quadrado xadrez em volta. As saídas são: (a) o usuário exporta de novo com alfa real, ou (b) usar `mask-image` com um SVG da silhueta (círculo + faixas laterais). Um `clip-path: circle()` cortaria as fitas.

---

## 1. Direções

### Direção A — "Duas Luzes" (noite para vigiar, pergaminho para decidir) — **RECOMENDADA**

**Ideia ousada:** a interface tem dois climas que carregam significado. Tudo o que é **vigiar** (Salão, Quadro, Missão ao vivo, Arsenal) acontece à **noite**, com fundo obsidiana, linhas de bronze gravadas e o emblema de aço. Tudo o que é **decidir** (a Sala de guerra) acontece num **pergaminho iluminado por vela**, que se desenrola sobre a noite. O selo de cera é a ponte entre os dois: ao selar, o pergaminho se enrola, o selo fica cravado nele e a missão "desce para a noite" (vai para Em campo). A troca de luz é o próprio portão de aprovação: dá para saber "estou num momento de decisão" sem ler nada.

- **Salão**: planta noturna de uma cidade renascentista em traço de bronze (gravura, sem preenchimento), com um rio, muralha e N quarteirões. Cada distrito é um projeto. No centro fica a torre com o **emblema-medidor grande**.
- **Missão ao vivo**: a "Linha dos Telhados", uma faixa horizontal de silhuetas de telhados onde cada agente convocado aparece como um membro encapuzado. Os handoffs são **mensageiros** que correm pelos telhados entre o Regente e o agente.
- **Por que vence:** é a direção que melhor usa os ativos (que são escuros), dá ao selo um papel funcional e não decorativo, e mantém o texto longo no papel, onde se lê melhor. Também separa o modo de "olhar" (noite, densa) do de "ler" (papel, calma), e o modo claro do spec 012 sai quase de graça (é o "pergaminho em tudo").
- **Risco:** o mapa pode virar enfeite. Mitigação: o mapa é um `<nav>` de verdade, tem lista equivalente e mostra estado (missões ativas e alarmes por distrito).

### Direção B — "Códice da Ordem" (livro-razão iluminado)

**Ideia ousada:** o app inteiro é um **manuscrito**. Cada missão é um fólio. A Missão ao vivo é uma **crônica escrita em tempo real**: cada evento vira uma linha com tinta que "seca" (opacidade 0.6 → 1), e nas **marginálias** ficam tokens, modelo e pontos do plano gastos. O Arsenal é um livro-razão com colunas pautadas e totais em caixa iluminada. O emblema aparece como capitular de abertura de cada fólio.

- **Forças:** a maior densidade de leitura, a mais barata de animar (quase só tipografia) e excelente para revisão.
- **Fraquezas:** fundo claro briga com o emblema metálico, perde a noite e o "assassino" (fica com cara de mosteiro) e os mensageiros viram simples anotações. Não atende bem à história 17 (microinterações memoráveis).

### Direção C — "Torre de Vigia" (painel de obsidiana)

**Ideia ousada:** telemetria pura com estética de guilda. Fundo preto, tudo em aço e um único vermelho. O centro é um **diagrama de raias ao vivo**: cada agente é uma raia horizontal no tempo, os blocos são chamadas de ferramenta e os handoffs são **fios vermelhos verticais** ligando as raias. O emblema-medidor fica fixo no topo, sempre grande. Não há mapa: os distritos são abas.

- **Forças:** a máxima densidade de informação, com leitura de "quem bloqueou quem" e de duração por agente que nenhuma outra direção dá.
- **Fraquezas:** é fria, parece ferramenta de observabilidade com outra pele, e os avatares encapuzados ficam espremidos em 16 px. É a que mais se aproxima do visual de HUD da franquia de referência, o que pede cuidado com a marca.

### Recomendação

**Direção A**, com um empréstimo explícito da C: na Missão ao vivo existe um **modo "Raias"** (alternável por tecla `R`) que mostra o mesmo stream como diagrama de raias. A Linha dos Telhados conta a história e as Raias dão o diagnóstico. A crônica da B entra como o **feed de eventos** sob a Linha dos Telhados. Tudo isso fica dentro da direção A, sem misturar climas: Raias e crônica também são noturnas.

O resto do documento detalha a Direção A.

---

## 2. Arquitetura de navegação

Sem `react-router`. Rotas em hash (`#/…`) lidas com `useSyncExternalStore` sobre `hashchange` (cerca de 20 linhas). O app é local, com 7 rotas e sem SSR.

| Rota | Tela | Clima |
|---|---|---|
| `#/` | Salão (mapa de distritos + emblema) | noite |
| `#/quadro` | Quadro de missões | noite |
| `#/nova?distrito=x` | Nova missão (painel lateral sobre a tela atual; em tela cheia no celular) | noite |
| `#/missao/:id/guerra` | Sala de guerra | **pergaminho** |
| `#/missao/:id` | Missão ao vivo | noite |
| `#/arsenal` | Arsenal de custos | noite |
| `#/distrito/:nome` | Página do distrito (Afiliados ganha painel próprio) | noite |

**Cabeçalho fixo (desktop, 56 px):** emblema-medidor compacto (40 px) + texto `5h 62% · 2h10 | sem 35% · 3d` · navegação (Salão, Quadro, Arsenal) · botão **Nova missão** (`N`) · sino de alarmes com contador · menu (modo sem animação, claro/escuro, notificações).

**Celular:** cabeçalho de 48 px com emblema compacto e sino. Barra inferior com 4 itens: Salão, Quadro, **+** (Nova), Arsenal. A Missão ao vivo e a Sala de guerra escondem a barra inferior para dar espaço.

### Caminho mais curto para a tarefa principal

A tarefa mais frequente não é criar missão, e sim **responder à guilda** (selar, ajustar ou destravar o disjuntor). Por isso:

1. O Salão e o Quadro têm no topo uma **faixa "Aguardam seu selo (n)"**. Clicar abre direto a Sala de guerra da mais antiga.
2. A notificação do navegador leva direto para `#/missao/:id/guerra`.
3. O título da aba vira `(2) Salão da Guilda`, onde o número é o total de missões que pedem ação.
4. Na Sala de guerra, `A` aprova (abre a confirmação do selo) e `J` pede ajustes (foca o comentário).

Para criar missão: `N` em qualquer tela, colar, `Ctrl+Enter`. Três gestos.

---

## 3. Telas

### 3.1 Salão

```
┌ cabeçalho ───────────────────────────────────────────────────────────┐
│ [◎] 5h 62% · 2h10  sem 35% · 3d   Salão  Quadro  Arsenal  [+ Nova] 🔔│
├──────────────────────────────────────────────────────────────────────┤
│ ▌Aguardam seu selo (1): "Filtro de ofertas" — afiliados   [Abrir ›]  │
├───────────────────────────────────────────────┬──────────────────────┤
│          ~~~~ rio ~~~~                         │ Em campo agora       │
│   ┌────────┐      ┌────────┐                   │  ● Ferreiro · Edit   │
│   │afiliados│ ●2  │lab-agents│                 │    afiliados · 4 pp  │
│   └────────┘      └────────┘     (EMBLEMA      │ Recolhidas (1)       │
│        ┌────────┐               GRANDE 240px)  │  ⚠ disjuntor: 9      │
│        │trabalho│ ⚠                            │    handoffs          │
│        └────────┘      [+ terreno vazio]       │                      │
└───────────────────────────────────────────────┴──────────────────────┘
```

- **Mapa:** um SVG desenhado uma vez (`guild/city.svg`, traço de bronze de 1 px, sem textura raster) com **8 lotes fixos**. Os projetos do registro (spec 016) ocupam os lotes por ordem de cadastro. Do 9º em diante, aparecem só na lista "Outros distritos". Os lotes livres mostram "terreno vazio" com **+ Anexar distrito** (história 21).
- Cada lote mostra o nome, um selo pequeno com o número de missões ativas e o ícone de alarme se houver missão parada ou com falha. Hover/foco faz o contorno do quarteirão "ganhar tinta" (stroke de bronze para osso, 150 ms).
- **Emblema grande** sobre a "torre" central, com os dois anéis e os tempos de reinício (ver §5).
- **Coluna direita:** missões em campo e recolhidas, com no máximo 5 de cada e o link "ver no Quadro".
- **Acessibilidade:** o mapa é `<nav aria-label="Distritos">` com `<a>` posicionados. Ordem de tabulação na ordem de leitura e a lista equivalente sempre no DOM (no celular é ela que aparece).

### 3.2 Quadro de missões

Seis estágios do core, com rótulo da guilda **e** o termo técnico embaixo (clareza antes do tema):

| Estágio (`mission.ts`) | Rótulo | Acento |
|---|---|---|
| `intake` | Contrato recebido | aço |
| `planejando` | Reconhecimento | aço |
| `aguardando-aprovacao` | **Aguarda o selo** | bronze, coluna destacada |
| `executando` | Em campo | sangue |
| `concluida` | Contrato cumprido | verdete |
| `parada` | Recolhida | âmbar (motivo visível) |

- **Desktop:** 6 colunas, com `intake` e `planejando` agrupadas visualmente sob "Fase 1". Cartão com título da demanda (1 linha), distrito, agente ativo (avatar de 24 px + codinome), **pp do plano consumidos / teto**, tempo desde a última atualização e US$ informativo em cinza.
- `concluida` mostra só as últimas 10 e um link "arquivo".
- **Celular:** abas por estágio com contadores (`Aguarda o selo · 1`). A aba inicial é a primeira não vazia na ordem de urgência: aguardando, parada, executando.
- O cartão de `parada` mostra o **motivo** (texto do disjuntor ou "teto do plano atingido") e o botão "Responder" (ver pergunta aberta 1).
- Não há arrastar e soltar: estágio não se muda à mão.

### 3.3 Nova missão

Painel lateral de 480 px (desktop) ou tela cheia (celular), com um formulário só:

1. **Distrito**: `<select>`, pré-preenchido quando se vem de um distrito, com a opção "+ Anexar distrito…" (URL de repositório ou pasta local).
2. **Demanda**: `<textarea>` grande. Se o texto colado for um link do ClickUp, aparece um chip "Tarefa do ClickUp detectada" (a integração vem do PRD `integracoes`; aqui só mostra).
3. **Quanto do plano posso gastar**: presets `5 · 10 · 15 · 25 pp` + campo numérico, com padrão conservador de **10 pp**.
   - Junto, um **mini-emblema (96 px) com arco fantasma**: o anel de 5 h mostra o uso atual sólido e o teto como arco tracejado na sequência. Assim se vê "35% → até 45%".
   - Texto sempre presente: `Uso 5h: 35% · reinicia em 2h10. Esta missão pode levar a janela até 45%.`
   - Se `atual + teto > 100`: aviso "o teto passa do que resta na janela; a missão vai pausar ao esgotar".
4. **Commit e push permitidos**: interruptor desligado por padrão, com o texto "A guilda não fará commit nem push" ou "pode fazer commit e push" (história 15).
5. **Lançar contrato** (`Ctrl+Enter`).

Confirmações bloqueantes (spec 018), dentro do próprio formulário e não em pop-up:
- Janela de 5 h acima do limiar (80%) ou semanal acima de 90%: caixa âmbar com checkbox obrigatório "Iniciar mesmo assim".
- **Uso indisponível**: caixa com "Não sei quanto do plano você já usou (nenhuma chamada recente ao modelo)." e as opções `[Consultar agora — consome uma chamada mínima]` ou o checkbox "Iniciar sem saber". Nunca segue às cegas.

### 3.4 Sala de guerra (pergaminho)

```
┌ (noite) ─────────────────────────────────────────────────────────────┐
│ ‹ Quadro   Filtro de ofertas · afiliados · Aguarda o selo            │
├──────────────┬───────────────────────────────────────┬───────────────┤
│ PACOTE       │  ╭──────── pergaminho ────────────╮   │ VEREDITO      │
│ ✓ Plano      │  │ # Plano                        │   │ Tamanho: média│
│ ✓ Design     │  │ ...markdown renderizado...     │   │ 3 specs       │
│ ○ PRD        │  │                                │   │ Fase 1: 6 pp  │
│ ○ Spec 001   │  │                                │   │ Commit: NÃO   │
│ ○ Spec 002   │  ╰────────────────────────────────╯   │ [ SELAR (A) ] │
│              │                                       │ Pedir ajustes │
│ Lidos 2/5    │                                       │ [textarea] (J)│
└──────────────┴───────────────────────────────────────┴───────────────┘
```

- **Índice** à esquerda, com marca de "lido" automática ao rolar até o fim (via IntersectionObserver em um sentinela) ou ao abrir. É só informativo: não bloqueia a aprovação, porque o usuário é adulto.
- **Pergaminho** ao centro, com largura de leitura de 70ch, fonte serifada e fundo `--pergaminho`. As bordas superior e inferior são dois gradientes que sugerem o rolo (sem imagem).
- **Veredito** à direita: resumo do pacote (classificação, número de specs, pp gastos na fase 1, permissão de commit), seguido de:
  - **Selar** abre um `<dialog>` nativo: "Selar a missão 'Filtro de ofertas'? A execução começa e pode gastar até 10 pp. Commit/push: não permitidos." O botão de confirmação **é o selo** (imagem de 72 px + texto "Selar"). Depois de confirmar, toca a animação do carimbo (§8) e a navegação segue para `#/missao/:id`.
  - **Pedir ajustes**: textarea obrigatória (botão desabilitado se vazia) e "Devolver ao reconhecimento". O pergaminho ganha uma dobra de canto e a missão volta para `planejando`.
- **Portão inválido** (o servidor recusou o `approved`): o selo aparece **rachado** e vem a mensagem "O selo não foi reconhecido; a execução não começou. Tente selar de novo." Falha fechada, também visualmente.
- **Celular:** o pergaminho ocupa a tela, o índice vira um `<select>` no topo e o Veredito vira uma barra fixa embaixo com `[Ajustes] [Selar]`.

Markdown: no spec 011 o conteúdo é renderizado como texto `white-space: pre-wrap` em fonte serifada, o que já é legível. No 012 entra um renderizador (ver pergunta aberta 6) **com HTML cru escapado**, porque o conteúdo é escrito por agentes.

### 3.5 Missão ao vivo

```
┌──────────────────────────────────────────────────────────────────────┐
│ Filtro de ofertas · afiliados · Em campo · fase 2       [■ PARAR]    │
├──────────────────────────────────────────────────────────────────────┤
│  ⌂⌂⌂⌂ LINHA DOS TELHADOS ⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂⌂     │
│  [Regente]  ──🏃📜──▶ [Ferreiro*]   [Provador]   [Juiz]              │
│   sonnet              Edit · sonnet   aguardando   aguardando        │
├────────────────────────────────────────────┬─────────────────────────┤
│ CRÔNICA                       [Telhados|Raias R] │ CONSUMO              │
│ 14:02 Regente → Ferreiro: spec 002         │ Plano  4 / 10 pp ▓▓▓▓░░ │
│ 14:02 Ferreiro usou Read (3x)              │ Tokens 182k (cache 71%) │
│ 14:03 Ferreiro usou Edit                   │ US$ 0,84 (informativo)  │
│ ...                                        │ DISJUNTOR               │
│                                            │ Handoffs ▮▮▮▮▮▯▯▯ 5/8   │
│                                            │ Voltas spec 002: ▮▯ 1/2 │
└────────────────────────────────────────────┴─────────────────────────┘
```

- **Linha dos Telhados**: o Regente fica fixo à esquerda e os agentes **aparecem quando convocados** (`subagent-started`), em ordem de chegada, até 6 visíveis. Os mais antigos colapsam em "+3".
  - O agente ativo fica **de costas** (indo à missão), com o emblema NTP no manto visível e luz de bronze no telhado. Os ociosos ficam de frente, em 70% de opacidade. Isso dá um uso funcional à imagem do emblema nas costas.
  - Embaixo de cada avatar: codinome, a última ferramenta (`tool.name`) e o modelo.
- **Mensageiros**: em `subagent-started`, um mensageiro sai do Regente até o agente levando um pergaminho bronze. Em `subagent-finished`, volta com pergaminho **bronze** (ok) ou **vermelho** (status de erro).
- **Crônica**: lista de eventos em linguagem humana, com as 500 últimas linhas no DOM. As ferramentas repetidas em sequência são agrupadas ("usou Read 3x"). Os eventos `desconhecido` não aparecem, só são contados num rodapé de depuração.
- **Modo Raias** (`R`): uma raia por agente, blocos por ferramenta, fios vermelhos nos handoffs. É SVG simples, redesenhado em lote a cada 500 ms, sem animação.
- **Consumo**: pp do plano gastos/teto (barra com marca de teto), tokens (entrada, saída e % de cache), US$ informativo e **disjuntor** como pavio de 8 entalhes de handoff + entalhes de voltas por spec (limites de `breaker.ts`). Os entalhes ficam âmbar no penúltimo e vermelhos ao estourar.
- **Parar**: sempre visível, em vermelho sólido. Abre um `<dialog>` com "Encerrar a missão e o processo? O que já foi feito fica no projeto." e as opções `[Encerrar] [Cancelar]`, com foco inicial em Cancelar.
- Pela métrica disponível, o pp do plano só existe **por missão** (o `rate_limit_event` é global). Por agente, a interface mostra tokens e a parcela de tokens, sem inventar pp por agente.

### 3.6 Arsenal de custos

- **Topo:** três números grandes: **pp do plano** gastos (7 dias), tokens (7 dias) e US$ de tabela (informativo, cinza). Logo abaixo, o emblema médio com as duas janelas.
- **Tabela por agente** (ordenável por coluna, com `<th aria-sort>`): avatar de 24 px, codinome e nome técnico, modelo, convocações, tokens de entrada, saída e cache, **barra inline de parcela**, US$. O padrão é ordenar por tokens, de forma decrescente.
- **Tabela por missão**: distrito, estágio, pp consumidos/teto, tokens, US$ e duração.
- **Filtros**: período (24 h, 7 d, 30 d) e distrito, com estado na URL (`#/arsenal?p=7d&d=afiliados`).
- Densidade: as linhas têm 36 px, com números `tabular-nums` alinhados à direita. É a tela mais densa e não tem animação.
- Destaque automático: uma linha com "Onde mais gastou" ("Ferreiro: 41% dos tokens em 7 dias, quase todo em sonnet"). Sai de um cálculo simples em `logic/`, sem IA.

### 3.7 Distrito (genérico) e Afiliados

- **Distrito genérico:** nome, caminho ou URL, missões do distrito (Quadro filtrado), notas de agentes existentes (`.claude/agent-notes/`, só a lista) e **Nova missão aqui**.
- **Afiliados** ganha, acima disso, o **painel de operação** com três blocos: ofertas enviadas (hoje e 7 dias, com sparkline SVG), falhas (lista com hora e causa) e alertas do `ops`. Um alerta tem botão "Investigar" que abre Nova missão pré-preenchida com o alerta e o agente `ops`.
- A fonte desses dados ainda não está definida (pergunta aberta 4). O painel nasce com o estado "sem fonte configurada".

---

## 4. Membros da guilda (avatares)

### 4.1 Grupos, insígnias e codinomes

A cor nunca é o único sinal: cada grupo tem **forma** de insígnia própria.

| Grupo | Cor da faixa | Insígnia (forma) | Agentes → codinome |
|---|---|---|---|
| Direção | `--ouro` `#d4b27a` | rosa dos ventos de 4 pontas | orchestrator → **Regente**, intake → **Porteiro**, planner → **Estrategista** |
| Documentos | `--marfim` `#cfc2a5` | pena | prd-writer → **Escrivão**, spec-writer → **Copista**, spec-checker → **Aferidor**, scribe → **Escriba** |
| Código | `--aco-azul` `#7f9bb5` | martelo | explorer → **Batedor**, coder → **Ferreiro**, reviewer → **Juiz**, tester → **Provador**, debugger → **Rastreador**, refactorer → **Restaurador** |
| Pesquisa/escrita | `--verdete` `#7fae8a` | livro aberto | researcher → **Erudito**, fact-checker → **Testemunha**, writer → **Cronista**, editor → **Lapidador**, illustrator → **Iluminador** |
| Frontend | `--tiria` `#a77bb0` | compasso | frontend-architect → **Arquiteta**, frontend-builder → **Vitralista** |
| Segurança | `--sangue-texto` `#ef5350` | chave | security-reviewer → **Guardião** |
| Operação | `--ambar` `#d9a441` | lanterna | ops → **Sentinela**, deal-auditor → **Tesoureiro** |

Os codinomes são originais, em português e funcionais. Ficam num único `guild/roster.ts` (dado, não código) para o usuário trocar. Um `subagentType` desconhecido vira **Recruta**: manto cinza, sem insígnia.

> Observação: `agents/intake.md` não existe hoje em `agents/` (há 22 arquivos, contando o orchestrator, e o roster do PRD lista 23 nomes). O Porteiro fica no roster por segurança.

### 4.2 SVG parametrizado (sem arte pesada)

Um componente, `Avatar({ agente, vista: "frente" | "costas", tamanho, estado })`, com `viewBox="0 0 64 64"` e 5 camadas:

1. **Manto**: um `path` de trapézio com barra curva, `fill: var(--manto)` (grafite `#2b2426`, igual para todos, para preservar a unidade da guilda).
2. **Faixa / cinto**: um `path` diagonal, `fill: cor do grupo`. Esse é o portador de cor.
3. **Capuz**: um `path` em ogiva (eco da ponta do emblema em A). Na vista **frente**, abertura do rosto em `#0c0809` com dois pontos de luz opcionais (olhos) só no estado "ativo". Na vista **costas**, o capuz fechado.
4. **Insígnia** (só frente): `<use href="#ins-pena">` do sprite, 12×12 no peito, `fill: cor do grupo`.
5. **Emblema nas costas** (só costas): `<mask style="mask-type:alpha"><image href={emblemNtp}/></mask>` aplicada a um `rect` com `fill: color-mix(in srgb, var(--manto) 70%, var(--aco))`. O alfa do PNG do usuário vira um **bordado em baixo contraste** na cor que se quiser, sem traçar o emblema à mão e sem competir com o capuz. Abaixo de 24 px a máscara é trocada por um losango simples (o PNG vira ruído nesse tamanho).

Estados por CSS: `ativo` (luz de bronze embaixo, opacidade 1), `ocioso` (0.7), `falhou` (faixa vermelha + ícone), `concluido` (pequeno selo verdete). O **mensageiro** é o mesmo Avatar em 16 px, vista costas, com `transform: skewX(-12deg)` para sugerir corrida e um retângulo de 4×6 px como pergaminho. Não há sprite animado nem quadros.

Custo total: um componente (cerca de 80 linhas), um sprite de 7 insígnias e um PNG que já existe.

---

## 5. Emblema-medidor e selo: onde entram

### 5.1 Emblema-medidor (`Emblem.tsx`, spec 017)

Parte de `assets/emblem-gauge.svg`: os anéis são `circle` com `pathLength="100"` e `stroke-dasharray` ligado às props.

**Ideia que surpreende, o marcador de ritmo:** as divisões já existentes (7 no externo, uma por dia; 5 no interno, uma por hora) passam a ter função. Cada anel ganha um **ponto de tempo**, um pequeno losango de osso na posição `1 − restante/duração` da janela. Se o arco de uso está **à frente** do ponto, o consumo está mais rápido que o tempo, e o ponto fica âmbar. Com isso o usuário lê "62% usados com 40% da janela decorrida", que é a informação que de fato importa para planejar. Isso sai de `reiniciaEm` e da duração conhecida da janela, sem dado novo.

| Onde | Tamanho | Conteúdo |
|---|---|---|
| Cabeçalho (todas as telas) | 40 px | anéis + texto ao lado no desktop (`5h 62% · 2h10`); no celular só os anéis, e o toque abre um popover com os valores |
| Salão (torre central) | 240 px | anéis, pontos de ritmo, legendas `SEMANA 35% · reinicia em 3d 4h` e `5 HORAS 62% · reinicia em 2h10` |
| Nova missão | 96 px | uso atual + **arco fantasma** do teto da missão |
| Missão ao vivo (painel Consumo) | 64 px | uso global; ao lado, a barra pp da missão |
| Arsenal | 120 px | as duas janelas |
| Favicon | 32 px | emblema simplificado (PNG reduzido); vermelho quando há ação pendente |

**Faixas** (spec 017): normal < 80%, atenção ≥ 80%, crítico ≥ 90%. A cor do anel **não muda** (prata e vermelho são identidade). Mudam o **texto** (rótulo "atenção" ou "crítico" em âmbar ou vermelho-texto) e o **aro externo**, que ganha um brilho âmbar estático. Ao cruzar 80% há uma única pulsação (não em loop) e uma notificação.

**Contagem regressiva:** resolução de minuto, com `setTimeout` alinhado à virada do minuto (não 1/s). Abaixo de 1 h mostra `47min`.

**Uso indisponível:** os anéis viram trilho **tracejado** sem arco, o centro mantém o emblema em 40% de opacidade e o texto diz `uso indisponível`. No Salão aparece ainda "Atualiza quando a guilda fizer a próxima chamada ao modelo" e o botão `Consultar agora` com a nota de custo. Se o último evento tiver `resetsAt` já vencido, o valor é descartado e vale o mesmo estado. **Nunca se mostra 0% como substituto.**

Acessibilidade: os anéis são `aria-hidden`. O texto visível é a fonte da verdade, e no modo compacto há um `aria-label` completo ("Uso do plano: janela de 5 horas 62%, reinicia em 2 horas e 10 minutos; semana 35%, reinicia em 3 dias").

### 5.2 Selo circular (`seal-ntp.png`)

- **Aprovação**: é o botão de confirmação e a animação de carimbo (§8). Depois fica cravado, a 64 px, no canto inferior direito do pergaminho de missões aprovadas, servindo de prova visual do portão.
- **Missão concluída**: selo pequeno (24 px) no cartão do Quadro.
- **Salão**: marca d'água do mapa (8% de opacidade, 480 px, atrás da cidade). Não aparece como logotipo no cabeçalho, onde o emblema já ocupa esse papel.
- **Estados vazios e tela de carregamento inicial**: selo a 10% com a frase do estado.
- **Selo rachado** (portão recusou): mesma imagem com `clip-path` em dois polígonos levemente deslocados. É CSS, sem arte nova.

---

## 6. Design system

### 6.1 Tokens de cor (`theme.css`, custom properties)

Contrastes calculados (WCAG 2.x) sobre o fundo indicado.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--noite-0` | `#0c0809` | fundo da página | — |
| `--noite-1` | `#160e0f` | superfície (cartões, painéis) | — |
| `--noite-2` | `#241416` | superfície elevada, diálogos | — |
| `--vinho` | `#5a1a1f` | coluna "Aguarda o selo", realces de fundo | — |
| `--osso` | `#ece3d0` | texto principal na noite | ≈ 15:1 em noite-0 |
| `--aco` | `#a9adb3` | texto secundário, anel semanal | ≈ 7.8:1 em noite-2 |
| `--bronze` | `#b08a5a` | filetes, rótulos, traço do mapa | ≈ 5.6:1 em noite-2 |
| `--ouro` | `#d4b27a` | títulos, grupo Direção | > 8:1 |
| `--sangue` | `#c1121f` | anel 5 h, fundo do botão Parar e perigo (texto `#fff` ≈ 6.2:1) | 3.2:1 em noite-0: **só preenchimento e UI, nunca texto na noite** |
| `--sangue-texto` | `#ef5350` | texto de erro e alarme na noite | ≈ 5.1:1 em noite-2 |
| `--ambar` | `#d9a441` | atenção, disjuntor perto do limite | ≈ 8.8:1 |
| `--verdete` | `#7fae8a` | sucesso, concluída | ≈ 7.8:1 |
| `--pergaminho` | `#ebdfc4` | fundo da Sala de guerra | — |
| `--tinta` | `#2a1a17` | texto no pergaminho | ≈ 12:1 |
| `--tinta-suave` | `#6b5a4e` | texto secundário no pergaminho | ≈ 5:1 |
| `--sangue` sobre pergaminho | `#c1121f` | links e alertas no pergaminho | ≈ 4.7:1 |
| `--foco` | `#ece3d0` + sombra `#0c0809` | anel de foco | visível nos dois climas |

O contraste do `--sangue` é o principal ponto de AA: é ótimo para anel e preenchimento, mas reprova como texto sobre a noite. Por isso existe `--sangue-texto`.

**Modo claro** (spec 012): todos os climas viram pergaminho, com `--noite-*` mapeado para tons de papel, `--osso` para `--tinta` e o emblema sobre um disco `--noite-2` (o metal precisa de fundo escuro). A troca é só de tokens via `[data-tema="claro"]`. O padrão segue `prefers-color-scheme`, mas a recomendação é **escuro**.

### 6.2 Tipografia

Fontes OFL, **auto-hospedadas** em `packages/web/public/fonts` (woff2, subconjunto latin; o app é local e não pode depender de CDN):

- **Cinzel** (400/600): capitulares romanas que ecoam o letreiro do selo. Só para títulos de tela, rótulos de coluna em versalete e nomes de distrito. Nunca em texto corrido.
- **Alegreya** (400/italic/700): serifada de inspiração caligráfica renascentista, para o **pergaminho** (documentos).
- **Alegreya Sans** (400/500/700): interface, com `font-variant-numeric: tabular-nums` em todos os números.
- `ui-monospace`: nomes de ferramenta, modelo e caminhos.

O orçamento fica em cerca de 6 arquivos woff2 e menos de 200 KB. O spec 011 usa `system-ui` e `Georgia`, e as fontes entram no 012.

Escala (rem, base 16): 0.75 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25 (só Cinzel). Altura de linha de 1.5 na UI e 1.65 no pergaminho.

### 6.3 Espaço, forma e ícones

- Base de 4 px: `--e-1: 4px … --e-8: 32px`, `--e-12: 48px`.
- Raio de **2 px**: a estética é gravada e metálica, nada de cantos arredondados de app de consumo. Os diálogos usam 4 px.
- Bordas: filete de 1 px `--bronze` a 40% e, nos títulos de seção, **filete duplo** (`border-bottom: 3px double`), o ornamento tipográfico mais barato que existe.
- Sombras: só nos diálogos e no selo. Superfícies se distinguem por tom, não por sombra.
- **Ícones**: um sprite SVG (`guild/icons.svg`, `<symbol>`) com cerca de 20 ícones de traço 1.5 em `currentColor`: as 7 insígnias, sino, parar, selo, pergaminho, mensageiro, adicionar, distrito, filtro, ordenar, alerta, ok, relógio, chave, link. Sem biblioteca de ícones.

### 6.4 Componentes (reaproveitados entre telas)

`Shell` (cabeçalho, nav e barra inferior) · `Emblem` (tamanhos: compacto, médio, grande; prop `fantasma`) · `Avatar` · `StageBadge` · `MissionCard` · `PlanMeter` (barra pp/teto) · `BreakerFuse` (pavio de entalhes) · `Chronicle` · `Lanes` · `Parchment` (leitor) · `SealButton` · `ConfirmDialog` (`<dialog>` nativo) · `AlarmBanner` · `EmptyState` · `Skeleton` · `DataTable` (ordenável).

A lógica fica em `src/logic/*.ts`, pura e com `now` injetado: `groupByStage`, `formatTempoRestante`, `ritmo(janela, now)`, `faixa(pct)`, `consumoPp`, `cronicaDe(eventos)`, `ondeMaisGastou`, `gateState`.

---

## 7. Estados

| Estado | Onde | Tratamento |
|---|---|---|
| **Vazio: sem distritos** | Salão | mapa com todos os lotes como "terreno vazio", selo a 10% e "Nenhum distrito no mapa. Anexe um projeto para a guilda trabalhar." + botão primário |
| **Vazio: sem missões** | Quadro | colunas vazias com uma única mensagem central: "Nenhum contrato ainda." + `Nova missão (N)` |
| **Vazio: coluna** | Quadro | texto discreto na coluna ("nada aguardando seu selo"), sem ilustração |
| **Vazio: Arsenal** | Arsenal | "Sem gastos no período" + troca rápida de período |
| **Carregando** | geral | esqueletos em `--noite-1` com filetes, **sem shimmer** (estáticos, CPU zero); emblema com só os trilhos |
| **Carregando: pacote** | Sala de guerra | pergaminho com linhas de tinta claras |
| **Erro: servidor fora** | Shell | faixa âmbar fixa no topo: "O salão perdeu contato com o servidor. Tentando de novo em 8s… [Tentar agora]"; dados ficam visíveis e marcados "desatualizado há 2min" |
| **Erro: SSE caiu** | Missão ao vivo | reconexão com backoff (1, 2, 4… até 30 s) e `Last-Event-ID`; a crônica ganha a linha "— mensageiro perdido, reconectando —" |
| **Erro: artefato ausente ou ilegível** | Sala de guerra | item do índice com ⚠ e "arquivo não encontrado: `<caminho>`"; Selar continua possível, com aviso no diálogo |
| **Agente falhou** | Ao vivo + sino | avatar com faixa vermelha, mensageiro de volta com pergaminho vermelho, linha da crônica em `--sangue-texto`, contador do sino +1 |
| **Disjuntor disparado** | Ao vivo, Quadro, Salão, sino | `AlarmBanner` com `role="alert"`: "Disjuntor: 9 handoffs seguidos sem sua intervenção (limite 8). A missão foi recolhida." O pavio fica todo vermelho com o último entalhe "partido"; notificação do navegador; ações conforme a pergunta aberta 1 |
| **Teto do plano atingido** | idem | mesma faixa, em âmbar: "A missão consumiu 10 de 10 pp do plano e foi pausada." |
| **Uso do plano indisponível** | Emblema, Nova missão | §5.1 e §3.3: trilho tracejado, texto explícito e confirmação obrigatória antes de iniciar |
| **Portão recusado** | Sala de guerra | selo rachado + mensagem (§3.4) |
| **Notificações negadas** | menu | aviso discreto "Notificações bloqueadas no navegador"; o título da aba continua funcionando |

---

## 8. Microinterações

Todas usam só `transform`, `opacity`, `clip-path` ou `stroke-dashoffset`, são **de disparo único** e duram menos de 1 s. Nenhuma fica em loop.

| Interação | Gatilho | Coreografia | Duração |
|---|---|---|---|
| **Selo de cera** | confirmar Selar | selo entra em `scale(1.5) rotate(-14deg)` com sombra larga → `scale(1) rotate(-4deg)` com sombra curta (impacto); um anel SVG de "cera" se expande e some; o pergaminho dá um tranco de 2 px | 320 + 220 ms |
| **Pergaminho abrindo** | abrir documento | `clip-path: inset(0 0 100% 0)` → `inset(0)` com as bordas de rolo descendo junto | 300 ms |
| **Pergaminho enrolando** | após o selo | o inverso, mais rápido, e depois a navegação | 220 ms |
| **Mensageiro correndo** | `subagent-started` / `finished` | Avatar de 16 px percorre `offset-path` entre os telhados com `offset-distance 0 → 100%` e `ease-in-out`; ao chegar, o destino dá um "aceno" (`translateY -2px`) | 900 ms |
| **Ferramenta em uso** | evento `tool` | o rótulo sob o avatar troca com fade cruzado; sem animação contínua | 150 ms |
| **Anéis do emblema** | novo `rate-limit` | `stroke-dashoffset` transiciona do valor antigo para o novo | 600 ms |
| **Entalhe do pavio** | handoff | o entalhe acende (opacidade 0.3 → 1) | 200 ms |
| **Disjuntor** | parada | o pavio fica vermelho e o último entalhe "parte" em duas metades que se afastam 3 px; a faixa desce do topo | 400 ms |
| **Tinta no mapa** | hover/foco em distrito | traço bronze → osso | 150 ms |
| **Cartão mudando de coluna** | mudança de estágio | sem movimento entre colunas (caro e confuso); o cartão novo aparece com um realce de borda que esmaece | 600 ms |

Com `prefers-reduced-motion: reduce` **ou** "modo sem animação", todas as durações viram 0. O selo aparece já cravado, os mensageiros não aparecem (a crônica já conta a história) e os anéis saltam ao valor final.

---

## 9. Responsividade

Pontos de quebra: **< 640** (celular), **640–1023** (tablet ou janela estreita), **≥ 1024** (desktop). Layout com CSS Grid e `minmax`, sem biblioteca.

| Tela | Desktop | Celular |
|---|---|---|
| Salão | mapa + emblema + coluna lateral | emblema grande no topo, faixa "aguardam selo", lista de distritos (o mapa vira ilustração de 160 px, não interativa) |
| Quadro | 6 colunas | abas por estágio com contadores |
| Nova missão | painel lateral de 480 px | tela cheia, botão fixo embaixo |
| Sala de guerra | índice, pergaminho e veredito | pergaminho em tela cheia, `<select>` de documento, barra fixa `[Ajustes] [Selar]` |
| Ao vivo | telhados, crônica e consumo | `Parar` fixo no topo; telhados vira **lista vertical** de agentes (avatar 32 px + ferramenta); consumo resumido numa linha; crônica embaixo; Raias indisponível |
| Arsenal | tabelas completas | cartões por agente com 3 números; tabela por missão com rolagem horizontal e primeira coluna fixa |

Alvos de toque com no mínimo 44×44 px. Teste com screenshots em **390 px** e **1440 px** (spec 011).

---

## 10. Acessibilidade

- **Estrutura:** `header`, `nav`, `main` e `aside`. Link "Pular para o conteúdo". Um `h1` por tela.
- **Teclado:** tudo alcançável por Tab, com ordem lógica. Atalhos de uma tecla **só fora de campos de texto** e listados em `?`: `N` nova missão, `A` selar, `J` ajustes, `R` alterna Raias, `Esc` fecha diálogo, `Ctrl+Enter` envia formulário. Usar `<dialog>` nativo dá foco preso e `Esc` de graça. Depois de selar, o foco vai para o `h1` da Missão ao vivo.
- **Foco visível:** `outline: 2px solid var(--foco); outline-offset: 2px` + `box-shadow: 0 0 0 4px var(--noite-0)`. Funciona na noite e no pergaminho.
- **Contraste AA:** tabela §6.1, com a regra de nunca usar `--sangue` como texto sobre a noite. Estado nunca só por cor: estágio tem texto, grupo tem forma de insígnia e faixa de uso tem rótulo.
- **Regiões vivas:** `AlarmBanner` com `role="alert"` (falha, disjuntor, teto). Crônica com `aria-live="polite"`, mas **anunciando só resumos** a cada 10 s no máximo ("Ferreiro terminou; Provador convocado"), para não metralhar o leitor de tela.
- **Medidor:** texto visível como fonte da verdade e anéis `aria-hidden` (§5.1).
- **Mapa:** links reais com nome acessível "Distrito afiliados, 2 missões ativas, 1 alarme".
- **Movimento:** `@media (prefers-reduced-motion: reduce)` **e** `html[data-motion="off"]` (alternância no menu, salva em `localStorage`), com a mesma regra:
  `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }` e o componente Mensageiro não renderiza.
- **Tabelas:** `<table>` real com `<th scope>` e `aria-sort`.

---

## 11. Desempenho e CPU em repouso

- **Zero animação infinita.** Sem vela tremulando, shimmer ou spinner girando. Em repouso, o único trabalho é um `setTimeout` por minuto para o relógio.
- **SSE em lote:** eventos acumulam num buffer e são aplicados ao estado no máximo a cada 250 ms (um `setState` por lote). As Raias redesenham a cada 500 ms.
- **Aba oculta** (`document.hidden`): para de animar mensageiros (eventos só entram na crônica) e de redesenhar as Raias. O SSE continua, para as notificações.
- **Mensageiros:** no máximo 3 simultâneos. Excedentes são descartados visualmente, já que a crônica registra todos.
- **DOM limitado:** crônica com as 500 últimas linhas. Quadro de concluídas com as 10 últimas.
- **SVG estático** para o mapa (um arquivo, menos de 30 KB) e as camadas animadas como elementos separados, para não repintar a cidade.
- **Sem canvas:** nada aqui precisa dele.
- **Sem consulta de uso em segundo plano** por padrão: o medidor só atualiza com eventos das missões. Consultar sem missão gasta plano, então é decisão do usuário (pergunta aberta 3).
- Dependências do app: `react`, `react-dom` e `vite` (versões exatas). No 012, opcionalmente um renderizador de markdown. Sem roteador, gerenciador de estado, biblioteca de ícones ou biblioteca de animação.
- Meta (spec 012): menos de 2% de CPU em repouso na Missão ao vivo sem eventos, medido no Chrome Performance Monitor.

---

## 12. Onde a interface surpreende

1. **Marcador de ritmo nos anéis:** mostra uso contra o tempo decorrido da janela. É a pergunta real de quem usa Claude Pro ("vou esgotar antes de reiniciar?"), respondida num olhar.
2. **Arco fantasma na Nova missão:** o teto em pp deixa de ser número abstrato e vira um pedaço visível do anel.
3. **Duas luzes:** a mudança de clima (noite para pergaminho) é o próprio portão. Não dá para aprovar "sem perceber".
4. **Agente de costas quando ativo:** o emblema no manto aparece justamente quando o membro sai em missão, então a identidade NTP marca a ação e não decora.
5. **Densidade honesta:** pp só por missão (é o que a fonte permite), tokens por agente e US$ sempre rotulado "informativo".
6. **Caminho mais curto:** a faixa "Aguardam seu selo", a notificação com link direto e `A` para selar.

---

## 13. Ordem de construção

### Spec 011 — casca funcional (sem pele, mas já com a estrutura certa)

1. `packages/web` com Vite, React e TS, versões exatas. `theme.css` com os **tokens de §6.1 já nomeados** (valores definitivos de cor; fontes de sistema). Assim o 012 não renomeia nada.
2. Roteador por hash, `Shell` (cabeçalho, nav e barra inferior) e cliente SSE com reconexão em lote.
3. `logic/*.ts` + testes: `groupByStage`, `formatTempoRestante`, `faixa`, `consumoPp`, `cronicaDe`, `gateState`, `ondeMaisGastou`.
4. Telas na ordem do fluxo E2E: **Quadro → Nova missão → Sala de guerra** (texto `pre-wrap`, Selar com `<dialog>` simples, Pedir ajustes) **→ Missão ao vivo** (crônica, consumo, pavio do disjuntor em texto e barras, Parar) **→ Arsenal** (tabelas).
5. **Salão como lista** de distritos + faixa "Aguardam seu selo" (o mapa fica para o 012). Página de distrito genérica.
6. Todos os estados de §7 (texto e layout, sem ilustração), teclado, foco, `prefers-reduced-motion`, responsivo em 390 e 1440 px.
7. Avatar provisório: círculo com cor do grupo + codinome (já lendo `roster.ts`).

### Spec 017 — emblema-medidor (pode correr em paralelo ao fim do 011)

`Emblem.tsx` com tamanhos, marcador de ritmo, arco fantasma, estado indisponível e alerta de 80%. Entra no cabeçalho e na Nova missão do 011.

### Spec 012 — pele da guilda

1. Fontes auto-hospedadas e modo claro e escuro.
2. Sprite de ícones e insígnias, e `Avatar` SVG (frente, costas e emblema por máscara).
3. **Selo** (resolver antes o fundo do `seal-ntp.png`): `SealButton`, animação de carimbo, selo cravado, selo rachado.
4. Pergaminho na Sala de guerra (clima claro, abrir e enrolar) + renderizador de markdown com HTML escapado.
5. Linha dos Telhados + mensageiros (`offset-path`), depois o modo Raias.
6. Mapa SVG da cidade no Salão (8 lotes, marca d'água do selo).
7. `AlarmBanner` visual, notificações do navegador, título da aba, favicon com estado.
8. Alternância "modo sem animação", auditoria de CPU, Lighthouse e screenshots claro, escuro, celular e desktop.

### Depois

Painel de operação do distrito Afiliados (depende da fonte de dados, pergunta aberta 4).

---

## 14. Perguntas em aberto para o usuário

1. **Como responder ao disjuntor?** Em `mission.ts`, `parada` é **terminal** (`parada: []`), mas o PRD diz "para e me pergunta". A interface precisa de "Responder e retomar" (com comentário) para o disjuntor e o teto do plano, e de "Encerrar" para o botão Parar. Proposta: um estágio `pausada` (retomável) separado de `parada` (encerrada), ou permitir `parada → planejando | executando` com intervenção do usuário. Qual prefere?
2. **Selo do PNG:** o `seal-ntp.png` parece ter o xadrez de transparência gravado nos pixels. Pode reexportar com alfa real?
3. **Consulta de uso sem missão:** atualizar o medidor em repouso exige uma chamada mínima ao modelo, que gasta um pouco do plano. Prefere só manual (botão "Consultar agora", que é a recomendação), ou periódica (por exemplo, a cada 30 min com o Salão aberto)?
4. **Fonte do painel Afiliados:** de onde vêm ofertas enviadas, falhas e alertas do `ops`? É um arquivo de log, um banco do projeto ou relatórios em `.claude/`? Sem isso, o painel nasce "sem fonte configurada".
5. **Codinomes:** aprova a lista de §4.1 (Regente, Ferreiro, Sentinela…)? Quer trocar algum?
6. **Markdown:** aceita uma dependência pequena de markdown no 012 (com HTML cru escapado), ou prefere manter `pre-wrap` com destaque mínimo de títulos e listas feito à mão?
7. **Lemas do selo:** o selo traz "Requiescat in pace" e "Creed of the shadows". São frases genéricas (latim litúrgico e inglês comum) e servem bem para uso local, mas são muito associadas à franquia de referência. Para manter a regra "nada de terceiros" à risca (se um dia o app for publicado), considere o lema próprio "Nil timet potentiam" como único texto. Mantém como está?
8. **Limiar de início:** confirma 80% na janela de 5 h e 90% na semanal como gatilhos da confirmação, e 10 pp como teto padrão da missão?
9. **Tema padrão:** escuro fixo como padrão (recomendado), ou seguir o sistema?
10. **`agents/intake.md`** não existe no repositório, embora o PRD liste o intake no roster. Foi intencional (o orquestrador faz o intake)? Isso define se o Porteiro aparece na guilda.

---

## 15. Decisões tomadas (2026-11-21) — respostas às perguntas da §14

O usuário delegou as decisões ("resolva tudo e me entregue pronto"). Direção escolhida: **A, "Duas Luzes"**.

1. **Disjuntor:** novo estágio `pausada` (retomável com comentário do usuário), separado de `parada` (encerrada, terminal). Spec 022.
2. **Selo:** `assets/seal-ntp.png` já é RGBA com transparência real (o xadrez foi removido); usar esse arquivo, não o original `Gemini_Generated_Image_*.jpeg`.
3. **Uso sem missão:** só manual, botão "Consultar agora" (gasta uma chamada mínima do plano).
4. **Afiliados:** o painel mostra o último relatório do agente `ops` (arquivo `.claude/ops-report.md` do projeto, gerado sob demanda por um botão "Rodar ops"); sem leitura direta do banco do projeto. Fica para depois do 012.
5. **Codinomes:** lista da §4.1 aprovada.
6. **Markdown:** sem dependência nova; `pre-wrap` com destaque de títulos e listas feito à mão.
7. **Lemas do selo:** mantidos como estão (uso pessoal e local). Revisar antes de qualquer publicação.
8. **Limiares:** 80% (janela de 5 h) e 90% (semana) pedem confirmação; teto padrão da missão 10 pp.
9. **Tema padrão:** escuro fixo; claro só na Sala de guerra (pergaminho) e por preferência.
10. **Intake:** `agents/intake.md` será criado no spec 013; o Porteiro aparece na guilda.
