import { ROSTER, type Grupo, type Membro } from "../roster.ts";

export type Modelo = "haiku" | "sonnet" | "opus";
export interface Ficha { modelo: Modelo; funcao: string }

// Mirrors the `model:` and `description:` of agents/<tecnico>.md (the web bundle cannot read them; test/guilda.test.ts checks the model against the files).
export const FICHA: Record<string, Ficha> = {
  orchestrator: { modelo: "sonnet", funcao: "Classifica a demanda, roteia os agentes e media os handoffs." },
  intake: { modelo: "haiku", funcao: "Lê a tarefa e grava o briefing em formato fixo." },
  planner: { modelo: "sonnet", funcao: "Transforma o pedido em um plano curto e objetivo." },
  "prd-writer": { modelo: "sonnet", funcao: "Converte o plano aprovado em PRD." },
  "spec-writer": { modelo: "sonnet", funcao: "Converte PRDs em specs numerados e mantém o índice." },
  "spec-checker": { modelo: "haiku", funcao: "Confere seções, dependências e tamanho dos specs." },
  scribe: { modelo: "haiku", funcao: "Registra learnings e notas sem duplicar." },
  explorer: { modelo: "haiku", funcao: "Mapeia o projeto e lista os caminhos relevantes." },
  coder: { modelo: "sonnet", funcao: "Implementa um spec por vez com TDD." },
  reviewer: { modelo: "sonnet", funcao: "Revisa o diff contra o spec, sem corrigir." },
  tester: { modelo: "haiku", funcao: "Roda testes e typecheck e devolve só as falhas." },
  debugger: { modelo: "sonnet", funcao: "Acha a causa raiz de uma falha e propõe a correção mínima." },
  refactorer: { modelo: "sonnet", funcao: "Refatora sem mudar o comportamento." },
  researcher: { modelo: "sonnet", funcao: "Pesquisa na web e anota fonte e data por afirmação." },
  "fact-checker": { modelo: "haiku", funcao: "Confere cada afirmação do rascunho contra as notas." },
  writer: { modelo: "sonnet", funcao: "Escreve o rascunho do artigo a partir das notas." },
  editor: { modelo: "haiku", funcao: "Revisão final de clareza e estilo, preservando fatos." },
  illustrator: { modelo: "sonnet", funcao: "Cria a capa do artigo em SVG e PNG." },
  "frontend-architect": { modelo: "sonnet", funcao: "Projeta fluxos, telas, estados e acessibilidade." },
  "frontend-builder": { modelo: "sonnet", funcao: "Implementa a interface e valida no navegador." },
  "security-reviewer": { modelo: "sonnet", funcao: "Procura falhas de segurança, com evidência e severidade." },
  ops: { modelo: "haiku", funcao: "Lê logs e execuções do projeto e reporta falhas." },
  "deal-auditor": { modelo: "haiku", funcao: "Confere se as ofertas tinham desconto real." },
};

export interface Cartao extends Membro { modelo: Modelo; funcao: string }
export interface SecaoGrupo { grupo: Grupo; membros: Cartao[] }

/** Roster grouped by role group, in roster order (groups and members). */
export function agruparPorGrupo(roster: readonly Membro[] = ROSTER): SecaoGrupo[] {
  const out: SecaoGrupo[] = [];
  for (const m of roster) {
    const f = FICHA[m.tecnico] ?? { modelo: "sonnet" as const, funcao: "" };
    const c: Cartao = { ...m, ...f };
    const s = out.find((x) => x.grupo.id === m.grupo.id);
    if (s) s.membros.push(c); else out.push({ grupo: m.grupo, membros: [c] });
  }
  return out;
}
