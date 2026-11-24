import { membro } from "../roster.ts";
import type { M } from "./stages.ts";

/** Subset of StreamEvent (packages/server/src/stream.ts) that the UI reads. */
export type Ev =
  | { kind: "tool"; agent: string; name: string }
  | { kind: "subagent-started"; agentId: string; subagentType?: string }
  | { kind: "subagent-finished"; agentId: string; status?: string }
  | { kind: "result"; isError: boolean; text: string; modelUsage: Record<string, number>; permissionDenials: unknown[] }
  | { kind: "usage"; messageId: string; agent: string; tokens: { input: number; output: number; cacheRead: number; cacheCreation: number } }
  | { kind: "init" | "rate-limit" | "desconhecido"; reason?: string };

export type Linha = { text: string; tone: "normal" | "erro" };

export type Gate = "fechado" | "aguardando" | "selado";
/** Where the approval seal stands, from the stage alone (the server is the authority and fails closed). */
export function gateState(m: Pick<M, "stage" | "pausedFrom">): Gate {
  if (m.stage === "aguardando-aprovacao") return "aguardando";
  if (m.stage === "executando" || m.stage === "concluida") return "selado";
  return m.stage === "pausada" && m.pausedFrom === "executando" ? "selado" : "fechado";
}

/** "Where did it spend the most": the top agent's share of tokens across missions, plus its most expensive model overall. */
export function ondeMaisGastou(ms: readonly M[]): { agente: string; pct: number; modelo?: string } | undefined {
  const sum = (key: "tokensByAgent" | "costByModel") => {
    const t: Record<string, number> = {};
    for (const m of ms) for (const [k, v] of Object.entries(m[key] ?? {})) t[k] = (t[k] ?? 0) + v;
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  };
  const agents = sum("tokensByAgent");
  const total = agents.reduce((n, [, v]) => n + v, 0);
  const top = agents[0];
  if (!top || total <= 0) return undefined;
  const modelo = sum("costByModel")[0]?.[0];
  return { agente: top[0], pct: Math.round((top[1] / total) * 100), ...(modelo ? { modelo } : {}) };
}

/** Stream events to human lines. Repeated tool calls by the same agent are grouped; `desconhecido` is hidden. */
export function cronicaDe(events: readonly Ev[]): Linha[] {
  const names = new Map<string, string>([["main", "Regente"]]); // agentId -> codename
  const nome = (id: string) => names.get(id) ?? "Recruta";
  const out: Linha[] = [];
  let run: { agent: string; tool: string; n: number; idx: number } | undefined;
  for (const e of events) {
    if (e.kind === "tool") {
      if (run && run.agent === e.agent && run.tool === e.name) {
        run.n++;
        out[run.idx] = { text: `${nome(e.agent)} usou ${e.name} (${run.n}x)`, tone: "normal" };
      } else {
        run = { agent: e.agent, tool: e.name, n: 1, idx: out.length };
        out.push({ text: `${nome(e.agent)} usou ${e.name}`, tone: "normal" });
      }
      continue;
    }
    run = undefined;
    if (e.kind === "subagent-started") {
      names.set(e.agentId, membro(e.subagentType).codinome);
      out.push({ text: `Regente convocou ${nome(e.agentId)}`, tone: "normal" });
    } else if (e.kind === "subagent-finished") {
      const bad = e.status !== undefined && e.status !== "completed";
      out.push({ text: bad ? `${nome(e.agentId)} terminou com erro (${e.status})` : `${nome(e.agentId)} terminou`, tone: bad ? "erro" : "normal" });
    } else if (e.kind === "result") {
      out.push({ text: e.isError ? "A execução terminou com erro" : "A execução terminou", tone: e.isError ? "erro" : "normal" });
    }
  }
  return out;
}

/** Chained handoffs seen in this session (the breaker's own count lives in the server; this is what the UI witnessed). */
export const contarTrocas = (events: readonly Ev[]): number => events.filter((e) => e.kind === "subagent-started").length;

/** Live token use from `usage` events: deduped by message id (the last report of a message wins, as in the runner). */
export function tokensVivos(events: readonly Ev[]) {
  const byMsg = new Map<string, { agent: string; t: { input: number; output: number; cacheRead: number; cacheCreation: number } }>();
  for (const e of events) if (e.kind === "usage") byMsg.set(e.messageId, { agent: e.agent, t: e.tokens });
  const porAgente: Record<string, number> = {};
  let total = 0, entrada = 0, saida = 0, lido = 0;
  for (const { agent, t } of byMsg.values()) {
    const n = t.input + t.output + t.cacheRead + t.cacheCreation;
    total += n; entrada += t.input + t.cacheCreation; saida += t.output; lido += t.cacheRead;
    porAgente[agent] = (porAgente[agent] ?? 0) + n;
  }
  const inTotal = entrada + lido;
  return { total, entrada, saida, cacheLeitura: lido, porAgente, cachePct: inTotal > 0 ? Math.round((lido / inTotal) * 100) : 0 };
}

export interface MembroVisto { id: string; tipo: string; estado: "ativo" | "concluido" | "falhou"; ferramenta?: string }

/** Agents convened in this session, in order of arrival, with their state and last tool. */
export function membrosDe(events: readonly Ev[]): MembroVisto[] {
  const by = new Map<string, MembroVisto>();
  for (const e of events) {
    if (e.kind === "subagent-started") by.set(e.agentId, { id: e.agentId, tipo: e.subagentType ?? "", estado: "ativo" });
    else if (e.kind === "tool") { const m = by.get(e.agent); if (m) m.ferramenta = e.name; }
    else if (e.kind === "subagent-finished") {
      const m = by.get(e.agentId);
      if (m) { m.estado = e.status !== undefined && e.status !== "completed" ? "falhou" : "concluido"; delete m.ferramenta; }
    }
  }
  return [...by.values()];
}
