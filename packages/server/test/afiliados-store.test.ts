import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/http.ts";
import { createProjectsStore } from "../src/projects-store.ts";
import { createStore } from "../src/store.ts";

// Fixtures only, in a temp dir: the real afiliados project is never touched.
const JID1 = "120363000000000001@g.us";
const JID2 = "120363000000000002@g.us";
const SEGREDO = "SUPER-SECRET-TOKEN-xyz";
const nicho = (key: string, groupJid: string, extra: object = {}) => ({ key, label: key.toUpperCase(), groupJid, instance: "inst", ml: { keywords: ["k"] }, cronSlots: ["0 9 * * *"], ...extra });
let n = 0;
const clock = () => new Date(Date.UTC(2026, 10, 21, 12, 0, 0, n++));

let root: string, hub: string, af: string, srv: ReturnType<typeof createServer>, port: number, logs: string[];
const nichesPath = () => join(af, "config", "niches.json");

const call = (method: string, path: string, body?: object) =>
  new Promise<{ status: number; headers: Record<string, any>; text: string; json: any }>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: body ? { "content-type": "application/json" } : {} }, (res) => {
      const cs: Buffer[] = [];
      res.on("data", (c) => cs.push(c));
      res.on("end", () => {
        const text = Buffer.concat(cs).toString("utf8");
        let json: any;
        try { json = JSON.parse(text); } catch { /* none */ }
        resolve({ status: res.statusCode!, headers: res.headers, text, json });
      });
    });
    r.on("error", reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });

async function boot(registrar: boolean) {
  const registry = createProjectsStore();
  if (registrar) registry.add({ id: "afiliados", nome: "afiliados", apelidos: [], comandos: [], origem: { tipo: "pasta", valor: af }, caminho: af, criadoEm: "2026-11-21T00:00:00Z" });
  srv = createServer({ runner: async () => { throw new Error("x"); }, store: createStore(join(root, "missions")), registry, clock, host: "127.0.0.1", hubDir: hub });
  port = await srv.listen(0);
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "afil-"));
  hub = join(root, "hub");
  af = join(root, "afiliados");
  mkdirSync(hub);
  mkdirSync(join(af, "config"), { recursive: true });
  writeFileSync(nichesPath(), JSON.stringify([nicho("tech", JID1), nicho("casa", JID2)], null, 2));
  logs = [];
  for (const k of ["log", "error", "warn", "info"] as const) (console as any)[k] = (...a: unknown[]) => logs.push(a.join(" "));
  await boot(true);
});
afterEach(async () => { await srv.close(); });

const carregar = async () => (await call("GET", "/afiliados/nichos")).json;
const put = async (nichos: unknown[], ref?: { hash: string; mtimeMs: number }) => {
  const c = ref ?? (await carregar());
  return call("PUT", "/afiliados/nichos", { nichos, hash: c.hash, mtimeMs: c.mtimeMs });
};

