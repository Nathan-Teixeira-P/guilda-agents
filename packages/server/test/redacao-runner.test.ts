import { spawn as realSpawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newMission, transition, type Mission } from "@lab/core/src/mission.ts";
import { createServer } from "../src/http.ts";
import { promptFase1Redacao, promptFase2Redacao } from "../src/prompt-redacao.ts";
import { createRedacaoStore, type RedacaoStore } from "../src/redacao-store.ts";
import { buildArgs, runPhase, type RunOpts, type SpawnFn } from "../src/runner.ts";
import { createStore } from "../src/store.ts";
import { createUsageSource, type UsageSource } from "../src/usage-source.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const fixture = new URL("../../../tests/fixtures/stream-basic.jsonl", import.meta.url).pathname; // replays 14% (5h)
const fake = new URL("./fake-agent.mjs", import.meta.url).pathname;
const RESET5 = 1795243200;
const RESET7 = 1795762800;
const clock = () => new Date((RESET5 - 3600) * 1000);
const now = clock;

let root: string, hub: string, rs: RedacaoStore, srv: ReturnType<typeof createServer>, port: number, usage: UsageSource;
let calls: { args: string[]; cwd: string }[];
let efeito: (phase: 1 | 2, cwd: string) => void; // what the "agent" leaves in the article folder
let modo = "";
const spawn: SpawnFn = (_f, args, o) => {
  calls.push({ args, cwd: o.cwd });
  efeito(args.includes("--resume") ? 2 : 1, o.cwd);
  return realSpawn(process.execPath, [fake, fixture, modo], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });
};
const escrever = (cwd: string, f: string, t = "x") => writeFileSync(join(cwd, f), t);
const feed = (c: number) => usage.alimentar({ fiveHour: { utilization: c, resetsAt: RESET5, status: "allowed" }, sevenDay: { utilization: 0.1, resetsAt: RESET7, status: "allowed" } });

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
const esperar = async (slug: string, estado: string) => {
  for (let i = 0; i < 200; i++) {
    const j = (await call("GET", `/redacao/${slug}`)).json;
    if (j.estado === estado) return j.artigo as Mission;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`article never reached ${estado}`);
};
const criar = async (extra: object = {}) => (await call("POST", "/redacao", { modo: "definido", tema: "Agentes de IA", tetoPp: 50, ...extra })).json.artigo as Mission;

beforeEach(async () => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "rr-"));
  hub = root;
  calls = [];
  modo = "";
  efeito = (phase, cwd) => {
    if (phase === 1) { escrever(cwd, "pesquisa.md"); escrever(cwd, "checagem.md", "ok"); escrever(cwd, "rascunho.md", "# rascunho"); }
    else { escrever(cwd, "final.md"); escrever(cwd, "capa.svg", "<svg/>"); escrever(cwd, "capa.png", "png"); }
  };
  usage = createUsageSource({ clock });
  feed(0.03);
  rs = createRedacaoStore(join(root, "redacao"));
  srv = createServer({ runner: (o: RunOpts) => runPhase(o, { spawn }), store: createStore(join(root, "missions")), clock, host: "127.0.0.1", redacao: rs, usage });
  port = await srv.listen(0);
});
afterEach(async () => { await srv.close(); });

