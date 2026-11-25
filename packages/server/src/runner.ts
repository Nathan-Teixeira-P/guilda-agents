import { spawn as nodeSpawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { check, recordHandoff, recordLoop, type BreakerLimits, type BreakerState } from "@lab/core/src/breaker.ts";
import { addUsage, excedeu, newBudget, recordResult } from "@lab/core/src/budget.ts";
import { GATE_FILE, isApproved } from "@lab/core/src/gate.ts";
import { consumo, deveParar, type Ponto } from "@lab/core/src/plan-budget.ts";
import { snapshotDeLimite } from "@lab/core/src/usage.ts";
import { recordLocal, transition, writeMission, type Mission } from "@lab/core/src/mission.ts";
import { validarComando } from "@lab/core/src/projects.ts";
import { readStats } from "./local-config.ts";
import { MAIN_AGENT, parseLine, type RateWindow, type StreamEvent } from "./stream.ts";

type Result = Extract<StreamEvent, { kind: "result" }>;
export type Child = ChildProcessByStdio<null, Readable, Readable>;
/** Injectable for tests. Must never use a shell. */
export type SpawnFn = (file: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }) => Child;

export interface RunOpts {
  phase: 1 | 2;
  mission: Mission;
  projectDir: string; // target project (cwd of claude); nothing in it is executed by us
  missionsDir: string; // holds `<id>/` with mission.json, `approved` seal and `out/` staging
  prompt: string;
  tetoUsd: number; // mission spend cap (server-side); the CLI flag is only a safety net
  agent?: string;
  testCommands?: string[]; // phase 2: project test commands allowed in Bash, e.g. "npm test"
  hubDir?: string; // phase 2: also allows exactly the hub local-model helper (spec 036)
  plano?: { inicio?: Ponto; tetoPp?: number; inicioSemana?: Ponto; tetoSemanaPp?: number }; // both caps optional (percent of the 5h / weekly window) // plan-usage cap (spec 018): 5h window at mission start; absent on old missions
  redacao?: { hubDir: string; leitura: string[]; sugerir?: boolean }; // article missions: projectDir is the article folder; leitura = user-given read-only paths
  breaker?: { get: () => BreakerState; step: string; limits?: BreakerLimits };
  claudeBin?: string;
  now: () => Date;
  onEvent?: (e: StreamEvent) => void;
  semResume?: boolean; // phase 2 in a fresh session (lean missions): the plan file is enough, no need to reread the phase 1 context
  signal?: AbortSignal; // abort = kill the child and end the mission (`parada`)
}
export interface RunOutcome {
  mission: Mission;
  stopped?: string; // why the server killed or parked the run
  lastResult?: Result; // last non-empty `result` (several can occur per run)
  unknownLines: number;
  rateLimit?: { status?: string; fiveHour?: RateWindow; sevenDay?: RateWindow; seenAt: string };
  tokensByAgent: Record<string, number>;
  subagentTypes: Record<string, string>; // agent id -> codename (`subagent_type`), sibling of tokensByAgent so old readers still see numbers
  costByModel: Record<string, number>;
  denials: Result["permissionDenials"];
  negados: { agent: string; tool: string; command: string }[]; // permission denials seen in the stream, subagents included, with the command tried
  consumo?: { turns?: number; input: number; output: number; cacheRead: number; cacheCreation: number }; // measured per phase: where the plan usage goes
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UNSAFE_RULE_CHARS = /[*?[\]{}()!]/;

function absPath(p: string, what: string): string {
  if (!isAbsolute(p) || UNSAFE_RULE_CHARS.test(p) || p.includes("\0")) throw new Error(`unsafe ${what}: ${p}`);
  return resolve(p);
}
/** Permission rules treat `//abs` as an absolute filesystem path (a single `/` is relative to the project). */
const rulePath = (abs: string, glob = "/**") => `Edit(/${abs}${glob})`;

/** A Bash call that goes through the hub local-model helper. */
export const usaLocal = (cmd: string) => /scripts\/local\.ts\s+(run|compact-test-log|list-relevant-files)\b/.test(cmd);

const SEM_FONTES = /SEM FONTES CONFI[ÁA]VEIS/i;
/** Why an article run that ended "fine" must not advance (Portuguese), or undefined. */
function motivoRedacao(o: RunOpts): string | undefined {
  const dir = absPath(o.projectDir, "projectDir");
  if (o.phase === 1 && !o.redacao?.sugerir) { // a suggestions run writes no draft; the server validates sugestoes.json
    const checagem = existsSync(join(dir, "checagem.md")) ? readFileSync(join(dir, "checagem.md"), "utf8") : "";
    if (SEM_FONTES.test(checagem) || !existsSync(join(dir, "rascunho.md"))) return "pesquisa sem fontes confiáveis: o artigo não avançou; ajuste o tema ou as referências e retome";
  }
  return undefined;
}

export function missionPaths(o: Pick<RunOpts, "missionsDir" | "mission">) {
  if (!ID.test(o.mission.id)) throw new Error(`invalid mission id: ${o.mission.id}`);
  const missionDir = join(absPath(o.missionsDir, "missionsDir"), o.mission.id);
  return { missionDir, staging: join(missionDir, "out"), resumoDir: join(missionDir, "resumo") };
}

/** Missions run without the ponytail plugin (~1.9k tokens per turn); other hooks (rtk, network routes) stay on. */
const CLICKUP_READ = ["get_task", "get_task_comments", "get_list", "search", "filter_tasks", "get_threaded_comments", "download_task_attachment"].map((t) => `mcp__clickup__clickup_${t}`); // same list as agents/intake.md, read-only
const NO_PONYTAIL = JSON.stringify({ enabledPlugins: { "ponytail@ponytail": false } });

/** The user's rtk PreToolUse hook rewrites e.g. `npx tsc --noEmit` to `rtk tsc --noEmit`, which then misses the allow rule and is denied in dontAsk mode (for subagents too). Allow that exact rewritten form as well. */
function rtkForm(c: string): string | undefined {
  // `rtk rewrite` exits 3 when it rewrites, so read stdout whatever the status
  const r = spawnSync("rtk", ["rewrite", c], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
  const out = (r.stdout ?? "").trim(); // rtk absent: stdout is null, out is ""
  return /^rtk [\w@./: =-]+$/.test(out) && out !== c ? out : undefined;
}

/** Pure: builds the argv for `claude -p`. Always an explicit --permission-mode; never bypassPermissions. */
export function buildArgs(o: RunOpts, sessionId: string): string[] {
  const project = absPath(o.projectDir, "projectDir");
  if (o.mission.kind === "redacao") return buildArgsRedacao(o, sessionId, project);
  const { staging, resumoDir } = missionPaths(o);
  const budget = Math.max(o.tetoUsd - o.mission.costUsd, 0.0001).toFixed(4);
  const args = ["-p", o.prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"];
  if (o.agent) args.push("--agent", o.agent);
  args.push("--max-budget-usd", budget);
  args.push("--disable-slash-commands", "--settings", NO_PONYTAIL); // missions never use skills; their listing is paid on every call
  if (!/app\.clickup\.com/.test(o.mission["demanda"] as string ?? "")) args.push("--strict-mcp-config"); // no MCP servers (their tool lists are paid on every call); only the ClickUp intake needs one
  const claudeDir = join(project, ".claude");
  const deny = [rulePath(claudeDir)]; // Edit rule also covers Write
  if (o.phase === 1) {
    args.push("--session-id", sessionId, "--add-dir", absPath(staging, "staging"));
    const clickup = /app\.clickup\.com/.test(o.mission["demanda"] as string ?? "") ? CLICKUP_READ : []; // dontAsk denies anything not allowed: the intake needs these read-only tools
    args.push("--allowedTools", "Read", "Glob", "Grep", "Artifact", rulePath(staging), ...clickup); // Artifact: only to publish the design mockup as a private page (see prompt.ts)
    args.push("--disallowedTools", "Bash", ...deny);
  } else {
    const sid = o.mission.sessionId;
    if (o.semResume) args.push("--session-id", sessionId);
    else {
      if (!sid) throw new Error("phase 2 needs mission.sessionId from phase 1");
      args.push("--resume", sid);
    }
    const tests = (o.testCommands ?? []).flatMap((c) => {
      if (!validarComando(c)) throw new Error(`unsafe test command: ${c}`); // closed-format allow-list, fails closed
      const base = /^npx tsc\b/.test(c) ? "npx tsc" : c; // tsc: any arguments (-p, --noEmit, a project path...)
      const r = rtkForm(base);
      return r ? [`Bash(${base}:*)`, `Bash(${r}:*)`] : [`Bash(${base}:*)`];
    });
    const script = o.hubDir ? join(absPath(o.hubDir, "hubDir"), "scripts", "local.ts") : undefined;
    const local = script ? ["run", "compact-test-log", "list-relevant-files"].map((t) => `Bash(node ${script} ${t}:*)`) : [];
    const git = ["status", "diff", "log"].map((c) => `Bash(git ${c}:*)`); // read-only: lets a resumed run audit what was already done
    args.push("--add-dir", resumoDir); // the only place outside the project phase 2 may write: the wrap-up card
    args.push("--allowedTools", "Read", "Glob", "Grep", rulePath(project), rulePath(resumoDir), ...tests, ...local, ...git);
    args.push("--disallowedTools", ...["git commit", "git push", "gh", "curl", "wget", "ssh", "scp"].map((c) => `Bash(${c}:*)`), "WebFetch", ...deny);
  }
  return args;
}

/** Articles: write only inside the article folder (never the seal or artigo.json); Bash only for the exact cover render in phase 2. */
function buildArgsRedacao(o: RunOpts, sessionId: string, dir: string): string[] {
  if (!o.redacao) throw new Error("redacao run needs opts.redacao");
  if (!ID.test(o.mission.id)) throw new Error(`invalid mission id: ${o.mission.id}`);
  const budget = Math.max(o.tetoUsd - o.mission.costUsd, 0.0001).toFixed(4);
  const args = ["-p", o.prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"];
  if (o.agent) args.push("--agent", o.agent);
  args.push("--max-budget-usd", budget);
  args.push("--disable-slash-commands", "--settings", NO_PONYTAIL);
  args.push("--strict-mcp-config"); // articles use WebSearch/WebFetch, never MCP
  const refs = o.redacao.leitura.map((p) => absPath(p, "reference"));
  const addDirs = refs.map((p) => (statSync(p).isDirectory() ? p : dirname(p)));
  const read = [dir, ...refs].map((p) => `Read(/${p}/**)`);
  const allow = ["Glob", "Grep", ...read, rulePath(dir)];
  const deny = [`Edit(/${join(dir, GATE_FILE)})`, `Edit(/${join(dir, "artigo.json")})`, `Edit(/${join(dir, "mission.json")})`]; // the agent can never forge the seal
  if (o.phase === 1) {
    args.push("--session-id", sessionId);
    allow.push("WebSearch", "WebFetch");
  } else {
    if (!o.mission.sessionId) throw new Error("phase 2 needs mission.sessionId from phase 1");
    args.push("--resume", o.mission.sessionId);
    const script = join(absPath(o.redacao.hubDir, "hubDir"), "scripts", "render-cover.sh");
    allow.push(`Bash(${script} capa.svg capa.png)`);
  }
  for (const d of addDirs) args.push("--add-dir", d);
  args.push("--allowedTools", ...allow);
  args.push("--disallowedTools", ...(o.phase === 1 ? ["Bash"] : ["git", "gh", "curl", "wget", "ssh", "scp"].map((c) => `Bash(${c}:*)`)), ...(o.phase === 2 ? ["WebFetch", "WebSearch"] : []), ...deny);
  return args;
}

/** Readable pause reason for stops that should wait for the user; undefined = terminal stop. */
function pauseReason(stopped: string, pt: string): string | undefined {
  if (stopped.startsWith("pause: ")) return "pausada pelo usuário";
  if (stopped.startsWith("breaker: ")) return `disjuntor: ${pt}`;
  if (stopped.startsWith("budget: ")) return `teto de uso: ${pt}`;
  if (stopped.startsWith("plan: ")) return `teto de uso do plano: ${pt}`;
  return undefined;
}

const defaultSpawn: SpawnFn = (file, args, o) =>
  nodeSpawn(file, args, { cwd: o.cwd, ...(o.env ? { env: o.env } : {}), stdio: ["ignore", "pipe", "pipe"] }); // no shell; stdin = /dev/null

export async function runPhase(o: RunOpts, deps: { spawn?: SpawnFn } = {}): Promise<RunOutcome> {
  const { missionDir, staging, resumoDir } = missionPaths(o);
  const artigo = o.mission.kind === "redacao"; // article: state lives in artigo.json, saved by the caller
  let m = o.mission;
  if (o.phase === 1) {
    if (m.stage === "intake") m = transition(m, "planejando", o);
    if (!artigo) mkdirSync(staging, { recursive: true });
  } else {
    // fail closed: the seal is re-read here, not trusted from the caller
    if (!isApproved(missionDir)) throw new Error("approval gate not open: phase 2 refused");
    if (m.stage !== "executando") m = transition(m, "executando", { now: o.now, approved: true });
    if (!artigo) mkdirSync(resumoDir, { recursive: true });
  }
  const fresca = o.phase === 1 || o.semResume === true;
  const sessionId = o.phase === 1 ? (m.sessionId ?? randomUUID()) : o.semResume ? randomUUID() : (m.sessionId ?? "");
  if (fresca) m = { ...m, sessionId };
  const priorCost = m.costUsd;
  const remaining = o.tetoUsd - priorCost;
  let bs: BreakerState = { loops: m.loops, handoffs: m.handoffs }; // seeded from mission.json; loops come from there plus `VOLTA <spec>` lines the orchestrator emits (main agent text)

  const out: RunOutcome = { mission: m, unknownLines: 0, tokensByAgent: {}, subagentTypes: {}, costByModel: {}, denials: [], negados: [] };
  /** Phase 2 of an article: the SVG is kept, but a missing PNG is reported clearly. */
  const erroCapa = () => {
    if (!artigo || o.phase !== 2 || out.lastResult?.isError || to2 !== "concluida") return undefined;
    const dir = absPath(o.projectDir, "projectDir");
    const png = join(dir, "capa.png");
    const ok = existsSync(png) && statSync(png).size > 0;
    return existsSync(join(dir, "capa.svg")) && !ok ? "render-cover.sh falhou: capa.png não foi gerada (capa.svg foi mantido)" : undefined;
  };
  let to2 = "";
  let fezTrabalho = false; // phase 2 that never edited a file nor called a subagent did not execute anything
  const finish = (stopped?: string, pt?: string): RunOutcome => {
    const failed = stopped !== undefined || out.lastResult?.isError === true;
    // breaker and budget stops pause (user can resume); user stop, errors and exits are terminal
    const why = stopped === undefined ? undefined : pauseReason(stopped, pt ?? stopped.replace(/^\w+: /, ""));
    const semFontes = artigo && !failed ? motivoRedacao(o) : undefined;
    const semExecucao = !artigo && o.phase === 2 && !failed && !fezTrabalho ? "a fase 2 terminou sem executar nada (nenhum subagente nem edição): confira a resposta do agente e retome" : undefined;
    const reason = why ?? semFontes ?? semExecucao;
    const to = reason ? "pausada" : failed ? "parada" : o.phase === 1 ? "aguardando-aprovacao" : "concluida";
    to2 = to;
    const next = m.stage === to ? m : transition(m, to, { now: o.now, ...(reason ? { reason } : {}) });
    let comLocal = next;
    if (statsAntes && o.hubDir && chamadasLocal > 0) {
      const d = readStats(o.hubDir);
      for (let i = 0; i < d.calls.local - statsAntes.calls.local; i++) comLocal = recordLocal(comLocal, { via: "local", tokensSaved: i === 0 ? d.tokensSavedEstimate - statsAntes.tokensSavedEstimate : 0 });
      for (let i = 0; i < d.calls.fallback - statsAntes.calls.fallback; i++) comLocal = recordLocal(comLocal, { via: "claude-fallback" });
    }
    out.mission = { ...comLocal, costUsd: priorCost + budget.totalUsd, tokensByAgent: out.tokensByAgent, subagentTypes: out.subagentTypes, costByModel: out.costByModel, ...(out.consumo ? { consumo: { ...(comLocal["consumo"] as object | undefined), [String(o.phase)]: out.consumo } } : {}), handoffs: bs.handoffs, loops: bs.loops, ...(out.negados.length ? { negados: out.negados } : {}), ...(erroCapa() ? { erroCapa: erroCapa() } : {}) };
    if (stopped) out.stopped = stopped;
    if (!artigo) {
      mkdirSync(missionDir, { recursive: true });
      writeMission(missionDir, out.mission);
    }
    return out;
  };
  let budget = newBudget();
  // Local-model use: the stream tells us the agent called the helper; the helper's stats file (appended per call) tells how it went.
  // ponytail: stats are hub-wide, so a concurrent mission's calls would leak in; add a mission id to the stat line if runs ever overlap.
  const statsAntes = o.hubDir ? readStats(o.hubDir) : undefined;
  let chamadasLocal = 0;
  if (remaining <= 0) return finish("budget: mission cap already reached", "o teto de gasto da missão já foi atingido");

  const args = buildArgs({ ...o, mission: m }, sessionId);
  const child = (deps.spawn ?? defaultSpawn)(o.claudeBin ?? "claude", args, { cwd: absPath(o.projectDir, "projectDir"), ...(o.phase === 2 && o.testCommands?.length ? { env: { ...process.env, LAB_LOCAL_COMMANDS: JSON.stringify(o.testCommands) } } : {}) });
  child.stderr.resume();

  let stopped: string | undefined;
  let stoppedPt: string | undefined; // Portuguese text for the pause reason
  const stop = (why: string, pt?: string) => {
    if (stopped) return;
    stopped = why;
    stoppedPt = pt;
    child.kill("SIGKILL");
  };
  const porAbort = () => stop(o.signal?.reason === "pause" ? "pause: pelo usuário" : "stopped by user"); // abort("pause") parks the run instead of ending it
  if (o.signal?.aborted) porAbort();
  o.signal?.addEventListener("abort", porAbort, { once: true });
  let baseline: Ponto | undefined = o.plano?.inicio;
  let baselineSemana: Ponto | undefined = o.plano?.inicioSemana; // plan-usage baseline (spec 018)
  const tokensByMsg = new Map<string, { agent: string; total: number }>(); // assistant blocks repeat the same message id
  let anon = 0;
  const ultimoBash = new Map<string, string>();
  const tripBreaker = () => {
    const injected = o.breaker?.get();
    const s = injected ? { ...injected, handoffs: bs.handoffs } : bs;
    const steps = o.breaker ? [o.breaker.step] : Object.keys(s.loops);
    for (const step of steps.length ? steps : [""]) {
      const v = check(s, step, o.breaker?.limits);
      if (!v.ok) return stop(`breaker: ${v.motivo}`, v.motivoPt);
    }
  };
  tripBreaker();

  const handle = (e: StreamEvent) => {
    if (stopped) return;
    o.onEvent?.(e);
    if (e.kind === "desconhecido") out.unknownLines++;
    else if (e.kind === "subagent-started") {
      fezTrabalho = true;
      if (e.subagentType) out.subagentTypes[e.agentId] = e.subagentType;
      bs = recordHandoff(bs, o.now);
    } else if (e.kind === "denied") { // the denial event carries no input: pair it with that agent's last Bash command
      if (out.negados.length < 10) out.negados.push({ agent: e.agent, tool: e.tool, command: ultimoBash.get(e.agent) ?? "" });
    } else if (e.kind === "tool") {
      if (e.command) ultimoBash.set(e.agent, e.command.slice(0, 300));
      if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(e.name)) fezTrabalho = true;
      if (e.command && usaLocal(e.command)) chamadasLocal++;
    } else if (e.kind === "text") {
      if (e.agent === MAIN_AGENT) for (const x of e.text.matchAll(/^VOLTA\s+([\w.-]+)\s*$/gm)) bs = recordLoop(bs, x[1]!, o.now);
    } else if (e.kind === "usage") {
      const t = e.tokens;
      tokensByMsg.set(e.messageId || `anon-${anon++}`, { agent: e.agent, total: t.input + t.output + t.cacheRead + t.cacheCreation });
    } else if (e.kind === "subagent-progress") { // a stopped mission never gets task_notification: progress keeps the per-agent tokens
      if (e.subagentType) out.subagentTypes[e.agentId] ??= e.subagentType;
      if (e.totalTokens !== undefined) out.tokensByAgent[e.agentId] = Math.max(out.tokensByAgent[e.agentId] ?? 0, e.totalTokens);
    } else if (e.kind === "subagent-finished" && e.totalTokens !== undefined) {
      out.tokensByAgent[e.agentId] = Math.max(out.tokensByAgent[e.agentId] ?? 0, e.totalTokens);
    } else if (e.kind === "rate-limit") {
      out.rateLimit = { status: e.status, fiveHour: e.fiveHour, sevenDay: e.sevenDay, seenAt: o.now().toISOString() };
      const snap = o.plano && snapshotDeLimite(e, "");
      if (o.plano && snap) {
        const { tetoPp, tetoSemanaPp } = o.plano;
        if (tetoPp !== undefined) {
          baseline ??= snap.cincoHoras; // no reading at start (user confirmed anyway): the first reading in the run is the baseline
          if (deveParar(baseline, snap.cincoHoras, tetoPp)) stop(`plan: consumiu ${consumo(baseline, snap.cincoHoras)} pp de ${tetoPp} pp (5 h)`);
        }
        if (tetoSemanaPp !== undefined) {
          baselineSemana ??= snap.semana;
          if (deveParar(baselineSemana, snap.semana, tetoSemanaPp)) stop(`plan: consumiu ${consumo(baselineSemana, snap.semana)} pp de ${tetoSemanaPp} pp (semana)`);
        }
      }
    } else if (e.kind === "result") {
      out.denials = e.permissionDenials;
      if (e.text !== "" || !out.lastResult) out.lastResult = e;
      if (e.usage) out.consumo = { ...(e.numTurns !== undefined ? { turns: e.numTurns } : {}), ...e.usage };
      budget = recordResult(budget, { subtype: e.subtype, terminal_reason: e.terminalReason ?? undefined, total_cost_usd: e.costUsd });
      if (Object.keys(e.modelUsage).length > 0) {
        out.costByModel = {};
        let per = newBudget();
        for (const [model, usd] of Object.entries(e.modelUsage)) per = addUsage(per, { agent: model, costUsd: usd });
        out.costByModel = per.byAgent;
      }
      if (budget.exhausted) stop("budget: CLI reported the spend cap was hit", "a CLI informou que o teto de gasto foi atingido");
      else if (excedeu(budget, remaining)) stop(`budget: spent ${budget.totalUsd.toFixed(4)} of ${remaining.toFixed(4)} USD`, `gastou ${budget.totalUsd.toFixed(4)} de ${remaining.toFixed(4)} USD`);
    }
    tripBreaker();
  };

  const rl = createInterface({ input: child.stdout });
  const rlClosed = new Promise<void>((r) => rl.once("close", () => r()));
  rl.on("line", (line) => {
    try {
      for (const e of parseLine(line)) handle(e);
    } catch {
      out.unknownLines++; // a listener bug must not kill the server
    }
  });

  const code = await new Promise<number | null>((done) => {
    let settled = false;
    const end = (c: number | null) => {
      if (!settled) {
        settled = true;
        done(c);
      }
    };
    child.on("error", (err) => {
      stopped ??= `spawn error: ${err.message}`;
      end(null);
    });
    child.on("close", end);
  });
  await rlClosed; // drain remaining lines

  // Merge per-agent tokens (own usage events, subagent totals take precedence when larger).
  for (const { agent, total } of tokensByMsg.values()) out.tokensByAgent[agent] = (out.tokensByAgent[agent] ?? 0) + total;
  if (!stopped && budget.exhausted) stopped = "budget: CLI reported the spend cap was hit", stoppedPt = "a CLI informou que o teto de gasto foi atingido";
  if (!stopped && code !== 0) stopped = `exit code ${code}`;
  return finish(stopped, stoppedPt);
}
