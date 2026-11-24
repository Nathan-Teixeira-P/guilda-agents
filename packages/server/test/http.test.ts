import { spawn as realSpawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isApproved } from "@lab/core/src/gate.ts";
import { newMission, parseMission, transition, writeMission } from "@lab/core/src/mission.ts";
import { createServer } from "../src/http.ts";
import { runPhase, type RunOpts, type SpawnFn } from "../src/runner.ts";
import { createProjectsStore } from "../src/projects-store.ts";
import { createStore } from "../src/store.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const fixture = (n: string) => new URL(`../../../tests/fixtures/${n}.jsonl`, import.meta.url).pathname;
const fake = new URL("./fake-agent.mjs", import.meta.url).pathname;
const clock = () => new Date("2026-01-01T00:00:00Z");

let root: string, project: string, missionsDir: string;
let mode = "", writeDraft = true, phases: number[], prompts: string[];
let srv: ReturnType<typeof createServer>, port: number;

const spawn: SpawnFn = (_f, _a, o) => realSpawn(process.execPath, [fake, fixture("stream-basic"), mode], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });
const runner = (o: RunOpts) => {
  phases.push(o.phase);
  prompts.push(o.prompt);
  if (o.phase === 1 && writeDraft) {
    const d = join(o.missionsDir, o.mission.id, "out/prd");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "a.prd.md"), "# PRD A");
  }
  return runPhase(o, { spawn });
};

async function boot() {
  srv = createServer({ runner, store: createStore(missionsDir), clock, projects: { proj: project }, host: "127.0.0.1" });
  port = await srv.listen(0);
}
function call(method: string, path: string, body?: string | object, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: any; text: string }>((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    const h: Record<string, string> = { ...(method === "POST" || method === "PATCH" ? { "content-type": "application/json" } : {}), ...headers };
    const r = request({ host: "127.0.0.1", port, method, path, headers: h }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode!, text: t, json: (() => { try { return JSON.parse(t); } catch { return undefined; } })() }));
    });
    r.on("error", reject);
    r.end(payload);
  });
}
const stageOf = async (id: string) => (await call("GET", `/missions/${id}`)).json.mission.stage;
async function until(id: string, stage: string) {
  for (let i = 0; i < 200; i++) {
    if ((await stageOf(id)) === stage) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`mission never reached ${stage}, at ${await stageOf(id)}`);
}
const create = async () => (await call("POST", "/missions", { project: "proj", demanda: "build it", confirmarUso: true })).json.id as string;

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "http-"));
  project = join(root, "proj");
  missionsDir = join(root, "missions");
  mkdirSync(project);
  mode = "";
  writeDraft = true;
  phases = [];
  prompts = [];
});
afterEach(async () => { await srv?.close(); });

describe("request hardening", () => {
  beforeEach(boot);
  it("rejects a foreign Host and a foreign or null Origin with 403", async () => {
    expect((await call("GET", "/missions", undefined, { host: "evil.com" })).status).toBe(403);
    expect((await call("GET", "/missions", undefined, { host: `127.0.0.1.evil.com:${port}` })).status).toBe(403);
    expect((await call("GET", "/missions", undefined, { origin: "http://evil.com" })).status).toBe(403);
    expect((await call("GET", "/missions", undefined, { origin: "null" })).status).toBe(403);
    expect((await call("GET", "/missions", undefined, { host: `localhost:${port}`, origin: `http://localhost:${port}` })).status).toBe(200);
  });
  it("rejects big bodies (413), bad content type (415) and bad JSON (400) without leaking a stack", async () => {
    expect((await call("POST", "/missions", "x".repeat(70_000))).status).toBe(413);
    expect((await call("POST", "/missions", "{}", { "content-type": "text/plain" })).status).toBe(415);
    const bad = await call("POST", "/missions", "{nope");
    expect(bad.status).toBe(400);
    expect(bad.text).not.toMatch(/at .*\.ts|node_modules/);
    expect((await call("POST", "/missions", { project: "nope", demanda: "x", confirmarUso: true })).status).toBe(400);
    expect((await call("POST", "/missions", { project: "proj", demanda: "" })).status).toBe(400);
    expect((await call("POST", "/missions", { project: "__proto__", demanda: "x", confirmarUso: true })).status).toBe(400);
  });
  it("validates mission ids", async () => {
    expect((await call("GET", "/missions/..%2Fx")).status).toBe(400);
    expect((await call("GET", "/missions/ABC")).status).toBe(400);
    expect((await call("GET", "/missions/nope-1")).status).toBe(404);
  });
  it("refuses to bind outside loopback", () => {
    expect(() => createServer({ runner, store: createStore(missionsDir), clock, projects: {}, host: "0.0.0.0" })).toThrow();
  });
});

