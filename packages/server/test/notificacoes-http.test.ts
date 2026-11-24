import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { transition } from "@lab/core/src/mission.ts";
import { createServer } from "../src/http.ts";
import { createStore } from "../src/store.ts";
import type { RunOpts } from "../src/runner.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const clock = () => new Date(2026, 0, 5, 12, 0, 0);
let root: string, srv: ReturnType<typeof createServer>, port: number, sp: string[][];

const runner = async (o: RunOpts) => {
  const d = join(o.missionsDir, o.mission.id, "out/prd");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "a.prd.md"), "# PRD");
  return { mission: transition(o.mission, "aguardando-aprovacao", { now: o.now }), unknownLines: 0, tokensByAgent: {}, subagentTypes: {}, costByModel: {}, denials: [] } as any;
};
async function boot(hubDir: string | null = join(root, "hub")) {
  srv = createServer({ runner, store: createStore(join(root, "missions")), clock, projects: { proj: join(root, "proj") }, host: "127.0.0.1", ...(hubDir !== null ? { hubDir } : {}), notificacoes: { spawn: (_f, a) => { sp.push(a); }, achar: () => "/bin/notify-send", every: () => () => {} } });
  port = await srv.listen(0);
}
function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const h: Record<string, string> = { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers };
    const r = request({ host: "127.0.0.1", port, method, path, headers: h }, (res) => {
      let t = ""; res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode!, json: (() => { try { return JSON.parse(t); } catch { return undefined; } })() }));
    });
    r.on("error", reject); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
beforeEach(() => { mkdirSync(SCRATCH, { recursive: true }); root = mkdtempSync(join(SCRATCH, "nhttp-")); mkdirSync(join(root, "proj")); sp = []; });
afterEach(async () => { await srv.close(); rmSync(root, { recursive: true, force: true }); });

describe("/notificacoes", () => {
  it("lists the boot notice, mission mapping arrives, read/clear/config round trip", async () => {
    await boot();
    expect((await call("GET", "/notificacoes")).json.notificacoes[0]).toMatchObject({ categoria: "sistema", titulo: "Salão no ar" });
    const id = (await call("POST", "/missions", { project: "proj", demanda: "build it", confirmarUso: true })).json.id;
    let l: any;
    for (let i = 0; i < 100; i++) { l = (await call("GET", "/notificacoes")).json; if (l.notificacoes.some((n: any) => n.titulo === "Missão aguarda o seu selo")) break; await new Promise((r) => setTimeout(r, 25)); }
    const n = l.notificacoes.find((x: any) => x.titulo === "Missão aguarda o seu selo");
    expect(n).toMatchObject({ link: `#/missao/${id}`, nivel: "aviso", categoria: "missao", lida: false });
    for (let i = 0; i < 100 && !sp.some((a) => a.at(-2) === "Missão aguarda o seu selo"); i++) await new Promise((r) => setTimeout(r, 25)); // queued behind the boot toast
    expect(sp.some((a) => a.at(-2) === "Missão aguarda o seu selo")).toBe(true);
    const unread = l.naoLidas;
    expect((await call("POST", "/notificacoes/lidas", { ids: [n.id] })).status).toBe(200);
    expect((await call("GET", "/notificacoes")).json.naoLidas).toBe(unread - 1);
    expect((await call("GET", `/notificacoes?desde=${encodeURIComponent("2999-01-01T00:00:00Z")}`)).json.notificacoes).toEqual([]);
    expect((await call("POST", "/notificacoes/lidas", { todas: true })).status).toBe(200);
    expect((await call("GET", "/notificacoes")).json.naoLidas).toBe(0);
    expect((await call("PUT", "/notificacoes/config", { silencio: { ativo: true, inicio: "22:00", fim: "06:00" } })).json.silencio.ativo).toBe(true);
    expect((await call("GET", "/notificacoes/config")).json.silencio).toEqual({ ativo: true, inicio: "22:00", fim: "06:00" });
    expect((await call("DELETE", "/notificacoes")).status).toBe(200);
    expect((await call("GET", "/notificacoes")).json.notificacoes).toEqual([]);
  });
  it("validates input", async () => {
    await boot();
    expect((await call("GET", "/notificacoes?desde=lixo")).status).toBe(400);
    expect((await call("POST", "/notificacoes/lidas", {})).status).toBe(400);
    expect((await call("POST", "/notificacoes/lidas", { ids: [1] })).status).toBe(400);
    expect((await call("PUT", "/notificacoes/config", { silencio: { inicio: "99:99" } })).status).toBe(400);
    expect((await call("PUT", "/notificacoes/config", { categorias: { x: true } })).status).toBe(400);
    expect((await call("PUT", "/notificacoes/config", { extra: 1 })).status).toBe(400);
    expect((await call("PATCH", "/notificacoes")).status).toBe(405);
    expect((await call("GET", "/notificacoes/xpto")).status).toBe(404);
    expect((await call("PUT", "/notificacoes/config", "x" as any)).status).toBe(400);
  });
  it("rejects a foreign Host or Origin on every route", async () => {
    await boot();
    for (const [m, p] of [["GET", "/notificacoes"], ["DELETE", "/notificacoes"], ["POST", "/notificacoes/lidas"], ["PUT", "/notificacoes/config"]] as const) {
      expect((await call(m, p, m === "GET" || m === "DELETE" ? undefined : {}, { host: "evil.example:80" })).status).toBe(403);
      expect((await call(m, p, m === "GET" || m === "DELETE" ? undefined : {}, { origin: "https://evil.example" })).status).toBe(403);
    }
    expect((await call("GET", "/notificacoes", undefined, { origin: `http://localhost:${port}` })).status).toBe(200);
  });
  it("is 501 without a hub dir", async () => {
    await boot(null);
    expect((await call("GET", "/notificacoes")).status).toBe(501);
  });
});
