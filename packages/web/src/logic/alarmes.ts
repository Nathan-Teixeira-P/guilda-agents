import { membro } from "../roster.ts";
import { membrosDe, type Ev } from "./events.ts";
import type { M } from "./stages.ts";

export interface Alarme { chave: string; tipo: "disjuntor" | "teto" | "falha" | "pausa"; missionId: string; texto: string }

/** Alarms to show: breaker trip and plan/budget cap (a paused mission, reason from the server) and agents that failed in this session. Never throws. */
export function alarmesDe(missions: readonly M[], events: Record<string, readonly Ev[]>): Alarme[] {
  const out: Alarme[] = [];
  for (const m of missions) {
    const r = m.pauseReason ?? "";
    if (m.stage === "pausada" && r.startsWith("disjuntor")) out.push({ chave: `d:${m.id}`, tipo: "disjuntor", missionId: m.id, texto: `Disjuntor: ${r.replace(/^disjuntor:\s*/, "")}. A missão foi recolhida e espera você.` });
    else if (m.stage === "pausada" && r.startsWith("teto")) out.push({ chave: `t:${m.id}`, tipo: "teto", missionId: m.id, texto: `${r.charAt(0).toUpperCase()}${r.slice(1)}. A missão foi pausada.` });
    if (m.stage === "planejando" || m.stage === "executando") {
      for (const x of membrosDe(events[m.id] ?? [])) if (x.estado === "falhou") out.push({ chave: `f:${m.id}:${x.id}`, tipo: "falha", missionId: m.id, texto: `${membro(x.tipo).codinome} falhou em campo.` });
    }
  }
  return out;
}

/** Everything the bell lists: the alarms plus paused missions no alarm already covers (one entry per mission waiting on the user). */
export function avisosDe(missions: readonly M[], events: Record<string, readonly Ev[]>): Alarme[] {
  const out = alarmesDe(missions, events);
  const cobertas = new Set(out.filter((a) => a.tipo !== "falha").map((a) => a.missionId));
  for (const m of missions) {
    if (m.stage === "pausada" && !cobertas.has(m.id)) out.push({ chave: `p:${m.id}`, tipo: "pausa", missionId: m.id, texto: `Missão pausada: ${m.pauseReason ?? "aguarda você"}.` });
  }
  return out;
}