describe("flow", () => {
  beforeEach(boot);
  it("create -> phase 1 -> promote -> aguardando-aprovacao -> approve -> concluida", async () => {
    const id = await create();
    await until(id, "aguardando-aprovacao");
    expect(readFileSync(join(project, ".claude/prd/a.prd.md"), "utf8")).toBe("# PRD A");
    const got = (await call("GET", `/missions/${id}`)).json;
    expect(got.package.files).toEqual([{ path: "prd/a.prd.md", content: "# PRD A" }]);
    expect((await call("GET", "/missions")).json.missions.map((m: any) => m.id)).toEqual([id]);

    const ok = await call("POST", `/missions/${id}/approve`);
    expect(ok.status).toBe(202);
    expect(isApproved(join(missionsDir, id))).toBe(true);
    await until(id, "concluida");
    expect(phases).toEqual([1, 2]);
    expect((await call("POST", `/missions/${id}/approve`)).status).toBe(409);
  });
  it("approve outside aguardando-aprovacao is 409 and writes no seal", async () => {
    mode = "hang";
    const id = await create();
    await until(id, "planejando");
    expect((await call("POST", `/missions/${id}/approve`)).status).toBe(409);
    expect(existsSync(join(missionsDir, id, "approved"))).toBe(false);
    expect((await call("POST", `/missions/${id}/adjust`, { comment: "x" })).status).toBe(409);
    await call("POST", `/missions/${id}/stop`);
  });
  it("pause parks a running mission with a user reason; resume audits what exists", async () => {
    mode = "hang";
    const id = await create();
    await until(id, "planejando");
    const r = await call("POST", `/missions/${id}/pause`);
    expect(r.status).toBe(200);
    expect(r.json.mission).toMatchObject({ stage: "pausada", pauseReason: "pausada pelo usuário", pausedFrom: "planejando" });
    expect((await call("POST", `/missions/${id}/pause`)).status).toBe(409);
    mode = "";
    expect((await call("POST", `/missions/${id}/resume`, {})).status).toBe(202);
    expect(prompts.at(-1)).toMatch(/RESUMING/);
    await until(id, "aguardando-aprovacao");
  });
  it("adjust reopens phase 1 with the comment", async () => {
    const id = await create();
    await until(id, "aguardando-aprovacao");
    expect((await call("POST", `/missions/${id}/adjust`, {})).status).toBe(400);
    expect((await call("POST", `/missions/${id}/adjust`, { comment: "more tests" })).status).toBe(202);
    await until(id, "planejando").catch(() => {});
    await until(id, "aguardando-aprovacao");
    expect(phases).toEqual([1, 1]);
    expect(prompts[1]).toContain("more tests");
    expect(prompts[1]).toContain("build it");
    expect(prompts[1]).toContain(join(missionsDir, id, "out"));
    expect(isApproved(join(missionsDir, id))).toBe(false);
  });
  it("stop kills the process and parks the mission", async () => {
    mode = "hang";
    const id = await create();
    await until(id, "planejando");
    const r = await call("POST", `/missions/${id}/stop`);
    expect(r.status).toBe(200);
    expect(r.json.mission.stage).toBe("parada");
    expect(await stageOf(id)).toBe("parada");
    expect((await call("POST", `/missions/${id}/stop`)).status).toBe(409);
  });
  it("a failed promotion parks the mission with the reason", async () => {
    writeDraft = false; // empty staging -> "nothing to promote"
    const id = await create();
    await until(id, "parada");
    const m = (await call("GET", `/missions/${id}`)).json.mission;
    expect(m.stopReason).toMatch(/nothing to promote/);
  });
});

