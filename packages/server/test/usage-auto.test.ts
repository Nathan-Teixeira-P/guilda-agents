import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/http.ts";
import { createStore } from "../src/store.ts";
import { createUsageAuto } from "../src/usage-auto.ts";
import type { ConsultResult, UsageSource } from "../src/usage-source.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const MIN = 60_000;
const T0 = Date.parse("2026-01-01T12:00:00Z");

/** Fake usage source: never reaches a real `claude`. */
function fakeUsage(clock: () => number) {
  let pct = 10;
  let leitura: number | undefined;
  const f = {
    calls: 0,
    next: (): ConsultResult | undefined => undefined,
    pct: (n: number) => { pct = n; },
    atual: () => leitura === undefined ? { estado: "indisponivel" as const, motivo: "sem leitura" } : { estado: "ok" as const, atualizadoEm: new Date(leitura).toISOString(), cincoHoras: { percentual: pct, reiniciaEm: clock() / 1000 + 3600, status: "allowed" }, semana: { percentual: 5, reiniciaEm: clock() / 1000 + 86400, status: "allowed" } },
    ultimaLeitura: () => leitura,
    subscribe: () => () => {},
    alimentar: () => true,
    gate: undefined as Promise<void> | undefined,
    async consultar(): Promise<ConsultResult> {
      f.calls++;
      if (f.gate) await f.gate;
      const r = f.next();
      if (r) return r;
      leitura = clock();
      pct += 1;
      return { ok: true, estado: f.atual() as never };
    },
  };
  return f;
}

function setup(over: { auto?: boolean; ocupado?: boolean; conectados?: number; visiveis?: number; dir?: string } = {}) {
  let now = T0;
  const clock = () => new Date(now);
  const usage = fakeUsage(() => now);
  const c = { ocupado: over.ocupado ?? false, conectados: over.conectados ?? 1, visiveis: over.visiveis ?? 1 };
  let mudou = 0, leu = 0;
  const a = createUsageAuto({ ...(over.dir ? { dir: over.dir } : {}), clock, usage: usage as unknown as UsageSource, ocupado: () => c.ocupado, clientes: () => c, aoMudar: () => mudou++, aoLer: () => leu++ });
  if (over.auto === false) a.set({ auto: false });
  return { a, usage, c, advance: (ms: number) => { now += ms; }, n: () => ({ mudou, leu }) };
}