describe("buildArgs (article)", () => {
  const dir = "/hub/redacao/tema";
  const m = (sessionId?: string): Mission => ({ ...transition(newMission("tema", "redacao", now), "planejando", { now }), kind: "redacao", ...(sessionId ? { sessionId } : {}) });
  const base = (phase: 1 | 2, leitura: string[] = []): RunOpts => ({ phase, mission: m(phase === 2 ? "sid" : undefined), projectDir: dir, missionsDir: "/hub/redacao", prompt: "go", now, redacao: { hubDir: "/hub", leitura } });
  const split = (a: string[]) => ({ allow: a.slice(a.indexOf("--allowedTools") + 1, a.indexOf("--disallowedTools")), deny: a.slice(a.indexOf("--disallowedTools") + 1) });

  it("phase 1: web for research, writes only in the folder, no Bash at all", () => {
    const { allow, deny } = split(buildArgs(base(1), "s"));
    expect(allow).toEqual(expect.arrayContaining(["Glob", "Grep", `Read(/${dir}/**)`, `Edit(/${dir}/**)`, "WebSearch", "WebFetch"]));
    expect(allow.some((x) => x.startsWith("Bash"))).toBe(false);
    expect(deny).toContain("Bash");
    expect(deny).toEqual(expect.arrayContaining([`Edit(/${dir}/approved)`, `Edit(/${dir}/artigo.json)`])); // the seal cannot be forged
  });
  it("phase 2: Bash only for the exact render-cover command, no web, no git", () => {
    const args = buildArgs(base(2), "s");
    const { allow, deny } = split(args);
    expect(allow.filter((x) => x.startsWith("Bash"))).toEqual(["Bash(/hub/scripts/render-cover.sh capa.svg capa.png)"]);
    expect(allow).not.toContain("WebSearch");
    expect(deny).toEqual(expect.arrayContaining(["Bash(git:*)", "WebFetch", "WebSearch"]));
    expect(args[args.indexOf("--resume") + 1]).toBe("sid");
    expect(args.join(" ")).not.toContain("bypassPermissions");
  });
  it("local references are read-only: add-dir and Read rules, never an Edit rule", () => {
    const args = buildArgs(base(1, ["/etc"]), "s");
    expect(args[args.indexOf("--add-dir") + 1]).toBe("/etc");
    const { allow } = split(args);
    expect(allow).toContain("Read(//etc/**)");
    expect(allow.filter((x) => x.startsWith("Edit"))).toEqual([`Edit(/${dir}/**)`]);
  });
  it("rejects an unsafe hub path", () => {
    expect(() => buildArgs({ ...base(2), redacao: { hubDir: "/hub/a*b", leitura: [] } }, "s")).toThrow();
  });
  it("prompts end with the never-publish rule and tell the illustrator the exact command", () => {
    const i = { pedido: { modo: "definido" as const, tema: "T", palavras: 800, referencias: [], idioma: "pt-BR" }, dir, hub: "/hub", comentario: "mais curto" };
    expect(promptFase1Redacao(i)).toMatch(/mais curto/);
    expect(promptFase1Redacao(i).endsWith("Nunca publique, agende nem envie o artigo: apenas grave os arquivos na pasta do artigo.")).toBe(true);
    expect(promptFase2Redacao(i)).toContain("/hub/scripts/render-cover.sh capa.svg capa.png");
  });
});

describe("gate", () => {
  it("phase 2 refuses to start without a valid seal (and spawns nothing)", async () => {
    const dir = join(root, "redacao", "t");
    mkdirSync(dir, { recursive: true });
    const m: Mission = { ...transition(transition(newMission("t", "redacao", now), "planejando", { now }), "aguardando-aprovacao", { now }), kind: "redacao", sessionId: "sid" };
    const o: RunOpts = { phase: 2, mission: m, projectDir: dir, missionsDir: join(root, "redacao"), prompt: "go", now, redacao: { hubDir: hub, leitura: [] } };
    await expect(runPhase(o, { spawn })).rejects.toThrow(/approval gate/);
    writeFileSync(join(dir, "approved"), "{}"); // invalid seal
    await expect(runPhase(o, { spawn })).rejects.toThrow(/approval gate/);
    expect(calls).toHaveLength(0);
  });
  it("resuming an execution without the seal is refused over HTTP", async () => {
    const a = await criar();
    await esperar(a.id, "em-revisao");
    const dir = join(root, "redacao", a.id);
    const cur = rs.ler(a.id)!;
    rs.salvar({ ...transition(transition(cur, "executando", { now, approved: true }), "pausada", { now, reason: "teste" }) });
    const r = await call("POST", `/redacao/${a.id}/retomar`, {});
    expect(r.status).toBe(409);
    expect(existsSync(join(dir, "approved"))).toBe(false);
    expect(calls).toHaveLength(1); // only the phase 1 run
  });
});

