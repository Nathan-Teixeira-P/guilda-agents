// Mirror of packages/core/src/redacao.ts (EstadoArtigo, estadoDoArtigo) and of the /redacao* responses; not imported (core pulls zod/node:fs).
import type { Stage } from "./stages.ts";

export const ESTADOS = ["pesquisando", "rascunho", "em-revisao", "edicao-final", "aprovado", "cancelado", "pausado"] as const;
export type EstadoArtigo = (typeof ESTADOS)[number];

export interface Referencia { tipo: "caminho" | "texto" | "url"; valor: string }
export interface PedidoRedacao {
  modo: "sugerir" | "definido";
  tema?: string; publico?: string; tom?: string;
  palavras?: number; // 200..5000, server default 1200
  referencias?: Referencia[];
  idioma?: string; // server default pt-BR
}
export interface Versao { versao: number; arquivo: string; atual?: boolean }
export interface Sugestao { tema: string; motivo: string; fontes: { url: string; acessadoEm: string }[]; rank: number }

/** Article as served by GET /redacao (a Mission with kind "redacao"). `estado` is only set locally by SSE events. */
export interface Artigo {
  id: string; // slug
  stage: Stage;
  estado?: EstadoArtigo;
  tema: string;
  versao: number;
  versoes?: Versao[];
  pedido?: PedidoRedacao;
  comentarios?: { texto: string; em: string }[];
  pauseReason?: string;
  stopReason?: string;
  erroCapa?: string;
  costUsd: number;
  createdAt: string;
  updatedAt: string;
}

/** SSE `artigo` payload; `excluido` means the folder is gone. */
export interface EventoArtigo { slug: string; estado: EstadoArtigo | "excluido" }

export interface Estimativa {
  uso: unknown;
  livre: { ok: boolean; motivo?: string };
  tetoPp: number | null; tetoSemanaPp: number | null; palavras: number;
}

export function estadoDoArtigo(a: Pick<Artigo, "stage" | "estado">): EstadoArtigo {
  if (a.estado) return a.estado;
  const map: Record<Exclude<Stage, "pausada">, EstadoArtigo> = {
    intake: "pesquisando", planejando: "rascunho", "aguardando-aprovacao": "em-revisao",
    executando: "edicao-final", concluida: "aprovado", parada: "cancelado",
  };
  return a.stage === "pausada" ? "pausado" : map[a.stage];
}

const ROTULO: Record<EstadoArtigo, string> = {
  pesquisando: "Pesquisando",
  rascunho: "Rascunho",
  "em-revisao": "Em revisão do usuário",
  "edicao-final": "Edição final",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
  pausado: "Pausado",
};
export const rotuloEstado = (e: EstadoArtigo): string => ROTULO[e];

export const filtrarPorEstado = (lista: Artigo[], estado?: EstadoArtigo): Artigo[] =>
  estado ? lista.filter((a) => estadoDoArtigo(a) === estado) : lista;

export function contarPorEstado(lista: Artigo[]): Record<EstadoArtigo, number> {
  const c = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoArtigo, number>;
  for (const a of lista) c[estadoDoArtigo(a)]++;
  return c;
}

/** Applies an SSE `artigo` event. Unknown slug: the event lacks the article body, so the caller must refetch. */
export function aplicarEventoArtigo(lista: Artigo[], ev: EventoArtigo): { lista: Artigo[]; recarregar: boolean } {
  if (ev.estado === "excluido") return { lista: lista.filter((a) => a.id !== ev.slug), recarregar: false };
  if (!lista.some((a) => a.id === ev.slug)) return { lista, recarregar: true };
  // a state change may also bring pauseReason/stopReason/versao: refetch to stay exact
  const mudou = lista.some((a) => a.id === ev.slug && estadoDoArtigo(a) !== ev.estado);
  return { lista: lista.map((a) => (a.id === ev.slug ? { ...a, estado: ev.estado as EstadoArtigo } : a)), recarregar: mudou };
}

