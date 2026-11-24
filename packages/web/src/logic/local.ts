// Local model (Ollama) display logic. Pure: the screens only render these strings. The backend owns every decision.
export interface LocalStatus {
  enabled: boolean;
  model: string;
  ollama: { estado: "parado" | "ligado"; startedByHub: boolean; modeloCarregado: string | null };
  viavel: { ok: boolean; motivo?: string; memoriaLivreMB?: number };
  emUso: { task: string; model: string; agent: string; desde: number | string } | null;
  ultimoUso: string | null;
  elegiveis: readonly { agente: string; tarefa: string; descricao: string }[];
  fora: readonly { agente: string; motivo: string }[];
}
export interface LocalStats { calls: { local: number; fallback: number; passthrough: number }; fallbacks: number; tokensSavedEstimate: number; estimate: true }
export interface LocalConfig { enabled: boolean; model: string; ollama: "up" | "down"; installed: string[] }

const n = (v: number) => v.toLocaleString("pt-BR");

export const textoOllama = (s: LocalStatus) => `Ollama: ${s.ollama.estado}`;
export const textoCarregado = (s: LocalStatus) => (s.ollama.modeloCarregado ? `modelo carregado: ${s.ollama.modeloCarregado}` : "nenhum modelo carregado na memória");
/** Who started Ollama. Only meaningful while it is running. */
export const textoOrigem = (s: LocalStatus) => (s.ollama.estado !== "ligado" ? undefined : s.ollama.startedByHub ? "ligado pelo hub (o hub desliga quando ficar ocioso)" : "já estava ligado por você (o hub não desliga)");
export function textoViabilidade(s: LocalStatus): string {
  const v = s.viavel;
  const mem = v.memoriaLivreMB !== undefined ? `memória livre ~${n(Math.round(v.memoriaLivreMB))} MB` : "memória livre desconhecida";
  return v.ok ? `${mem} — viável` : `${mem} — não viável${v.motivo ? `: ${v.motivo}` : ""}`;
}
export const textoUltimoUso = (s: LocalStatus, agora: number, formatar: (iso: string, now: number) => string) => (s.ultimoUso ? `último uso ${formatar(s.ultimoUso, agora)}` : "ainda não foi usado");

export interface Chip { visivel: boolean; texto: string; curto: string; emUso: boolean } // curto: for narrow headers (the long text stays in title/aria)
/** Shown only when the local model is on or in use; a disabled, idle model leaves the header clean. */
export function chipLocal(s: LocalStatus | undefined): Chip {
  if (!s) return { visivel: false, texto: "", curto: "", emUso: false };
  if (s.emUso) return { visivel: true, texto: `Modelo local: em uso — ${s.emUso.task} (${s.emUso.model})`, curto: "local: em uso", emUso: true };
  if (s.enabled) return { visivel: true, texto: "local: ocioso", curto: "local: ocioso", emUso: false };
  return { visivel: false, texto: "local: desligado", curto: "local: desligado", emUso: false };
}

export const podeUsarLocal = (s: LocalStatus | undefined, agente: string) => !!s?.elegiveis.some((e) => e.agente === agente);
export const emUsoAgora = (s: LocalStatus | undefined, agente: string) => s?.emUso?.agent === agente;

export function textoStats(st: LocalStats) {
  return {
    local: `${n(st.calls.local)} chamadas com modelo local`,
    semModelo: `${n(st.calls.passthrough)} só com filtro, sem modelo`,
    fallback: `${n(st.calls.fallback)} caíram para o Claude`,
    tokens: `≈ ${n(st.tokensSavedEstimate)} tokens economizados (estimativa, não medição)`,
  };
}

const ehStatus = (d: unknown): d is LocalStatus & { evento?: string } => !!d && typeof d === "object" && typeof (d as LocalStatus).enabled === "boolean" && Array.isArray((d as LocalStatus).elegiveis) && !!(d as LocalStatus).ollama;
/** SSE `local` payload = { evento, ...status }. A malformed frame keeps the current state and asks for a refetch. */
export function aplicarEventoLocal(cur: LocalStatus | undefined, data: unknown): { status: LocalStatus | undefined; recarregar: boolean } {
  if (!ehStatus(data)) return { status: cur, recarregar: true };
  const { evento: _e, ...status } = data;
  return { status, recarregar: false };
}
