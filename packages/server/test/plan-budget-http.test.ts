import { spawn as realSpawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/http.ts";
import { runPhase, type RunOpts, type SpawnFn } from "../src/runner.ts";
import { createStore } from "../src/store.ts";
import { createUsageSource, type UsageSource } from "../src/usage-source.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const fixture = new URL("../../../tests/fixtures/stream-basic.jsonl", import.meta.url).pathname; // replays 14% (5h) and 10% (week)
const fake = new URL("./fake-agent.mjs", import.meta.url).pathname;
const RESET5 = 1795243200;
const RESET7 = 1795762800;
const clock = () => new Date((RESET5 - 3600) * 1000);

let root: string, srv: ReturnType<typeof createServer>, port: number, usage: UsageSource, spawned: number;
let srvSpawnFile = fixture;
const spawn: SpawnFn = (_f, _a, o) => { spawned++; return realSpawn(process.execPath, [fake, srvSpawnFile], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] }); };
const feed = (c: number, s = 0.1) => usage.alimentar({ fiveHour: { utilization: c, resetsAt: RESET5, status: "allowed" }, sevenDay: { utilization: s, resetsAt: RESET7, status: "allowed" } });

const call = (method: string, path: string, body?: object) =>
  new Promise<{ status: number; json: any }>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: body ? { "content-type": "application/json" } : {} }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode!, json: JSON.parse(t) }));
    });
    r.on("error", reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });
const mission = async (id: string) => (await call("GET", `/missions/${id}`)).json.mission;
async function settle(id: string) {
  for (let i = 0; i < 200; i++) {
    const m = await mission(id);
    if (m.stage !== "planejando") return m;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("mission never left planejando");
}
const make = (extra: object = {}) => call("POST", "/missions", { project: "proj", demanda: "go", ...extra });

beforeEach(async () => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "pb-"));
  mkdirSync(join(root, "proj"));
  spawned = 0;
  srvSpawnFile = fixture;
  usage = createUsageSource({ clock });
  srv = createServer({ runner: (o: RunOpts) => {
    const d = join(o.missionsDir, o.mission.id, "out/prd"); // a draft for phase 1 to promote
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "a.prd.md"), "# PRD A");
    return runPhase(o, { spawn });
  }, store: createStore(join(root, "missions")), clock, projects: { proj: join(root, "proj") }, host: "127.0.0.1", usage });
  port = await srv.listen(0);
});
afterEach(async () => { await srv.close(); });

describe("POST /missions plan usage gate", () => {
  it("409 with reason and current usage when the 5h window is above 80%, without launching", async () => {
    feed(0.85);
    const r = await make();
    expect(r.status).toBe(409);
    expect(r.json.motivo).toMatch(/5 horas/);
    expect(r.json.uso).toMatchObject({ estado: "ok", cincoHoras: { percentual: 85 } });
    expect(spawned).toBe(0);
    expect((await call("GET", "/missions")).json.missions).toEqual([]);
  });
  it("409 when there is no usage reading (never assumes free)", async () => {
    const r = await make();
    expect(r.status).toBe(409);
    expect(r.json.uso).toMatchObject({ estado: "indisponivel" });
  });
  it("confirmarUso releases it", async () => {
    feed(0.85);
    const r = await make({ confirmarUso: true });
    expect(r.status).toBe(201);
    expect(r.json.mission.usoInicial.cincoHoras.percentual).toBe(85);
  });
  it("records usoInicial and no cap by default", async () => {
    feed(0.03);
    const r = await make();
    expect(r.status).toBe(201);
    expect(r.json.mission).toMatchObject({ usoInicial: { cincoHoras: { percentual: 3, reiniciaEm: RESET5 }, semana: { percentual: 10, reiniciaEm: RESET7 } } });
    expect(r.json.mission.tetoPp).toBeUndefined();
    expect(r.json.mission.tetoSemanaPp).toBeUndefined();
  });
  it("rejects an invalid cap", async () => {
    feed(0.03);
    expect((await make({ tetoPp: 0 })).status).toBe(400);
    expect((await make({ tetoPp: 101 })).status).toBe(400);
  });
});

describe("pause at the plan cap", () => {
  it("pauses with a Portuguese reason when a rate_limit_event reaches the cap", async () => {
    feed(0.03); // the replayed stream reports 14%: 11 pp consumed against a 10 pp cap
    const id = (await make({ tetoPp: 10 })).json.id;
    const m = await settle(id);
    expect(m.stage).toBe("pausada");
    expect(m.pauseReason).toBe("teto de uso do plano: consumiu 11 pp de 10 pp (5 h)");
  });
  it("pauses at the weekly cap too", async () => {
    feed(0.03, 0.05); // the stream reports 10% for the week: 5 pp consumed against a 1 pp cap
    const id = (await make({ tetoSemanaPp: 1 })).json.id;
    const m = await settle(id);
    expect(m.stage).toBe("pausada");
    expect(m.pauseReason).toMatch(/^teto de uso do plano: consumiu .* \(semana\)$/);
  });
  it("runs uncapped when no cap is given", async () => {
    feed(0.03);
    expect((await settle((await make()).json.id)).stage).toBe("aguardando-aprovacao");
  });
  it("keeps going below the cap", async () => {
    feed(0.03);
    const id = (await make({ tetoPp: 20 })).json.id;
    expect((await settle(id)).stage).toBe("aguardando-aprovacao");
  });
  it("with no reading at creation, the first reading in the run is the baseline and the cap still applies", async () => {
    const rl = readFileSync(fixture, "utf8").split("\n").find((l) => l.includes("rate_limit_event"))!;
    const at = (u: number) => { const j = JSON.parse(rl); j.rate_limit_info.unifiedWindows.five_hour.utilization = u; return JSON.stringify(j); };
    const two = join(root, "two-readings.jsonl");
    writeFileSync(two, [at(0.1), at(0.15), at(0.25)].join("\n") + "\n"); // baseline 10%, then 15% (under the cap), then 25% (15 pp over a 10 pp cap)
    srvSpawnFile = two;
    const id = (await make({ tetoPp: 10, confirmarUso: true })).json.id; // no reading recorded: no usoInicial
    const m = await settle(id);
    expect(m.usoInicial).toBeUndefined();
    expect(m.stage).toBe("pausada");
    expect(m.pauseReason).toBe("teto de uso do plano: consumiu 15 pp de 10 pp (5 h)");
  });
  it("old missions without usoInicial run uncapped", async () => {
    const id = (await make({ confirmarUso: true })).json.id; // no reading: no baseline recorded
    const m = await settle(id);
    expect(m.usoInicial).toBeUndefined();
    expect(m.stage).toBe("aguardando-aprovacao");
  });
});

describe("edit and delete", () => {
  it("edits demanda and caps (null removes), then deletes; refuses while running", async () => {
    feed(0.03);
    const id = (await make({ tetoPp: 20 })).json.id;
    expect((await call("PATCH", `/missions/${id}`, { demanda: "x" })).status).toBe(409); // still planning
    await settle(id);
    const r = await call("PATCH", `/missions/${id}`, { demanda: "nova", tetoSemanaPp: 30, tetoPp: null });
    expect(r.status).toBe(200);
    expect(r.json.mission).toMatchObject({ demanda: "nova", tetoSemanaPp: 30 });
    expect(r.json.mission.tetoPp).toBeUndefined();
    expect((await call("DELETE", `/missions/${id}`)).status).toBe(200);
    expect((await call("GET", `/missions/${id}`)).status).toBe(404);
  });
});
