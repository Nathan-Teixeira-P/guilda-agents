import { z } from "zod";

/** Claude plan usage (spec 017). Pure: the clock is always injected. No reading means "indisponivel", never zero. */
export const Janela = z.object({
  percentual: z.number().min(0).max(100),
  reiniciaEm: z.number().int(), // epoch seconds
  status: z.string(),
});
export type Janela = z.infer<typeof Janela>;
export const Snapshot = z.object({ cincoHoras: Janela, semana: Janela, atualizadoEm: z.string() });
export type Snapshot = z.infer<typeof Snapshot>;

export type Tipo = "cincoHoras" | "semana";
export type Faixa = "normal" | "atencao" | "critico";
export type Estado = ({ estado: "ok" } & Snapshot) | { estado: "indisponivel"; motivo: string };
type JanelaView = Janela & { restanteSegundos: number; ritmo: number; faixa: Faixa };
export type Vista = { estado: "ok"; cincoHoras: JanelaView; semana: JanelaView; atualizadoEm: string } | { estado: "indisponivel"; motivo: string };

const DURACAO_S: Record<Tipo, number> = { cincoHoras: 5 * 3600, semana: 7 * 24 * 3600 };

interface LimiteBruto { utilization: number; resetsAt: number; status: string } // shape of `rate_limit_event` windows

const janela = (w?: LimiteBruto): Janela | undefined => {
  if (!w || !Number.isFinite(w.utilization) || !Number.isFinite(w.resetsAt)) return undefined;
  const percentual = Math.min(100, Math.max(0, Math.round(w.utilization * 100)));
  return { percentual, reiniciaEm: Math.trunc(w.resetsAt), status: w.status };
};

/** Both windows are required: a partial event yields nothing rather than a made-up half. */
export function snapshotDeLimite(e: { fiveHour?: LimiteBruto; sevenDay?: LimiteBruto }, atualizadoEm: string): Snapshot | undefined {
  const cincoHoras = janela(e.fiveHour);
  const semana = janela(e.sevenDay);
  return cincoHoras && semana ? { cincoHoras, semana, atualizadoEm } : undefined;
}

/** Seconds until the window resets (0 when already past). */
export const tempoRestante = (reiniciaEm: number, now: Date): number => Math.max(0, Math.round(reiniciaEm - now.getTime() / 1000));

/** Above 80 -> atencao, above 90 -> critico. */
export const faixa = (percentual: number): Faixa => (percentual > 90 ? "critico" : percentual > 80 ? "atencao" : "normal");

/** Fraction (0..1) of the window already elapsed: where the "pace" marker sits. */
export function ritmo(j: Janela, tipo: Tipo, now: Date): number {
  const d = DURACAO_S[tipo];
  return Math.min(1, Math.max(0, 1 - (j.reiniciaEm - now.getTime() / 1000) / d));
}

/** A reading whose reset already passed no longer describes the current window: stale, so unavailable. */
export function avaliar(s: Snapshot | undefined, now: Date): Estado {
  if (!s) return { estado: "indisponivel", motivo: "sem leitura" };
  const t = now.getTime() / 1000;
  if (s.cincoHoras.reiniciaEm <= t || s.semana.reiniciaEm <= t) return { estado: "indisponivel", motivo: "obsoleto" };
  return { estado: "ok", ...s };
}

const view = (j: Janela, tipo: Tipo, now: Date): JanelaView => ({ ...j, restanteSegundos: tempoRestante(j.reiniciaEm, now), ritmo: ritmo(j, tipo, now), faixa: faixa(j.percentual) });

/** What the API returns: raw values plus remaining time, pace and band computed once on the server. */
export function vista(e: Estado, now: Date): Vista {
  return e.estado === "ok" ? { estado: "ok", cincoHoras: view(e.cincoHoras, "cincoHoras", now), semana: view(e.semana, "semana", now), atualizadoEm: e.atualizadoEm } : e;
}