describe("nichos", () => {
  it("never returns the full jid by default; reveal is explicit", async () => {
    const r = await call("GET", "/afiliados/nichos");
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(JID1);
    expect(r.text).not.toContain("120363000000000001");
    expect(r.json.nichos[0].groupJid).toBe("1203…@g.us");
    expect(r.json.hash).toMatch(/^[0-9a-f]{64}$/);
    const j = await call("GET", "/afiliados/nichos/tech/jid");
    expect(j.json.groupJid).toBe(JID1);
    expect((await call("GET", "/afiliados/nichos/nada/jid")).status).toBe(404);
    expect(logs.join("\n")).not.toContain("1203630");
  });

  it("writes with backup, atomically, keeping the original jid when masked comes back", async () => {
    const c = await carregar();
    const edit = c.nichos.map((x: any) => (x.key === "tech" ? { ...x, label: "Novo" } : x));
    const r = await put(edit, c);
    expect(r.status).toBe(200);
    expect(r.json.pendenteSync).toBe(true);
    expect(r.json.comandoSync).toBe("npm run niches:sync");
    expect(r.text).not.toContain(JID1);
    const disco = JSON.parse(readFileSync(nichesPath(), "utf8"));
    expect(disco.find((x: any) => x.key === "tech")).toMatchObject({ label: "Novo", groupJid: JID1 });
    expect(readdirSync(join(hub, "afiliados-backups"))).toHaveLength(1);
    expect(readdirSync(join(af, "config"))).toEqual(["niches.json"]); // no temp left behind
    expect(JSON.parse(readFileSync(join(hub, "afiliados-state.json"), "utf8")).pendenteSync).toBe(true);
    expect((await call("GET", "/afiliados/info")).json.pendenteSync).toBe(true);
    expect((await call("POST", "/afiliados/sincronizado", {})).json.pendenteSync).toBe(false);
    expect((await call("GET", "/afiliados/info")).json.pendenteSync).toBe(false);
  });

  it("accepts a new full jid and rejects invalid input without touching the file", async () => {
    const antes = readFileSync(nichesPath(), "utf8");
    const c = await carregar();
    const novo = await put([...c.nichos, nicho("pet", "120363000000000009@g.us")], c);
    expect(novo.status).toBe(200);
    const c2 = await carregar();
    const ruim = await put([nicho("x", "nao-e-jid")], c2);
    expect(ruim.status).toBe(400);
    const dup = await put([nicho("a", JID1), nicho("b", JID1)], c2);
    expect(dup.status).toBe(400);
    expect(dup.text).not.toContain(JID1);
    expect(readFileSync(nichesPath(), "utf8")).not.toBe(antes);
    expect(JSON.parse(readFileSync(nichesPath(), "utf8"))).toHaveLength(3);
  });

  it("refuses stale hash and stale mtime with 409", async () => {
    const c = await carregar();
    const edit = c.nichos;
    const h = await call("PUT", "/afiliados/nichos", { nichos: edit, hash: "0".repeat(64), mtimeMs: c.mtimeMs });
    expect(h.status).toBe(409);
    expect(h.json.recarregar).toBe(true);
    const m = await call("PUT", "/afiliados/nichos", { nichos: edit, hash: c.hash, mtimeMs: c.mtimeMs + 1000 });
    expect(m.status).toBe(409);
    // same content, touched file: mtime differs
    const t = new Date(Date.now() + 60_000);
    utimesSync(nichesPath(), t, t);
    expect((await put(edit, c)).status).toBe(409);
    expect(existsSync(join(hub, "afiliados-backups"))).toBe(false);
  });

  it("a failing backup leaves the original intact", async () => {
    writeFileSync(join(hub, "afiliados-backups"), "i am a file, mkdir fails");
    const antes = readFileSync(nichesPath(), "utf8");
    const c = await carregar();
    const r = await put(c.nichos.slice(0, 1).map((x: any) => ({ ...x, label: "Z" })), c);
    expect(r.status).toBe(500);
    expect(readFileSync(nichesPath(), "utf8")).toBe(antes);
    expect(readdirSync(join(af, "config"))).toEqual(["niches.json"]);
  });

  it("prunes backups to 10, lists and restores", async () => {
    for (let i = 0; i < 12; i++) {
      const c = await carregar();
      const r = await put(c.nichos.map((x: any) => ({ ...x, priority: i })), c);
      expect(r.status).toBe(200);
    }
    const b = (await call("GET", "/afiliados/backups")).json.backups;
    expect(b).toHaveLength(10);
    expect(readdirSync(join(hub, "afiliados-backups"))).toHaveLength(10);
    const alvo = b[0].id; // newest backup = state before the last write (priority 10)
    const r = await call("POST", `/afiliados/backups/${alvo}/restaurar`, {});
    expect(r.status).toBe(200);
    expect(JSON.parse(readFileSync(nichesPath(), "utf8"))[0].priority).toBe(10);
    expect((await call("GET", "/afiliados/backups")).json.backups).toHaveLength(10); // restore also backs up
    expect((await call("POST", "/afiliados/backups/..%2Fx/restaurar", {})).status).toBe(400);
    expect((await call("POST", "/afiliados/backups/2026-01-01T00-00-00-000Z/restaurar", {})).status).toBe(404);
  });
});