describe("flow", () => {
  it("phase 1 -> review (version recorded) -> approve -> phase 2 -> approved, all in the article folder", async () => {
    const a = await criar();
    expect(a.stage).toBe("planejando");
    const rev = await esperar(a.id, "em-revisao");
    expect(rev["versoes"]).toEqual([{ versao: 1, arquivo: "versoes/rascunho-1.md", atual: true }]);
    expect(calls[0]!.cwd).toBe(join(root, "redacao", a.id));
    expect((await call("POST", `/redacao/${a.id}/aprovar`, {})).status).toBe(200);
    const fin = await esperar(a.id, "aprovado");
    expect(fin["erroCapa"]).toBeUndefined();
    expect(existsSync(join(root, "redacao", a.id, "approved"))).toBe(true);
    expect(calls[1]!.args).toContain("--resume");
  });
  it("a failed render keeps capa.svg and reports a clear error", async () => {
    efeito = (phase, cwd) => {
      if (phase === 1) { escrever(cwd, "checagem.md"); escrever(cwd, "rascunho.md"); }
      else { escrever(cwd, "final.md"); escrever(cwd, "capa.svg", "<svg/>"); }
    };
    const a = await criar();
    await esperar(a.id, "em-revisao");
    await call("POST", `/redacao/${a.id}/aprovar`, {});
    const fin = await esperar(a.id, "aprovado");
    expect(fin["erroCapa"]).toMatch(/render-cover\.sh falhou.*capa\.svg foi mantido/);
    expect(existsSync(join(root, "redacao", a.id, "capa.svg"))).toBe(true);
  });
  it("no reliable sources: the article does not advance and says why", async () => {
    efeito = (_p, cwd) => escrever(cwd, "checagem.md", "SEM FONTES CONFIÁVEIS\nnada achado");
    const a = await criar();
    const m = await esperar(a.id, "pausado");
    expect(m.pauseReason).toMatch(/sem fontes confiáveis/);
    expect(m["versoes"]).toEqual([]);
  });
  it("the 4th version prunes the oldest and never the current one", async () => {
    const a = await criar();
    await esperar(a.id, "em-revisao");
    for (let i = 0; i < 3; i++) {
      await call("POST", `/redacao/${a.id}/ajustes`, { comentario: `ajuste ${i}` });
      for (let t = 0; t < 200 && calls.length < i + 2; t++) await new Promise((r) => setTimeout(r, 10));
      await esperar(a.id, "em-revisao");
    }
    const m = rs.ler(a.id)!;
    expect((m["versoes"] as any[]).map((v) => v.versao)).toEqual([4, 3, 2]);
    expect(readdirSync(join(root, "redacao", a.id, "versoes")).sort()).toEqual(["rascunho-2.md", "rascunho-3.md", "rascunho-4.md"]);
    expect(calls[1]!.args).not.toContain("--resume"); // adjustments restart phase 1 with a new session
    expect(calls[1]!.args[calls[1]!.args.indexOf("-p") + 1]).toContain("ajuste 0");
  });
});

describe("usage", () => {
  it("?estimar=1 returns the estimate and starts nothing", async () => {
    const r = await call("POST", "/redacao?estimar=1", { modo: "definido", tema: "X" });
    expect(r.status).toBe(200);
    expect(r.json.estimativa).toMatchObject({ livre: { ok: true }, tetoPp: null, tetoSemanaPp: null, uso: { estado: "ok", cincoHoras: { percentual: 3 } } });
    expect(calls).toHaveLength(0);
    expect(rs.listar()).toEqual([]);
  });
  it("409 above the threshold without confirmation; nothing is created", async () => {
    feed(0.85);
    const r = await call("POST", "/redacao", { modo: "definido", tema: "X" });
    expect(r.status).toBe(409);
    expect(r.json.motivo).toMatch(/5 horas/);
    expect(rs.listar()).toEqual([]);
  });
  it("pauses with a Portuguese reason when the plan cap is reached", async () => {
    const a = await criar({ tetoPp: 10 }); // the replayed stream goes from 3% to 14%
    const m = await esperar(a.id, "pausado");
    expect(m.pauseReason).toBe("teto de uso do plano: consumiu 11 pp de 10 pp (5 h)");
  });
});

