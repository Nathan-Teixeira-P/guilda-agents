import { ROSTER, membro } from "../roster.ts";
import { membrosDe, tokensVivos, type Ev } from "./events.ts";
import type { M } from "./stages.ts";

// What each member is doing, for the hideout scenes (layout in fortaleza.ts). Viewbox 800x480.
export const VIEW = { w: 800, h: 480 } as const;
export interface Atividade { ativo: boolean; falhou: boolean; ferramenta?: string; projeto?: string }
const VIVAS = new Set(["intake", "planejando", "executando"]);
export interface Painel { aoVivo: boolean; atividade: Record<string, Atividade>; tokens: Record<string, number> }

/** What the hall shows, from the missions and this session's events. Only live missions make agents active; failures also stay visible on halted ones. */
export function derivarPainel(ms: readonly M[], events: Record<string, readonly Ev[]>, nomeProjeto: (id: string) => string = (id) => id): Painel {
  const atividade: Record<string, Atividade> = {};
  const tokens: Record<string, number> = {};
  const at = (t: string) => (atividade[t] ??= { ativo: false, falhou: false });
  let aoVivo = false;
  for (const m of ms) {
    const viva = VIVAS.has(m.stage);
    if (!viva && m.stage !== "parada") continue;
    const evs = events[m.id] ?? [];
    if (viva) {
      aoVivo = true;
      const x = at(m.stage === "intake" ? "intake" : m.stage === "planejando" ? "planner" : "orchestrator");
      x.ativo = true; x.projeto = nomeProjeto(m.project);
    }
    const vistos = membrosDe(evs);
    const tipoDe = new Map(vistos.map((v) => [v.id, membro(v.tipo).tecnico]));
    tipoDe.set("main", "orchestrator");
    for (const v of vistos) {
      const t = membro(v.tipo).tecnico;
      if (!ROSTER.some((r) => r.tecnico === t)) continue;
      if (v.estado === "falhou") at(t).falhou = true;
      else if (v.estado === "ativo" && viva) { const x = at(t); x.ativo = true; x.projeto = nomeProjeto(m.project); if (v.ferramenta) x.ferramenta = v.ferramenta; }
    }
    if (viva) at("orchestrator").projeto = nomeProjeto(m.project);
    if (viva) for (let i = evs.length - 1; i >= 0; i--) { const e = evs[i]!; if (e.kind === "tool" && e.agent === "main") { at("orchestrator").ferramenta = e.name; break; } }
    for (const [id, n] of Object.entries(tokensVivos(evs).porAgente)) { const t = tipoDe.get(id); if (t) tokens[t] = (tokens[t] ?? 0) + n; }
    if (evs.length === 0) for (const [k, n] of Object.entries(m.tokensByAgent ?? {})) { const t = membro(k).tecnico; tokens[t] = (tokens[t] ?? 0) + n; }
  }
  return { aoVivo, atividade, tokens };
}
