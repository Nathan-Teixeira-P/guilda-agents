import { spawn as realSpawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/http.ts";
import { runPhase, type RunOpts, type SpawnFn } from "../src/runner.ts";
import { createStore } from "../src/store.ts";
import { createUsageSource } from "../src/usage-source.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const fixture = (n: string) => new URL(`../../../tests/fixtures/${n}.jsonl`, import.meta.url).pathname;
const fake = new URL("./fake-agent.mjs", import.meta.url).pathname;
const RESET5 = 1795243200;
let nowMs = (RESET5 - 3600) * 1000;
const clock = () => new Date(nowMs);

let root: string, fx: string, srv: ReturnType<typeof createServer>, port: number, spawned: number;
const spawn: SpawnFn = (_f, _a, o) => { spawned++; return realSpawn(process.execPath, [fake, fx], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] }); };

async function boot(withSpawn = true) {
  const usage = createUsageSource({ clock, ...(withSpawn ? { spawn } : {}) });
  srv = createServer({ runner: (o: RunOpts) => runPhase(o, { spawn }), store: createStore(join(root, "missions")), clock, projects: { proj: join(root, "proj") }, host: "127.0.0.1", usage });
  port = await srv.listen(0);
}
const call = (method: string, path: string) =>
  new Promise<{ status: number; json: any; headers: Record<string, any> }>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: method === "POST" ? { "content-type": "application/json" } : {} }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode!, json: JSON.parse(t), headers: res.headers }));
    });
    r.on("error", reject);
    r.end();
  });

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "uhttp-"));
  mkdirSync(join(root, "proj"));
  fx = fixture("stream-basic");
  nowMs = (RESET5 - 3600) * 1000;
  spawned = 0;
});
afterEach(() => srv.close());

describe("GET /usage", () => {
  it("is unavailable before any reading (never zero)", async () => {
    await boot();
    expect(await call("GET", "/usage")).toMatchObject({ status: 200, json: { estado: "indisponivel", motivo: "sem leitura" } });
    expect(spawned).toBe(0); // GET never consults the model
  });
});

describe("POST /usage/consult", () => {
  it("consults once and then GET returns remaining time, pace and band", async () => {
    await boot();
    const r = await call("POST", "/usage/consult");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ estado: "ok", cincoHoras: { percentual: 14, restanteSegundos: 3600, faixa: "normal" }, semana: { percentual: 10 } });
    expect(r.json.cincoHoras.ritmo).toBeCloseTo(0.8);
    expect((await call("GET", "/usage")).json).toMatchObject({ estado: "ok", cincoHoras: { percentual: 14 } });
    expect(spawned).toBe(1);
  });
  it("429 with retry-after when repeated in under 30 s; the second call spawns nothing", async () => {
    await boot();
    await call("POST", "/usage/consult");
    const r = await call("POST", "/usage/consult");
    expect(r.status).toBe(429);
    expect(r.headers["retry-after"]).toBe("30");
    expect(spawned).toBe(1);
  });
  it("502 when the consult fails, and usage stays unavailable", async () => {
    await boot();
    fx = join(root, "empty.jsonl");
    writeFileSync(fx, "");
    expect((await call("POST", "/usage/consult")).status).toBe(502);
    expect((await call("GET", "/usage")).json.estado).toBe("indisponivel");
  });
  it("502 when no consult is configured (no real claude is ever reached by default)", async () => {
    await boot(false);
    expect((await call("POST", "/usage/consult")).status).toBe(502);
    expect(spawned).toBe(0);
  });
  it("rejects a foreign Origin like every other route", async () => {
    await boot();
    const r = await new Promise<number>((res) => { const q = request({ host: "127.0.0.1", port, method: "POST", path: "/usage/consult", headers: { origin: "http://evil.com" } }, (x) => { x.resume(); res(x.statusCode!); }); q.end(); });
    expect(r).toBe(403);
    expect(spawned).toBe(0);
  });
});

describe("feeding and SSE", () => {
  it("a mission's rate_limit_event feeds the snapshot and emits a `usage` SSE event", async () => {
    await boot();
    const got = new Promise<string>((resolve) => {
      let t = "";
      const r = request({ host: "127.0.0.1", port, path: "/events" }, (res) => {
        res.on("data", (c) => { t += c; if (t.includes("event: usage")) { r.destroy(); resolve(t); } });
      });
      r.end();
      setTimeout(() => {
        const q = request({ host: "127.0.0.1", port, method: "POST", path: "/missions", headers: { "content-type": "application/json" } }, (x) => x.resume());
        q.end(JSON.stringify({ project: "proj", demanda: "x", confirmarUso: true }));
      }, 100);
      setTimeout(() => { r.destroy(); resolve(t); }, 4000);
    });
    expect(await got).toContain("event: usage");
    expect((await call("GET", "/usage")).json).toMatchObject({ estado: "ok", cincoHoras: { percentual: 14 } });
  });
  it("a manual consult also emits the `usage` SSE event", async () => {
    await boot();
    const got = new Promise<string>((resolve) => {
      let t = "";
      const r = request({ host: "127.0.0.1", port, path: "/events" }, (res) => {
        res.on("data", (c) => { t += c; if (t.includes("event: usage")) { r.destroy(); resolve(t); } });
      });
      r.end();
      setTimeout(() => call("POST", "/usage/consult"), 100);
      setTimeout(() => { r.destroy(); resolve(t); }, 4000);
    });
    const t = await got;
    expect(t).toContain("event: usage");
    expect(t).toContain('"percentual":14');
  });
});
