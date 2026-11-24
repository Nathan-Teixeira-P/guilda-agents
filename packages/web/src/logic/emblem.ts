import { formatTempoRestante } from "./time.ts";

export type Faixa = "normal" | "atencao" | "critico";
export interface JanelaUso { percentual: number; reiniciaEm: number; faixa: Faixa }
/** Shape of GET /usage and the SSE `usage` event. */
export type Uso = { estado: "ok"; cincoHoras: JanelaUso; semana: JanelaUso; atualizadoEm: string } | { estado: "indisponivel"; motivo: string };
export type Tipo = "cincoHoras" | "semana";

const DURACAO_S: Record<Tipo, number> = { cincoHoras: 5 * 3600, semana: 7 * 24 * 3600 };

/** Fraction (0..1) of the window already elapsed: where the pace marker sits. `now` is injected. */
export const ritmo = (reiniciaEm: number, tipo: Tipo, now: number) => Math.min(1, Math.max(0, 1 - (reiniciaEm - now / 1000) / DURACAO_S[tipo]));

/** Usage arc ahead of the time marker means consumption outpaces the window. */
export const adiantado = (percentual: number, r: number) => percentual / 100 > r;

/** An "ok" reading whose reset already passed no longer describes the current window: unavailable, never 0%. */
export function efetivo(u: Uso | undefined, now: number): Uso {
  if (!u) return { estado: "indisponivel", motivo: "sem leitura" };
  if (u.estado === "ok" && (u.cincoHoras.reiniciaEm * 1000 <= now || u.semana.reiniciaEm * 1000 <= now)) return { estado: "indisponivel", motivo: "obsoleto" };
  return u;
}

/** Ghost arc of the mission cap on the 5h ring, in pathLength=100 units: starts at current usage, clamped at 100. */
export const arcoFantasma = (percentual: number, tetoPp: number) => ({ de: percentual, tam: Math.max(0, Math.min(tetoPp, 100 - percentual)) });

export const rotuloFaixa = (f: Faixa) => (f === "critico" ? "crítico" : f === "atencao" ? "atenção" : "");

/** Spoken duration, minute resolution: "2 horas e 10 minutos", "3 dias". */
export function tempoExtenso(reiniciaEm: number, now: number): string {
  const min = Math.floor((reiniciaEm * 1000 - now) / 60_000);
  if (min <= 0) return "agora";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  const p = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  if (d > 0) return h > 0 ? `${p(d, "dia")} e ${p(h, "hora")}` : p(d, "dia");
  if (h > 0) return m > 0 ? `${p(h, "hora")} e ${p(m, "minuto")}` : p(h, "hora");
  return p(m, "minuto");
}

/** Short visible text: "5h 62% · 2h10". */
export const textoCompacto = (u: Uso, now: number) => (u.estado === "ok" ? `5h ${u.cincoHoras.percentual}% · ${formatTempoRestante(u.cincoHoras.reiniciaEm, now)}` : u.motivo === "desatualizado" ? "uso desatualizado" : "uso indisponível");

export const ariaUso = (u: Uso, now: number) =>
  u.estado === "ok"
    ? `Uso do plano: janela de 5 horas ${u.cincoHoras.percentual}%, reinicia em ${tempoExtenso(u.cincoHoras.reiniciaEm, now)}; semana ${u.semana.percentual}%, reinicia em ${tempoExtenso(u.semana.reiniciaEm, now)}`
    : u.motivo === "desatualizado" ? "Uso do plano desatualizado" : "Uso do plano indisponível";

/** True when 5h or week just crossed into attention/critical (>= 80%): triggers the single pulse. */
export function cruzouAlerta(antes: Uso | undefined, depois: Uso): boolean {
  if (depois.estado !== "ok") return false;
  const alto = (u: Uso | undefined) => u?.estado === "ok" && (u.cincoHoras.percentual >= 80 || u.semana.percentual >= 80);
  return alto(depois) && !alto(antes);
}

/** Highest band of the two windows. */
export function piorFaixa(u: Uso): Faixa {
  if (u.estado !== "ok") return "normal";
  const fs = [u.cincoHoras.faixa, u.semana.faixa];
  return fs.includes("critico") ? "critico" : fs.includes("atencao") || u.cincoHoras.percentual >= 80 ? "atencao" : "normal";
}

/** Message for a failed POST /usage/consult. */
export const erroConsulta = (status: number, error: string) =>
  status === 429 ? "Consultado há menos de 30 s. Aguarde um instante." : status === 0 ? "Servidor fora do ar." : `Não foi possível consultar: ${error}`;
