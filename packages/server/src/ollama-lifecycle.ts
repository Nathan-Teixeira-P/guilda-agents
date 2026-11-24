// Starts Ollama only when needed, unloads the model when idle, stops ONLY what the hub itself started.
import { spawn as nodeSpawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { LOCAL_ELIGIBLE, LOCAL_FORA } from "../../core/src/local-tasks.ts";

export type ProcLike = { pid?: number; on(ev: "error", f: (e: Error) => void): unknown; unref(): unknown };
export type LifecycleDeps = {
  hub: string;
  port: number;
  model: string;
  spawn?: (file: string, args: string[], env: NodeJS.ProcessEnv) => ProcLike; // no shell
  memAvailableMB?: () => number;
  cmdline?: (pid: number) => string | undefined;
  alive?: (pid: number) => boolean;
  kill?: (pid: number, sig: NodeJS.Signals) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  readyTimeoutMs?: number;
};

const REC = "ollama-lifecycle.json";
const ACTIVE = "local-active.json";
const LAST = "local-lastuse.json";
const LOCK = "ollama-lifecycle.lock";
export const ACTIVE_STALE_MS = 120_000;
export const IDLE_MS = 60_000;
const GIB = 1024 * 1024 * 1024;
const UNKNOWN_SIZE = 4 * GIB; // model never seen while Ollama was up: assume a big one

const Rec = z.object({ pid: z.number().int().positive(), startedAt: z.string(), startedByHub: z.literal(true) });
const Active = z.object({ id: z.string(), task: z.string(), model: z.string(), agent: z.string(), since: z.string() });
export type Active = z.infer<typeof Active>;

const now = (d: LifecycleDeps) => (d.now ?? Date.now)();
const base = (d: LifecycleDeps) => `http://127.0.0.1:${d.port}`;

function writeAtomic(hub: string, name: string, v: unknown): void {
  mkdirSync(hub, { recursive: true });
  const tmp = join(hub, `${name}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  writeFileSync(tmp, JSON.stringify(v));
  renameSync(tmp, join(hub, name));
}
function readJson<T>(hub: string, name: string, s: z.ZodType<T>): T | undefined {
  try { const r = s.safeParse(JSON.parse(readFileSync(join(hub, name), "utf8"))); return r.success ? r.data : undefined; } catch { return undefined; }
}
const rm = (hub: string, name: string) => rmSync(join(hub, name), { force: true });

const defaultMem = (): number => {
  try { return Number(/MemAvailable:\s+(\d+)/.exec(readFileSync("/proc/meminfo", "utf8"))?.[1] ?? 0) / 1024; } catch { return 0; }
};
const defaultCmdline = (pid: number) => { try { return readFileSync(`/proc/${pid}/cmdline`, "utf8"); } catch { return undefined; } };
const defaultAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const defaultSpawn: NonNullable<LifecycleDeps["spawn"]> = (file, args, env) => nodeSpawn(file, args, { stdio: "ignore", detached: false, env });
/** argv0 basename must be `ollama` and argv1 `serve`; anything else is never signalled. */
const isOllamaServe = (cmd: string | undefined) => { const a = (cmd ?? "").split("\0"); return a[0]?.split("/").pop() === "ollama" && a[1] === "serve"; };

async function getJson(d: LifecycleDeps, path: string, timeoutMs = 1500): Promise<unknown> {
  try {
    const res = await fetch(`${base(d)}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : undefined;
  } catch { return undefined; }
}
const Tags = z.object({ models: z.array(z.object({ name: z.string(), size: z.number().optional() })) });
/** undefined = not answering; otherwise the (possibly empty) model list. Any 2xx JSON counts as "up". */
async function tags(d: LifecycleDeps) {
  const j = await getJson(d, "/api/tags");
  if (j === undefined) return undefined;
  const r = Tags.safeParse(j);
  return r.success ? r.data.models : [];
}
async function loaded(d: LifecycleDeps): Promise<string | undefined> {
  const r = z.object({ models: z.array(z.object({ name: z.string() })) }).safeParse(await getJson(d, "/api/ps"));
  return r.success ? r.data.models[0]?.name : undefined;
}

const SIZES = "local-model-size.json";
const Sizes = z.record(z.string(), z.number());

export const touchUse = (d: LifecycleDeps) => writeAtomic(d.hub, LAST, { at: now(d) });
export const lastUse = (d: LifecycleDeps): number | undefined => readJson(d.hub, LAST, z.object({ at: z.number() }))?.at;
const record = (d: LifecycleDeps) => readJson(d.hub, REC, Rec);

export function viability(d: LifecycleDeps, sizeBytes: number | undefined): { ok: boolean; motivo?: string; memoriaLivreMB: number } {
  const free = Math.round((d.memAvailableMB ?? defaultMem)());
  const need = Math.ceil(((sizeBytes ?? UNKNOWN_SIZE) * 1.3 + GIB) / (1024 * 1024));
  return free >= need ? { ok: true, memoriaLivreMB: free } : { ok: false, motivo: `memória livre ${free} MB < ${need} MB necessários`, memoriaLivreMB: free };
}

export type Up = { ok: true; startedByHub: boolean } | { ok: false; motivo: string };

async function waitReady(d: LifecycleDeps): Promise<boolean> {
  const sleep = d.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const end = Date.now() + (d.readyTimeoutMs ?? 10_000);
  while (Date.now() < end) {
    if (await tags(d)) return true;
    await sleep(250);
  }
  return false;
}

/** Ollama already answering => use it and never touch the process. Down => viability, then spawn `ollama serve`. */
export async function ensureUp(d: LifecycleDeps): Promise<Up> {
  touchUse(d);
  const up = await tags(d);
  if (up) {
    const s = up.find((m) => m.name === d.model)?.size;
    if (s) writeAtomic(d.hub, SIZES, { ...(readJson(d.hub, SIZES, Sizes) ?? {}), [d.model]: s });
    return { ok: true, startedByHub: record(d) !== undefined };
  }
  const v = viability(d, readJson(d.hub, SIZES, Sizes)?.[d.model]);
  if (!v.ok) return { ok: false, motivo: v.motivo! };
  const lock = join(d.hub, LOCK);
  mkdirSync(d.hub, { recursive: true });
  try { if (now(d) - statSync(lock).mtimeMs > 20_000) rmSync(lock, { force: true }); } catch { /* no lock */ }
  let mine = false;
  try { closeSync(openSync(lock, "wx")); mine = true; } catch { /* someone else is starting it: just wait */ }
  try {
    let child: ProcLike | undefined;
    if (mine) {
      try { child = (d.spawn ?? defaultSpawn)("ollama", ["serve"], { ...process.env, OLLAMA_HOST: `127.0.0.1:${d.port}` }); } catch { return { ok: false, motivo: "não consegui iniciar o ollama" }; }
      child.on("error", () => {});
      child.unref();
      if (child.pid) writeAtomic(d.hub, REC, { pid: child.pid, startedAt: new Date(now(d)).toISOString(), startedByHub: true });
    }
    if (await waitReady(d)) return { ok: true, startedByHub: record(d) !== undefined };
    if (mine) await release(d); // we started it and it never answered: stop our own child
    return { ok: false, motivo: "ollama não respondeu a tempo" };
  } finally { if (mine) rm(d.hub, LOCK); }
}

/** Unloads the model; stops the server only when the hub recorded starting it and the pid is still `ollama serve`. */
export async function release(d: LifecycleDeps): Promise<void> {
  try {
    await fetch(`${base(d)}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: d.model, keep_alive: 0 }), signal: AbortSignal.timeout(3000) });
  } catch { /* down already */ }
  const r = record(d);
  if (r && isOllamaServe((d.cmdline ?? defaultCmdline)(r.pid))) { try { (d.kill ?? process.kill)(r.pid, "SIGTERM"); } catch { /* gone */ } }
  rm(d.hub, REC);
}

/** Start-up: a record whose pid is dead or is no longer `ollama serve` is dropped (nothing is killed). */
export function cleanStale(d: LifecycleDeps): void {
  const r = record(d);
  if (!r || !(d.alive ?? defaultAlive)(r.pid) || !isOllamaServe((d.cmdline ?? defaultCmdline)(r.pid))) rm(d.hub, REC);
}

export function markActive(d: LifecycleDeps, a: { task: string; model: string; agent?: string }): string {
  const id = Math.random().toString(36).slice(2);
  writeAtomic(d.hub, ACTIVE, { id, task: a.task, model: a.model, agent: a.agent ?? "tester", since: new Date(now(d)).toISOString() });
  touchUse(d);
  return id;
}
/** Only clears its own mark, so overlapping calls do not erase each other. */
export function markIdle(d: LifecycleDeps, id: string): void {
  if (readJson(d.hub, ACTIVE, Active)?.id === id) rm(d.hub, ACTIVE);
  touchUse(d);
}
export function readActive(d: LifecycleDeps): Active | null {
  const a = readJson(d.hub, ACTIVE, Active);
  const t = a ? Date.parse(a.since) : NaN;
  return a && now(d) - t <= ACTIVE_STALE_MS ? a : null;
}

/** The reaper is the only releaser. last-use older than idleMs and nothing active => release. */
export function createReaper(getDeps: () => LifecycleDeps, o: { idleMs?: number; everyMs?: number } = {}) {
  let releasedAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  const pending = () => record(getDeps()) !== undefined || (lastUse(getDeps()) ?? 0) > releasedAt;
  const doRelease = async () => { releasedAt = now(getDeps()); await release(getDeps()); };
  const tick = async () => {
    if (busy || readActive(getDeps()) || !pending()) return;
    const lu = lastUse(getDeps());
    if (lu !== undefined && now(getDeps()) - lu < (o.idleMs ?? IDLE_MS)) return;
    busy = true;
    try { await doRelease(); } finally { busy = false; }
  };
  return {
    tick,
    start() { timer = setInterval(() => void tick(), o.everyMs ?? 15_000); timer.unref(); },
    async stop() { if (timer) clearInterval(timer); timer = undefined; if (pending()) await doRelease(); }, // shutdown
  };
}

export async function localStatus(d: LifecycleDeps, enabled: boolean) {
  const up = await tags(d);
  const size = up?.find((m) => m.name === d.model)?.size ?? readJson(d.hub, SIZES, Sizes)?.[d.model];
  const v = viability(d, size);
  const lu = lastUse(d);
  const a = readActive(d);
  return {
    enabled,
    model: d.model,
    ollama: { estado: up ? ("ligado" as const) : ("parado" as const), startedByHub: record(d) !== undefined, modeloCarregado: up ? ((await loaded(d)) ?? null) : null },
    viavel: up ? { ok: true, memoriaLivreMB: v.memoriaLivreMB } : v,
    emUso: a ? { task: a.task, model: a.model, agent: a.agent, desde: a.since } : null,
    ultimoUso: lu ? new Date(lu).toISOString() : null,
    elegiveis: LOCAL_ELIGIBLE,
    fora: LOCAL_FORA,
  };
}
