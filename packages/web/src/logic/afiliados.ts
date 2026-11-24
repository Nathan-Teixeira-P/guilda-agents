import type { Projeto } from "../api.ts";

export type EstadoAfiliados = { tipo: "sem-projeto" } | { tipo: "sem-relatorio"; projeto: Projeto };

/** The afiliados project is the registered one whose id or name is "afiliados". */
export function estadoAfiliados(projects: readonly Projeto[]): EstadoAfiliados {
  const projeto = projects.find((p) => p.id.toLowerCase() === "afiliados" || p.nome.toLowerCase() === "afiliados");
  return projeto ? { tipo: "sem-relatorio", projeto } : { tipo: "sem-projeto" };
}

// ---- niche shape and validation: mirror of packages/core/src/niches.ts (compared against core in test/afiliados.test.ts) ----

export interface Nicho {
  key: string;
  label: string;
  enabled: boolean;
  priority: number;
  groupJid: string; // always masked when it comes from the server
  instance: string;
  audience?: string;
  ml: { categoryIds: string[]; keywords: string[] };
  amazon: { browseNodeIds: string[]; keywords: string[] };
  minDealScore: number;
  maxPerRun: number;
  cronSlots: string[];
}

/** "120363000000000001@g.us" -> "1203…@g.us" */
export function mascararJid(jid: string): string {
  const i = jid.indexOf("@");
  const id = i < 0 ? jid : jid.slice(0, i);
  const sufixo = i < 0 ? "" : jid.slice(i);
  return id.length <= 4 ? `…${sufixo}` : `${id.slice(0, 4)}…${sufixo}`;
}

export type ErrosNicho = Partial<Record<"key" | "label" | "groupJid" | "instance" | "priority" | "minDealScore" | "maxPerRun" | "cronSlots", string>>;

const inteiro = (v: unknown) => typeof v === "number" && Number.isInteger(v);

/** Same rules and messages as the core schema. `original` is the saved niche with the same key: its masked jid is accepted as "unchanged". */
export function validarNicho(n: Nicho, original?: Nicho): ErrosNicho {
  const e: ErrosNicho = {};
  if (!n.key) e.key = "key é obrigatória";
  else if (!/^[a-z0-9-]+$/.test(n.key)) e.key = "key deve ter apenas letras minúsculas, números e hífens";
  if (!n.label) e.label = "label é obrigatório";
  const inalterado = original !== undefined && n.groupJid === original.groupJid;
  if (!inalterado && !/^[\d-]+@g\.us$/.test(n.groupJid)) e.groupJid = "groupJid deve terminar em @g.us (grupo, não conversa privada)";
  if (!n.instance) e.instance = "instance é obrigatória";
  if (!inteiro(n.priority)) e.priority = "priority deve ser inteiro";
  if (!inteiro(n.minDealScore)) e.minDealScore = "minDealScore deve ser inteiro";
  else if (n.minDealScore < 0) e.minDealScore = "minDealScore deve ser no mínimo 0";
  else if (n.minDealScore > 100) e.minDealScore = "minDealScore deve ser no máximo 100";
  if (!inteiro(n.maxPerRun)) e.maxPerRun = "maxPerRun deve ser inteiro";
  else if (n.maxPerRun < 1) e.maxPerRun = "maxPerRun deve ser no mínimo 1";
  if (n.cronSlots.length === 0) e.cronSlots = "cronSlots deve ter ao menos uma expressão cron";
  if (!n.ml.categoryIds.length && !n.ml.keywords.length && !n.amazon.browseNodeIds.length && !n.amazon.keywords.length)
    e.key ??= "O nicho precisa de ao menos uma fonte de busca (ML categoryIds/keywords ou Amazon browseNodeIds/keywords)";
  return e;
}

