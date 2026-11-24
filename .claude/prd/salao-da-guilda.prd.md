# PRD — Salão da Guilda (interface e servidor)

## Problem Statement

Sem interface, o usuário precisa abrir terminal, lembrar flags, ler arquivos soltos para aprovar planos e não enxerga o que cada agente faz nem quanto custa. Existe um visualizador pronto (agents-office), mas só espelha sessões; não é a porta de entrada das demandas, não tem portão de aprovação nem conceito de missão e tem estética fixa.

## Solution

Um app web local, o **Salão da Guilda**, com visual inspirado em uma guilda de assassinos (capuz, pergaminho, bordô e ouro, estilo Animus; arte, nomes e símbolos originais, sem marcas de terceiros). É a porta de entrada: o usuário escolhe o distrito (projeto), cola a demanda ou link do ClickUp e a orquestração começa dali. Lê o pacote na sala de guerra, aprova com um selo e acompanha a execução ao vivo, com custo por agente.

## User Stories

1. Como usuário, quero escolher o projeto (distrito) e colar a demanda, para iniciar uma missão sem abrir o terminal.
2. Como usuário, quero ver as missões num quadro por estágio, para saber o que está planejando, aguardando e executando.
3. Como usuário, quero ler plano, design, PRD e specs na sala de guerra, para decidir com informação.
4. Como usuário, quero um botão Aprovar que sela a missão, para liberar a fase 2.
5. Como usuário, quero Pedir ajustes com comentário, para reabrir a fase 1.
6. Como usuário, quero acompanhar a missão ao vivo (quem está agindo, ferramenta, modelo), para entender o progresso.
7. Como usuário, quero ver as trocas de handoff entre agentes como mensageiros no mapa, para entender a "conversa".
8. Como usuário, quero ver custo e tokens por agente e por missão, para identificar onde gasto mais.
9. Como usuário, quero definir quanto do meu plano (pontos percentuais da janela de 5 horas) uma missão pode consumir, e ver o uso atual antes de iniciar, para não esgotar o limite do Claude Pro.
10. Como usuário, quero um botão Parar que encerra a missão e o processo, para interromper a qualquer momento.
11. Como usuário, quero retomar missões após fechar o navegador ou reiniciar, para não perder trabalho.
12. Como usuário, quero um alarme visual quando um agente falha ou o disjuntor dispara, para agir rápido.
13. Como usuário, quero ver a tela do afiliados (ofertas enviadas, falhas, alertas do ops), para operar o projeto.
14. Como usuário, quero que o servidor só aceite conexões locais, para que ninguém dispare agentes que editam código.
15. Como usuário, quero marcar na missão se commit/push são permitidos (padrão: não), para não ter ações irreversíveis sem pedir.
21. Como usuário, quero anexar um projeto pela interface informando a URL do repositório (ou pasta local), para o laboratório trabalhar nele.
22. Como usuário, quero citar o projeto só pelo nome numa demanda e o laboratório retomar de onde parou, para não reexplicar o contexto.
23. Como usuário, quero ver o emblema NTP com o uso do Claude (janela de 5 horas e semanal) e o tempo para cada reset, para planejar o uso.
16. Como usuário, quero ver os agentes como membros da guilda com codinome e insígnia por função, para a interface ser agradável e legível.
17. Como usuário, quero microinterações (selo de cera ao aprovar, pergaminho abrindo, mensageiro correndo), para a experiência ser memorável.
18. Como usuário, quero a interface responsiva e acessível (teclado, contraste, reduzir movimento), para uso confortável.
19. Como usuário, quero um modo sem animação, para economizar CPU quando necessário.
20. Como usuário, quero notificação quando a missão aguarda minha aprovação ou termina, para não ficar olhando a tela.

## Implementation Decisions

- **Servidor Node (TS, ESM)** local em `127.0.0.1` com `node:http` e SSE; sem banco: o estado é lido de `missions/<id>/mission.json` e dos artefatos no projeto alvo.
- **Orquestração por subprocesso**: o servidor executa `claude -p --agent orchestrator --output-format stream-json` com `--session-id`, `--permission-mode`, `--max-budget-usd` (só como rede de segurança) e `--allowedTools` conforme a fase (fase 1 sem Edit/Bash; fase 2 com edição e comandos de teste). Fase 2 usa `--resume <sessão>`. Sem SDK extra; usa o login existente do Claude Code.
- **Leitura passiva para métricas**: custo e tokens vêm do stream-json e dos transcripts em `~/.claude/projects`; observar não gasta tokens.
- **Portão**: o botão Aprovar grava `approved` na pasta da missão; o servidor só inicia a fase 2 se o arquivo existir e for válido (falha fechado).
- **Disjuntor também no servidor**: o servidor conta invocações de subagentes e voltas pelo stream e mata o processo ao estourar o limite da missão.
- **Sem autenticação** por ficar em loopback; qualquer processo local é confiável. Rejeitar Host/Origin que não sejam locais (proteção contra DNS rebinding e CSRF de páginas externas).
- **Frontend**: Vite + React + TypeScript; animação em CSS/SVG/canvas leve; tokens de tema em CSS custom properties; `prefers-reduced-motion` respeitado.
- **Direção visual definida pelo `frontend-architect`** antes de construir (documento de design em `.claude/design/`); `frontend-builder` implementa e valida com screenshots.
- **Telas**: Salão (mapa com distritos), Quadro de missões, Sala de guerra, Missão ao vivo, Arsenal (custos), distrito Afiliados.
- **Distritos** vêm do registro de projetos (spec 016), cadastrado pela própria interface.
- Dependências com versão exata (sem `^`/`~`).

## Testing Decisions

- Testar comportamento: máquina de estados da missão, aprovação fail-closed, parse do stream-json (fixtures reais gravadas no spike), disjuntor, rejeição de Host/Origin.
- Lógica da UI em módulos puros (`*Logic.ts`) com `now` injetado; camada React fina.
- E2E com Playwright apenas no fluxo principal: criar missão (agente falso) → aprovar → concluir.
- Um agente falso (script que emite stream-json gravado) substitui o `claude` nos testes: sem rede e sem custo.
- Prior art: contratos zod com `safeParse` em todas as fronteiras, como no agents-office.

## Out of Scope

- Autenticação e acesso remoto.
- Terminal embutido e navegador embutido.
- Edição do código dentro da interface.
- Empacotamento desktop (Electron).

## Further Notes

- Marca: estética inspirada, sem logos, nomes ou arte de terceiros.
- O app só lê o que os agentes já escrevem em arquivo, por isso vem depois do núcleo.
