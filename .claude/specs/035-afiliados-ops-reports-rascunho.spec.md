---
title: Afiliados - pasta ops-reports e ops gravando relatórios (RASCUNHO)
number: 035
priority: low
tags: [draft, afiliados, agents, requires-approval]
dependencies: [033-afiliados-servidor.spec.md]
related_prd: .claude/prd/afiliados-painel.prd.md
status: done
created: 2026-11-21
---

# 035 - Afiliados: ops-reports (RASCUNHO, requer aprovação do usuário, repo afiliados)

> **Requer aprovação do usuário, repo afiliados.** Este spec mora no hub como rascunho. O spec-runner NÃO deve executá-lo e nenhum arquivo do repositório `/home/nathan/Projetos/pessoal/afiliados` pode ser alterado a partir do hub. Só após o usuário aprovar, o conteúdo deve ser copiado para `.claude/specs/` do próprio afiliados e executado lá.

## Overview
Para o painel (spec 033/034) ter o que mostrar na seção Saúde, o afiliados precisa criar `.claude/ops-reports/` e fazer os agentes `ops` e `deal-auditor` gravarem relatórios nela. Também documentar o comando `npm run niches:sync` como estável.

## Related PRD
- [afiliados-painel](../prd/afiliados-painel.prd.md) — histórias 34–39; Further Notes

## Prerequisites
- [ ] Aprovação explícita do usuário para mudar o repo afiliados.
- [ ] Spec 033 concluído (define o contrato de leitura).

## Dependencies
- 033 (contrato). Executado no repo afiliados, fora do spec-runner do hub.

## Contrato (já decidido)
- Pasta: `<afiliados>/.claude/ops-reports/`
- Nome: `ops-YYYY-MM-DD.md` e `deal-auditor-YYYY-MM-DD.md` (sufixo `-HHmm` se houver mais de um no dia)
- Formato: markdown com frontmatter `data` (ISO), `nichos` (lista de keys), `status` (`ok|atencao|falha`), `achados` (lista curta), seguido do corpo livre
- Os relatórios não devem conter jids completos nem valores do `.env`

## Implementation Tasks (a rodar no repo afiliados, após aprovação)
- [ ] Criar `.claude/ops-reports/` (com `.gitkeep`; decidir se entra no `.gitignore`)
- [ ] Ajustar as instruções do agente `ops` e do `deal-auditor` do afiliados para gravar o relatório no formato acima
- [ ] Documentar `npm run niches:sync` (README ou doc existente) e garantir que ele continue estável
- [ ] Teste/verificação no afiliados que valide o frontmatter do relatório gerado

## Acceptance Criteria
### Must Have
- [ ] Nenhuma alteração no repo afiliados sem aprovação do usuário
- [ ] Relatório gerado é lido corretamente pelo `GET /afiliados/relatorios/*` do hub (fixture igual ao formato)
- [ ] Sem jid completo nem segredos nos relatórios

## Verification
- No afiliados: rodar o `ops` e conferir o arquivo; no hub: `npx vitest run` com fixture do mesmo formato

## Rollback Plan
No afiliados: reverter os arquivos alterados e apagar `.claude/ops-reports/`. O painel do hub volta a mostrar "sem relatório".