/** Text for the copy button: the final article when it exists, otherwise the draft. */
export const textoParaCopiar = (art: { final?: string; rascunho?: string }): string => (art.final?.trim() ? art.final : art.rascunho ?? "");

/** Rota `#/redacao/<slug>` -> slug (undefined for the list). */
export const slugDaRota = (path: string): string | undefined => /^\/redacao\/([^/]+)$/.exec(path)?.[1];

// ---- screen logic (spec 031) ----

/** A "sugerir" run ends in stage concluida (aprovado) but holds suggestions, not an article. */
export const ehSugestao = (a: Pick<Artigo, "pedido">): boolean => a.pedido?.modo === "sugerir";

export function rotuloArtigo(a: Pick<Artigo, "stage" | "estado" | "pedido">): string {
  const e = estadoDoArtigo(a);
  return ehSugestao(a) && e === "aprovado" ? "Sugestões prontas" : rotuloEstado(e);
}

export interface Acoes { aprovar: boolean; ajustes: boolean; cancelar: boolean; reabrir: boolean; retomar: boolean }
/** Mirrors podeAvancar (core): the server stays the authority, the UI only avoids offering dead buttons. */
export function acoesDe(e: EstadoArtigo, sugestao = false): Acoes {
  const fim = e === "aprovado" || e === "cancelado";
  return { aprovar: e === "em-revisao" && !sugestao, ajustes: e === "em-revisao" && !sugestao, cancelar: !fim, reabrir: fim && !sugestao, retomar: e === "pausado" };
}

export const ARTEFATOS_TEXTO = ["pesquisa", "checagem", "rascunho", "final"] as const;
export type AbaTexto = (typeof ARTEFATOS_TEXTO)[number];

/** Tab to open first: the most advanced text that exists. */
export function abaInicial(artefatos: readonly string[]): AbaTexto {
  for (const n of ["final", "rascunho", "checagem", "pesquisa"] as const) if (artefatos.includes(`${n}.md`)) return n;
  return "pesquisa";
}

