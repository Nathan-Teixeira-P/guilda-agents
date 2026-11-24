import type { Estado, Janela } from "./usage.ts";

/** Plan-usage budget (spec 018). Pure. Percentages are the plan's own, in percentage points (pp). */
export const LIMIAR_5H = 80;
export const LIMIAR_SEMANA = 90;

export type Limiares = { cincoHoras: number; semana: number };
export type Ponto = Pick<Janela, "percentual" | "reiniciaEm">;

/** Starting is free only with a fresh reading under both thresholds; otherwise the user must confirm. */
export function podeIniciar(uso: Estado, l: Limiares = { cincoHoras: LIMIAR_5H, semana: LIMIAR_SEMANA }): { ok: true } | { ok: false; motivo: string } {
  if (uso.estado !== "ok") return { ok: false, motivo: `uso do plano indisponivel (${uso.motivo}): confirme para iniciar` };
  if (uso.cincoHoras.percentual > l.cincoHoras) return { ok: false, motivo: `janela de 5 horas em ${uso.cincoHoras.percentual}% (limiar ${l.cincoHoras}%)` };
  if (uso.semana.percentual > l.semana) return { ok: false, motivo: `semana em ${uso.semana.percentual}% (limiar ${l.semana}%)` };
  return { ok: true };
}

/** pp consumed since the start. A different reset time means the window restarted: current usage is what was spent. */
export function consumo(inicial: Ponto, atual: Ponto): number {
  return atual.reiniciaEm !== inicial.reiniciaEm ? atual.percentual : Math.max(0, atual.percentual - inicial.percentual);
}

/** Fails closed: an invalid cap stops the mission. */
export function deveParar(inicio: Ponto, atual: Ponto, tetoPp: number): boolean {
  if (!Number.isFinite(tetoPp) || tetoPp <= 0) return true;
  return consumo(inicio, atual) >= tetoPp;
}