/** Errors per niche index plus list-level ones (duplicate keys/groups). Masked jids are never compared (the server checks the real ones). */
export function validarLista(draft: readonly Nicho[], salvo: readonly Nicho[]): { porNicho: ErrosNicho[]; lista: string[]; total: number } {
  const orig = new Map(salvo.map((n) => [n.key, n]));
  const porNicho = draft.map((n) => validarNicho(n, orig.get(n.key)));
  const lista: string[] = [];
  if (draft.length === 0) lista.push("Ao menos um nicho deve ser configurado");
  const dup = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];
  const keys = dup(draft.map((n) => n.key));
  if (keys.length) lista.push(`Keys duplicadas: ${keys.join(", ")}. Cada key deve ser única.`);
  const jids = dup(draft.map((n) => n.groupJid).filter((j) => !j.includes("…")));
  if (jids.length) lista.push(`groupJids duplicados: ${jids.map(mascararJid).join(", ")}. Cada grupo só pode pertencer a um nicho.`);
  return { porNicho, lista, total: porNicho.reduce((t, e) => t + Object.keys(e).length, 0) + lista.length };
}

export const NICHO_NOVO = (instance = ""): Nicho => ({
  key: "", label: "", enabled: true, priority: 0, groupJid: "", instance,
  ml: { categoryIds: [], keywords: [] }, amazon: { browseNodeIds: [], keywords: [] },
  minDealScore: 50, maxPerRun: 1, cronSlots: ["0 9 * * *"],
});

/** "a, b ,, c" -> ["a","b","c"] */
export const listaDeTexto = (t: string): string[] => t.split(",").map((s) => s.trim()).filter(Boolean);

/** Chips for a group card: search terms per marketplace plus category counts. */
export function resumoFontes(n: Nicho): { ml: string[]; amazon: string[]; categoriasMl: number; categoriasAmazon: number } {
  return { ml: n.ml.keywords, amazon: n.amazon.keywords, categoriasMl: n.ml.categoryIds.length, categoriasAmazon: n.amazon.browseNodeIds.length };
}

/** Human-readable diff between saved and draft (by key); jids are compared masked-as-given, so untouched masked jids never count. */
export function resumoMudancas(salvo: readonly Nicho[], draft: readonly Nicho[]): { novos: string[]; removidos: string[]; alterados: string[]; total: number } {
  const a = new Map(salvo.map((n) => [n.key, JSON.stringify(n)]));
  const b = new Map(draft.map((n) => [n.key, JSON.stringify(n)]));
  const rot = (k: string) => draft.find((n) => n.key === k)?.label || salvo.find((n) => n.key === k)?.label || k || "(sem key)";
  const novos = draft.filter((n) => !a.has(n.key)).map((n) => rot(n.key));
  const removidos = salvo.filter((n) => !b.has(n.key)).map((n) => rot(n.key));
  const alterados = draft.filter((n) => a.has(n.key) && a.get(n.key) !== b.get(n.key)).map((n) => rot(n.key));
  return { novos, removidos, alterados, total: novos.length + removidos.length + alterados.length };
}

// ---- agenda: mirror of packages/core/src/agenda.ts ----

export const FUSO = "America/Sao_Paulo";
const DIA = 1440;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const pad = (n: number) => String(n).padStart(2, "0");

export type Slot = { key: string; hhmm: string };
export type Concentracao = { a: Slot; b: Slot; distanciaMin: number };