/** The research found nothing citable: no link at all, or the agent said so. */
export const semFontesConfiaveis = (pesquisa: string | undefined): boolean =>
  pesquisa !== undefined && pesquisa.trim() !== "" && (!/https?:\/\//i.test(pesquisa) || /sem fontes confi[aá]veis/i.test(pesquisa));

/** Server reasons are partly English (runner/store); show them in Portuguese. Unknown text passes through. */
export function motivoPt(r: string): string {
  if (r === "stopped by user") return "Cancelado por você.";
  if (r === "stopped") return "Interrompido antes de terminar.";
  const m = /^(breaker|budget|plan|runner error): ?(.*)$/s.exec(r);
  if (!m) return r;
  const pre = { breaker: "Disjuntor acionado", budget: "Teto de custo atingido", plan: "Teto de uso do plano atingido", "runner error": "Erro ao executar o agente" }[m[1]!]!;
  return `${pre}: ${m[2]}`;
}
export function motivoDoArtigo(a: Pick<Artigo, "pauseReason" | "stopReason">): { titulo: string; texto: string } | undefined {
  if (a.pauseReason) return { titulo: "Pausado", texto: motivoPt(a.pauseReason).replace(/^(disjuntor|teto de uso do plano|teto de uso): /i, (s) => s[0]!.toUpperCase() + s.slice(1)) };
  if (a.stopReason) return { titulo: "Parado", texto: motivoPt(a.stopReason) };
  return undefined;
}

export type Papel = { agente: string; papel: string; estado: "ativo" | "ocioso" | "concluido" };
/** Who is at work in each phase (rascunho = research, check and writing; edição final = editor and cover). */
export function equipeDe(e: EstadoArtigo, sugestao = false): Papel[] {
  const fase = (ativo: boolean, feito: boolean): Papel["estado"] => (ativo ? "ativo" : feito ? "concluido" : "ocioso");
  const f1 = e === "rascunho", f1ok = e === "em-revisao" || e === "edicao-final" || e === "aprovado";
  const f2 = e === "edicao-final", f2ok = e === "aprovado";
  const eru: Papel = { agente: "researcher", papel: "Pesquisa", estado: fase(f1 || e === "pesquisando", f1ok) };
  if (sugestao) return [eru];
  return [
    eru,
    { agente: "fact-checker", papel: "Checagem", estado: fase(f1, f1ok) },
    { agente: "writer", papel: "Texto", estado: fase(f1, f1ok) },
    { agente: "editor", papel: "Edição final", estado: fase(f2, f2ok) },
    { agente: "illustrator", papel: "Capa", estado: fase(f2, f2ok) },
  ];
}

export interface FormRedacao { modo: "sugerir" | "definido"; tema: string; publico: string; tom: string; palavras: string; referencias: Referencia[]; idioma: string }
export const FORM_VAZIO: FormRedacao = { modo: "sugerir", tema: "", publico: "", tom: "", palavras: "1200", referencias: [], idioma: "pt-BR" };

/** Validates the form like the server does and builds the request. Empty optional fields are left out. */
export function montarPedido(f: FormRedacao): { ok: true; pedido: PedidoRedacao } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const tema = f.tema.trim();
  if (f.modo === "definido" && !tema) erros["tema"] = "Diga o tema do artigo.";
  const palavras = f.modo === "definido" ? Number(f.palavras) : 1200; // suggestions have no length: the field is hidden
  if (f.modo === "definido" && f.palavras.trim() === "" || !Number.isInteger(palavras) || palavras < 200 || palavras > 5000) erros["palavras"] = "Informe de 200 a 5000 palavras.";
  if (f.idioma.trim().length < 2) erros["idioma"] = "Informe o idioma, por exemplo pt-BR.";
  const referencias = f.referencias.map((r) => ({ tipo: r.tipo, valor: r.valor.trim() })).filter((r) => r.valor);
  const ruim = referencias.find((r) => (r.tipo === "url" && !linkSeguroHttp(r.valor)) || (r.tipo === "caminho" && !r.valor.startsWith("/")));
  if (ruim) erros["referencias"] = ruim.tipo === "url" ? `Link inválido (use http:// ou https://): ${ruim.valor}` : `O caminho deve ser absoluto (começa com /): ${ruim.valor}`;
  if (Object.keys(erros).length) return { ok: false, erros };
  const pedido: PedidoRedacao = { modo: f.modo, palavras, idioma: f.idioma.trim(), ...(tema ? { tema } : {}), ...(f.modo === "definido" && f.publico.trim() ? { publico: f.publico.trim() } : {}), ...(f.modo === "definido" && f.tom.trim() ? { tom: f.tom.trim() } : {}), ...(referencias.length ? { referencias } : {}) };
  return { ok: true, pedido };
}
const linkSeguroHttp = (u: string) => /^https?:\/\/\S+$/i.test(u);

/** Form prefilled from a chosen suggestion: the theme plus its sources as link references. */
export const formDaSugestao = (s: Sugestao): FormRedacao => ({ ...FORM_VAZIO, modo: "definido", tema: s.tema, referencias: s.fontes.map((x) => ({ tipo: "url", valor: x.url })) });

export interface Deps { clipboard?: { writeText(t: string): Promise<void> }; copiarLegado?: (t: string) => boolean }
/** Clipboard API first (needs a secure context; localhost counts), then the legacy path. Never throws. */
export async function copiarTexto(texto: string, d: Deps): Promise<boolean> {
  try { if (d.clipboard) { await d.clipboard.writeText(texto); return true; } } catch { /* denied: try the fallback */ }
  try { return d.copiarLegado?.(texto) ?? false; } catch { return false; }
}

export const dataCurta = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Articles that can have a cover to show in the gallery. */
export const comCapa = (lista: Artigo[]): Artigo[] => lista.filter((a) => estadoDoArtigo(a) === "aprovado" && !ehSugestao(a));