describe("pause and resume", () => {
  beforeEach(boot);
  const seed = (id: string, from: "planejando" | "executando", sealed: boolean) => {
    let m = transition(newMission(id, "proj", clock), "planejando", { now: clock });
    if (from === "executando") {
      m = transition(transition(m, "aguardando-aprovacao", { now: clock }), "executando", { now: clock, approved: true });
    }
    m = { ...transition(m, "pausada", { now: clock, reason: "disjuntor: loops" }), demanda: "build it", sessionId: "old" };
    mkdirSync(join(missionsDir, id), { recursive: true });
    writeMission(join(missionsDir, id), m);
    if (sealed) writeFileSync(join(missionsDir, id, "approved"), '{"approved":true}');
  };
  it("a breaker trip pauses, exposes the reason in JSON and SSE, and resume phase 1 runs a fresh session with the comment", async () => {
    await srv.close();
    let trip = true;
    const r2 = (o: RunOpts) => runner(trip ? { ...o, breaker: { get: () => ({ loops: { s: 3 }, handoffs: 0 }), step: "s" } } : o);
    srv = createServer({ runner: r2, store: createStore(missionsDir), clock, projects: { proj: project }, host: "127.0.0.1" });
    port = await srv.listen(0);
    mode = "hang";
    const id = await create();
    await until(id, "pausada");
    const m = (await call("GET", `/missions/${id}`)).json.mission;
    expect(m.pauseReason).toMatch(/^disjuntor/);
    trip = false;
    mode = "";
    expect((await call("POST", `/missions/${id}/resume`, { comment: "try smaller" })).status).toBe(202);
    await until(id, "aguardando-aprovacao");
    expect(phases).toEqual([1, 1]);
    expect(prompts[1]).toContain("try smaller");
    expect((await call("GET", `/missions/${id}`)).json.mission).not.toHaveProperty("pauseReason");
  });
  it("GET exposes mission handoffs and resume resets the breaker counters", async () => {
    seed("p-h", "planejando", false);
    const f = join(missionsDir, "p-h");
    writeMission(f, { ...parseMission(readFileSync(join(f, "mission.json"), "utf8"))!, handoffs: 9, loops: { s: 3 } });
    expect((await call("GET", "/missions/p-h")).json.breaker).toMatchObject({ handoffs: 9, loops: { s: 3 } });
    expect((await call("POST", "/missions/p-h/resume", {})).status).toBe(202);
    expect((await call("GET", "/missions/p-h")).json.breaker).toMatchObject({ handoffs: 0, loops: {} });
  });
  it("resume only works in pausada (409 otherwise), 404 unknown, 400 bad comment", async () => {
    const id = await create();
    await until(id, "aguardando-aprovacao");
    expect((await call("POST", `/missions/${id}/resume`, {})).status).toBe(409);
    expect((await call("POST", "/missions/nope-1/resume", {})).status).toBe(404);
    seed("p-bad", "planejando", false);
    expect((await call("POST", "/missions/p-bad/resume", { comment: 5 })).status).toBe(400);
    expect((await call("POST", "/missions/p-bad/resume", { comment: "" })).status).toBe(400);
  });
  it("resume phase 2 without a valid seal is 409 and stays pausada (fail closed)", async () => {
    seed("p-exec", "executando", false);
    expect((await call("POST", "/missions/p-exec/resume", {})).status).toBe(409);
    writeFileSync(join(missionsDir, "p-exec", "approved"), "garbage");
    expect((await call("POST", "/missions/p-exec/resume", {})).status).toBe(409);
    expect(await stageOf("p-exec")).toBe("pausada");
    expect(phases).toEqual([]);
  });
  it("resume phase 2 with the seal runs phase 2 with the comment in the prompt", async () => {
    seed("p-exec", "executando", true);
    expect((await call("POST", "/missions/p-exec/resume", { comment: "keep going" })).status).toBe(202);
    await until("p-exec", "concluida");
    expect(phases).toEqual([2]);
    expect(prompts[0]).toContain("keep going");
  });
  it("stop on a paused mission ends it in parada, and a recolhida can be resumed (phase 1: unsealed)", async () => {
    seed("p-stop", "planejando", false);
    await srv.close();
    await boot();
    const r = await call("POST", "/missions/p-stop/stop");
    expect(r.status).toBe(200);
    expect(r.json.mission.stage).toBe("parada");
    const back = await call("POST", "/missions/p-stop/resume", {});
    expect(back.status).toBe(202);
    expect(back.json.mission.stage).toBe("planejando");
    expect(back.json.mission.stopReason).toBeUndefined();
    expect(phases).toEqual([1]);
  });
});