export const minutos = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  if (!m) throw new Error(`horário inválido: "${hhmm}" (use HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
};
const dist = (x: number, y: number) => Math.min(Math.abs(x - y), DIA - Math.abs(x - y));

export function horasParaCron(hhmm: string): string {
  const t = minutos(hhmm);
  return `${t % 60} ${Math.floor(t / 60)} * * *`;
}

/** Inverse of horasParaCron for the simple daily form; anything else is undefined ("custom"). */
export function cronParaHoras(cron: string): string | undefined {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron.trim());
  return m && Number(m[1]) <= 59 && Number(m[2]) <= 23 ? `${pad(Number(m[2]))}:${pad(Number(m[1]))}` : undefined;
}

export function descreverCron(cron: string): string {
  const h = cronParaHoras(cron);
  return h ? `todo dia às ${h}` : "expressão personalizada";
}

export function detectarConcentracao(slots: Slot[], intervaloMin = 45): Concentracao[] {
  const s = [...slots].sort((p, q) => minutos(p.hhmm) - minutos(q.hhmm) || p.key.localeCompare(q.key));
  const out: Concentracao[] = [];
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      const d = dist(minutos(s[i]!.hhmm), minutos(s[j]!.hhmm));
      if (d < intervaloMin) out.push({ a: s[i]!, b: s[j]!, distanciaMin: d });
    }
  return out;
}

export type TotalDiario = { total: number; limiteDiario?: number; excede: boolean };
export function totalDiario(nichos: Array<{ maxPerRun: number; execucoes: number }>, limiteDiario?: number): TotalDiario {
  const total = nichos.reduce((t, n) => t + n.maxPerRun * n.execucoes, 0);
  return { total, limiteDiario, excede: limiteDiario !== undefined && total > limiteDiario };
}

/** "9:00, 12:30 21:5" -> { horas: ["09:00","12:30"], invalidas: ["21:5"] }; sorted, deduplicated. */
export function lerHoras(txt: string): { horas: string[]; invalidas: string[] } {
  const horas: string[] = [];
  const invalidas: string[] = [];
  for (const t of txt.split(/[\s,;]+/).filter(Boolean)) {
    const m = HHMM.exec(t);
    if (m) horas.push(`${pad(Number(m[1]))}:${m[2]}`);
    else invalidas.push(t);
  }
  return { horas: [...new Set(horas)].sort((a, b) => minutos(a) - minutos(b)), invalidas };
}

/** Times of a niche when every cron is the simple daily form; `custom` lists the others (the panel does not edit those). */
export function horasDoNicho(n: Pick<Nicho, "cronSlots">): { horas: string[]; custom: string[] } {
  const horas: string[] = [];
  const custom: string[] = [];
  for (const c of n.cronSlots) { const h = cronParaHoras(c); if (h) horas.push(h); else custom.push(c); }
  return { horas: horas.sort((a, b) => minutos(a) - minutos(b)), custom };
}

export interface LinhaAgenda { key: string; label: string; enabled: boolean; horas: string[]; custom: string[]; execucoes: number; maxPerRun: number }

/** Timeline rows (all niches; disabled ones are shown but do not count for concentration or totals). */
export const linhasAgenda = (nichos: readonly Nicho[]): LinhaAgenda[] =>
  nichos.map((n) => ({ key: n.key, label: n.label || n.key, enabled: n.enabled, ...horasDoNicho(n), execucoes: n.cronSlots.length, maxPerRun: n.maxPerRun }));

export function analiseAgenda(linhas: readonly LinhaAgenda[], intervaloMin: number, limite?: number) {
  const ativas = linhas.filter((l) => l.enabled);
  const slots: Slot[] = ativas.flatMap((l) => l.horas.map((hhmm) => ({ key: l.key, hhmm })));
  const rotulo = new Map(linhas.map((l) => [l.key, l.label]));
  return {
    concentracoes: detectarConcentracao(slots, intervaloMin).map((c) => ({ ...c, texto: `${rotulo.get(c.a.key)} ${c.a.hhmm} e ${rotulo.get(c.b.key)} ${c.b.hhmm}: ${c.distanciaMin} min de distância (mínimo ${intervaloMin})` })),
    total: totalDiario(ativas.map((l) => ({ maxPerRun: l.maxPerRun, execucoes: l.execucoes })), limite),
  };
}

/** Request body for POST /afiliados/agenda/sugerir. */
export const pedidoSugestao = (nichos: ReadonlyArray<{ key: string; horas: string[]; envios: number }>, intervaloMin: number) => ({
  nichos: nichos.map((n) => ({ key: n.key, envios: n.envios, ...(n.horas.length ? { horas: n.horas } : {}) })),
  intervaloMin,
});

export const posicaoNaLinha = (hhmm: string): number => (minutos(hhmm) / DIA) * 100;

export const dataHora = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
