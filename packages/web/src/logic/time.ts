const toMs = (now: Date | number) => (typeof now === "number" ? now : now.getTime());

/** Time until a window resets. `resetsAtSec` is epoch seconds. Minute resolution; the clock is injected. */
export function formatTempoRestante(resetsAtSec: number, now: Date | number): string {
  const min = Math.floor((resetsAtSec * 1000 - toMs(now)) / 60_000);
  if (min <= 0) return "já reiniciou";
  if (min < 60) return `${min}min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}

/** "há 15min" style age of an ISO timestamp. */
export function formatDesde(iso: string, now: Date | number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const min = Math.floor((toMs(now) - t) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  if (min < 1440) return `há ${Math.floor(min / 60)}h`;
  return `há ${Math.floor(min / 1440)}d`;
}

export type Faixa = "normal" | "atencao" | "critico";
/** Plan usage band (percent 0..100): normal < 80, attention >= 80, critical >= 90. */
export const faixa = (pct: number): Faixa => (pct >= 90 ? "critico" : pct >= 80 ? "atencao" : "normal");

/** Plan points spent by a mission: utilization fractions (0..1) at start and now. Unknown start means unknown. */
export function consumoPp(inicio: number | undefined, atual: number | undefined): number | undefined {
  if (inicio === undefined || atual === undefined) return undefined;
  return Math.max(0, Math.round((atual - inicio) * 1000) / 10); // a lower value means the window reset: never negative
}
