import type { M } from "./logic/stages.ts";
import type { LocalConfig, LocalStats, LocalStatus } from "./logic/local.ts";
import type { Uso } from "./logic/emblem.ts";
import type { AutoStatus } from "./logic/frescor.ts";
import type { Arquivo } from "./logic/pacote.ts";
import type { Nicho } from "./logic/afiliados.ts";
import type { Notificacao } from "./logic/notificacoes.ts";
import type { Artigo, Estimativa, EstadoArtigo, PedidoRedacao, Sugestao } from "./logic/redacao.ts";

export interface Projeto {
  id: string;
  nome: string;
  apelidos: string[];
  origem: { tipo: "url" | "pasta"; valor: string };
  caminho: string;
  comandos: string[];
  criadoEm: string;
}

/** Every call resolves to a Result: failures become UI state, never thrown exceptions. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number }; // status 0 = server unreachable

async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(path, {
      method,
      ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    let data: unknown;
    try { data = await res.json(); } catch { data = undefined; }
    if (!res.ok) {
      const msg = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : `erro ${res.status}`;
      return { ok: false, error: msg, status: res.status };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "servidor fora do ar", status: 0 };
  }
}

export interface Detalhe { mission: M; package: { files: Arquivo[] } }

const R = (slug: string) => `/redacao/${encodeURIComponent(slug)}`;
export interface DetalheArtigo { artigo: Artigo; estado: EstadoArtigo; artefatos: string[]; sugestoes: Sugestao[] }
export interface LimitesRedacao { tetoPp?: number; tetoUsd?: number; confirmarUso?: boolean }

/** Afiliados panel (display + niches.json only). `configurado: false` means the project is not registered. */
export type NaoConfigurado = { configurado: false; instrucao: string };
export type NichosResp = { configurado: true; ok: true; hash: string; mtimeMs: number; nichos: Nicho[]; pendenteSync: boolean };
export type GravadoResp = { configurado: true; ok: true; hash: string; mtimeMs: number; backup?: string; pendenteSync: boolean; comandoSync: string };
export type InfoResp = { configurado: true; dryRun?: boolean; waMaxPerDay?: number; comandoSync: string; pendenteSync: boolean };
export type RelatorioResp = { configurado: true; existe: false } | { configurado: true; existe: true; arquivo: string; data?: string; nichos?: string[]; status?: string; achados?: string | string[]; corpo: string };
export type SugestaoAgenda = { slots: Array<{ key: string; hhmm: string; cron: string }>; impossiveis: Array<{ key: string; faltam: number }> };
const AF = "/afiliados";

