import type { M } from "./stages.ts";

/** Missions that newly started waiting for the seal. The first call (prev undefined) only records the baseline: no burst of notifications on load. */
export function novosAguardando(prev: ReadonlySet<string> | undefined, missions: readonly M[]): { ids: Set<string>; novos: M[] } {
  const aguardando = missions.filter((m) => m.stage === "aguardando-aprovacao");
  const ids = new Set(aguardando.map((m) => m.id));
  return { ids, novos: prev === undefined ? [] : aguardando.filter((m) => !prev.has(m.id)) };
}

export type PermissaoNotif = "indisponivel" | "padrao" | "concedida" | "negada";
export const permissaoNotif = (): PermissaoNotif => {
  if (typeof Notification === "undefined") return "indisponivel";
  return Notification.permission === "granted" ? "concedida" : Notification.permission === "denied" ? "negada" : "padrao";
};