describe("resume and SSE", () => {
  it("pauses orphaned running missions on boot (resumable), keeps the rest", async () => {
    mkdirSync(missionsDir, { recursive: true });
    const put = (id: string, stage: "planejando" | "executando" | "aguardando-aprovacao") => {
      let m = transition(newMission(id, "proj", clock), "planejando", { now: clock });
      if (stage !== "planejando") m = transition(m, "aguardando-aprovacao", { now: clock });
      if (stage === "executando") m = transition(m, "executando", { now: clock, approved: true });
      mkdirSync(join(missionsDir, id), { recursive: true });
      writeMission(join(missionsDir, id), m);
    };
    put("a-plan", "planejando");
    put("b-exec", "executando");
    put("c-wait", "aguardando-aprovacao");
    writeFileSync(join(missionsDir, "b-exec", "approved"), '{"approved":true}');
    await boot();
    const list = (await call("GET", "/missions")).json.missions as any[];
    const by = Object.fromEntries(list.map((m) => [m.id, m]));
    expect(by["a-plan"].stage).toBe("pausada");
    expect(by["a-plan"].pauseReason).toBe("servidor reiniciado");
    expect(by["b-exec"].stage).toBe("pausada");
    expect(isApproved(join(missionsDir, "b-exec"))).toBe(true);
    expect(by["c-wait"].stage).toBe("aguardando-aprovacao");
    expect(phases).toEqual([]); // nothing restarts by itself
  });
  it("GET /events streams mission and progress events", async () => {
    await boot();
    const got: string[] = [];
    const seen = new Promise<void>((resolve, reject) => {
      const r = request({ host: "127.0.0.1", port, path: "/events" }, (res) => {
        expect(res.headers["content-type"]).toBe("text/event-stream");
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          got.push(c);
          const all = got.join("");
          if (all.includes("event: mission") && all.includes("event: progress") && all.includes("aguardando-aprovacao")) { r.destroy(); resolve(); }
        });
      });
      r.on("error", (e: any) => (e.code === "ECONNRESET" ? undefined : reject(e)));
      r.end();
      setTimeout(() => reject(new Error("no SSE events: " + got.join(""))), 5000);
    });
    await new Promise((r) => setTimeout(r, 50));
    await create();
    await seen;
  });
});

describe("SSE heartbeat and ids; breaker state", () => {
  it("sends `: ping` periodically and `id:` on events", async () => {
    srv = createServer({ runner, store: createStore(missionsDir), clock, projects: { proj: project }, host: "127.0.0.1", heartbeatMs: 20 });
    port = await srv.listen(0);
    const got: string[] = [];
    const seen = new Promise<void>((resolve, reject) => {
      const r = request({ host: "127.0.0.1", port, path: "/events" }, (res) => {
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          got.push(c);
          const all = got.join("");
          if (all.includes(": ping") && /id: \d+\nevent: mission/.test(all)) { r.destroy(); resolve(); }
        });
      });
      r.on("error", (e: any) => (e.code === "ECONNRESET" ? undefined : reject(e)));
      r.end();
      setTimeout(() => reject(new Error("missing ping/id: " + got.join(""))), 5000);
    });
    await new Promise((r) => setTimeout(r, 50));
    await create();
    await seen;
  });
  it("GET /missions/:id exposes the breaker state", async () => {
    await boot();
    const id = await create();
    expect((await call("GET", `/missions/${id}`)).json.breaker).toEqual({ loops: {}, handoffs: 0, limits: { maxLoops: 2, maxHandoffs: 8 } });
  });
});