describe("cancel and resume", () => {
  it("cancel kills the running child; a paused phase 1 resumes with a fresh session", async () => {
    modo = "hang";
    const a = await criar();
    for (let t = 0; t < 200 && calls.length < 1; t++) await new Promise((r) => setTimeout(r, 10));
    const r = await call("POST", `/redacao/${a.id}/cancelar`, {});
    expect(r.json.estado).toBe("cancelado");
    modo = "";
    expect((await call("POST", `/redacao/${a.id}/reabrir`, {})).json.estado).toBe("rascunho");
    await esperar(a.id, "em-revisao");
    efeito = (_p, cwd) => escrever(cwd, "checagem.md", "SEM FONTES CONFIÁVEIS");
    await call("POST", `/redacao/${a.id}/ajustes`, { comentario: "outra vez" });
    await esperar(a.id, "pausado");
    efeito = (phase, cwd) => { escrever(cwd, "checagem.md"); escrever(cwd, "rascunho.md"); };
    expect((await call("POST", `/redacao/${a.id}/retomar`, {})).status).toBe(202);
    await esperar(a.id, "em-revisao");
  });
});

describe("suggestions run and recovery", () => {
  const fonte = { url: "https://x.test", acessadoEm: "2026-11-21T10:00:00Z" };
  const sug = (cwd: string, dados: unknown) => escrever(cwd, "sugestoes.json", JSON.stringify(dados));

  it("runs only the suggestions prompt, validates, stores and exposes the themes", async () => {
    efeito = (_p, cwd) => sug(cwd, [{ tema: "B", motivo: "m", fontes: [fonte], rank: 2 }, { tema: "A", motivo: "m", fontes: [fonte], rank: 1 }]);
    const a = (await call("POST", "/redacao", { modo: "sugerir", tetoPp: 50 })).json.artigo as Mission;
    await esperar(a.id, "aprovado");
    expect(calls).toHaveLength(1);
    const args = calls[0]!.args;
    expect(args[1]).toContain("Sugerir temas de artigo");
    expect(args[1]).not.toContain("rascunho.md");
    expect(args.slice(args.indexOf("--allowedTools"))).not.toContain("Bash(");
    expect(args[args.indexOf("--disallowedTools") + 1]).toBe("Bash");
    expect((await call("GET", `/redacao/sugestoes/${a.id}`)).json.sugestoes.map((s: any) => s.tema)).toEqual(["A", "B"]);
    expect((await call("GET", `/redacao/${a.id}`)).json.sugestoes).toHaveLength(2);
    expect(rs.lerSugestoes(a.id)).toHaveLength(2);
    expect((await call("POST", `/redacao/sugestoes/${a.id}/escolher`, { indice: 0 })).json.artigo).toMatchObject({ tema: "A" });
  });
  it("invalid, empty or missing suggestions end in a clear error and never advance", async () => {
    for (const efs of [(c: string) => sug(c, [{ tema: "X", motivo: "m", fontes: [], rank: 1 }]), (c: string) => sug(c, []), () => {}]) {
      efeito = (_p, cwd) => efs(cwd);
      const a = (await call("POST", "/redacao", { modo: "sugerir", tetoPp: 50 })).json.artigo as Mission;
      const m = await esperar(a.id, "cancelado");
      expect(String(m["stopReason"])).toMatch(/sugestões inválidas/);
      expect(rs.lerSugestoes(a.id) ?? []).toEqual([]);
    }
  });
  it("same usage rules: blocked without confirmation (409), nothing spawned", async () => {
    feed(0.95);
    const r = await call("POST", "/redacao", { modo: "sugerir", tetoPp: 50 });
    expect(r.status).toBe(409);
    expect(calls).toHaveLength(0);
    expect(rs.listar()).toEqual([]);
  });
  it("on start, running articles become pausada and are resumable", async () => {
    const m = transition(newMission("preso", "redacao", now), "planejando", { now });
    rs.salvar({ ...m, kind: "redacao", tema: "Preso", pedido: { modo: "definido", tema: "Preso", palavras: 800, referencias: [], idioma: "pt-BR" } } as Mission);
    expect(rs.recover(now)).toEqual(["preso"]);
    const p = rs.ler("preso")!;
    expect(p).toMatchObject({ stage: "pausada", pauseReason: "servidor reiniciou durante a execução", pausedFrom: "planejando" });
    const r = await call("POST", "/redacao/preso/retomar", {});
    expect(r.status).toBe(202);
    await esperar("preso", "em-revisao");
  });
});
