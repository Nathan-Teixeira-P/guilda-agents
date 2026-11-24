import type { Projeto } from "../api.ts";
import type { Ev } from "./events.ts";
import type { M } from "./stages.ts";

/** 8 fixed lots of the district map (viewBox 800x400). Registered projects fill them in order; the rest only appear in the list. */
export const LOTES = [
  { x: 30, y: 50 }, { x: 195, y: 50 }, { x: 455, y: 50 }, { x: 620, y: 50 },
  { x: 30, y: 250 }, { x: 195, y: 250 }, { x: 455, y: 250 }, { x: 620, y: 250 },
] as const;
export const LOTE = { w: 150, h: 90 } as const;
export const TORRE = { x: 400, y: 200 } as const;

export function distribuir(projetos: readonly Projeto[]): { lotes: (Projeto | undefined)[]; extras: Projeto[] } {
  return { lotes: LOTES.map((_, i) => projetos[i]), extras: projetos.slice(LOTES.length) };
}

const ATIVAS = new Set(["intake", "planejando", "aguardando-aprovacao", "executando"]);
export function infoDistrito(missions: readonly M[], project: string): { ativas: number; alarmes: number } {
  const ms = missions.filter((m) => m.project === project);
  return { ativas: ms.filter((m) => ATIVAS.has(m.stage)).length, alarmes: ms.filter((m) => m.stage === "parada" || m.stage === "pausada").length };
}

export interface Handoff { id: string; missionId: string; tipo: string }
/** Handoffs since the last call = subagent-started events beyond the count already seen. The first call is only the baseline (nothing runs on load). */
export function novosHandoffs(vistos: Record<string, number> | undefined, events: Record<string, readonly Ev[]>): { contagem: Record<string, number>; novos: Handoff[] } {
  const contagem: Record<string, number> = {};
  const novos: Handoff[] = [];
  for (const [mid, evs] of Object.entries(events)) {
    const ini = evs.filter((e) => e.kind === "subagent-started");
    contagem[mid] = ini.length;
    if (vistos === undefined) continue;
    for (const e of ini.slice(vistos[mid] ?? 0)) if (e.kind === "subagent-started") novos.push({ id: `${mid}:${e.agentId}`, missionId: mid, tipo: e.subagentType ?? "" });
  }
  return { contagem, novos };
}
