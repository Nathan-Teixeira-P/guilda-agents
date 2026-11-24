---
title: Web - pele e interações da guilda
number: 012
priority: medium
tags: [feature, frontend, design]
dependencies: [011-web-casca-e-telas.spec.md]
related_prd: .claude/prd/salao-da-guilda.prd.md
status: pending
created: 2026-11-20
---

# 012 - Pele da guilda

## Overview
Aplica a estética inspirada em guilda de assassinos: mapa de distritos, agentes com codinome e insígnia, mensageiros nos handoffs, selo de cera na aprovação, alarmes. Arte, nomes e símbolos originais.

## Related PRD
- [salao-da-guilda](../prd/salao-da-guilda.prd.md)

## Prerequisites
- [ ] Spec 011 concluído; direção visual do `frontend-architect` aprovada

## Implementation Tasks
- [ ] `packages/web/src/theme.css` — tokens (bordô, ouro, pergaminho), tipografia, modo claro/escuro
- [ ] `packages/web/src/guild/` — mapa SVG dos distritos, avatares/insígnias por função, mensageiros animados (CSS/SVG)
- [ ] `packages/web/src/guild/seal.tsx` — selo de aprovação com `assets/seal-ntp.png` (efeito de carimbo)
- [ ] `packages/web/src/guild/Avatar.tsx` — capuz e manto por função, com `assets/emblem-ntp.png` estampado nas costas do manto (visto de trás), em baixo contraste para não competir com o rosto/capuz
- [ ] Modo "sem animação" e `prefers-reduced-motion`; notificação do navegador em "aguardando aprovação"

## Acceptance Criteria
### Must Have
- [ ] Nenhum logo, nome ou arte de terceiros
- [ ] Contraste AA e foco visível; modo sem animação funciona
### Should Have
- [ ] Animações não passam de poucos % de CPU em repouso

## Verification
- Screenshots desktop/celular claro/escuro; Lighthouse de acessibilidade

## Rollback Plan
Reverter `theme.css` e `guild/`; a casca do spec 011 continua funcional.
