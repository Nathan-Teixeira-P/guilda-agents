import type { Alarme } from "./alarmes.ts";

export const CATEGORIAS = ["missao", "agente", "redacao", "afiliados", "uso", "local", "sistema"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export type Nivel = "info" | "sucesso" | "aviso" | "erro";
/** Mirror of packages/server/src/notificador.ts `Notificacao` (what GET /notificacoes and SSE `notificacao` send). */
export interface Notificacao { id: string; ts: string; categoria: Categoria; nivel: Nivel; titulo: string; texto: string; link?: string; origem: string; lida: boolean; silencio?: boolean }
type Flags = Record<Categoria, boolean>;
export interface NotifConfig { categorias: Flags; desktop: { ligado: boolean; categorias: Flags }; silencio: { ativo: boolean; inicio: string; fim: string } }

export const CAT_ROTULO: Record<Categoria, string> = { missao: "Missões", agente: "Agentes", redacao: "Redação", afiliados: "Afiliados", uso: "Uso do plano", local: "Modelo local", sistema: "Sistema" };
export const CAT_ICONE: Record<Categoria, string> = { missao: "⚔", agente: "♞", redacao: "✎", afiliados: "◈", uso: "◔", local: "⚙", sistema: "ℹ" };
/** The level is always spelled out: colour is never the only signal. */
export const NIVEL_ROTULO: Record<Nivel, string> = { info: "Info", sucesso: "Sucesso", aviso: "Aviso", erro: "Erro" };
export const MAX_LISTA = 300;

/** Only hash routes of this app become links. */
export const linkSeguro = (l: string | undefined): string | undefined => (l && /^#\/[\w\-./%]*$/.test(l) ? l : undefined);

/** Newest first, no duplicate ids, capped. */
export function aplicarNotificacao(lista: readonly Notificacao[], n: Notificacao): Notificacao[] {
  const { silencio: _s, ...limpa } = n;
  return [limpa, ...lista.filter((x) => x.id !== n.id)].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, MAX_LISTA);
}

/** Ids not seen before. The first call (`vistos` undefined) records the baseline: nothing is "new" on load. */
export function novasDe(vistos: ReadonlySet<string> | undefined, lista: readonly Notificacao[]): { ids: Set<string>; novas: Notificacao[] } {
  const ids = new Set(lista.map((n) => n.id));
  return { ids, novas: vistos === undefined ? [] : lista.filter((n) => !vistos.has(n.id)).reverse() };
}

export const filtrar = (lista: readonly Notificacao[], cat: Categoria | "todas"): Notificacao[] => (cat === "todas" ? [...lista] : lista.filter((n) => n.categoria === cat));

/** Read state: the server flag, or the local fallback set (used when the server could not be reached). */
export const lidaDe = (n: Pick<Notificacao, "id" | "lida">, locais: ReadonlySet<string>) => n.lida || locais.has(n.id);

/** A live alarm (breaker, cap, failure, pause) shown in the same list. It resolves by itself, so it is never "read". */
export interface Pendencia { chave: string; nivel: Nivel; categoria: Categoria; titulo: string; texto: string; link: string; missionId: string }
export function pendenciasDe(alarmes: readonly Alarme[]): Pendencia[] {
  return alarmes.map((a) => ({
    chave: a.chave, missionId: a.missionId, link: `#/missao/${encodeURIComponent(a.missionId)}`, texto: a.texto,
    categoria: a.tipo === "falha" ? "agente" : "missao",
    nivel: a.tipo === "disjuntor" || a.tipo === "falha" ? "erro" : "aviso",
    titulo: a.tipo === "disjuntor" ? "Disjuntor acionado" : a.tipo === "teto" ? "Teto atingido" : a.tipo === "falha" ? "Agente falhou" : "Missão pausada",
  }));
}

/** Bell counter: live pendências + unread notifications, without counting twice the unread one that tells the same story as a live pendência of that mission. */
export function contarBadge(lista: readonly Notificacao[], pend: readonly Pendencia[], locais: ReadonlySet<string>): { total: number; critico: boolean } {
  const cobertas = new Set(pend.filter((p) => p.categoria === "missao").map((p) => p.missionId));
  const naoLidas = lista.filter((n) => !lidaDe(n, locais) && !(n.categoria === "missao" && cobertas.has(n.origem.replace(/^missao:/, ""))));
  return { total: pend.length + naoLidas.length, critico: pend.some((p) => p.nivel === "erro") || naoLidas.some((n) => n.nivel === "erro") };
}

/** Toast: success/warning/error only, never during the server's quiet hours. */
export const mostrarToast = (n: Notificacao) => n.nivel !== "info" && n.silencio !== true;
/** Browser notification: same rule, and only while the tab is hidden. */
export const mostrarNoNavegador = (n: Notificacao, abaOculta: boolean) => abaOculta && mostrarToast(n);
export const toastMs = (n: Notificacao) => (n.nivel === "erro" ? 10_000 : 6_000);

const MAX_LOCAIS = 300;
export const lerLocais = (raw: string | null): Set<string> => {
  try { const v = JSON.parse(raw ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-MAX_LOCAIS) : []); } catch { return new Set(); }
};
export const unirLocais = (atual: ReadonlySet<string>, ids: readonly string[]): string[] => [...new Set([...atual, ...ids])].slice(-MAX_LOCAIS);

export const configPadrao = (): NotifConfig => ({
  categorias: { missao: true, agente: true, redacao: true, afiliados: true, uso: true, local: true, sistema: true },
  desktop: { ligado: true, categorias: { missao: true, agente: false, redacao: true, afiliados: true, uso: true, local: false, sistema: false } },
  silencio: { ativo: false, inicio: "22:00", fim: "07:00" },
});
/** Tolerant read of GET /notificacoes/config: anything odd falls back to the default. */
export function lerConfig(x: unknown): NotifConfig {
  const d = configPadrao();
  if (!x || typeof x !== "object") return d;
  const o = x as Record<string, any>;
  const flags = (v: unknown, base: Flags): Flags => { const r = { ...base }; if (v && typeof v === "object") for (const c of CATEGORIAS) if (typeof (v as any)[c] === "boolean") r[c] = (v as any)[c]; return r; };
  const hhmm = (v: unknown, b: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : b);
  return {
    categorias: flags(o["categorias"], d.categorias),
    desktop: { ligado: typeof o["desktop"]?.ligado === "boolean" ? o["desktop"].ligado : d.desktop.ligado, categorias: flags(o["desktop"]?.categorias, d.desktop.categorias) },
    silencio: { ativo: o["silencio"]?.ativo === true, inicio: hhmm(o["silencio"]?.inicio, d.silencio.inicio), fim: hhmm(o["silencio"]?.fim, d.silencio.fim) },
  };
}
