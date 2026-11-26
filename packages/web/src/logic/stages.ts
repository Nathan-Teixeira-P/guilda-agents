// Mirror of STAGES in packages/core/src/mission.ts (not imported: core pulls zod and node:fs into the bundle).
export const STAGE_ORDER = ["intake", "planejando", "aguardando-aprovacao", "executando", "pausada", "concluida", "parada"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

/** Mission as served by GET /missions (loose fields are optional). */
export interface M {
  id: string;
  project: string;
  stage: Stage;
  costUsd: number;
  planoGasto?: { cincoHoras: number; semana: number };
  createdAt: string;
  updatedAt: string;
  demanda?: string;
  pauseReason?: string;
  pausedFrom?: "planejando" | "executando";
  stopReason?: string;
  tokensByAgent?: Record<string, number>;
  subagentTypes?: Record<string, string>;
  costByModel?: Record<string, number>;
  promoted?: string[];
  avisosSpecs?: string[];
  loops?: Record<string, number>;
  local?: { localTasks: number; fallbacks: number; tokensSaved: number };
}

export const STAGE_LABEL: Record<Stage, { rotulo: string; tecnico: string }> = {
  intake: { rotulo: "Contrato recebido", tecnico: "intake" },
  planejando: { rotulo: "Reconhecimento", tecnico: "planejando" },
  "aguardando-aprovacao": { rotulo: "Aguarda o selo", tecnico: "aguardando aprovação" },
  executando: { rotulo: "Em campo", tecnico: "executando" },
  pausada: { rotulo: "Pausada", tecnico: "aguarda você" },
  concluida: { rotulo: "Contrato cumprido", tecnico: "concluída" },
  parada: { rotulo: "Recolhida", tecnico: "parada" },
};

/** Tab order on small screens: what needs the user first. */
export const URGENCY: readonly Stage[] = ["aguardando-aprovacao", "pausada", "parada", "executando", "planejando", "intake", "concluida"];

export function groupByStage(missions: readonly M[]): Record<Stage, M[]> {
  const out = Object.fromEntries(STAGE_ORDER.map((s) => [s, [] as M[]])) as Record<Stage, M[]>;
  for (const m of missions) out[m.stage]?.push(m);
  for (const s of STAGE_ORDER) out[s].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Missions waiting for the user's seal, oldest first (the shortest path to the main task). */
export const aguardamSelo = (ms: readonly M[]): M[] => ms.filter((m) => m.stage === "aguardando-aprovacao").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

export function contagemPorEstagio(ms: readonly M[], project: string): Record<Stage, number> {
  const out = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<Stage, number>;
  for (const m of ms) if (m.project === project) out[m.stage]++;
  return out;
}
