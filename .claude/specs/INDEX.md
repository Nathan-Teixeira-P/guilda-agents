# Specs - guilda-agents

| # | Título | Prioridade | Status | Tags | Dependências |
|---|--------|-----------|--------|------|--------------|
| 001 | Spike do Claude Code headless | high | done | spike, core | - |
| 002 | Missão e portão de aprovação | high | done | core, logic | 001 |
| 003 | Disjuntor e classificador | high | done | core, cost | 002 |
| 004 | Esqueleto do hub e validador | high | done | core, config | 002 |
| 005 | Agentes de direção e documentos | high | done | agents | 004 |
| 006 | Agentes de código | high | done | agents | 004 |
| 007 | Agentes de pesquisa, escrita e ops | medium | done | agents | 004 |
| 008 | Agentes de frontend e apoio | high | done | agents, frontend | 004 |
| 009 | Servidor: runner e stream | high | done | server | 003, 005 |
| 010 | Servidor: HTTP, SSE e portão | high | done | server, api | 009, 019 |
| 011 | Web: casca e telas | high | done | frontend | 010, 008, 022, 023, 024 |
| 012 | Web: pele da guilda | medium | done | frontend, design | 011 |
| 013 | Intake do ClickUp | medium | done | integration | 005, 010 |
| 014 | Ponte para modelo local | low | done | integration, cost | 003, 009 |
| 015 | Agente illustrator (imagem do artigo) | medium | done | agents, content | 007 |
| 016 | Registro de projetos e retomada por nome | high | done | server, memory | 010 |
| 017 | Emblema NTP e medidor de uso | medium | done | frontend, usage | 001, 011 |
| 018 | Limite de missão pelo uso do plano | high | done | core, server, cost | 003, 009, 017 |
| 019 | Promoção do rascunho da fase 1 | high | done | server, security | 009 |
| 020 | Agentes de refatoração e segurança | medium | done | agents, security | 006 |
| 021 | Prompt da missão e teste real da fase 1 | high | done | server, validation | 010, 016 |
| 022 | Estágio pausada e retomada | high | done | core, server | 021 |
| 023 | Entrada do servidor e comando único | high | done | server, infra | 016, 022 |
| 024 | Comandos permitidos por projeto | high | done | server, security | 016, 023 |
| 025 | Ajustes do servidor pedidos pela interface | medium | done | server | 011 |
| 026 | Redação: núcleo (tipos, estados, gate, versões) | high | done | core, redacao | 002, 018 |
| 027 | Redação: servidor, workspace e endpoints | high | done | server, api, redacao, security | 026, 010, 025 |
| 028 | Redação: orquestrador e contrato dos agentes | medium | done | agents, redacao | 026, 007, 015 |
| 029 | Redação: runner, prompts e orçamento | high | done | server, redacao, cost | 027, 028, 022, 018 |
| 030 | Redação: web, dados e rota | medium | done | frontend, redacao | 027, 011 |
| 031 | Redação: web, tela de artigos | medium | done | frontend, redacao | 030, 029 |
| 032 | Afiliados: espelho do schema e planejador de agenda | high | done | core, afiliados | 004 |
| 033 | Afiliados: servidor (nichos, backups, ambiente, relatórios) | high | done | server, api, afiliados, security | 032, 010, 016 |
| 034 | Afiliados: web, painel de nichos, agenda e saúde | medium | done | frontend, afiliados | 033, 032, 011 |
| 035 | Afiliados: ops-reports (RASCUNHO, requer aprovação, repo afiliados; NÃO rodar no spec-runner) | low | done | draft, afiliados, requires-approval | 033 |
| 036 | Modelo local: ligação (verificador, CLI, servidor, tester) | medium | done | cost, server, agents | 014, 024 |

PRDs: `../prd/core-agentes.prd.md` (001–008), `../prd/salao-da-guilda.prd.md` (009–012), `../prd/integracoes.prd.md` (013–014); `core-agentes` também cobre 015; `../prd/redacao.prd.md` (026–031); `../prd/afiliados-painel.prd.md` (032–035).