describe("project registry", () => {
  let cloned: { origem: string; id: string; workspacesDir: string }[];
  let cloneOk = true;
  const clone = async (c: { origem: string; id: string; workspacesDir: string }) => {
    cloned.push(c);
    if (!cloneOk) return { ok: false as const, reason: "git clone failed (exit 128)" };
    const caminho = join(c.workspacesDir, c.id);
    mkdirSync(caminho, { recursive: true });
    return { ok: true as const, caminho };
  };
  beforeEach(async () => {
    cloned = [];
    cloneOk = true;
    srv = createServer({ runner, store: createStore(missionsDir), clock, host: "127.0.0.1", registry: createProjectsStore(join(root, "projects.json")), workspacesDir: join(root, "workspaces"), clone });
    port = await srv.listen(0);
  });
  const attach = (b: object) => call("POST", "/projects", b);

  it("attaches a local folder, lists it, and resolves it by name for missions", async () => {
    const r = await attach({ nome: "Meu Projeto", pasta: project, apelidos: ["mp"] });
    expect(r.status).toBe(201);
    expect(r.json.projeto.id).toMatch(/^[a-z0-9-]+$/);
    expect(r.json.projeto.caminho).toBe(project);
    expect((await call("GET", "/projects")).json.projects).toHaveLength(1);
    const m = await call("POST", "/missions", { project: "meu projeto", demanda: "go", confirmarUso: true });
    expect(m.status).toBe(201);
    expect(m.json.mission.project).toBe(r.json.projeto.id);
    await until(m.json.id, "aguardando-aprovacao");
    expect((await call("POST", "/missions", { project: r.json.projeto.id, demanda: "go", confirmarUso: true })).status).toBe(201);
    expect((await call("POST", "/missions", { project: "nao existe", demanda: "go", confirmarUso: true })).status).toBe(400);
  });
  it("clones a url into workspaces/<id> through the injected clone", async () => {
    const r = await attach({ nome: "Remoto", url: "https://github.com/a/b.git", clickupListUrl: "https://app.clickup.com/1/v/li/2" });
    expect(r.status).toBe(201);
    expect(cloned).toEqual([{ origem: "https://github.com/a/b.git", id: r.json.projeto.id, workspacesDir: join(root, "workspaces") }]);
    expect(r.json.projeto.caminho).toBe(join(root, "workspaces", r.json.projeto.id));
    cloneOk = false;
    expect((await attach({ nome: "Falha", url: "https://github.com/a/c.git" })).status).toBe(502);
    expect((await call("GET", "/projects")).json.projects).toHaveLength(1);
  });
  it("refuses bad input without cloning", async () => {
    for (const b of [
      { nome: "x", url: "file:///etc" }, { nome: "x", url: "--upload-pack=x" }, { nome: "x", url: "ext::sh -c x" },
      { nome: "x", pasta: "relative" }, { nome: "x", pasta: join(root, "nope") }, { nome: "x" },
      { nome: "x", url: "https://h.io/a", pasta: project }, { url: "https://h.io/a" },
      { nome: "x", pasta: project, clickupListUrl: "https://evil.com/x" }, { nome: "x", pasta: project, clickupListUrl: "http://app.clickup.com/x" },
    ]) expect((await attach(b)).status, JSON.stringify(b)).toBe(400);
    expect(cloned).toEqual([]);
    expect((await call("GET", "/projects")).json.projects).toEqual([]);
  });
  it("ambiguous names answer 409 with candidates and never pick", async () => {
    await attach({ nome: "Dup", pasta: project });
    await attach({ nome: "dup", pasta: project });
    const r = await call("GET", "/projects/resolve?q=DUP");
    expect(r.status).toBe(409);
    expect(r.json.candidatos).toHaveLength(2);
    const m = await call("POST", "/missions", { project: "DUP", demanda: "x", confirmarUso: true });
    expect(m.status).toBe(409);
    expect(m.json.candidatos).toHaveLength(2);
    expect((await call("GET", "/missions")).json.missions).toEqual([]);
    expect((await call("GET", "/projects/resolve?q=zzz")).status).toBe(404);
  });
  it("resolve returns capped notes and the latest mission to resume", async () => {
    const r = await attach({ nome: "Retomar", pasta: project });
    mkdirSync(join(project, ".claude"), { recursive: true });
    writeFileSync(join(project, ".claude/project-notes.md"), "# estado\nproximo passo: X");
    const m = await call("POST", "/missions", { project: "retomar", demanda: "go", confirmarUso: true });
    await until(m.json.id, "aguardando-aprovacao");
    const res = await call("GET", "/projects/resolve?q=Retomar");
    expect(res.status).toBe(200);
    expect(res.json.projeto.id).toBe(r.json.projeto.id);
    expect(res.json.notes).toContain("proximo passo: X");
    expect(res.json.lastMission.id).toBe(m.json.id);
    expect(prompts[0]).toContain("proximo passo: X"); // notes reach the phase 1 prompt
    expect(prompts[0]).toContain(join(missionsDir, m.json.id, "out"));
    expect(prompts[0]).toContain("go");
  });
  it("DELETE removes only the record, never the folder", async () => {
    const r = await attach({ nome: "Del", pasta: project });
    writeFileSync(join(project, "keep.txt"), "x");
    expect((await call("DELETE", `/projects/${r.json.projeto.id}`)).status).toBe(200);
    expect(existsSync(join(project, "keep.txt"))).toBe(true);
    expect((await call("GET", "/projects")).json.projects).toEqual([]);
    expect((await call("DELETE", `/projects/${r.json.projeto.id}`)).status).toBe(404);
    expect((await call("DELETE", "/projects/..%2Fx")).status).toBe(400);
    expect((await call("DELETE", "/projects/ABC")).status).toBe(400);
  });
  it("refuses a url attach when no workspaces dir is configured", async () => {
    await srv.close();
    srv = createServer({ runner, store: createStore(missionsDir), clock, host: "127.0.0.1", projects: {} });
    port = await srv.listen(0);
    expect((await attach({ nome: "x", url: "https://h.io/a" })).status).toBe(501);
  });
});

