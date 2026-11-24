import { spawn as nodeSpawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { avaliar, Snapshot, snapshotDeLimite, type Estado } from "@lab/core/src/usage.ts";
import type { SpawnFn } from "./runner.ts";
import { parseLine, type RateWindow } from "./stream.ts";

/** One cheap model call (~US$ 0.004) whose only purpose is the `rate_limit_event`. Fixed argv: nothing user-controlled. */
export const CONSULT_ARGS = ["-p", "ok", "--model", "haiku", "--max-budget-usd", "0.05", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"];
export const MIN_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export type ConsultResult =
  | { ok: true; estado: Estado }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number }
  | { ok: false; reason: "failed"; motivo: string };
export type RateEvent = { fiveHour?: RateWindow; sevenDay?: RateWindow };

/** No shell, stdin = /dev/null. */
export const spawnClaude: SpawnFn = (file, args, o) => nodeSpawn(file, args, { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });

const File = z.object({ snapshot: Snapshot });

export interface UsageOpts {
  clock: () => Date;
  file?: string; // usage.json in the hub; memory only without it
  spawn?: SpawnFn; // without it, consultar() fails (tests never reach a real `claude`)
  claudeBin?: string;
  timeoutMs?: number;
}

/** Last known plan usage. Fed by mission `rate_limit_event`s and by an explicit, manual `consultar()`: never polls. */
export function createUsageSource(o: UsageOpts) {
  let snap: Snapshot | undefined;
  let lastConsultMs = -Infinity; // set when a consult STARTS, so concurrent and failed attempts are also throttled
  const listeners = new Set<() => void>();

  if (o.file) {
    try {
      const r = File.safeParse(JSON.parse(readFileSync(o.file, "utf8")));
      if (r.success) snap = r.data.snapshot;
      else renameSync(o.file, `${o.file}.corrupt-${Date.now()}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        try { renameSync(o.file, `${o.file}.corrupt-${Date.now()}`); } catch { /* nothing to back up */ }
      }
    }
  }
  const persist = () => {
    if (!o.file || !snap) return;
    try {
      mkdirSync(dirname(o.file), { recursive: true });
      const tmp = `${o.file}.tmp-${process.pid}`;
      writeFileSync(tmp, JSON.stringify({ snapshot: snap }, null, 2));
      renameSync(tmp, o.file);
    } catch { /* losing persistence must not break the live reading */ }
  };

  /** True when the stored numbers changed (the timestamp alone is not a change). */
  function alimentar(e: RateEvent): boolean {
    const next = snapshotDeLimite(e, o.clock().toISOString());
    if (!next) return false;
    const same = snap && JSON.stringify({ ...snap, atualizadoEm: "" }) === JSON.stringify({ ...next, atualizadoEm: "" });
    snap = next;
    persist();
    if (same) return false;
    for (const l of listeners) l();
    return true;
  }

  function run(): Promise<RateEvent | string> {
    return new Promise((done) => {
      let child: ReturnType<SpawnFn>;
      try {
        if (!o.spawn) return done("consult not configured");
        child = o.spawn(o.claudeBin ?? "claude", CONSULT_ARGS, { cwd: tmpdir() });
      } catch (e) {
        return done(`spawn failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      let found: RateEvent | undefined;
      let settled = false;
      const end = (r: RateEvent | string) => { if (!settled) { settled = true; clearTimeout(timer); done(r); } };
      const timer = setTimeout(() => { child.kill("SIGKILL"); end("consult timed out"); }, o.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      child.stderr.resume();
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        for (const ev of parseLine(line)) if (ev.kind === "rate-limit") found = { fiveHour: ev.fiveHour, sevenDay: ev.sevenDay };
      });
      child.on("error", (err) => end(`spawn error: ${err.message}`));
      const drained = new Promise<void>((r) => rl.once("close", () => r()));
      child.on("close", (code) => void drained.then(() => end(found ?? `no rate_limit_event (exit ${code})`)));
    });
  }

  return {
    atual: (): Estado => avaliar(snap, o.clock()),
    /** Epoch ms of the last reading (even an expired one), undefined when there is none. */
    ultimaLeitura: (): number | undefined => (snap ? Date.parse(snap.atualizadoEm) : undefined),
    alimentar,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async consultar(): Promise<ConsultResult> {
      const now = o.clock().getTime();
      const wait = lastConsultMs + MIN_INTERVAL_MS - now;
      if (wait > 0) return { ok: false, reason: "throttled", retryAfterSeconds: Math.ceil(wait / 1000) };
      lastConsultMs = now;
      const r = await run();
      if (typeof r === "string") return { ok: false, reason: "failed", motivo: r };
      if (!alimentar(r) && !snapshotDeLimite(r, "")) return { ok: false, reason: "failed", motivo: "incomplete rate_limit_event" };
      return { ok: true, estado: avaliar(snap, o.clock()) };
    },
  };
}
export type UsageSource = ReturnType<typeof createUsageSource>;
