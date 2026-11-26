import { membro } from "../roster.ts";
import type { M } from "./stages.ts";

/** Subset of StreamEvent (packages/server/src/stream.ts) that the UI reads. */
export type Ev =
  | { kind: "tool"; agent: string; name: string; command?: string; alvo?: string }
  | { kind: "text"; agent: string; text: string }
  | { kind: "subagent-started"; agentId: string; toolUseId?: string; subagentType?: string }
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

/** "Where did it spend the most": the top agent's share of tokens across missions, across missions. */
export function ondeMaisGastou(ms: readonly M[]): { agente: string; pct: number } | undefined {
  const sum = (key: "tokensByAgent") => {
    const t: Record<string, number> = {};
    for (const m of ms) for (const [k, v] of Object.entries(m[key] ?? {})) t[k] = (t[k] ?? 0) + v;
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  };
  const agents = sum("tokensByAgent");
  const total = agents.reduce((n, [, v]) => n + v, 0);
  const top = agents[0];
  if (!top || total <= 0) return undefined;
  return { agente: top[0], pct: Math.round((top[1] / total) * 100) };
}

/** Long Bash commands also arrive as "subagent" events, without a type: drop them. `comandos` remembers their ids so the finish is dropped too. */
export function ehComando(e: Ev, comandos: Set<string>): boolean {
  if (e.kind === "subagent-started" && !e.subagentType) comandos.add(e.agentId);
  return (e.kind === "subagent-started" || e.kind === "subagent-finished") && comandos.has(e.agentId);
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
// mirrors the server breaker: an `OK <spec>` line from the main agent (once per spec) restarts the chain
export function contarTrocas(events: readonly Ev[]): number {
  const ok = new Set<string>();
  let n = 0;
  for (const e of events) {
    if (e.kind === "subagent-started") n++;
    else if (e.kind === "text" && e.agent === "main") for (const x of e.text.matchAll(/^OK\s+([\w.-]+)\s*$/gm)) if (!ok.has(x[1]!)) { ok.add(x[1]!); n = 0; }
  }
  return n;
}

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

export interface Janela extends MembroVisto { linhas: string[] }

/** One "terminal window" per agent: the Regente first, then the others in order of arrival, each with its latest actions. */
export function janelasDe(events: readonly Ev[], max = 40): Janela[] {
  const main: Janela = { id: "main", tipo: "main", estado: "ativo", linhas: [] };
  const by = new Map<string, Janela>([["main", main]]);
  for (const j of membrosDe(events)) by.set(j.id, { ...j, linhas: [] });
  const alias = new Map<string, string>(); // some events name the agent by its tool-use id
  for (const e of events) {
    if (e.kind === "subagent-started" && e.toolUseId) alias.set(e.toolUseId, e.agentId);
    if (e.kind === "result") main.estado = e.isError ? "falhou" : "concluido";
    if ((e.kind === "tool" && e.agent === "main") || e.kind === "subagent-started") main.estado = "ativo"; // a run has one `result` per turn
    if (e.kind !== "tool") continue;
    const j = by.get(alias.get(e.agent) ?? e.agent);
    if (!j) continue;
    j.linhas.push(e.command ? `$ ${e.command}` : `▸ ${e.name}${e.alvo ? ` ${e.alvo}` : ""}`);
    if (j.linhas.length > max) j.linhas.shift();
  }
  return [...by.values()];
}

/** Caps the history without losing totals: only tool lines are dropped (oldest first); usage keeps one entry per message. */
export function aparar(events: readonly Ev[], maxTools = 500): Ev[] {
  const msg = new Map<string, number>(); // messageId -> position in `out`
  const out: Ev[] = [];
  for (const e of events) {
    const i = e.kind === "usage" ? msg.get(e.messageId) : undefined;
    if (i !== undefined) { out[i] = e; continue; }
    if (e.kind === "usage") msg.set(e.messageId, out.length);
    out.push(e);
  }
  let sobra = out.filter((e) => e.kind === "tool").length - maxTools;
  return sobra > 0 ? out.filter((e) => e.kind !== "tool" || sobra-- <= 0) : out;
}

export interface Papel { tipo: string; estado: MembroVisto["estado"]; linhas: string[]; tokens: number; vezes: number }

/** One node per role on the canvas: every instance of an agent type adds to the same window. */
export function porPapel(janelas: readonly Janela[], tokens: Record<string, number>, max = 60): Papel[] {
  const by = new Map<string, Papel>();
  for (const j of janelas) {
    const p = by.get(j.tipo) ?? { tipo: j.tipo, estado: j.estado, linhas: [], tokens: 0, vezes: 0 };
    p.estado = p.estado === "ativo" ? "ativo" : j.estado;
    p.linhas = [...p.linhas, ...j.linhas].slice(-max);
    p.tokens += tokens[j.id] ?? 0;
    p.vezes++;
    by.set(j.tipo, p);
  }
  return [...by.values()];
}
