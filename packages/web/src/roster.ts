// Guild roster (design 4.1, approved): technical agent name -> codename, group and group color.
// Data, not logic: edit the codenames here. Provisional avatar: a colored circle (the SVG avatar is spec 012).
export interface Grupo { id: string; nome: string; cor: string }

const G = {
  direcao: { id: "direcao", nome: "Direção", cor: "var(--ouro)" },
  documentos: { id: "documentos", nome: "Documentos", cor: "#cfc2a5" },
  codigo: { id: "codigo", nome: "Código", cor: "#7f9bb5" },
  pesquisa: { id: "pesquisa", nome: "Pesquisa e escrita", cor: "var(--verdete)" },
  frontend: { id: "frontend", nome: "Frontend", cor: "#a77bb0" },
  seguranca: { id: "seguranca", nome: "Segurança", cor: "var(--sangue-texto)" },
  operacao: { id: "operacao", nome: "Operação", cor: "var(--ambar)" },
} as const satisfies Record<string, Grupo>;

export interface Membro { tecnico: string; codinome: string; grupo: Grupo }

export const ROSTER: readonly Membro[] = [
  { tecnico: "orchestrator", codinome: "Regente", grupo: G.direcao },
  { tecnico: "intake", codinome: "Porteiro", grupo: G.direcao }, // agents/intake.md arrives with spec 013
  { tecnico: "planner", codinome: "Estrategista", grupo: G.direcao },
  { tecnico: "prd-writer", codinome: "Escrivão", grupo: G.documentos },
  { tecnico: "spec-writer", codinome: "Copista", grupo: G.documentos },
  { tecnico: "spec-checker", codinome: "Aferidor", grupo: G.documentos },
  { tecnico: "scribe", codinome: "Escriba", grupo: G.documentos },
  { tecnico: "explorer", codinome: "Batedor", grupo: G.codigo },
  { tecnico: "coder", codinome: "Ferreiro", grupo: G.codigo },
  { tecnico: "reviewer", codinome: "Juiz", grupo: G.codigo },
  { tecnico: "tester", codinome: "Provador", grupo: G.codigo },
  { tecnico: "debugger", codinome: "Rastreador", grupo: G.codigo },
  { tecnico: "refactorer", codinome: "Restaurador", grupo: G.codigo },
  { tecnico: "researcher", codinome: "Erudito", grupo: G.pesquisa },
  { tecnico: "fact-checker", codinome: "Testemunha", grupo: G.pesquisa },
  { tecnico: "writer", codinome: "Cronista", grupo: G.pesquisa },
  { tecnico: "editor", codinome: "Lapidador", grupo: G.pesquisa },
  { tecnico: "illustrator", codinome: "Iluminador", grupo: G.pesquisa },
  { tecnico: "frontend-architect", codinome: "Arquiteta", grupo: G.frontend },
  { tecnico: "frontend-builder", codinome: "Vitralista", grupo: G.frontend },
  { tecnico: "security-reviewer", codinome: "Guardião", grupo: G.seguranca },
  { tecnico: "ops", codinome: "Sentinela", grupo: G.operacao },
  { tecnico: "deal-auditor", codinome: "Tesoureiro", grupo: G.operacao },
];

const RECRUTA: Membro = { tecnico: "", codinome: "Recruta", grupo: { id: "recruta", nome: "Sem grupo", cor: "#6b6f75" } };
const BY_NAME = new Map(ROSTER.map((m) => [m.tecnico, m]));

/** The session's main agent is the orchestrator; anything unknown is a Recruta. Never throws. */
export function membro(tecnico: string | undefined): Membro {
  if (tecnico === undefined) return RECRUTA;
  if (tecnico === "main") return BY_NAME.get("orchestrator")!;
  return BY_NAME.get(tecnico) ?? { ...RECRUTA, tecnico };
}