describe("usage auto refresher guards", () => {
  it("consults when every guard holds and then waits for the interval (d)", async () => {
    const s = setup();
    await s.a.tick();
    expect(s.usage.calls).toBe(1);
    expect(s.n().leu).toBe(1);
    s.advance(14 * MIN);
    await s.a.tick();
    expect(s.usage.calls).toBe(1);
    s.advance(1 * MIN);
    await s.a.tick();
    expect(s.usage.calls).toBe(2);
    expect(s.a.status().consultasHoje.auto).toBe(2);
  });
  it("(a) off, (b) no client / hidden tab, (c) mission running: never consults, and status says why", async () => {
    const off = setup({ auto: false });
    await off.a.tick();
    expect(off.usage.calls).toBe(0);
    expect(off.a.status()).toMatchObject({ estado: "desligado" });
    const none = setup({ conectados: 0, visiveis: 0 });
    await none.a.tick();
    expect(none.a.status()).toMatchObject({ estado: "pausado", motivo: "nenhuma aba aberta" });
    const hidden = setup({ visiveis: 0 });
    await hidden.a.tick();
    expect(hidden.a.status()).toMatchObject({ motivo: "aba oculta" });
    const busy = setup({ ocupado: true });
    await busy.a.tick();
    expect(busy.a.status()).toMatchObject({ motivo: "missão em andamento" });
    expect(none.usage.calls + hidden.usage.calls + busy.usage.calls).toBe(0);
  });
  it("(c) a fresh reading from a mission also postpones the next consult", async () => {
    const s = setup();
    await s.a.tick(); // reading at T0
    s.advance(10 * MIN);
    await s.a.tick();
    expect(s.usage.calls).toBe(1);
  });
  it("(e) at 95% or more it stops and says so; below it resumes", async () => {
    const s = setup();
    s.usage.pct(94);
    await s.a.tick(); // reading becomes 95
    s.advance(20 * MIN);
    await s.a.tick();
    expect(s.usage.calls).toBe(1);
    expect(s.a.status()).toMatchObject({ estado: "pausado" });
    expect(s.a.status().motivo).toContain("95");
  });
  it("(f) never overlaps an in-flight consult; manual in flight is throttled", async () => {
    const s = setup();
    let abrir!: () => void;
    s.usage.gate = new Promise<void>((r) => { abrir = r; });
    const p = s.a.tick();
    await s.a.tick();
    const m = await s.a.consultar("manual");
    expect(m).toMatchObject({ ok: false, reason: "throttled" });
    expect(s.usage.calls).toBe(1);
    abrir();
    await p;
  });
  it("keeps the existing throttle: a throttled answer delays the next try and is not counted", async () => {
    const s = setup();
    s.usage.next = () => ({ ok: false, reason: "throttled", retryAfterSeconds: 30 });
    await s.a.tick();
    await s.a.tick();
    expect(s.usage.calls).toBe(1);
    expect(s.a.status().consultasHoje.auto).toBe(0);
  });
  it("failure backs off exponentially, caps at 60 min, exposes the error and never throws", async () => {
    const s = setup();
    s.usage.next = () => ({ ok: false, reason: "failed", motivo: "not logged in" });
    await s.a.tick(); // fail 1 -> wait 15
    expect(s.a.status()).toMatchObject({ erro: "not logged in", falhasSeguidas: 1 });
    s.advance(14 * MIN); await s.a.tick();
    expect(s.usage.calls).toBe(1);
    s.advance(1 * MIN); await s.a.tick(); // fail 2 -> wait 30
    s.advance(29 * MIN); await s.a.tick();
    expect(s.usage.calls).toBe(2);
    s.advance(1 * MIN); await s.a.tick(); // fail 3 -> wait 60
    s.advance(59 * MIN); await s.a.tick();
    expect(s.usage.calls).toBe(3);
    s.advance(1 * MIN); await s.a.tick(); // fail 4 -> capped at 60 (not 120)
    s.advance(60 * MIN); s.usage.next = () => undefined; await s.a.tick();
    expect(s.usage.calls).toBe(5);
    expect(s.a.status().erro).toBeUndefined(); // success clears it
    s.usage.consultar = async () => { throw new Error("boom"); };
    s.advance(15 * MIN);
    await expect(s.a.tick()).resolves.toBeUndefined();
    expect(s.a.status().erro).toBe("boom");
  });
  it("records cost deltas (last 20) and per-day counts, persisted", async () => {
    const dir = mkdtempSync(join(SCRATCH, "uauto-"));
    const s = setup({ dir });
    await s.a.consultar("manual"); // no previous reading: no delta
    expect(s.a.status().custoPp.ultimos).toEqual([]);
    for (let i = 0; i < 22; i++) { s.advance(15 * MIN); await s.a.tick(); }
    const st = s.a.status();
    expect(st.custoPp.ultimos).toHaveLength(20);
    expect(st.custoPp.ultimos.every((x) => x === 1)).toBe(true);
    expect(st.custoPp.media).toBe(1);
    expect(st.consultasHoje.manual).toBeGreaterThanOrEqual(1);
    const again = setup({ dir });
    expect(again.a.status().custoPp.ultimos).toHaveLength(20);
    expect(JSON.parse(readFileSync(join(dir, "usage-auto-stats.json"), "utf8")).deltas).toHaveLength(20);
  });
  it("persists the config and rejects nothing silently (defaults on corrupt file)", () => {
    const dir = mkdtempSync(join(SCRATCH, "uauto-"));
    const s = setup({ dir });
    expect(s.a.config()).toEqual({ auto: true, intervaloMin: 15 });
    s.a.set({ auto: false, intervaloMin: 30 });
    expect(setup({ dir }).a.config()).toEqual({ auto: false, intervaloMin: 30 });
  });
  it("start/stop use the injected timer", () => {
    let fn: (() => void) | undefined, cleared = 0;
    const usage = fakeUsage(() => T0);
    const a = createUsageAuto({ clock: () => new Date(T0), usage: usage as unknown as UsageSource, ocupado: () => false, clientes: () => ({ conectados: 0, visiveis: 0 }), aoMudar() {}, aoLer() {}, every: (f) => { fn = f; return () => { cleared++; }; } });
    a.start(); a.start();
    expect(fn).toBeDefined();
    a.stop();
    expect(cleared).toBe(1);
  });
});