export const api = {
  afNichos: () => call<NichosResp | NaoConfigurado>("GET", `${AF}/nichos`),
  afGravar: (b: { nichos: Nicho[]; hash: string; mtimeMs: number }) => call<GravadoResp | NaoConfigurado>("PUT", `${AF}/nichos`, b),
  afRevelarJid: (key: string) => call<{ groupJid: string }>("GET", `${AF}/nichos/${encodeURIComponent(key)}/jid`),
  afBackups: () => call<{ configurado: boolean; backups: Array<{ id: string; tamanho: number }> }>("GET", `${AF}/backups`),
  afRestaurar: (id: string) => call<GravadoResp | NaoConfigurado>("POST", `${AF}/backups/${encodeURIComponent(id)}/restaurar`, {}),
  afSugerir: (b: { nichos: Array<{ key: string; horas?: string[]; envios: number }>; intervaloMin?: number }) => call<SugestaoAgenda>("POST", `${AF}/agenda/sugerir`, b),
  afInfo: () => call<InfoResp | NaoConfigurado>("GET", `${AF}/info`),
  afRelatorio: (tipo: "ops" | "deal-auditor") => call<RelatorioResp | NaoConfigurado>("GET", `${AF}/relatorios/${tipo}`),
  afSincronizado: () => call<{ configurado: true; pendenteSync: false } | NaoConfigurado>("POST", `${AF}/sincronizado`, {}),
  missions: () => call<{ missions: M[] }>("GET", "/missions"),
  projects: () => call<{ projects: Projeto[] }>("GET", "/projects"),
  addProject: (b: { nome: string; pasta?: string; url?: string; comandos?: string[] }) => call<{ projeto: Projeto }>("POST", "/projects", b),
  removeProject: (id: string) => call<{ removed: string }>("DELETE", `/projects/${encodeURIComponent(id)}`),
  subida: (id: string) => call<{ passos: { passo: number; comando: string; motivo: string }[] }>("GET", `/projects/${encodeURIComponent(id)}/subida`),
  sugestoes: (id: string) => call<{ sugestoes: { comando: string; motivo: string }[]; mensagem?: string }>("GET", `/projects/${encodeURIComponent(id)}/sugestoes`),
  setComandos: (id: string, comandos: string[]) => call<{ projeto: Projeto }>("PATCH", `/projects/${encodeURIComponent(id)}/comandos`, { comandos }),
  mission: (id: string) => call<Detalhe>("GET", `/missions/${encodeURIComponent(id)}`),
  approve: (id: string) => call<{ mission: M }>("POST", `/missions/${encodeURIComponent(id)}/approve`, {}),
  adjust: (id: string, comment: string) => call<{ mission: M }>("POST", `/missions/${encodeURIComponent(id)}/adjust`, { comment }),
  resume: (id: string, comment?: string) => call<{ mission: M }>("POST", `/missions/${encodeURIComponent(id)}/resume`, comment ? { comment } : {}),
  stop: (id: string) => call<{ mission: M }>("POST", `/missions/${encodeURIComponent(id)}/stop`, {}),
  localStatus: () => call<LocalStatus>("GET", "/local/status"),
  localStats: () => call<LocalStats>("GET", "/local/stats"),
  localConfig: () => call<LocalConfig>("GET", "/local"),
  setLocal: (b: { enabled?: boolean; model?: string }) => call<{ enabled: boolean; model: string }>("PUT", "/local", b),
  usage: () => call<Uso>("GET", "/usage"),
  notificacoes: () => call<{ notificacoes: Notificacao[]; naoLidas: number }>("GET", "/notificacoes"),
  notifLidas: (b: { ids?: string[]; todas?: boolean }) => call<{ ok: true }>("POST", "/notificacoes/lidas", b),
  notifLimpar: () => call<{ ok: true }>("DELETE", "/notificacoes"),
  notifConfig: () => call<unknown>("GET", "/notificacoes/config"),
  setNotifConfig: (b: object) => call<unknown>("PUT", "/notificacoes/config", b),
  usageAuto: () => call<AutoStatus>("GET", "/usage/auto"),
  setUsageAuto: (b: { auto?: boolean; intervaloMin?: number }) => call<AutoStatus>("PUT", "/usage/auto", b),
  visibilidade: (visivel: boolean, cliente: string) => call<AutoStatus>("POST", "/usage/visibilidade", { visivel, cliente }),
  consultarUso: () => call<Uso>("POST", "/usage/consult", {}),
  newMission: (b: { project: string; demanda: string; tetoPp: number; confirmarUso?: boolean }) => call<{ id: string }>("POST", "/missions", b),
  artigos: (estado?: EstadoArtigo) => call<{ artigos: Artigo[] }>("GET", `/redacao${estado ? `?estado=${estado}` : ""}`),
  artigo: (slug: string) => call<DetalheArtigo>("GET", R(slug)),
  criarArtigo: (b: PedidoRedacao & LimitesRedacao) => call<{ artigo: Artigo }>("POST", "/redacao", b),
  estimarArtigo: (b: PedidoRedacao & LimitesRedacao) => call<{ estimativa: Estimativa }>("POST", "/redacao?estimar=1", b),
  aprovarArtigo: (slug: string) => call<{ artigo: Artigo; estado: EstadoArtigo }>("POST", `${R(slug)}/aprovar`, {}),
  ajustarArtigo: (slug: string, comentario: string) => call<{ artigo: Artigo; estado: EstadoArtigo }>("POST", `${R(slug)}/ajustes`, { comentario }),
  cancelarArtigo: (slug: string) => call<{ artigo: Artigo; estado: EstadoArtigo }>("POST", `${R(slug)}/cancelar`, {}),
  reabrirArtigo: (slug: string) => call<{ artigo: Artigo; estado: EstadoArtigo }>("POST", `${R(slug)}/reabrir`, {}),
  retomarArtigo: (slug: string) => call<{ artigo: Artigo; estado: EstadoArtigo }>("POST", `${R(slug)}/retomar`, {}),
  excluirArtigo: (slug: string) => call<{ removed: string }>("DELETE", R(slug)),
  sugestoesArtigo: (id: string) => call<{ sugestoes: Sugestao[] }>("GET", `/redacao/sugestoes/${encodeURIComponent(id)}`),
  escolherSugestao: (id: string, indice: number) => call<{ artigo: Artigo }>("POST", `/redacao/sugestoes/${encodeURIComponent(id)}/escolher`, { indice }),
  /** Text artifacts (pesquisa.md, rascunho.md, final.md...) come back as raw files: use artefatoUrl and fetch as text. */
};

/** Text artifact as a string; a missing file is an ordinary failure (404), not an exception. */
export async function lerArtefato(slug: string, nome: string): Promise<Result<string>> {
  try {
    const res = await fetch(artefatoUrl(slug, nome));
    return res.ok ? { ok: true, data: await res.text() } : { ok: false, error: `erro ${res.status}`, status: res.status };
  } catch { return { ok: false, error: "servidor fora do ar", status: 0 }; }
}

export const artefatoUrl = (slug: string, nome: string) => `${R(slug)}/artefatos/${encodeURIComponent(nome)}`;
export const capaUrl = (slug: string, ext: "png" | "svg" = "png") => `${R(slug)}/capa.${ext}`;
