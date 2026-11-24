# Guilda de agentes

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black) ![Node](https://img.shields.io/badge/Node-24+-5FA04E?logo=nodedotjs&logoColor=white) ![Claude Code](https://img.shields.io/badge/Claude%20Code-subagentes-D97757)

Hub local que orquestra subagentes do Claude Code em vários projetos. Você descreve a demanda, a Guilda planeja, espera o seu **selo** (aprovação) e só então executa, sempre respeitando o limite do seu plano Claude Pro. O servidor roda só na sua máquina.

## O que tem

- **23 subagentes especializados** (`agents/`): planner, coder, tester, reviewer, debugger, security-reviewer, frontend-architect/builder, researcher, writer, editor, illustrator, intake (ClickUp, somente leitura) e outros. Cada um com ferramentas e modelo mínimos.
- **Fluxo em duas fases:** Fase 1 (plano, PRD, specs) → selo do usuário → Fase 2 (execução). Sem selo, nada executa.
- **Disjuntor e orçamento do plano:** limite de voltas por spec e de handoffs encadeados; nunca passa de 80% da janela de 5 h sem confirmar; leitura de uso em tempo real.
- **Interface web** (React + Vite): Salão, Escritório animado (2D e 3D com three.js) com mostrador do plano, Quadro, Arsenal, Guilda, Projetos, Redação, Afiliados e central de notificações.
- **Redação:** pesquisa de temas, rascunho de artigos para LinkedIn, checagem de fatos e capa (SVG/PNG). Nunca publica sozinho.
- **Afiliados:** painel para o projeto `afiliados` (nichos, grupos, agenda, saúde e links de afiliado).
- **Modelo local (Ollama):** tarefas fechadas e verificáveis (ex.: compactar log de teste) podem rodar localmente, com liga/desliga automático.
- **Notificações:** dentro da Guilda e no painel de notificações do sistema (`notify-send`).

## Requisitos

- Node 24 ou superior
- CLI `claude` instalada e logada numa conta Claude Pro (sem chave de API)
- Opcional: Ollama (modelo local), `notify-send` (notificações do desktop)

## Como iniciar

```bash
npm install
bash scripts/install-agents.sh   # liga os agentes em ~/.claude/agents
npm run build:web                # gera packages/web/dist
npm start                        # http://127.0.0.1:4317
```

- Outra porta: `PORT=5000 npm start` (`PORT=0` escolhe uma livre).
- Servidor com reinício automático: `npm run dev:server`.
- Dados locais na raiz: `missions/`, `projects.json`, `workspaces/`, `redacao/` (todos fora do git).
- Ctrl+C interrompe as missões em andamento e os processos `claude` filhos.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `agents/` | Definição dos subagentes e do orquestrador |
| `packages/core` | Estado da missão, disjuntor, orçamento, projetos, regras puras |
| `packages/server` | Runner headless, portão de aprovação, uso, notificações, APIs |
| `packages/web` | Interface React/Vite (inclui o escritório 3D) |
| `scripts/` | Instalação dos agentes, validação, modelo local, capa |
| `.claude/` | PRDs, specs, design e learnings do próprio projeto |

## Uso sem supervisão

O login por assinatura expira. Para rodar sem alguém por perto, gere um token de longa duração com `claude setup-token` e siga as instruções que o próprio comando mostra.

## Limite real: o plano

Não há cobrança por chamada: o limite é o uso do plano Claude Pro (janela de 5 horas e janela semanal). Planeje pelo uso do plano; o teto em dólares é só uma rede de segurança.

## Segurança

- O servidor escuta apenas em `127.0.0.1`. Requisições com `Host` ou `Origin` não locais recebem 403.
- Não exponha a porta (túnel, proxy, port-forward): não há autenticação.
- Comandos da fase de execução vêm de uma lista fechada (testes, lint, build). Subir a aplicação (docker, `air`) é com você; o hub só mostra a sequência.
- Arquivos estáticos só de `packages/web/dist`, sem `..` nem links simbólicos para fora.
- Nada de projetos clonados é executado pelo servidor; o ClickUp é lido, nunca escrito, sem pedido.

## Testes

```bash
npx vitest run
npx tsc --noEmit
node scripts/validate-agents.ts agents
```