describe("HTTP: /usage/auto, /usage/visibilidade and SSE client counting", () => {
  let srv: ReturnType<typeof createServer> | undefined;
  afterEach(async () => { await srv?.close(); srv = undefined; });
  const T = Date.parse("2026-01-01T12:00:00Z");
  async function boot() {
    mkdirSync(SCRATCH, { recursive: true });
    const root = mkdtempSync(join(SCRATCH, "uauto-http-"));
    const usage = fakeUsage(() => T);
    srv = createServer({ runner: (() => Promise.reject(new Error("no"))) as never, store: createStore(join(root, "m")), clock: () => new Date(T), host: "127.0.0.1", usage: usage as unknown as UsageSource, hubDir: root, usageAuto: { every: () => () => {} }, local: { watchMs: 3_600_000, reapMs: 3_600_000 } });
    const port = await srv.listen(0);
    return { port, usage };
  }
  const call = (port: number, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; json: any }>((resolve, reject) => {
      const r = request({ host: "127.0.0.1", port, method, path, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
        let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => resolve({ status: res.statusCode!, json: JSON.parse(t) }));
      });
      r.on("error", reject); r.end(body !== undefined ? JSON.stringify(body) : undefined);
    });
  const sse = (port: number, c: string) => new Promise<{ close: () => void }>((resolve) => {
    const r = request({ host: "127.0.0.1", port, path: `/events?c=${c}` }, (res) => { res.resume(); resolve({ close: () => r.destroy() }); });
    r.end();
  });
  const espera = async (f: () => Promise<boolean>) => { for (let i = 0; i < 50 && !(await f()); i++) await new Promise((r) => setTimeout(r, 20)); };

  it("GET/PUT validate and persist; defaults are auto on, 15 min", async () => {
    const { port } = await boot();
    expect((await call(port, "GET", "/usage/auto")).json).toMatchObject({ auto: true, intervaloMin: 15, estado: "pausado", motivo: "nenhuma aba aberta" });
    expect((await call(port, "PUT", "/usage/auto", { intervaloMin: 4 })).status).toBe(400);
    expect((await call(port, "PUT", "/usage/auto", { intervaloMin: 61 })).status).toBe(400);
    expect((await call(port, "PUT", "/usage/auto", { auto: "sim" })).status).toBe(400);
    const r = await call(port, "PUT", "/usage/auto", { auto: false, intervaloMin: 30 });
    expect(r.json).toMatchObject({ auto: false, intervaloMin: 30, estado: "desligado" });
  });
  it("Host and Origin rules apply", async () => {
    const { port } = await boot();
    expect((await call(port, "PUT", "/usage/auto", { auto: false }, { origin: "http://evil.example" })).status).toBe(403);
    expect((await call(port, "POST", "/usage/visibilidade", { visivel: true }, { host: "evil.example" })).status).toBe(403);
    expect((await call(port, "POST", "/usage/visibilidade", { visivel: "x" })).status).toBe(400);
  });
  it("counts connected and visible tabs; closing the tab drops its visibility", async () => {
    const { port, usage } = await boot();
    const a = await sse(port, "aba-a");
    await espera(async () => (await call(port, "GET", "/usage/auto")).json.motivo !== "nenhuma aba aberta");
    expect((await call(port, "GET", "/usage/auto")).json.motivo).toBe("aba oculta");
    expect(usage.calls).toBe(0);
    const v = await call(port, "POST", "/usage/visibilidade", { visivel: true, cliente: "aba-a" });
    expect(v.status).toBe(200);
    await espera(async () => usage.calls === 1); // visible tab triggers an immediate guarded tick
    expect(usage.calls).toBe(1);
    expect((await call(port, "GET", "/usage/auto")).json.consultasHoje.auto).toBe(1);
    a.close();
    await espera(async () => (await call(port, "GET", "/usage/auto")).json.motivo === "nenhuma aba aberta");
    const b = await sse(port, "aba-a"); // same id reconnecting must not inherit the old visibility
    await espera(async () => (await call(port, "GET", "/usage/auto")).json.motivo === "aba oculta");
    expect((await call(port, "GET", "/usage/auto")).json.motivo).toBe("aba oculta");
    b.close();
  });
});
