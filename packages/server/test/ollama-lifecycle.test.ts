import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttp, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCAL_ELIGIBLE, LOCAL_FORA } from "../../core/src/local-tasks.ts";
import { createServer } from "../src/http.ts";
import { cleanStale, createReaper, ensureUp, markActive, markIdle, readActive, release, touchUse, type LifecycleDeps } from "../src/ollama-lifecycle.ts";
import { createStore } from "../src/store.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
let hub: string, fake: Server | undefined, port: number, unloads: number, killed: Array<[number, string]>, spawned: number, t: number;

/** Fake Ollama: /api/tags, /api/ps, /api/generate (counts keep_alive:0 unloads). */
const listen = async (): Promise<number> => {
  fake = createHttp((q, s) => {
    let b = "";
    q.on("data", (c) => (b += c));
    q.on("end", () => {
      if (q.url === "/api/tags") s.end(JSON.stringify({ models: [{ name: "m", size: 1_000_000_000 }] }));
      else if (q.url === "/api/ps") s.end(JSON.stringify({ models: [{ name: "m" }] }));
      else { if (b.includes('"keep_alive":0')) unloads++; s.end("{}"); }
    });
  });
  await new Promise<void>((r) => fake!.listen(0, "127.0.0.1", r));
  return (fake.address() as AddressInfo).port;
};
const stopFake = () => { fake?.closeAllConnections(); fake?.close(); fake = undefined; };
const deps = (o: Partial<LifecycleDeps> = {}): LifecycleDeps => ({
  hub, port, model: "m", now: () => t, memAvailableMB: () => 8000, sleep: async () => {}, readyTimeoutMs: 300,
  cmdline: () => "/usr/bin/ollama\0serve\0", alive: () => true, kill: (p, s) => { killed.push([p, s]); },
  spawn: () => { spawned++; void listen().then((p) => { void p; }); return { pid: 4242, on: () => {}, unref: () => {} }; },
  ...o,
});

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  hub = mkdtempSync(join(SCRATCH, "lc-"));
  unloads = 0; killed = []; spawned = 0; t = 1_000_000;
});
afterEach(() => stopFake());

describe("ensureUp / release", () => {
  it("Ollama already up: used as is, never spawned, never killed (startedByHub=false)", async () => {
    port = await listen();
    expect(await ensureUp(deps())).toEqual({ ok: true, startedByHub: false });
    expect(spawned).toBe(0);
    await release(deps());
    expect(unloads).toBe(1);
    expect(killed).toEqual([]);
    expect(existsSync(join(hub, "ollama-lifecycle.json"))).toBe(false);
  });
  it("down and not viable: no spawn, deterministic fallback", async () => {
    port = 1;
    const r = await ensureUp(deps({ memAvailableMB: () => 500 }));
    expect(r.ok).toBe(false);
    expect(spawned).toBe(0);
  });
  it("down and viable: spawns `ollama serve` (no shell), records pid, release unloads and SIGTERMs only that pid", async () => {
    const tmp = await listen(); stopFake(); port = tmp; // reserve a port, then go down
    const calls: Array<{ f: string; a: string[]; env: NodeJS.ProcessEnv }> = [];
    const d = deps({ spawn: (f, a, env) => { calls.push({ f, a, env }); spawned++; void (async () => { fake = createHttp((q, s) => s.end(q.url === "/api/tags" ? JSON.stringify({ models: [{ name: "m", size: 1 }] }) : "{}")); await new Promise<void>((r) => fake!.listen(port, "127.0.0.1", r)); })(); return { pid: 4242, on: () => {}, unref: () => {} }; }, readyTimeoutMs: 3000, sleep: () => new Promise((r) => setTimeout(r, 20)) });
    expect(await ensureUp(d)).toEqual({ ok: true, startedByHub: true });
    expect(calls[0]).toMatchObject({ f: "ollama", a: ["serve"] });
    expect(calls[0]!.env["OLLAMA_HOST"]).toBe(`127.0.0.1:${port}`);
    expect(JSON.parse(readFileSync(join(hub, "ollama-lifecycle.json"), "utf8"))).toMatchObject({ pid: 4242, startedByHub: true });
    await release(d);
    expect(killed).toEqual([[4242, "SIGTERM"]]);
    expect(existsSync(join(hub, "ollama-lifecycle.json"))).toBe(false);
  });
  it("never kills a recorded pid that is no longer ollama serve", async () => {
    port = await listen();
    writeFileSync(join(hub, "ollama-lifecycle.json"), JSON.stringify({ pid: 99, startedAt: "x", startedByHub: true }));
    await release(deps({ cmdline: () => "/usr/bin/vim\0x\0" }));
    expect(killed).toEqual([]);
    expect(existsSync(join(hub, "ollama-lifecycle.json"))).toBe(false);
  });
  it("cleanStale drops records of dead pids without killing", () => {
    writeFileSync(join(hub, "ollama-lifecycle.json"), JSON.stringify({ pid: 99, startedAt: "x", startedByHub: true }));
    cleanStale(deps({ alive: () => false }));
    expect(existsSync(join(hub, "ollama-lifecycle.json"))).toBe(false);
    expect(killed).toEqual([]);
  });
});

