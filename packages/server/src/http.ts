import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { closeSync, constants, copyFileSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { MAX_CHAINED_HANDOFFS, MAX_LOOPS_PER_SPEC } from "@lab/core/src/breaker.ts";
import { accessSync, constants as fsc, statSync } from "node:fs";
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import { GATE_FILE, isApproved } from "@lab/core/src/gate.ts";
import { conferirSpecs } from "@lab/core/src/specs.ts";
import { somarGasto, type Gasto } from "@lab/core/src/plan-budget.ts";
import { MAX_FILE_BYTES } from "@lab/core/src/promote.ts";
import { newMission, transition, type Mission } from "@lab/core/src/mission.ts";
import { dependenciasFaltando, montarBlocos, blocoFeito, type Bloco } from "@lab/core/src/blocos.ts";
import { normalizar, PROJECT_ID, analisarProjeto, analisarSubida, resolverProjeto, validarClickupUrl, validarComando, validarOrigem, type LeitorProjeto, type Projeto } from "@lab/core/src/projects.ts";
import { checkPasta, cloneRepo, type CloneResult } from "./clone.ts";
import { gravarEvento, lerEventos } from "./event-log.ts";
import { lerConversas } from "./transcript.ts";
import { promoteDraft } from "./promote.ts";
import { promptFase1, promptFase2, promptContinuacao, instrucaoRelatorio, instrucaoResumo, instrucaoExecucao, comentarioBuild } from "./prompt.ts";
import { promptFase1Redacao, promptFase2Redacao, promptSugestoes } from "./prompt-redacao.ts";
import { createProjectsStore, lerRetomada, type ProjectsStore } from "./projects-store.ts";
import { goTestScript, type RunOpts, type RunOutcome } from "./runner.ts";
import { MISSION_ID, type Store } from "./store.ts";
import type { StreamEvent } from "./stream.ts";
import { createUsageSource, type UsageSource } from "./usage-source.ts";
import { AutoPut, createUsageAuto, type AutoDeps } from "./usage-auto.ts";
import { SLUG, type RedacaoStore } from "./redacao-store.ts";
import { ARTEFATOS, avancar, estadoDoArtigo, PedidoRedacao, podeAvancar, type Acao, type EstadoArtigo } from "@lab/core/src/redacao.ts";
import { createAfiliadosStore, COMANDO_SYNC } from "./afiliados-store.ts";
import { lerInfo, ultimoRelatorio } from "./afiliados-info.ts";
import { sugerirAgenda } from "@lab/core/src/agenda.ts";
import { createReaper, localStatus, cleanStale, type LifecycleDeps } from "./ollama-lifecycle.ts";
import { LocalConfig, ollamaModels, readLocalConfig, readStats, writeLocalConfig } from "./local-config.ts";
import { watchDirs } from "./watch.ts";
import { podeIniciar } from "@lab/core/src/plan-budget.ts";
import { vista } from "@lab/core/src/usage.ts";
import { createNotificador, LidasPut, NotifConfigPut, type SpawnDesktop } from "./notificador.ts";

export type Runner = (o: RunOpts) => Promise<RunOutcome>;
export interface ServerOpts {
  runner: Runner; // injectable: real `runPhase` in production, fake agent in tests
  store: Store;
  clock: () => Date;
  host: string; // must be 127.0.0.1
  port?: number;
  registry?: ProjectsStore; // attached projects (spec 016)
  projects?: Record<string, string>; // legacy: id -> absolute path, becomes an in-memory registry
  workspacesDir?: string; // where URL projects are cloned: <hub>/workspaces
  clone?: (o: { origem: string; id: string; workspacesDir: string }) => Promise<CloneResult>; // injectable in tests
  usageAuto?: Pick<AutoDeps, "every" | "tickMs">; // injectable timer for tests
  usage?: UsageSource; // plan usage (spec 017); default is in memory with no way to consult
  retomadaMs?: number; // how often to look for missions whose plan limit was released
  agent?: string;
  heartbeatMs?: number; // SSE `: ping` period (default 25 s); injectable for tests
  redacao?: RedacaoStore; // article workspace (spec 027); without it /redacao answers 501
  hubDir?: string; // hub folder: afiliados backups and sync state (spec 033); without it /afiliados answers 501
  local?: { lifecycle?: Partial<LifecycleDeps>; idleMs?: number; reapMs?: number; watchMs?: number }; // spec 036: Ollama lifecycle, injectable for tests
  notificacoes?: { spawn?: SpawnDesktop; achar?: (cmd: string) => string | undefined; every?: (fn: () => void, ms: number) => () => void; pollMs?: number }; // notification center: injectable desktop spawn/timer for tests
  static?: (req: IncomingMessage, res: ServerResponse) => void; // front-end files for non-API GET/HEAD (spec 023)
}

const MAX_BODY = 64 * 1024;
/** Names the rejected command and, for path arguments, which one (the UI shows this text). */
const motivoComando = (c: string) => { const t = c.split(" ").find((x) => x.startsWith("/") || x.startsWith("~")); return t ? `argumento "${t}" é caminho absoluto (/ ou ~); use caminho relativo ao projeto` : "comando fora do formato permitido"; };
const Comandos = z.array(z.string()).max(50).superRefine((l, ctx) => { for (const c of l as string[]) if (!validarComando(c)) ctx.addIssue({ code: "custom", message: `comando "${String(c).slice(0, 80)}" recusado: ${motivoComando(c)}` }); }).transform((l) => [...new Set(l)]);
const PKG_LIMIT = 256 * 1024;
const NewProject = z.object({
  comandos: Comandos.optional(),
  nome: z.string().trim().min(1).max(100),
  url: z.string().max(2048).optional(),
  pasta: z.string().max(4096).optional(),
  apelidos: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  clickupListUrl: z.string().max(2048).refine(validarClickupUrl, "must be an https://app.clickup.com url").optional(),
});
const NewMission = z.object({ project: z.string().min(1).max(100), demanda: z.string().min(1).max(20_000), tetoPp: z.number().positive().max(100).optional(), tetoSemanaPp: z.number().positive().max(100).optional(), confirmarUso: z.boolean().optional(), relatorio: z.boolean().optional() });
const Resumo = z.object({ feito: z.array(z.string().max(1000)).max(50), pendente: z.array(z.string().max(1000)).max(50), acaoUsuario: z.array(z.string().max(1000)).max(50) });
const Ponto = z.object({ percentual: z.number(), reiniciaEm: z.number() });
const UsoInicial = z.object({ cincoHoras: Ponto, semana: Ponto });
/** Plan caps of a stored mission; absent when neither cap is set. */
const planoDe = (m: Record<string, unknown>) => {
  const ini = UsoInicial.safeParse(m["usoInicial"]);
  const tetoPp = typeof m["tetoPp"] === "number" ? m["tetoPp"] : undefined;
  const tetoSemanaPp = typeof m["tetoSemanaPp"] === "number" ? m["tetoSemanaPp"] : undefined;
  if (tetoPp === undefined && tetoSemanaPp === undefined) return undefined;
  return { ...(tetoPp !== undefined ? { tetoPp } : {}), ...(tetoSemanaPp !== undefined ? { tetoSemanaPp } : {}), ...(ini.success ? { inicio: ini.data.cincoHoras, inicioSemana: ini.data.semana } : {}) };
};
const SetComandos = z.object({ comandos: Comandos });
const Adjust = z.object({ comment: z.string().min(1).max(20_000) });
const Continuar = z.object({ comment: z.string().min(1).max(20_000) });
const Resume = z.object({ comment: z.string().min(1).max(20_000).optional() });
const Empty = z.object({});
const Approve = z.object({ blocos: z.array(z.number().int().positive()).min(1).max(100).optional() });
const Cap = z.number().positive().max(100).nullable().optional(); // null removes the cap
const EditMission = z.object({ demanda: z.string().min(1).max(20_000).optional(), tetoPp: Cap, tetoSemanaPp: Cap });
const PutLocal = z.object({ enabled: z.boolean().optional(), model: z.string().min(1).max(100).optional() }).strict();
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const SugerirAgenda = z.object({ nichos: z.array(z.object({ key: z.string().min(1).max(100), horas: z.array(HHMM).max(100).optional(), envios: z.number().int().min(0).max(100) })).max(50), intervaloMin: z.number().int().min(1).max(600).optional() });
const PutNichos = z.object({ nichos: z.array(z.unknown()).max(200), hash: z.string().min(1).max(100), mtimeMs: z.number() });
const SYNC_AVISO = "Register the project 'afiliados' (id or name) in the hub to use this panel.";
const Ajustes = z.object({ comentario: z.string().trim().min(1).max(20_000) });
const Limites = z.object({ tetoPp: z.number().positive().max(100).optional(), tetoSemanaPp: z.number().positive().max(100).optional(), confirmarUso: z.boolean().optional() });
const Escolher = z.object({ indice: z.number().int().min(0) });
const ESTADOS = ["pesquisando", "rascunho", "em-revisao", "edicao-final", "aprovado", "cancelado", "pausado"];
const TIPOS: Record<string, string> = { ".md": "text/markdown; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

/** Reader for top-level project files: no symlinks (O_NOFOLLOW), regular files only, capped size, any failure means "absent". */
function leitorProjeto(dir: string): LeitorProjeto {
  const abrir = <T>(nome: string, f: (fd: number) => T): T | undefined => {
    try {
      const fd = openSync(join(dir, nome), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { return fstatSync(fd).isFile() ? f(fd) : undefined; } finally { closeSync(fd); }
    } catch { return undefined; }
  };
  return {
    listar: () => { try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name); } catch { return []; } },
    existe: (nome) => abrir(nome, () => true) === true,
    ler: (nome) => abrir(nome, (fd) => {
      const buf = Buffer.alloc(PKG_LIMIT + 1);
      const n = readSync(fd, buf, 0, PKG_LIMIT + 1, 0);
      return n > PKG_LIMIT ? undefined : buf.subarray(0, n).toString("utf8");
    }),
  };
}

class HttpError extends Error {
  readonly status: number; // no parameter property: Node strips types only (spec 023)
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const str = (m: Mission, k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");

export function createServer(o: ServerOpts) {
  if (o.host !== "127.0.0.1") throw new Error("server binds to 127.0.0.1 only");
  const { store, clock } = o;
  const registry = o.registry ?? createProjectsStore();
  for (const [id, caminho] of Object.entries(o.projects ?? {}))
    registry.add({ id, nome: id, apelidos: [], comandos: [], origem: { tipo: "pasta", valor: caminho }, caminho, criadoEm: clock().toISOString() });
  const usage = o.usage ?? createUsageSource({ clock });
  const usageView = () => vista(usage.atual(), clock());
  const running = new Map<string, { ac: AbortController; done: Promise<void> }>();
  const sse = new Set<ServerResponse>();
  let port = 0;

  let eventId = 0; // `id:` only labels events; no replay (Last-Event-ID is ignored)
  const publish = (event: string, data: unknown) => {
    const msg = `id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const r of sse) r.write(msg);
  };
  const nt = o.hubDir ? createNotificador({
    hubDir: o.hubDir, clock, publish,
    afiliados: () => registry.list().find((p) => p.id.toLowerCase() === "afiliados" || p.nome.toLowerCase() === "afiliados")?.caminho,
    ...o.notificacoes,
  }) : undefined;
  usage.subscribe(() => { const v = usageView(); publish("usage", v); nt?.uso(v); });
  // SSE clients by tab id (`/events?c=<id>`); a tab counts as visible only while its id is in `visiveis` AND it is connected
  const conexoes = new Map<ServerResponse, string>();
  const visiveis = new Set<string>();
  const auto = createUsageAuto({
    ...(o.hubDir ? { dir: o.hubDir } : {}),
    clock,
    usage,
    ocupado: () => running.size > 0,
    clientes: () => { const ids = new Set(conexoes.values()); return { conectados: conexoes.size, visiveis: [...ids].filter((i) => visiveis.has(i)).length }; },
    aoMudar: () => { const s = auto.status(); publish("uso-auto", s); nt?.usoAuto(s); },
    aoLer: () => publish("usage", usageView()),
    ...o.usageAuto,
  });
  const lcDeps = (): LifecycleDeps => { const c = readLocalConfig(o.hubDir!); return { hub: o.hubDir!, port: c.port, model: c.model, ...o.local?.lifecycle }; };
  let reaper: ReturnType<typeof createReaper> | undefined;
  let watcher: ReturnType<typeof setInterval> | undefined;
  let last: { ligado: boolean; uso: string } | undefined;
  const watch = async () => {
    const d = lcDeps();
    const s = await localStatus(d, readLocalConfig(d.hub).enabled);
    const cur = { ligado: s.ollama.estado === "ligado", uso: s.emUso?.task ?? "" };
    const ev = !last ? undefined : cur.ligado !== last.ligado ? (cur.ligado ? "ligado" : "desligado") : cur.uso !== last.uso ? (cur.uso ? "em-uso" : "ocioso") : undefined;
    last = cur;
    if (ev) { publish("local", { evento: ev, ...s }); nt?.local(ev, s.enabled); }
  };
  const save = (m: Mission) => {
    store.save(m);
    publish("mission", summary(m));
    nt?.missao(m);
  };
  const summary = (m: Mission) => ({ id: m.id, project: m.project, stage: m.stage, costUsd: m.costUsd, planoGasto: m["planoGasto"], updatedAt: m.updatedAt, stopReason: m["stopReason"], pauseReason: m.pauseReason });
  const projectPath = (m: Mission) => registry.get(m.project)?.caminho;
  const newProjectId = (nome: string) => {
    const base = normalizar(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "projeto";
    let id = base;
    while (registry.get(id)) id = `${base}-${randomBytes(2).toString("hex")}`;
    return id;
  };

  /** Reads the promoted artifacts back from `<project>/.claude/` (only paths we recorded; never follows symlinks). */
  const pack = (m: Mission) => {
    const proj = projectPath(m);
    const promoted = Array.isArray(m["promoted"]) ? (m["promoted"] as unknown[]).filter((p): p is string => typeof p === "string") : [];
    const files: { path: string; content: string }[] = [];
    if (!proj) return { files };
    const claude = resolve(proj, ".claude");
    for (const rel of promoted) {
      const abs = resolve(claude, rel);
      try {
        if (!abs.startsWith(claude + sep) || lstatSync(abs).isSymbolicLink() || lstatSync(abs).size > MAX_FILE_BYTES) continue;
        files.push({ path: rel, content: readFileSync(abs, "utf8") });
      } catch { /* vanished: skip */ }
    }
    return { files };
  };

  /** The user stepped in (approve/adjust/resume): clear the breaker counters. */
  const intervene = (m: Mission): Mission => ({ ...m, loops: {}, handoffs: 0 });

  const resumoPath = (m: Mission) => join(store.dirOf(m.id), "resumo", "resumo.json");
  /** Never throws: a missing or malformed wrap-up just means no summary card. */
  const lerResumo = (p: string) => {
    try { const r = Resumo.safeParse(JSON.parse(readFileSync(p, "utf8"))); return r.success ? r.data : undefined; } catch { return undefined; }
  };

  /** Starts a phase in the background; the HTTP call returns right away. */
  function launch(m: Mission, phase: 1 | 2, prompt: string, continuacao = false) {
    const proj = projectPath(m);
    const ac = new AbortController();
    const park = (id: string, why: string) => {
      const cur = store.get(id);
      if (cur && cur.stage !== "parada" && cur.stage !== "concluida") save({ ...transition(cur, "parada", { now: clock }), stopReason: why });
    };
    if (!proj) { park(m.id, "unknown project"); return; }
    const comandos = registry.get(m.project)?.comandos ?? [];
    const plano = planoDe(m); // no caps: no limit; no baseline: first reading becomes the baseline
    if (phase === 2 && comandos.length === 0) publish("warning", { missionId: m.id, message: "sem comandos de teste configurados: a fase 2 roda sem Bash" });
    if (phase === 2) rmSync(resumoPath(m), { force: true }); // a stale wrap-up must never pass for this run
    const stopWatch = watchDirs({ mission: store.dirOf(m.id), project: join(proj, ".claude") }, (e) => publish("file", { missionId: m.id, ...e }));
    const usoAntes = usage.atual();
    const done = (async () => {
      try {
        const out = await o.runner({
          phase, mission: m, projectDir: proj, missionsDir: store.dir, prompt: phase === 2 ? `${prompt}\n${m.kind === "relatorio" ? `${instrucaoRelatorio}\n` : `${instrucaoExecucao(comandos, goTestScript(o.hubDir, proj))}\n`}${instrucaoResumo(resumoPath(m))}` : prompt, now: clock, signal: ac.signal, ...(plano ? { plano } : {}),
          ...(o.agent ? { agent: o.agent } : {}), ...(phase === 2 ? { ...(specsOf(m).length === 0 && !continuacao ? { semResume: true } : {}), testCommands: comandos, ...(o.hubDir ? { hubDir: o.hubDir } : {}) } : {}),
          onEvent: (e: StreamEvent) => {
            if (e.kind === "rate-limit") usage.alimentar(e);
            publish("progress", { missionId: m.id, event: e });
            gravarEvento(store.dirOf(m.id), e);
            nt?.progresso(m.id, e, "missao");
          },
        });
        let cur: Mission = out.mission;
        if (phase === 2 && out.specsOk?.length) cur = { ...cur, specsFeitas: [...new Set([...feitasDe(cur), ...out.specsOk.map((s) => Number(/\d+/.exec(s)?.[0])).filter(Boolean)])] };
        const usoDepois = usage.atual();
        if (usoAntes.estado === "ok" && usoDepois.estado === "ok") cur = { ...cur, planoGasto: somarGasto(cur["planoGasto"] as Gasto | undefined, usoAntes, usoDepois) };
        if (phase === 1 && cur.stage === "aguardando-aprovacao") {
          const r = promoteDraft(join(store.dirOf(m.id), "out"), proj);
          if (r.ok) {
            const ler = (p: string) => readFileSync(join(store.dirOf(m.id), "out", p), "utf8");
            const textos = r.promoted.filter((p) => p.startsWith("specs/")).map((p) => ({ name: p.slice(6), text: ler(p) }));
            const b = montarBlocos(r.promoted.includes("handoff/blocks.json") ? ler("handoff/blocks.json") : undefined, textos.filter((f) => /^\d.*\.spec\.md$/.test(f.name)));
            cur = { ...cur, promoted: r.promoted, avisosSpecs: [...conferirSpecs(textos), ...(b.aviso ? [b.aviso] : [])], blocos: b.blocos };
          } else cur = { ...transition(cur, "parada", { now: clock }), stopReason: `promotion failed: ${r.reason}` };
        } else if (phase === 2 && cur.stage === "concluida") {
          const r = lerResumo(resumoPath(m));
          if (r) cur = { ...cur, resumo: r };
          delete cur["ajustando"];
          // blocks left unsealed: close the gate and go back to the user's approval
          if (blocosDe(cur).some((b) => !blocoFeito(b, feitasDe(cur)))) {
            rmSync(join(store.dirOf(m.id), GATE_FILE), { force: true });
            cur = { ...transition(cur, "aguardando-aprovacao", { now: clock }), blocosSel: undefined };
          }
        } else if (cur.stage === "parada") cur = { ...cur, stopReason: out.stopped ?? "stopped" };
        save(cur);
      } catch (e) {
        park(m.id, `runner error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        stopWatch();
        running.delete(m.id);
      }
    })();
    running.set(m.id, { ac, done });
  }

  const specsOf = (m: Mission) =>
    (Array.isArray(m["promoted"]) ? (m["promoted"] as unknown[]) : [])
      .filter((p): p is string => typeof p === "string" && /^specs\/\d.*\.spec\.md$/.test(p))
      .map((p) => join(projectPath(m) ?? "", ".claude", p));

  const blocosDe = (m: Mission) => (Array.isArray(m["blocos"]) ? (m["blocos"] as Bloco[]) : []);
  const feitasDe = (m: Mission) => (Array.isArray(m["specsFeitas"]) ? (m["specsFeitas"] as number[]) : []);
  const numeroDe = (spec: string) => Number(/(\d+)[^/]*$/.exec(spec)?.[1]);

  /** Phase 2 input limited to the sealed blocks, minus specs already done. */
  const fase2Input = (m: Mission) => {
    const sel = Array.isArray(m["blocosSel"]) ? (m["blocosSel"] as number[]) : undefined;
    const escolhidas = new Set(blocosDe(m).filter((_, i) => !sel || sel.includes(i + 1)).flatMap((b) => b.specs));
    const todas = specsOf(m);
    const specs = blocosDe(m).length ? todas.filter((p) => escolhidas.has(numeroDe(p)) && !feitasDe(m).includes(numeroDe(p))) : todas;
    const rodada = new Set(specs.map(numeroDe));
    const blocos = blocosDe(m).flatMap((b, i) => { const ns = b.specs.filter((n) => rodada.has(n)); return ns.length ? [`- Block ${i + 1}: specs ${ns.join(", ")}`] : []; });
    return { specs, blocos, projetoPath: projectPath(m) ?? "", adiadas: todas.length - specs.length, ...(o.hubDir ? { hubDir: o.hubDir } : {}) };
  };

  const prompt1 = (m: Mission, comment?: string, retomada = false) => {
    const p = registry.get(m.project);
    return promptFase1({
      demanda: str(m, "demanda"),
      stagingDir: join(store.dirOf(m.id), "out"),
      projetoPath: p?.caminho ?? "",
      ...(p ? { notas: lerRetomada(p, store).notes } : {}),
      ...(comment ? { comentario: comment } : {}),
      ...(retomada ? { retomada } : {}),
      ...(m.kind === "relatorio" ? { relatorio: true } : {}),
    });
  };

  const LIBEROU = "The run stopped because the Claude plan usage limit was reached; usage is available again. Continue exactly where you stopped: do not redo or re-audit finished work, only check what was left half-done.";

  /** Resumes a paused or recolhida mission. `automatico`: the hub itself, after the plan's usage was released. */
  function retomar(m: Mission, resposta?: string, automatico = false, auditar = !automatico): Mission {
    // pausada remembers its phase; parada (recolhida) goes back to phase 2 only if it was sealed and has a session
    const fase2 = m.stage === "pausada" ? m.pausedFrom === "executando" : isApproved(store.dirOf(m.id)) && !!m.sessionId;
    // fail closed: phase 2 only with a valid seal (re-checked by the runner too)
    if (fase2 && !isApproved(store.dirOf(m.id))) throw new HttpError(409, "approval gate not open: cannot resume execution");
    const { stopReason: _s, retomarEm: _r, ...limpa } = m;
    const depois = (x: Mission) => (automatico ? x : intervene(x)); // rework counters survive an automatic resume
    if (fase2) {
      const next = depois(transition(limpa as Mission, "executando", { now: clock, approved: true }));
      save(next);
      const comentario = automatico ? LIBEROU : String(m["pauseReason"] ?? "").startsWith("build necessário") ? comentarioBuild(resposta) : resposta;
      // an interrupted follow-up goes back to its own request, never to the unsealed specs
      if (typeof next["ajustando"] === "string") launch(next, 2, `${promptContinuacao(next["ajustando"], projectPath(next) ?? "")}\nThat run was interrupted: check what was left half-done and finish it.${comentario ? `\nUser comment: ${comentario}` : ""}`, true);
      else launch(next, 2, promptFase2({ ...fase2Input(next), retomada: auditar, ...(comentario ? { comentario } : {}) }));
      return next;
    }
    // phase 1 resumes like adjust: fresh session carrying the comment, auditing what was already drafted
    const { sessionId: _drop, ...rest } = transition(limpa as Mission, "planejando", { now: clock });
    const next = depois(rest as Mission);
    save(next);
    launch(next, 1, prompt1(next, resposta, true));
    return next;
  }

  /** Missions stopped by the plan limit go back by themselves, one at a time. The time is in mission.json, so a hub restart keeps it. */
  function retomarLiberadas() {
    if (running.size) return;
    const agora = clock().getTime() / 1000;
    const m = store.list().find((x) => x.stage === "pausada" && typeof x["retomarEm"] === "number" && (x["retomarEm"] as number) <= agora);
    if (!m) return;
    try { retomar(m, undefined, true); } catch (e) { console.error(`auto-resume ${m.id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  let retomador: NodeJS.Timeout | undefined;

  // ---- request plumbing ----
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify(body));
  };
  const localHost = (h: string | undefined) => h === `127.0.0.1:${port}` || h === `localhost:${port}`;
  const localOrigin = (origin: string) => {
    try {
      const u = new URL(origin);
      return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    } catch { return false; }
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolveBody, reject) => {
      if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) return reject(new HttpError(413, "body too large"));
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) { chunks.length = 0; reject(new HttpError(413, "body too large")); req.removeAllListeners("data"); req.resume(); }
        else chunks.push(c);
      });
      req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  async function json<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
    if (!/^application\/json\s*(;|$)/i.test(req.headers["content-type"] ?? "")) throw new HttpError(415, "content-type must be application/json");
    const text = await readBody(req);
    let data: unknown = {};
    if (text.trim() !== "") {
      try { data = JSON.parse(text); } catch { throw new HttpError(400, "invalid JSON"); }
    }
    const r = schema.safeParse(data);
    if (!r.success) throw new HttpError(400, `invalid input: ${r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")}`);
    return r.data;
  }
  const mustGet = (id: string) => {
    if (!MISSION_ID.test(id)) throw new HttpError(400, "invalid mission id");
    const m = store.get(id);
    if (!m) throw new HttpError(404, "mission not found");
    return m;
  };

  const sendFile = (res: ServerResponse, nome: string, buf: Buffer, attachment: boolean) => {
    res.writeHead(200, {
      "content-type": TIPOS[nome.slice(nome.lastIndexOf("."))] ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", // an SVG served here can never run script
      ...(attachment ? { "content-disposition": `attachment; filename="${nome}"` } : {}),
    });
    res.end(buf);
  };
  const artigoEvent = (m: Mission) => {
    publish("artigo", { slug: m.id, estado: estadoDoArtigo(m.stage) });
    nt?.artigo(m, estadoDoArtigo(m.stage) === "aprovado" && o.redacao?.lerArtefato(m.id, "capa.png") !== undefined);
  };

  /** Article run: cwd is `redacao/<slug>/`; state lives in artigo.json. Phase 1 ends in review, phase 2 in `aprovado`. */
  function launchRedacao(m: Mission, phase: 1 | 2, comentario?: string) {
    const rs = o.redacao!;
    const dir = join(rs.dir, m.id);
    const hub = dirname(rs.dir);
    const key = `redacao:${m.id}`;
    const ac = new AbortController();
    const park = (why: string) => {
      const cur = rs.ler(m.id);
      if (cur && cur.stage !== "parada" && cur.stage !== "concluida") { const p = { ...transition(cur, "parada", { now: clock }), stopReason: why }; rs.salvar(p); artigoEvent(p); }
    };
    const ped = PedidoRedacao.safeParse(m["pedido"]);
    if (!ped.success) { park("pedido inválido"); return; }
    const leitura = ped.data.referencias.filter((r) => r.tipo === "caminho").map((r) => r.valor);
    const plano = planoDe(m);
    const input = { pedido: ped.data, dir, hub, leitura, ...(comentario ? { comentario } : {}) };
    const sugerir = ped.data.modo === "sugerir"; // researcher only; the result is sugestoes.json, validated below
    const done = (async () => {
      try {
        const out = await o.runner({
          phase, mission: m, projectDir: dir, missionsDir: rs.dir, now: clock, signal: ac.signal,
          prompt: sugerir ? promptSugestoes(input) : phase === 1 ? promptFase1Redacao(input) : promptFase2Redacao(input), redacao: { hubDir: hub, leitura, ...(sugerir ? { sugerir } : {}) },
          ...(plano ? { plano } : {}), ...(o.agent ? { agent: o.agent } : {}),
          onEvent: (e: StreamEvent) => { if (e.kind === "rate-limit") usage.alimentar(e); publish("progress", { missionId: m.id, event: e }); nt?.progresso(m.id, e, "redacao"); },
        });
        let cur: Mission = out.mission;
        if (cur.stage === "parada") cur = { ...cur, stopReason: out.stopped ?? "stopped" };
        if (sugerir && cur.stage === "aguardando-aprovacao") {
          let bruto: unknown; // never advances on missing/invalid/empty suggestions
          try { bruto = JSON.parse(readFileSync(join(dir, "sugestoes.json"), "utf8")); } catch { /* reported below */ }
          const r = rs.salvarSugestoes(m.id, bruto);
          cur = r.validas.length
            ? { ...cur, stage: "concluida" } // nothing more to run: the user picks a theme via /escolher
            : { ...transition(cur, "parada", { now: clock }), stopReason: `sugestões inválidas ou sem fontes/data de acesso: ${r.recusadas.flatMap((x) => x.erros).join("; ") || "sugestoes.json ausente ou vazio"}` };
        }
        rs.salvar(cur);
        if (phase === 1 && !sugerir && cur.stage === "aguardando-aprovacao") { // keep the draft as a version (3 max, the 4th prunes the oldest)
          const n = (Array.isArray(cur["versoes"]) ? (cur["versoes"] as { versao: number }[]) : []).reduce((a, v) => Math.max(a, v.versao), 0) + 1;
          mkdirSync(join(dir, "versoes"), { recursive: true });
          copyFileSync(join(dir, ARTEFATOS.rascunho), join(dir, "versoes", `rascunho-${n}.md`));
          cur = rs.registrarVersao(m.id, `versoes/rascunho-${n}.md`);
        }
        artigoEvent(cur);
      } catch (e) {
        park(`runner error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        running.delete(key);
      }
    })();
    running.set(key, { ac, done });
  }

  async function routeRedacao(req: IncomingMessage, res: ServerResponse, url: URL, path: string, method: string) {
    const rs = o.redacao;
    if (!rs) throw new HttpError(501, "redação is not configured");
    const slugOk = (s: string) => { if (!SLUG.test(s)) throw new HttpError(400, "invalid slug"); return s; };
    const get = (s: string) => rs.ler(slugOk(s)) ?? (() => { throw new HttpError(404, "article not found"); })();
    const save = (m: Mission) => { rs.salvar(m); artigoEvent(m); };

    if (path === "/redacao") {
      if (method === "GET") {
        const e = url.searchParams.get("estado");
        if (e !== null && !ESTADOS.includes(e)) throw new HttpError(400, "invalid estado");
        return send(res, 200, { artigos: rs.listar((e ?? undefined) as EstadoArtigo | undefined) });
      }
      if (method !== "POST") throw new HttpError(404, "not found");
      const b = await json(req, PedidoRedacao);
      const invalidas: { valor: string; motivo: string }[] = [];
      for (const r of b.referencias) {
        if (r.tipo !== "caminho") continue;
        try {
          if (!isAbsolute(r.valor)) throw new Error("caminho deve ser absoluto");
          statSync(r.valor);
          accessSync(r.valor, fsc.R_OK);
        } catch (e) {
          invalidas.push({ valor: r.valor, motivo: (e as NodeJS.ErrnoException).code === "ENOENT" ? "não existe" : (e as Error).message.includes("absoluto") ? "caminho deve ser absoluto" : "ilegível" });
        }
      }
      if (invalidas.length) throw Object.assign(new HttpError(400, "referências locais inválidas"), { extra: { invalidas } });
      const lim = Limites.safeParse(b);
      if (!lim.success) throw new HttpError(400, `invalid input: ${lim.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      const uso = usage.atual();
      const livre = podeIniciar(uso);
      const { tetoPp, tetoSemanaPp } = lim.data;
      if (url.searchParams.get("estimar") === "1") return send(res, 200, { estimativa: { uso: usageView(), livre, tetoPp: tetoPp ?? null, tetoSemanaPp: tetoSemanaPp ?? null, palavras: b.palavras } }); // nothing is created or started
      if (!livre.ok && lim.data.confirmarUso !== true) throw Object.assign(new HttpError(409, livre.motivo), { extra: { motivo: livre.motivo, uso: usageView() } });
      const usoInicial = uso.estado === "ok" ? { cincoHoras: { percentual: uso.cincoHoras.percentual, reiniciaEm: uso.cincoHoras.reiniciaEm }, semana: { percentual: uso.semana.percentual, reiniciaEm: uso.semana.reiniciaEm } } : undefined;
      const criada = rs.criar(b, clock);
      const m = transition({ ...criada, ...(tetoPp !== undefined ? { tetoPp } : {}), ...(tetoSemanaPp !== undefined ? { tetoSemanaPp } : {}), ...(usoInicial ? { usoInicial } : {}) }, "planejando", { now: clock });
      rs.salvar(m);
      artigoEvent(m);
      launchRedacao(m, 1);
      return send(res, 201, { artigo: m });
    }
    const sg = /^\/redacao\/sugestoes\/([^/]+)$/.exec(path);
    if (sg && method === "GET") {
      const lista = rs.lerSugestoes(slugOk(sg[1]!));
      if (!lista) throw new HttpError(404, "suggestions not found");
      return send(res, 200, { sugestoes: lista });
    }
    const esc = /^\/redacao\/sugestoes\/([^/]+)\/escolher$/.exec(path);
    if (esc) {
      if (method !== "POST") throw new HttpError(404, "not found");
      const id = slugOk(esc[1]!);
      const b = await json(req, Escolher);
      const s = rs.lerSugestoes(id)?.[b.indice];
      if (!s) throw new HttpError(404, "suggestion not found");
      const pedido = PedidoRedacao.parse({ modo: "definido", tema: s.tema, referencias: s.fontes.map((f) => ({ tipo: "url", valor: f.url })) });
      const m = rs.criar(pedido, clock);
      artigoEvent(m);
      return send(res, 201, { artigo: m });
    }
    const hit = /^\/redacao\/([^/]+)(?:\/(aprovar|ajustes|cancelar|reabrir|retomar|artefatos\/([^/]+)|(capa\.png|capa\.svg)))?$/.exec(path);
    if (!hit) throw new HttpError(404, "not found");
    const slug = slugOk(hit[1]!);
    const [, , acao, nomeRaw, capa] = hit;
    if (!acao) {
      if (method === "GET") { const m = get(slug); return send(res, 200, { artigo: m, estado: estadoDoArtigo(m.stage), artefatos: rs.artefatos(slug), sugestoes: rs.lerSugestoes(slug) ?? [] }); }
      if (method !== "DELETE") throw new HttpError(404, "not found");
      if (!rs.excluir(slug)) throw new HttpError(404, "article not found");
      publish("artigo", { slug, estado: "excluido" });
      return send(res, 200, { removed: slug });
    }
    if (method === "GET" && (nomeRaw !== undefined || capa)) {
      let nome = capa ?? "";
      if (nomeRaw !== undefined) { try { nome = decodeURIComponent(nomeRaw); } catch { throw new HttpError(400, "invalid artifact name"); } }
      get(slug);
      if (!(Object.values(ARTEFATOS) as string[]).includes(nome)) throw new HttpError(404, "artifact not found");
      const buf = rs.lerArtefato(slug, nome);
      if (!buf) throw new HttpError(404, "artifact not found");
      return sendFile(res, nome, buf, capa !== undefined);
    }
    if (method !== "POST" || !["aprovar", "ajustes", "cancelar", "reabrir", "retomar"].includes(acao)) throw new HttpError(404, "not found");
    const key = `redacao:${slug}`;
    const novaSessao = (m: Mission) => { const { sessionId: _drop, ...rest } = m; return rest as Mission; }; // a new --session-id: the CLI rejects reuse
    const selo = join(rs.dir, slug, GATE_FILE);
    if (acao === "retomar") {
      await json(req, Empty);
      const m = get(slug);
      if (m.stage !== "pausada" || running.has(key)) throw new HttpError(409, `cannot resume in stage ${m.stage}`);
      if (m.pausedFrom === "executando") {
        if (!isApproved(join(rs.dir, slug))) throw new HttpError(409, "approval gate not open: cannot resume execution"); // fail closed
        const next = transition(m, "executando", { now: clock, approved: true });
        save(next); launchRedacao(next, 2);
        return send(res, 202, { artigo: next, estado: estadoDoArtigo(next.stage) });
      }
      const next = novaSessao(transition(m, "planejando", { now: clock }));
      save(next); launchRedacao(next, 1);
      return send(res, 202, { artigo: next, estado: estadoDoArtigo(next.stage) });
    }
    if (acao === "cancelar" && running.has(key)) {
      await json(req, Empty);
      const run = running.get(key)!;
      run.ac.abort();
      await run.done;
      const cur = get(slug);
      return send(res, 200, { artigo: cur, estado: estadoDoArtigo(cur.stage) });
    }
    let a: Acao;
    if (acao === "ajustes") a = { tipo: "pedir-ajustes", comentario: (await json(req, Ajustes)).comentario };
    else { await json(req, Empty); a = { tipo: acao as "aprovar" | "cancelar" | "reabrir" }; }
    const m = get(slug);
    const r = podeAvancar(estadoDoArtigo(m.stage), a);
    if (!r.ok) throw new HttpError(409, r.erro);
    let next: Mission;
    try { next = avancar(m, a, clock); } catch (e) { throw new HttpError(409, (e as Error).message); }
    if (r.novaVersao) {
      const c = Array.isArray(next["comentarios"]) ? next["comentarios"] : [];
      next = { ...next, versao: (typeof next["versao"] === "number" ? next["versao"] : 1) + 1, ...(a.tipo === "pedir-ajustes" ? { comentarios: [...c, { texto: a.comentario, em: clock().toISOString() }] } : {}) };
    }
    if (a.tipo === "aprovar") {
      // Everything below is synchronous, so a double click cannot start phase 2 twice.
      writeFileSync(selo, JSON.stringify({ approved: true, approvedAt: clock().toISOString() }));
      save(next); launchRedacao(next, 2);
      return send(res, 200, { artigo: next, estado: estadoDoArtigo(next.stage) });
    }
    if (a.tipo === "pedir-ajustes" || a.tipo === "reabrir") {
      rmSync(selo, { force: true }); // a new draft needs a new approval
      next = novaSessao(next);
      save(next); launchRedacao(next, 1, a.tipo === "pedir-ajustes" ? a.comentario : undefined);
      return send(res, 200, { artigo: next, estado: estadoDoArtigo(next.stage) });
    }
    save(next);
    return send(res, 200, { artigo: next, estado: estadoDoArtigo(next.stage) });
  }

  const afiliados = o.hubDir ? createAfiliadosStore({ hubDir: o.hubDir, clock, caminho: () => registry.list().find((p) => p.id.toLowerCase() === "afiliados" || p.nome.toLowerCase() === "afiliados")?.caminho }) : undefined;

  /** Display-only: no route sends, executes or changes DRY_RUN; the client never supplies paths. */
  async function routeAfiliados(req: IncomingMessage, res: ServerResponse, path: string, method: string) {
    const af = afiliados;
    if (!af) throw new HttpError(501, "afiliados is not configured");
    const resp = (r: { ok: true } | { ok: false; status: number; erro: string; recarregar?: boolean }, extra: object = {}) => {
      if (r.ok) return send(res, 200, { ...r, ...extra });
      throw Object.assign(new HttpError(r.status, r.erro), r.recarregar ? { extra: { recarregar: true } } : {});
    };
    const caminho = () => registry.list().find((p) => p.id.toLowerCase() === "afiliados" || p.nome.toLowerCase() === "afiliados")?.caminho;
    const naoConfigurado = () => send(res, 200, { configurado: false, instrucao: SYNC_AVISO });
    const rotas: Record<string, Array<[string, () => Promise<void> | void]>> = {};
    const on = (m: string, rota: string, f: () => Promise<void> | void) => { (rotas[rota] ??= []).push([m, f]); };
    const c = caminho();
    const relatorio = /^\/afiliados\/relatorios\/(ops|deal-auditor)$/.exec(path);
    const jid = /^\/afiliados\/nichos\/([^/]+)\/jid$/.exec(path);
    const rest = /^\/afiliados\/backups\/([^/]+)\/restaurar$/.exec(path);
    const rota = relatorio ? "relatorio" : jid ? "jid" : rest ? "restaurar" : path;
    on("GET", "/afiliados/nichos", () => { if (!c) return naoConfigurado(); const r = af.lerNichos(); return r.ok ? send(res, 200, { configurado: true, ...r, pendenteSync: af.estado().pendenteSync }) : resp(r); });
    on("PUT", "/afiliados/nichos", async () => {
      const b = await json(req, PutNichos);
      if (!c) return naoConfigurado();
      const r = af.gravarNichos(b.nichos, { hash: b.hash, mtimeMs: b.mtimeMs });
      if (r.ok) nt?.afiliados("salvo"); else if (r.status === 409) nt?.afiliados("conflito");
      return r.ok ? send(res, 200, { configurado: true, ...r, pendenteSync: true, comandoSync: COMANDO_SYNC }) : resp(r);
    });
    on("GET", "jid", () => {
      if (!c) return naoConfigurado();
      const v = af.revelarJid(jid![1]!);
      if (v === undefined) throw new HttpError(404, "niche not found");
      res.setHeader("cache-control", "no-store");
      return send(res, 200, { groupJid: v });
    });
    on("GET", "/afiliados/backups", () => send(res, 200, { configurado: c !== undefined, backups: c ? af.listarBackups() : [] }));
    on("POST", "restaurar", async () => {
      await json(req, Empty);
      if (!c) return naoConfigurado();
      const r = af.restaurarBackup(rest![1]!);
      if (r.ok) nt?.afiliados("restaurado");
      return r.ok ? send(res, 200, { configurado: true, ...r, pendenteSync: true, comandoSync: COMANDO_SYNC }) : resp(r);
    });
    on("POST", "/afiliados/agenda/sugerir", async () => {
      const b = await json(req, SugerirAgenda);
      return send(res, 200, sugerirAgenda({ nichos: b.nichos.map((n) => ({ key: n.key, envios: n.envios, ...(n.horas ? { horas: n.horas } : {}) })), ...(b.intervaloMin ? { intervaloMin: b.intervaloMin } : {}) }));
    });
    on("GET", "/afiliados/info", () => (c ? send(res, 200, { configurado: true, ...lerInfo(c), comandoSync: COMANDO_SYNC, pendenteSync: af.estado().pendenteSync }) : naoConfigurado()));
    on("POST", "/afiliados/sincronizado", async () => {
      await json(req, Empty);
      if (!c) return naoConfigurado();
      af.marcarSincronizado();
      return send(res, 200, { configurado: true, pendenteSync: false });
    });
    on("GET", "relatorio", () => (c ? send(res, 200, { configurado: true, ...ultimoRelatorio(c, relatorio![1] as "ops" | "deal-auditor") }) : naoConfigurado()));
    const lista = rotas[rota];
    if (!lista) throw new HttpError(404, "not found");
    const h = lista.find(([m]) => m === method);
    if (!h) { res.setHeader("allow", lista.map(([m]) => m).join(", ")); throw new HttpError(405, "method not allowed"); }
    await h[1]();
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "GET" && path === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      sse.add(res);
      const c = url.searchParams.get("c") ?? "";
      const cid = /^[\w-]{1,64}$/.test(c) ? c : `anon-${++eventId}`;
      conexoes.set(res, cid);
      const ping = setInterval(() => res.write(": ping\n\n"), o.heartbeatMs ?? 25_000);
      res.on("close", () => {
        sse.delete(res); clearInterval(ping); conexoes.delete(res);
        if (![...conexoes.values()].includes(cid)) visiveis.delete(cid);
        auto.notificar();
      });
      return;
    }
    if (path === "/usage/auto" && (method === "GET" || method === "PUT")) {
      if (method === "PUT") auto.set(await json(req, AutoPut));
      return send(res, 200, auto.status());
    }
    if (method === "POST" && path === "/usage/visibilidade") {
      const b = await json(req, z.object({ visivel: z.boolean(), cliente: z.string().regex(/^[\w-]{1,64}$/).optional() }));
      const id = b.cliente ?? "anon";
      if (b.visivel) visiveis.add(id); else visiveis.delete(id);
      auto.notificar();
      if (b.visivel) void auto.tick(); // back on the tab: refresh right away if every guard allows
      return send(res, 200, auto.status());
    }
    if (method === "GET" && path === "/usage") return send(res, 200, usageView());
    if (method === "POST" && path === "/usage/consult") {
      await json(req, Empty);
      const r = await auto.consultar("manual");
      if (r.ok) return send(res, 200, usageView());
      if (r.reason === "throttled") {
        res.setHeader("retry-after", String(r.retryAfterSeconds));
        throw Object.assign(new HttpError(429, "usage was consulted less than 30 s ago"), { extra: { retryAfterSeconds: r.retryAfterSeconds } });
      }
      throw new HttpError(502, `usage consult failed: ${r.motivo}`);
    }
    if (path === "/local/status" && method === "GET") {
      if (!o.hubDir) throw new HttpError(501, "local model is not configured");
      const d = lcDeps();
      return send(res, 200, await localStatus(d, readLocalConfig(d.hub).enabled));
    }
    if (path === "/local" || path === "/local/stats") {
      if (!o.hubDir) throw new HttpError(501, "local model is not configured");
      const hub = o.hubDir;
      if (method === "GET" && path === "/local/stats") return send(res, 200, readStats(hub));
      if (path === "/local" && method === "GET") {
        const c = readLocalConfig(hub);
        const installed = await ollamaModels(c.port);
        return send(res, 200, { enabled: c.enabled, model: c.model, ollama: installed ? "up" : "down", installed: installed ?? [] });
      }
      if (path === "/local" && method === "PUT") {
        const b = await json(req, PutLocal);
        const c = readLocalConfig(hub);
        if (b.model !== undefined) {
          const installed = await ollamaModels(c.port);
          if (!installed) throw new HttpError(503, "ollama is not reachable");
          if (!installed.includes(b.model)) throw new HttpError(400, "model is not installed");
        }
        const next = LocalConfig.parse({ ...c, ...(b.enabled !== undefined ? { enabled: b.enabled } : {}), ...(b.model !== undefined ? { model: b.model } : {}) });
        writeLocalConfig(hub, next);
        return send(res, 200, { enabled: next.enabled, model: next.model });
      }
      throw new HttpError(405, "method not allowed");
    }
    if (path === "/notificacoes" || path.startsWith("/notificacoes/")) {
      if (!nt) throw new HttpError(501, "notifications are not configured");
      if (path === "/notificacoes" && method === "GET") {
        const d = url.searchParams.get("desde");
        const desde = d === null ? undefined : Date.parse(d);
        if (desde !== undefined && !Number.isFinite(desde)) throw new HttpError(400, "invalid desde");
        return send(res, 200, nt.listar(desde));
      }
      if (path === "/notificacoes" && method === "DELETE") { nt.limpar(); return send(res, 200, { ok: true }); }
      if (path === "/notificacoes/lidas" && method === "POST") { const b = await json(req, LidasPut); nt.marcarLidas(b.todas ? undefined : b.ids); return send(res, 200, { ok: true }); }
      if (path === "/notificacoes/config" && (method === "GET" || method === "PUT")) {
        if (method === "PUT") nt.setConfig(await json(req, NotifConfigPut));
        return send(res, 200, nt.config());
      }
      throw new HttpError(path === "/notificacoes" || path === "/notificacoes/lidas" || path === "/notificacoes/config" ? 405 : 404, "not found");
    }
    if (path === "/afiliados" || path.startsWith("/afiliados/")) return routeAfiliados(req, res, path, method);
    if (path === "/redacao" || path.startsWith("/redacao/")) return routeRedacao(req, res, url, path, method);
    if (method === "GET" && path === "/missions") return send(res, 200, { missions: store.list() });
    if (method === "GET" && path === "/projects") return send(res, 200, { projects: registry.list() });
    if (method === "GET" && path === "/projects/resolve") {
      const r = resolverProjeto(url.searchParams.get("q") ?? "", registry.list());
      if (r.ok) return send(res, 200, { projeto: r.projeto, ...lerRetomada(r.projeto, store) });
      if ("ambiguo" in r) return send(res, 409, { error: "ambiguous project name", candidatos: r.candidatos });
      return send(res, 404, { error: "project not found" });
    }
    if (method === "POST" && path === "/projects") {
      const b = await json(req, NewProject);
      if ((b.url === undefined) === (b.pasta === undefined)) throw new HttpError(400, "provide exactly one of url or pasta");
      const id = newProjectId(b.nome);
      let origem: { tipo: "url" | "pasta"; valor: string };
      let caminho: string;
      if (b.pasta !== undefined) {
        const v = validarOrigem(b.pasta);
        if (!v.ok || v.tipo !== "pasta") throw new HttpError(400, "invalid folder path");
        const c = checkPasta(b.pasta);
        if (!c.ok) throw new HttpError(400, c.reason);
        origem = { tipo: "pasta", valor: b.pasta };
        caminho = c.caminho;
      } else {
        const v = validarOrigem(b.url!);
        if (!v.ok || v.tipo !== "url") throw new HttpError(400, "invalid repository url");
        if (!o.workspacesDir) throw new HttpError(501, "cloning is not configured");
        const c = await (o.clone ?? cloneRepo)({ origem: v.valor, id, workspacesDir: o.workspacesDir });
        if (!c.ok) throw new HttpError(502, c.reason);
        origem = { tipo: "url", valor: v.valor };
        caminho = c.caminho;
      }
      const projeto: Projeto = { id, nome: b.nome, apelidos: b.apelidos ?? [], comandos: b.comandos ?? [], origem, caminho, ...(b.clickupListUrl ? { clickupListUrl: b.clickupListUrl } : {}), criadoEm: clock().toISOString() };
      registry.add(projeto);
      return send(res, 201, { projeto });
    }
    const cmd = /^\/projects\/([^/]+)\/(comandos|sugestoes|subida)$/.exec(path);
    if (cmd) {
      const pid = cmd[1]!;
      if (!PROJECT_ID.test(pid)) throw new HttpError(400, "invalid project id");
      const p = registry.get(pid);
      if (cmd[2] === "comandos" && method === "PATCH") {
        const b = await json(req, SetComandos);
        const projeto = registry.setComandos(pid, b.comandos);
        if (!projeto) throw new HttpError(404, "project not found");
        return send(res, 200, { projeto });
      }
      if (cmd[2] === "sugestoes" && method === "GET") {
        if (!p) throw new HttpError(404, "project not found");
        return send(res, 200, { ...analisarProjeto(leitorProjeto(p.caminho)) });
      }
      if (cmd[2] === "subida" && method === "GET") {
        if (!p) throw new HttpError(404, "project not found");
        return send(res, 200, { passos: analisarSubida(leitorProjeto(p.caminho)) });
      }
      throw new HttpError(404, "not found");
    }
    const del = /^\/projects\/([^/]+)$/.exec(path);
    if (method === "DELETE" && del) {
      const pid = del[1]!;
      if (!PROJECT_ID.test(pid)) throw new HttpError(400, "invalid project id");
      if (!registry.remove(pid)) throw new HttpError(404, "project not found"); // record only; the folder stays
      return send(res, 200, { removed: pid });
    }
    if (method === "POST" && path === "/missions") {
      const b = await json(req, NewMission);
      const found = registry.get(b.project);
      let projectId = found?.id;
      if (!found) {
        const r = resolverProjeto(b.project, registry.list());
        if (r.ok) projectId = r.projeto.id;
        else if ("ambiguo" in r) throw Object.assign(new HttpError(409, "ambiguous project name"), { extra: { candidatos: r.candidatos.map((c) => ({ id: c.id, nome: c.nome })) } });
        else throw new HttpError(400, "unknown project");
      }
      const uso = usage.atual();
      const livre = podeIniciar(uso);
      if (!livre.ok && b.confirmarUso !== true) throw Object.assign(new HttpError(409, livre.motivo), { extra: { motivo: livre.motivo, uso: usageView() } });
      const usoInicial = uso.estado === "ok" ? { cincoHoras: { percentual: uso.cincoHoras.percentual, reiniciaEm: uso.cincoHoras.reiniciaEm }, semana: { percentual: uso.semana.percentual, reiniciaEm: uso.semana.reiniciaEm } } : undefined;
      const id = `m-${randomBytes(6).toString("hex")}`;
      const m: Mission = { ...newMission(id, projectId!, clock), ...(b.relatorio ? { kind: "relatorio" as const } : {}), demanda: b.demanda, ...(b.tetoPp !== undefined ? { tetoPp: b.tetoPp } : {}), ...(b.tetoSemanaPp !== undefined ? { tetoSemanaPp: b.tetoSemanaPp } : {}), ...(usoInicial ? { usoInicial } : {}) };
      const planning = transition(m, "planejando", { now: clock }); // persisted now: the runner only writes at the end
      save(planning);
      launch(planning, 1, prompt1(planning));
      return send(res, 201, { id, mission: planning });
    }
    const historico = /^\/missions\/([^/]+)\/eventos$/.exec(path);
    if (historico && method === "GET") return send(res, 200, { eventos: lerEventos(store.dirOf(mustGet(historico[1]!).id)) });
    const terminal = /^\/missions\/([^/]+)\/terminal$/.exec(path);
    if (terminal && method === "GET") {
      const m = mustGet(terminal[1]!);
      return send(res, 200, { conversas: m.sessionId ? lerConversas(join(homedir(), ".claude", "projects"), m.sessionId) : [] });
    }
    const hit = /^\/missions\/([^/]+)(?:\/(approve|adjust|resume|continue|stop|pause))?$/.exec(path);
    if (!hit) throw new HttpError(404, "not found");
    const [, id = "", action] = hit;

    if (method === "GET" && !action) {
      const m = mustGet(id);
      return send(res, 200, { mission: m, package: pack(m), breaker: { loops: m.loops, handoffs: m.handoffs, limits: { maxLoops: MAX_LOOPS_PER_SPEC, maxHandoffs: MAX_CHAINED_HANDOFFS } } });
    }
    if (!action && (method === "PATCH" || method === "DELETE")) {
      const m = mustGet(id);
      if (running.has(id) || m.stage === "planejando" || m.stage === "executando") throw new HttpError(409, `cannot ${method === "PATCH" ? "edit" : "delete"} in stage ${m.stage}: stop it first`);
      if (method === "DELETE") {
        store.remove(id);
        return send(res, 200, { removed: id });
      }
      const b = await json(req, EditMission);
      const { tetoPp: _a, tetoSemanaPp: _b, ...rest } = m;
      const next: Mission = { ...rest, ...(b.demanda !== undefined ? { demanda: b.demanda } : {}), updatedAt: clock().toISOString() };
      for (const k of ["tetoPp", "tetoSemanaPp"] as const) {
        const v = b[k] === undefined ? m[k] : b[k]; // undefined keeps, null removes
        if (typeof v === "number") next[k] = v;
      }
      save(next);
      return send(res, 200, { mission: next });
    }
    if (method !== "POST" || !action) throw new HttpError(404, "not found");

    if (action === "approve") {
      const b = await json(req, Approve);
      const m = mustGet(id);
      if (m.stage !== "aguardando-aprovacao") throw new HttpError(409, `cannot approve in stage ${m.stage}`);
      const blocos = blocosDe(m);
      const pendentes = blocos.map((_, i) => i + 1).filter((i) => !blocoFeito(blocos[i - 1]!, feitasDe(m)));
      const sel = (b.blocos ?? pendentes).filter((i) => pendentes.includes(i));
      if (blocos.length) {
        if (!sel.length) throw new HttpError(409, "nenhum bloco pendente selecionado");
        const faltam = dependenciasFaltando(blocos, sel, feitasDe(m));
        if (faltam.length) throw new HttpError(409, `os blocos escolhidos dependem do(s) bloco(s) ${faltam.join(", ")}`);
      }
      // Everything below is synchronous, so a double click cannot start phase 2 twice.
      writeFileSync(join(store.dirOf(id), GATE_FILE), JSON.stringify({ approved: true, approvedAt: clock().toISOString() }));
      const next = intervene(transition(blocos.length ? { ...m, blocosSel: sel } : m, "executando", { now: clock, approved: true }));
      save(next);
      launch(next, 2, promptFase2(fase2Input(next)));
      return send(res, 202, { mission: next });
    }
    if (action === "adjust") {
      const b = await json(req, Adjust);
      const m = mustGet(id);
      if (m.stage !== "aguardando-aprovacao") throw new HttpError(409, `cannot adjust in stage ${m.stage}`);
      // fresh session: reusing the old --session-id would be rejected by the CLI
      const { sessionId: _drop, ...rest } = transition(m, "planejando", { now: clock });
      const next = intervene(rest as Mission);
      save(next);
      const feitas = feitasDe(next);
      launch(next, 1, prompt1(next, feitas.length ? `${b.comment}\nSpecs ${feitas.join(", ")} are already implemented: keep their numbers and files.` : b.comment, feitas.length > 0));
      return send(res, 202, { mission: next });
    }
    if (action === "resume") {
      const b = await json(req, Resume);
      const m = mustGet(id);
      if ((m.stage !== "pausada" && m.stage !== "parada") || running.has(id)) throw new HttpError(409, `cannot resume in stage ${m.stage}`);
      return send(res, 202, { mission: retomar(m, b.comment) });
    }
    if (action === "continue") {
      const b = await json(req, Continuar);
      let m = mustGet(id);
      const run = running.get(id);
      if (m.stage === "executando" && run && m.kind !== "redacao") {
        // adjustment during execution: interrupt and resume the same session with it
        run.ac.abort("pause");
        await run.done;
        m = mustGet(id);
        if (m.stage === "pausada" && m.pausedFrom === "executando") return send(res, 202, { mission: retomar(m, `The user interrupted the run with this adjustment. Check what the interrupted agent left half-done, apply the adjustment first, then continue:\n${b.comment}`, false, false) });
      }
      const entreBlocos = m.stage === "aguardando-aprovacao" && feitasDe(m).length > 0;
      if ((m.stage !== "concluida" && !entreBlocos) || running.has(id) || m.kind === "redacao") throw new HttpError(409, `cannot continue in stage ${m.stage}`);
      if (entreBlocos && m.sessionId) writeFileSync(join(store.dirOf(id), GATE_FILE), JSON.stringify({ approved: true, approvedAt: clock().toISOString() })); // the request itself authorizes this change
      if (!isApproved(store.dirOf(id)) || !m.sessionId) throw new HttpError(409, "no sealed session to continue");
      const { resumo: _old, ...limpa } = m;
      const next = intervene(transition({ ...limpa, ajustando: b.comment } as Mission, "executando", { now: clock, approved: true }));
      save(next);
      launch(next, 2, promptContinuacao(b.comment, projectPath(m) ?? ""), true);
      return send(res, 202, { mission: next });
    }
    if (action === "pause") {
      await json(req, Empty);
      const m = mustGet(id);
      const run = running.get(id);
      if (!run || (m.stage !== "planejando" && m.stage !== "executando")) throw new HttpError(409, `cannot pause in stage ${m.stage}`);
      run.ac.abort("pause");
      await run.done;
      return send(res, 200, { mission: store.get(id) });
    }
    // stop
    await json(req, Empty);
    const m = mustGet(id);
    if (m.stage === "concluida" || m.stage === "parada") throw new HttpError(409, `cannot stop in stage ${m.stage}`);
    const run = running.get(id);
    if (run) {
      run.ac.abort();
      await run.done;
      return send(res, 200, { mission: store.get(id) });
    }
    const next = { ...transition(m, "parada", { now: clock }), stopReason: "stopped by user" };
    save(next);
    return send(res, 200, { mission: next });
  }

  const server = createHttp((req, res) => {
    // DNS rebinding / CSRF guard, before anything else
    const origin = req.headers.origin;
    if (!localHost(req.headers.host) || (origin !== undefined && !localOrigin(origin))) return send(res, 403, { error: "forbidden" });
    const p = (req.url ?? "/").split("?")[0] ?? "/";
    const api = p === "/events" || /^\/(missions|projects|usage|redacao|afiliados|local|notificacoes)(\/|$)/.test(p);
    if (o.static && !api) return o.static(req, res);
    route(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) {
        if (e.status === 413) res.setHeader("connection", "close");
        return send(res, e.status, { error: e.message, ...(e as { extra?: object }).extra });
      }
      nt?.sistema("Erro interno no servidor", "Uma requisição falhou (500). Veja o log do servidor.", "erro");
      send(res, 500, { error: "internal error" }); // never leak the stack
    });
  });

  return {
    server,
    async listen(p = o.port ?? 0): Promise<number> {
      store.recover(clock);
      o.redacao?.recover(clock);
      if (o.hubDir) {
        cleanStale(lcDeps());
        reaper = createReaper(lcDeps, { idleMs: o.local?.idleMs, everyMs: o.local?.reapMs });
        reaper.start();
        watcher = setInterval(() => void watch().catch(() => {}), o.local?.watchMs ?? 1000);
        watcher.unref();
      }
      await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(p, "127.0.0.1", ok); });
      auto.start();
      nt?.start();
      nt?.sistema("Salão no ar", "O servidor do salão foi iniciado.");
      port = (server.address() as { port: number }).port;
      retomador = setInterval(retomarLiberadas, o.retomadaMs ?? 60_000);
      retomador.unref();
      return port;
    },
    async close() {
      auto.stop();
      clearInterval(retomador);
      nt?.close();
      if (watcher) clearInterval(watcher);
      watcher = undefined;
      await reaper?.stop().catch(() => {});
      for (const r of running.values()) r.ac.abort();
      await Promise.all([...running.values()].map((r) => r.done));
      for (const r of sse) r.end();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