describe("info e relatorios", () => {
  it("reads only DRY_RUN and WA_MAX_PER_DAY from .env", async () => {
    writeFileSync(join(af, ".env"), `EVOLUTION_API_KEY=${SEGREDO}\nexport DRY_RUN="true"\nWA_MAX_PER_DAY=20 # x\nGROUP=${JID1}\nDRY_RUN_OTHER=${SEGREDO}\n`);
    const r = await call("GET", "/afiliados/info");
    expect(r.json).toEqual({ configurado: true, dryRun: true, waMaxPerDay: 20, comandoSync: "npm run niches:sync", pendenteSync: false });
    expect(r.text).not.toContain(SEGREDO);
    expect(JSON.stringify(logs)).not.toContain(SEGREDO);
    const antes = statSync(join(af, ".env")).mtimeMs;
    await call("GET", "/afiliados/info");
    expect(statSync(join(af, ".env")).mtimeMs).toBe(antes);
  });

  it("absent .env gives no values", async () => {
    const r = await call("GET", "/afiliados/info");
    expect(r.json.dryRun).toBeUndefined();
    expect(r.json.waMaxPerDay).toBeUndefined();
  });

  it("picks the latest report by filename date, tolerant frontmatter", async () => {
    const d = join(af, ".claude", "ops-reports");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "ops-2026-11-01.md"), "---\nstatus: antigo\n---\nvelho");
    writeFileSync(join(d, "ops-2026-11-20-b.md"), `---\ndata: 2026-11-20\nnichos: [tech, casa]\nstatus: ok\nachados:\n  - um ${JID1}\n  - dois\nlixo sem dois pontos\n---\n# Corpo ${JID1}\n`);
    writeFileSync(join(d, "deal-auditor-2026-10-01.md"), "---\nstatus: da\n---\nx");
    const r = (await call("GET", "/afiliados/relatorios/ops")).json;
    expect(r).toMatchObject({ existe: true, arquivo: "ops-2026-11-20-b.md", data: "2026-11-20", nichos: ["tech", "casa"], status: "ok" });
    expect(r.achados).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain(JID1);
    expect((await call("GET", "/afiliados/relatorios/deal-auditor")).json.status).toBe("da");
  });

  it("reads a report in the exact format written by afiliados `npm run ops:report`", async () => {
    const d = join(af, ".claude", "ops-reports");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "ops-2026-11-23.md"), "---\ndata: 2026-11-23\nnichos: [tech, casa]\nstatus: atencao\nachados:\n  - erro em casa: falha [id]\n  - casa: 1 oferta(s) aguardando link de afiliado\n---\n\n# Relatório ops 2026-11-23\n\nExecuções: 1\n");
    writeFileSync(join(d, "deal-auditor-2026-11-23.md"), "---\ndata: 2026-11-23\nnichos: []\nstatus: ok\nachados: []\n---\n\n# Auditoria\n");
    const r = (await call("GET", "/afiliados/relatorios/ops")).json;
    expect(r).toMatchObject({ existe: true, arquivo: "ops-2026-11-23.md", data: "2026-11-23", nichos: ["tech", "casa"], status: "atencao" });
    expect(r.achados).toEqual(["erro em casa: falha [id]", "casa: 1 oferta(s) aguardando link de afiliado"]);
    expect(r.corpo).toContain("Execuções: 1");
    const a = (await call("GET", "/afiliados/relatorios/deal-auditor")).json;
    expect(a).toMatchObject({ existe: true, nichos: [], status: "ok" });
  });

  it("broken frontmatter still returns the body; empty file or missing folder is existe:false", async () => {
    expect((await call("GET", "/afiliados/relatorios/ops")).json).toEqual({ configurado: true, existe: false });
    const d = join(af, ".claude", "ops-reports");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "ops-2026-11-20.md"), "");
    expect((await call("GET", "/afiliados/relatorios/ops")).json.existe).toBe(false);
    writeFileSync(join(d, "ops-2026-11-20.md"), "---\n: : :\nsem fechar\n");
    const r = (await call("GET", "/afiliados/relatorios/ops")).json;
    expect(r.existe).toBe(true);
    expect(r.corpo).toContain("sem fechar");
  });
});

describe("agenda e seguranca", () => {
  it("suggests an agenda with the pure core function", async () => {
    const r = await call("POST", "/afiliados/agenda/sugerir", { nichos: [{ key: "a", envios: 2 }, { key: "b", envios: 1 }] });
    expect(r.status).toBe(200);
    expect(r.json.slots).toHaveLength(3);
    expect((await call("POST", "/afiliados/agenda/sugerir", { nichos: [{ key: "a", envios: 1, horas: ["99:99"] }] })).status).toBe(400);
  });

  it("without a registered project answers configurado:false with instructions", async () => {
    await srv.close();
    await boot(false);
    for (const [m, p, b] of [["GET", "/afiliados/nichos"], ["GET", "/afiliados/info"], ["GET", "/afiliados/relatorios/ops"], ["GET", "/afiliados/nichos/tech/jid"], ["POST", "/afiliados/sincronizado", {}]] as const) {
      const r = await call(m, p, b);
      expect(r.status).toBe(200);
      expect(r.json.configurado).toBe(false);
      expect(r.json.instrucao).toMatch(/afiliados/);
    }
    expect((await call("GET", "/afiliados/backups")).json).toMatchObject({ configurado: false, backups: [] });
  });

  it("no /afiliados route sends, executes or changes DRY_RUN", async () => {
    writeFileSync(join(af, ".env"), "DRY_RUN=true\n");
    const antes = readFileSync(join(af, ".env"), "utf8");
    for (const p of ["/afiliados/info", "/afiliados/enviar", "/afiliados/executar", "/afiliados/dry-run", "/afiliados/sync", "/afiliados/nichos/tech/enviar"]) {
      for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
        const r = await call(m, p, m === "DELETE" ? undefined : { dryRun: false });
        expect([404, 405], `${m} ${p} -> ${r.status}`).toContain(r.status);
      }
    }
    expect((await call("GET", "/afiliados/enviar")).status).toBe(404);
    expect((await call("PUT", "/afiliados/info", { dryRun: false })).status).toBe(405);
    expect(readFileSync(join(af, ".env"), "utf8")).toBe(antes);
    expect(readdirSync(af).sort()).toEqual([".env", "config"]);
  });
});
