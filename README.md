# Laboratory Agents

Hub local que orquestra agentes do Claude Code (Guilda de agentes). O servidor roda só na sua máquina.

## Requisitos
- Node 24 ou superior
- CLI `claude` instalada e logada numa conta Claude Pro (sem chave de API)

## Como iniciar
```bash
npm install
bash scripts/install-agents.sh   # instala os agentes em ~/.claude/agents
npm start                        # http://127.0.0.1:4317
```
- Outra porta: `PORT=5000 npm start` (`PORT=0` escolhe uma livre).
- Desenvolvimento do servidor, com reinício automático: `npm run dev:server`.
- Front-end: `npm run build:web` gera `packages/web/dist`. Enquanto ele não existe, a raiz mostra uma página explicando isso; a API (`/missions`, `/projects`) já funciona.
- Dados ficam na raiz do hub: `missions/`, `projects.json` e `workspaces/` (repositórios clonados).
- Encerrar com Ctrl+C: as missões em andamento e os processos `claude` filhos são interrompidos.

## Uso sem supervisão
O login por assinatura expira. Para rodar sem alguém por perto, gere um token de longa duração com `claude setup-token` e siga as instruções que o próprio comando mostra para disponibilizar o token ao processo.

## Limite real: o plano
Não há cobrança por chamada: o limite é o uso do plano Claude Pro (janela de 5 horas e janela semanal). No teste real, a fase 1 média custou cerca de 7 pontos percentuais da janela de 5 horas. O teto em dólares por missão é só uma rede de segurança; planeje pelo uso do plano.

## Segurança
- O servidor escuta apenas em `127.0.0.1`, nunca em `0.0.0.0`. Requisições com `Host` ou `Origin` que não sejam locais recebem 403.
- Não exponha a porta (túnel, proxy, port-forward): não há autenticação.
- Arquivos estáticos são servidos só de `packages/web/dist`, sem seguir `..` nem links simbólicos para fora.
- Nada de projetos clonados é executado pelo servidor.

## Testes
`npx vitest run` e `npx tsc --noEmit`.
