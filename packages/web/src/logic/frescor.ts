import { efetivo, type Uso } from "./emblem.ts";

/** Shape of GET/PUT /usage/auto and the SSE `uso-auto` event. */
export interface AutoStatus {
  auto: boolean;
  intervaloMin: number;
  estado: "ativo" | "pausado" | "desligado";
  motivo?: string;
  proximaEm?: string;
  erro?: string;
  falhasSeguidas?: number;
  consultasHoje: { auto: number; manual: number };
  custoPp: { ultimos: number[]; media?: number };
}
export const INTERVALOS = [5, 10, 15, 30, 60] as const;

/** Whole minutes since the reading; undefined when there is no valid timestamp. */
export function idadeMin(atualizadoEm: string, now: number): number | undefined {
  const t = Date.parse(atualizadoEm);
  return Number.isNaN(t) ? undefined : Math.max(0, Math.floor((now - t) / 60_000));
}

/** Auto on and the reading is older than 2x the interval (the window reset case is already "indisponivel/obsoleto" in `efetivo`). */
export function desatualizado(u: Uso, auto: AutoStatus | undefined, now: number): boolean {
  if (u.estado !== "ok" || !auto?.auto) return false;
  const i = idadeMin(u.atualizadoEm, now);
  return i !== undefined && i > 2 * auto.intervaloMin;
}

const min = (n: number) => (n < 1 ? "agora" : n < 60 ? `há ${n} min` : `há ${Math.floor(n / 60)} h`);

/** "atualizado há 4 min" / "desatualizado (leitura há 40 min)" / "sem leitura". */
export function textoFrescor(u: Uso, auto: AutoStatus | undefined, now: number): string {
  if (u.estado !== "ok") return u.motivo === "obsoleto" ? "desatualizado: a janela já reiniciou" : "sem leitura";
  const i = idadeMin(u.atualizadoEm, now);
  if (i === undefined) return "sem leitura";
  return desatualizado(u, auto, now) ? `desatualizado (leitura ${min(i)})` : i < 1 ? "atualizado agora" : `atualizado ${min(i)}`;
}

/** "próxima consulta em ~3 min" / "pausado: aba oculta" / "atualização automática desligada"; undefined while the status is unknown. */
export function textoProxima(auto: AutoStatus | undefined, now: number): string | undefined {
  if (!auto) return undefined;
  if (auto.estado === "desligado" || !auto.auto) return "atualização automática desligada";
  if (auto.estado === "pausado") return `pausado: ${auto.motivo ?? "aguardando"}`;
  const t = auto.proximaEm ? Date.parse(auto.proximaEm) : NaN;
  if (Number.isNaN(t)) return undefined;
  const n = Math.ceil((t - now) / 60_000);
  return n <= 0 ? "próxima consulta em instantes" : `próxima consulta em ~${n} min`;
}

/** "3 consultas automáticas hoje". */
export const textoConsultasHoje = (auto: AutoStatus) => `${auto.consultasHoje.auto} ${auto.consultasHoje.auto === 1 ? "consulta automática" : "consultas automáticas"} hoje`;

/** Defensive parse of the server payload (old server or garbage => undefined). */
export function lerAuto(d: unknown): AutoStatus | undefined {
  const a = d as Partial<AutoStatus> | null;
  if (!a || typeof a !== "object" || typeof a.auto !== "boolean" || typeof a.intervaloMin !== "number" || !a.consultasHoje || !a.custoPp) return undefined;
  return a as AutoStatus;
}

/** What the gauges draw: unavailable when expired, "desatualizado" when stale: never a confident number for an old reading. */
export function exibido(u: Uso | undefined, auto: AutoStatus | undefined, now: number): Uso {
  const e = efetivo(u, now);
  return desatualizado(e, auto, now) ? { estado: "indisponivel", motivo: "desatualizado" } : e;
}
