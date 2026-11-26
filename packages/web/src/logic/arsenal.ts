import type { M } from "./stages.ts";

const somar = (ms: readonly M[], key: "tokensByAgent" | "costByModel") => {
  const t: Record<string, number> = {};
  for (const m of ms) for (const [k, v] of Object.entries(m[key] ?? {})) t[k] = (t[k] ?? 0) + v;
  return Object.entries(t).sort((a, b) => b[1] - a[1]);
};

export const tokensDe = (m: M): number => Object.values(m.tokensByAgent ?? {}).reduce((n, v) => n + v, 0);

/** Tokens per agent id with share of the total. Plan points are per mission only: never split per agent. */
export function linhasAgente(ms: readonly M[]): { agente: string; tokens: number; pct: number }[] {
  const rows = somar(ms, "tokensByAgent");
  const total = rows.reduce((n, [, v]) => n + v, 0);
  return rows.map(([agente, tokens]) => ({ agente, tokens, pct: total > 0 ? Math.round((tokens / total) * 100) : 0 }));
}


/** Share of the plan windows a mission used, as shown next to the 5 h and weekly gauges. */
export const textoPlano = (m: Pick<M, "planoGasto">): string =>
  m.planoGasto ? `5 h: ${Math.round(m.planoGasto.cincoHoras)}% · semana: ${Math.round(m.planoGasto.semana)}%` : "—";
