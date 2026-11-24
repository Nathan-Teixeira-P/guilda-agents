import { spawn as realSpawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createUsageSource, CONSULT_ARGS, MIN_INTERVAL_MS } from "../src/usage-source.ts";
import type { SpawnFn } from "../src/runner.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const fixture = (n: string) => new URL(`../../../tests/fixtures/${n}.jsonl`, import.meta.url).pathname;
const fake = new URL("./fake-agent.mjs", import.meta.url).pathname;
const RESET5 = 1795243200; // resetsAt in the real fixtures
let nowMs = (RESET5 - 3600) * 1000;
const clock = () => new Date(nowMs);

let dir: string, calls: { file: string; args: string[] }[];
const agent = (fx: string, mode = ""): SpawnFn => (file, args, o) => {
  calls.push({ file, args });
  return realSpawn(process.execPath, [fake, fx, mode], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });
};
beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  dir = mkdtempSync(join(SCRATCH, "usage-"));
  calls = [];
  nowMs = (RESET5 - 3600) * 1000;
});
const noEvent = () => { const f = join(dir, "noevent.jsonl"); writeFileSync(f, '{"type":"system","subtype":"init","session_id":"s"}\n'); return f; };
const event = { fiveHour: { utilization: 0.5, resetsAt: RESET5, status: "allowed" }, sevenDay: { utilization: 0.2, resetsAt: RESET5 + 86400, status: "allowed" } };

describe("usage source", () => {
  it("starts unavailable: no reading, no zero", () => {
    expect(createUsageSource({ clock }).atual()).toEqual({ estado: "indisponivel", motivo: "sem leitura" });
  });

  it("consult runs the cheap fixed command without a shell and reads the rate_limit_event", async () => {
    const u = createUsageSource({ clock, spawn: agent(fixture("stream-basic")) });
    const r = await u.consultar();
    expect(r).toMatchObject({ ok: true, estado: { estado: "ok", cincoHoras: { percentual: 14 }, semana: { percentual: 10 } } });
    expect(calls).toEqual([{ file: "claude", args: CONSULT_ARGS }]);
    expect(CONSULT_ARGS).toEqual(["-p", "ok", "--model", "haiku", "--max-budget-usd", "0.05", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"]);
    expect(u.atual()).toMatchObject({ estado: "ok", atualizadoEm: clock().toISOString() });
  });

  it("limits to one consult per 30 s, even for concurrent calls", async () => {
    const u = createUsageSource({ clock, spawn: agent(fixture("stream-basic")) });
    const [a, b] = await Promise.all([u.consultar(), u.consultar()]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((x) => !x.ok)).toMatchObject({ ok: false, reason: "throttled", retryAfterSeconds: 30 });
    nowMs += MIN_INTERVAL_MS - 1000;
    expect(await u.consultar()).toMatchObject({ ok: false, reason: "throttled", retryAfterSeconds: 1 });
    nowMs += 1000;
    expect(await u.consultar()).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("fails closed: no event, hang, spawn error -> failure, still unavailable", async () => {
    for (const spawn of [agent(noEvent()), agent(noEvent(), "fail"), agent(noEvent(), "hang"), (() => { throw new Error("ENOENT"); }) as SpawnFn]) {
      const u = createUsageSource({ clock, spawn, timeoutMs: 300 });
      expect(await u.consultar()).toMatchObject({ ok: false, reason: "failed" });
      expect(u.atual()).toEqual({ estado: "indisponivel", motivo: "sem leitura" });
    }
  });

  it("a failed consult keeps the last real reading instead of erasing it", async () => {
    const u = createUsageSource({ clock });
    u.alimentar(event);
    expect(await u.consultar()).toMatchObject({ ok: false, reason: "failed" }); // no spawn configured
    expect(u.atual()).toMatchObject({ estado: "ok", cincoHoras: { percentual: 50 } });
  });

  it("mission events feed it; subscribers only hear real changes; partial events are ignored", () => {
    const u = createUsageSource({ clock });
    const seen: unknown[] = [];
    u.subscribe(() => seen.push(u.atual()));
    expect(u.alimentar({ fiveHour: event.fiveHour })).toBe(false);
    expect(u.alimentar({ status: "allowed" } as never)).toBe(false);
    expect(u.alimentar(event)).toBe(true);
    nowMs += 5000;
    expect(u.alimentar(event)).toBe(false); // same numbers: no change event
    expect(u.alimentar({ ...event, fiveHour: { ...event.fiveHour, utilization: 0.51 } })).toBe(true);
    expect(seen).toHaveLength(2);
  });

  it("persists atomically in usage.json and reloads; stale reload is unavailable", () => {
    const f = join(dir, "usage.json");
    createUsageSource({ clock, file: f }).alimentar(event);
    expect(readdirSync(dir)).toEqual(["usage.json"]);
    expect(createUsageSource({ clock, file: f }).atual()).toMatchObject({ estado: "ok", cincoHoras: { percentual: 50 } });
    nowMs = (RESET5 + 10) * 1000;
    expect(createUsageSource({ clock, file: f }).atual()).toEqual({ estado: "indisponivel", motivo: "obsoleto" });
  });

  it("a corrupt file is backed up and the source starts clean", () => {
    const f = join(dir, "usage.json");
    for (const bad of ["{not json", JSON.stringify({ snapshot: { cincoHoras: { percentual: 500 } } })]) {
      writeFileSync(f, bad);
      const u = createUsageSource({ clock, file: f });
      expect(u.atual()).toEqual({ estado: "indisponivel", motivo: "sem leitura" });
      expect(existsSync(f)).toBe(false);
      expect(readdirSync(dir).some((n) => n.startsWith("usage.json.corrupt-"))).toBe(true);
      u.alimentar(event);
      expect(JSON.parse(readFileSync(f, "utf8")).snapshot.cincoHoras.percentual).toBe(50);
      for (const n of readdirSync(dir)) if (n !== "usage.json" && n !== "noevent.jsonl") writeFileSync(join(dir, n), "");
    }
  });
});