describe("project commands (spec 024)", () => {
  let seen: (string[] | undefined)[];
  const attach = (b: object) => call("POST", "/projects", b);
  const spy = (o: RunOpts) => { if (o.phase === 2) seen.push(o.testCommands); return runner(o); };
  beforeEach(async () => {
    seen = [];
    srv = createServer({ runner: spy, store: createStore(missionsDir), clock, host: "127.0.0.1", registry: createProjectsStore(join(root, "projects.json")) });
    port = await srv.listen(0);
  });
  const approved = async (id: string) => { await until(id, "aguardando-aprovacao"); await call("POST", `/missions/${id}/approve`, {}); await until(id, "concluida"); };

  it("accepts valid comandos on attach, refuses injection, defaults to []", async () => {
    expect((await attach({ nome: "A", pasta: project })).json.projeto.comandos).toEqual([]);
    const ok = await attach({ nome: "B", pasta: project, comandos: ["npm test", "npx tsc --noEmit"] });
    expect(ok.json.projeto.comandos).toEqual(["npm test", "npx tsc --noEmit"]);
    for (const c of ["npm test; rm -rf /", "npm test && ls", "rm -rf x", "npm test $(id)"])
      expect((await attach({ nome: "C", pasta: project, comandos: [c] })).status, c).toBe(400);
    expect((await call("GET", "/projects")).json.projects).toHaveLength(2);
  });
  it("PATCH /projects/:id/comandos replaces the list, validates and 404s", async () => {
    const id = (await attach({ nome: "P", pasta: project })).json.projeto.id;
    const r = await call("PATCH", `/projects/${id}/comandos`, { comandos: ["npm test", "npm test"] });
    expect(r.status).toBe(200);
    expect(r.json.projeto.comandos).toEqual(["npm test"]);
    expect((await call("GET", "/projects")).json.projects[0].comandos).toEqual(["npm test"]);
    expect((await call("PATCH", `/projects/${id}/comandos`, { comandos: ["curl x"] })).status).toBe(400);
    const abs = await call("PATCH", `/projects/${id}/comandos`, { comandos: ["npm test /etc/passwd"] });
    expect(abs.status).toBe(400);
    expect(abs.json.error).toMatch(/"npm test \/etc\/passwd".*"\/etc\/passwd" é caminho absoluto/); // names the command and the argument
    expect((await call("PATCH", `/projects/${id}/comandos`, {})).status).toBe(400);
    expect((await call("GET", "/projects")).json.projects[0].comandos).toEqual(["npm test"]);
    expect((await call("PATCH", "/projects/nope/comandos", { comandos: [] })).status).toBe(404);
    expect((await call("PATCH", "/projects/..%2Fx/comandos", { comandos: [] })).status).toBe(400);
  });
  it("GET sugestoes only reads files, no generic fallback", async () => {
    const id = (await attach({ nome: "S", pasta: project })).json.projeto.id;
    const get = async () => (await call("GET", `/projects/${id}/sugestoes`)).json;
    const base = await get();
    expect(base.sugestoes).toEqual([]);
    expect(base.mensagem).toMatch(/Não encontrei/);
    const marker = join(project, "pwned");
    writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { test: "x", lint: `touch ${marker}`, build: "x", postinstall: "touch " + marker } }));
    expect((await get()).sugestoes.map((s: any) => s.comando)).toEqual(["npm test", "npm run lint", "npm run build"]);
    expect(existsSync(marker)).toBe(false);
    writeFileSync(join(project, "package.json"), "{not json");
    expect((await get()).sugestoes).toEqual([]);
    writeFileSync(join(project, "package.json"), " ".repeat(300_000));
    expect((await get()).sugestoes).toEqual([]);
    rmSync(join(project, "package.json"));
    writeFileSync(join(project, "go.mod"), "module x");
    expect((await get()).sugestoes).toEqual([{ comando: "go test ./...", motivo: "go.mod" }]);
    rmSync(join(project, "go.mod"));
    const alvo = join(project, "..", "alvo-fora.mod");
    writeFileSync(alvo, "x");
    symlinkSync(alvo, join(project, "go.mod"));
    expect((await get()).sugestoes).toEqual([]);
    expect((await call("GET", "/projects/nope/sugestoes")).status).toBe(404);
  });
  it("GET subida lists informative steps only", async () => {
    const id = (await attach({ nome: "Sub", pasta: project })).json.projeto.id;
    expect((await call("GET", `/projects/${id}/subida`)).json).toEqual({ passos: [] });
    writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    writeFileSync(join(project, "docker-compose.infra.yml"), "");
    writeFileSync(join(project, ".air.toml"), "");
    const r = (await call("GET", `/projects/${id}/subida`)).json;
    expect(r.passos.map((p: any) => p.comando)).toEqual(["docker compose -f docker-compose.infra.yml up -d --build", "npm run dev", "air -c .air.toml"]);
    expect((await call("GET", "/projects/nope/subida")).status).toBe(404);
  });
  it("phase 2 receives the project's commands", async () => {
    await attach({ nome: "Cmd", pasta: project, comandos: ["npm test"] });
    await approved(await (async () => (await call("POST", "/missions", { project: "cmd", demanda: "x", confirmarUso: true })).json.id)());
    expect(seen).toEqual([["npm test"]]);
  });
  it("without commands phase 2 gets none and a warning goes out on SSE", async () => {
    await attach({ nome: "Nada", pasta: project });
    const got: string[] = [];
    const r = request({ host: "127.0.0.1", port, path: "/events" }, (res) => { res.setEncoding("utf8"); res.on("data", (c: string) => got.push(c)); });
    r.on("error", () => undefined);
    r.end();
    await new Promise((x) => setTimeout(x, 50));
    await approved((await call("POST", "/missions", { project: "nada", demanda: "x", confirmarUso: true })).json.id);
    r.destroy();
    expect(seen).toEqual([[]]);
    expect(got.join("")).toContain("event: warning");
    expect(got.join("")).toContain("sem comandos de teste configurados");
  });
});