describe("active mark and reaper", () => {
  it("active is ignored after 120 s; markIdle only clears its own mark", () => {
    const a = markActive(deps(), { task: "compact-test-log", model: "m" });
    expect(readActive(deps())?.task).toBe("compact-test-log");
    const b = markActive(deps(), { task: "compact-test-log", model: "m" });
    markIdle(deps(), a);
    expect(readActive(deps())).not.toBeNull();
    markIdle(deps(), b);
    expect(readActive(deps())).toBeNull();
    markActive(deps(), { task: "x", model: "m" });
    t += 121_000;
    expect(readActive(deps())).toBeNull();
  });
  it("reaper releases only after 60 s idle, never while active, and is the single releaser", async () => {
    port = await listen();
    const r = createReaper(() => deps(), { idleMs: 60_000 });
    await r.tick();
    expect(unloads).toBe(0); // never used: nothing to release
    touchUse(deps());
    t += 30_000; await r.tick();
    expect(unloads).toBe(0);
    const id = markActive(deps(), { task: "x", model: "m" });
    t += 100_000; await r.tick();
    expect(unloads).toBe(0); // active (fresh) blocks
    markIdle(deps(), id); // refreshes last-use
    t += 59_000; await r.tick();
    expect(unloads).toBe(0);
    t += 2_000; await r.tick();
    expect(unloads).toBe(1);
    t += 120_000; await r.tick();
    expect(unloads).toBe(1); // already released, no repeat
    touchUse(deps());
    await r.stop(); // shutdown releases what was used
    expect(unloads).toBe(2);
  });
});

describe("closed eligibility table", () => {
  it("only tester is eligible; every agent file is either eligible or in fora", () => {
    const names = new Set<string>(LOCAL_ELIGIBLE.map((e) => e.agente));
    const fora = LOCAL_FORA.map((f) => f.agente);
    expect([...names]).toEqual(["tester"]);
    expect(fora).not.toContain("tester");
    const dir = join(import.meta.dirname, "../../../agents");
    const files = require("node:fs").readdirSync(dir).filter((f: string) => f.endsWith(".md")).map((f: string) => f.replace(/\.md$/, ""));
    expect([...names, ...fora].sort()).toEqual(files.sort());
  });
});

describe("GET /local/status + SSE local", () => {
  it("reports state and emits `local` events on changes", async () => {
    port = await listen();
    writeFileSync(join(hub, "local.json"), JSON.stringify({ enabled: true, model: "m", port }));
    const srv = createServer({ runner: async () => { throw new Error("x"); }, store: createStore(join(hub, "missions")), clock: () => new Date(), host: "127.0.0.1", hubDir: hub, local: { watchMs: 30, reapMs: 3_600_000, lifecycle: { kill: (p, s) => { killed.push([p, s]); } } } });
    const sp = await srv.listen(0);
    const events: string[] = [];
    const req = request({ host: "127.0.0.1", port: sp, path: "/events" }, (res) => res.on("data", (c) => events.push(String(c))));
    req.end();
    const get = () => new Promise<any>((ok) => request({ host: "127.0.0.1", port: sp, path: "/local/status" }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok(JSON.parse(b))); }).end());
    const s = await get();
    expect(s).toMatchObject({ enabled: true, model: "m", ollama: { estado: "ligado", startedByHub: false, modeloCarregado: "m" }, viavel: { ok: true }, emUso: null, ultimoUso: null });
    expect(s.elegiveis[0]).toMatchObject({ agente: "tester", tarefa: "compact-test-log" });
    expect(s.fora.some((f: any) => f.agente === "coder")).toBe(true);
    await new Promise((r) => setTimeout(r, 100)); // baseline sample
    const id = markActive({ hub, port, model: "m" }, { task: "compact-test-log", model: "m" });
    await new Promise((r) => setTimeout(r, 120));
    markIdle({ hub, port, model: "m" }, id);
    await new Promise((r) => setTimeout(r, 120));
    expect((await get()).emUso).toBeNull();
    const text = events.join("");
    expect(text).toContain("event: local");
    expect(text).toContain('"evento":"em-uso"');
    expect(text).toContain('"evento":"ocioso"');
    req.destroy();
    await srv.close();
    expect(unloads).toBe(1); // close() releases what was used; user's server not killed
    expect(killed).toEqual([]);
  });
});
