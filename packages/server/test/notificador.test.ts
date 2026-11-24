import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotificador, emSilencio, limpar, NotifConfig, NotifConfigPut, type Notificacao, type SpawnDesktop } from "../src/notificador.ts";
import type { Mission } from "@lab/core/src/mission.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
let root: string, hub: string, af: string, t: number;
let pub: { ev: string; data: any }[], sp: { file: string; args: string[] }[];
const spawn: SpawnDesktop = (file, args) => { sp.push({ file, args }); };
const mk = (o: Partial<Parameters<typeof createNotificador>[0]> = {}) => createNotificador({ hubDir: hub, clock: () => new Date(t), publish: (ev, data) => pub.push({ ev, data }), afiliados: () => af, spawn, achar: () => "/usr/bin/notify-send", ...o });
const notifs = () => pub.filter((p) => p.ev === "notificacao").map((p) => p.data as Notificacao);
const m = (stage: string, extra: object = {}): Mission => ({ id: "m-1", project: "p", stage, costUsd: 0, loops: {}, handoffs: 0, createdAt: "x", updatedAt: "x", demanda: "Fazer a coisa\nlinha 2", ...extra }) as Mission;
const T0 = new Date(2026, 0, 5, 12, 0, 0).getTime(); // local noon: outside default quiet hours

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "notif-"));
  hub = join(root, "hub"); af = join(root, "af");
  mkdirSync(join(af, ".claude", "ops-reports"), { recursive: true });
  t = T0; pub = []; sp = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("missao", () => {
  it("maps each stage change, never the same stage twice, and skips the first planejando", () => {
    const n = mk();
    n.missao(m("planejando"));
    n.missao(m("aguardando-aprovacao")); n.missao(m("aguardando-aprovacao"));
    n.missao(m("pausada", { pauseReason: "disjuntor: 3 loops" }));
    n.missao(m("pausada", { pauseReason: "teto de 5 USD" })); // same stage: ignored
    n.missao(m("executando"));
    n.missao(m("pausada", { pauseReason: "teto de 5 USD" }));
    n.missao(m("concluida"));
    n.missao(m("parada", { stopReason: "runner error: boom" }));
    expect(notifs().map((x) => [x.titulo, x.nivel])).toEqual([
      ["Missão aguarda o seu selo", "aviso"], ["Disjuntor acionado", "erro"], ["Missão pausada", "aviso"], ["Missão concluída", "sucesso"], ["Missão parada", "erro"],
    ]);
    expect(notifs()[0]).toMatchObject({ categoria: "missao", link: "#/missao/m-1", origem: "missao:m-1", texto: "Fazer a coisa" });
  });
  it("a stop by the user is info, not an error", () => {
    const n = mk(); n.missao(m("executando")); t += 1; n.missao(m("parada", { stopReason: "stopped by user" }));
    expect(notifs().at(-1)).toMatchObject({ nivel: "info" });
  });
});

describe("redacao", () => {
  const a = (stage: string, extra: object = {}) => m(stage, { id: "art-1", pedido: { modo: "definido", tema: "Tema X" }, ...extra });
  it("review, approved (with cover), cover error, paused", () => {
    const n = mk();
    n.artigo(a("planejando")); n.artigo(a("aguardando-aprovacao")); n.artigo(a("executando"));
    n.artigo(a("concluida", { erroCapa: "render falhou" }), false);
    n.artigo(a("pausada", { pauseReason: "teto" }));
    expect(notifs().map((x) => x.titulo)).toEqual(["Rascunho em revisão", "Artigo aprovado", "A capa não foi gerada", "Artigo pausado"]);
    expect(notifs()[0]).toMatchObject({ link: "#/redacao/art-1", categoria: "redacao" });
  });
  it("cover ready is said in the approval; suggestions ready link to the list", () => {
    const n = mk();
    n.artigo(a("executando")); n.artigo(a("concluida"), true);
    n.artigo(m("concluida", { id: "sug-1", pedido: { modo: "sugerir" } }));
    expect(notifs().map((x) => x.texto)).toEqual(["Tema X. Capa pronta.", "Escolha um tema para começar o artigo."]);
    expect(notifs()[1]!.titulo).toBe("Sugestões de pauta prontas");
  });
});

describe("agente: throttle", () => {
  const start = (id: string, tipo: string) => ({ kind: "subagent-started" as const, agentId: id, subagentType: tipo });
  it("announces codename and role; max 1 per agent per 20 s; global cooldown", () => {
    const n = mk();
    n.progresso("m-1", start("a1", "coder"), "missao");
    expect(notifs()[0]).toMatchObject({ categoria: "agente", texto: "Agora: Ferreiro (Código) assumiu." });
    t += 1000; n.progresso("m-1", start("a2", "coder"), "missao"); // same agent, 1 s later
    t += 1000; n.progresso("m-1", start("a3", "tester"), "missao"); // other agent inside the global cooldown
    expect(notifs()).toHaveLength(1);
    t += 6000; n.progresso("m-1", start("a4", "tester"), "missao");
    expect(notifs()).toHaveLength(2);
    t += 20_000; n.progresso("m-1", start("a5", "coder"), "missao"); // allowed by the throttle but identical text inside 60 s: deduped
    expect(notifs()).toHaveLength(2);
    t += 40_000; n.progresso("m-1", start("a6", "coder"), "missao");
    expect(notifs()).toHaveLength(3);
  });
  it("a burst of 50 starts yields very few", () => {
    const n = mk();
    for (let i = 0; i < 50; i++) { t += 100; n.progresso("m-1", start(`x${i}`, i % 2 ? "coder" : "tester"), "missao"); }
    expect(notifs().length).toBeLessThanOrEqual(2);
  });
  it("a failed finish is a warning; a normal finish is silent", () => {
    const n = mk();
    n.progresso("m-1", start("a1", "coder"), "missao"); t += 30_000;
    n.progresso("m-1", { kind: "subagent-finished", agentId: "a1", status: "completed" }, "missao");
    expect(notifs()).toHaveLength(1);
    n.progresso("m-1", start("a2", "coder"), "missao");
    n.progresso("m-1", { kind: "subagent-finished", agentId: "a2", status: "failed" }, "missao");
    expect(notifs().at(-1)).toMatchObject({ nivel: "aviso", titulo: "Ferreiro terminou com erro" });
  });
});

describe("uso", () => {
  const v = (p: number, reset = 100) => ({ estado: "ok", cincoHoras: { percentual: p, reiniciaEm: reset }, semana: { percentual: 10, reiniciaEm: 999 } });
  it("80 and 95 once per window; a jump to 97 gives one; a new window notifies again", () => {
    const n = mk();
    n.uso(v(79)); n.uso(v(80)); n.uso(v(85)); n.uso(v(95)); n.uso(v(96));
    expect(notifs().map((x) => [x.titulo, x.nivel])).toEqual([["Janela de 5 horas em 80%", "aviso"], ["Janela de 5 horas em 95%", "erro"]]);
    n.uso(v(97, 200));
    expect(notifs()).toHaveLength(3);
    n.uso({ estado: "indisponivel" });
    expect(notifs()).toHaveLength(3);
  });
  it("survives a restart (state persisted)", () => {
    mk().uso(v(90)); const n2 = mk(); t += 120_000; n2.uso(v(91));
    expect(notifs()).toHaveLength(1);
  });
  it("auto refresh: failure once, pause by window once", () => {
    const n = mk();
    n.usoAuto({ erro: "boom" }); n.usoAuto({ erro: "boom" }); n.usoAuto({ motivo: "janela de 5h em 96% (acima de 94%)" }); n.usoAuto({ motivo: "aba oculta" });
    expect(notifs().map((x) => x.titulo)).toEqual(["Atualização automática do uso falhou", "Atualização automática do uso pausada"]);
  });
});

describe("local", () => {
  it("only on a state change; 'off' at boot is a baseline", () => {
    const n = mk();
    n.local("desligado", false); n.local("ligado", true); n.local("ligado", true); n.local("desligado", true);
    expect(notifs().map((x) => [x.titulo, x.nivel])).toEqual([["Modelo local ligado", "info"], ["Modelo local desligado", "aviso"]]);
  });
});

describe("dedup, persistence and cap", () => {
  it("drops identical notifications inside 60 s, accepts them after", () => {
    const n = mk();
    n.sistema("Oi", "x"); t += 30_000; n.sistema("Oi", "x");
    expect(notifs()).toHaveLength(1);
    t += 31_000; n.sistema("Oi", "x");
    expect(notifs()).toHaveLength(2);
  });
  it("persists to jsonl, reloads, keeps only the last 300 and the file stays valid", () => {
    const n = mk();
    for (let i = 0; i < 310; i++) { t += 1; n.sistema(`t${i}`, "x"); }
    const lines = readFileSync(join(hub, "notificacoes.jsonl"), "utf8").trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(300);
    expect(JSON.parse(lines.at(-1)!).titulo).toBe("t309");
    const n2 = mk();
    const l = n2.listar();
    expect(l.notificacoes).toHaveLength(300);
    expect(l.notificacoes[0]!.titulo).toBe("t309"); // newest first
    expect(statSync(join(hub, "notificacoes.jsonl")).isFile()).toBe(true);
  });
  it("tolerates a corrupt line in the file", () => {
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "notificacoes.jsonl"), 'lixo\n{"id":1}\n');
    expect(mk().listar().notificacoes).toEqual([]);
  });
  it("read state persists; desde filters; limpar empties", () => {
    const n = mk();
    n.sistema("a", "1"); t += 1000; n.sistema("b", "2"); t += 1000; n.sistema("c", "3");
    const ids = n.listar().notificacoes.map((x) => x.id);
    n.marcarLidas([ids[2]!]);
    expect(n.listar().naoLidas).toBe(2);
    expect(mk().listar().naoLidas).toBe(2); // reloaded from disk
    expect(n.listar(T0 + 500).notificacoes.map((x) => x.titulo)).toEqual(["c", "b"]);
    n.marcarLidas(); expect(n.listar().naoLidas).toBe(0);
    n.limpar(); expect(mk().listar().notificacoes).toEqual([]);
  });
  it("publishes SSE `notificacao` with the quiet-hours flag", () => {
    const n = mk(); n.sistema("a", "1");
    expect(pub[0]).toMatchObject({ ev: "notificacao", data: { titulo: "a", silencio: false, lida: false } });
  });
});

describe("config", () => {
  it("defaults, partial merge, validation", () => {
    const n = mk();
    expect(n.config()).toMatchObject({ desktop: { ligado: true, categorias: { missao: true, agente: true, sistema: true } }, silencio: { ativo: false } });
    n.setConfig({ categorias: { agente: false }, silencio: { ativo: true, inicio: "23:00" } });
    expect(n.config().categorias.agente).toBe(false);
    expect(n.config().categorias.missao).toBe(true);
    expect(n.config().silencio).toEqual({ ativo: true, inicio: "23:00", fim: "07:00" });
    expect(mk().config().silencio.inicio).toBe("23:00"); // persisted
    expect(NotifConfigPut.safeParse({ silencio: { inicio: "25:00" } }).success).toBe(false);
    expect(NotifConfigPut.safeParse({ categorias: { xpto: true } }).success).toBe(false);
    expect(NotifConfigPut.safeParse({ extra: 1 }).success).toBe(false);
    expect(NotifConfig.safeParse({}).success).toBe(true);
  });
  it("a disabled category records nothing", () => {
    const n = mk(); n.setConfig({ categorias: { sistema: false } }); n.sistema("a", "b");
    expect(notifs()).toHaveLength(0);
  });
  it("quiet hours wrap past midnight", () => {
    const s = { ativo: true, inicio: "22:00", fim: "07:00" };
    expect(emSilencio(s, new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(emSilencio(s, new Date(2026, 0, 1, 6, 59))).toBe(true);
    expect(emSilencio(s, new Date(2026, 0, 1, 7, 0))).toBe(false);
    expect(emSilencio(s, new Date(2026, 0, 1, 12, 0))).toBe(false);
    expect(emSilencio({ ...s, ativo: false }, new Date(2026, 0, 1, 23, 0))).toBe(false);
  });
});

describe("desktop (notify-send)", () => {
  it("argv only, no shell: metacharacters stay literal; capped; control chars stripped", () => {
    const n = mk();
    const titulo = '$(rm -rf ~); `id` | "x" -- --urgency=critical\n' + "A".repeat(300);
    n.emitir({ categoria: "missao", nivel: "erro", titulo, texto: "&& evil;\u0007\u001b[31m" + "B".repeat(500), origem: "t" });
    expect(sp).toHaveLength(1);
    const { file, args } = sp[0]!;
    expect(file).toBe("/usr/bin/notify-send");
    expect(args.slice(0, 5)).toEqual(["-a", "Guilda de agentes", "-u", "critical", "--"]); // `--` before the user text
    expect(args[5]!.startsWith("$(rm -rf ~); `id` | \"x\" -- --urgency=critical A")).toBe(true);
    expect(args[5]!.length).toBeLessThanOrEqual(80);
    expect(args[6]!.length).toBeLessThanOrEqual(200);
    expect(args[6]).not.toMatch(/[\u0000-\u001f]/);
    expect(args).toHaveLength(7);
  });
  it("at most 1 per 1 s: the extra toast is queued, not dropped", () => {
    vi.useFakeTimers();
    try {
      const n = mk();
      n.emitir({ categoria: "missao", nivel: "aviso", titulo: "1", texto: "x", origem: "t" });
      n.emitir({ categoria: "missao", nivel: "aviso", titulo: "2", texto: "x", origem: "t" });
      expect(sp).toHaveLength(1);
      vi.advanceTimersByTime(1000);
      expect(sp).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });
  it("respects info, the category toggle, the master toggle and quiet hours", () => {
    const n = mk();
    n.emitir({ categoria: "missao", nivel: "info", titulo: "i", texto: "x", origem: "t" }); t += 4000;
    expect(sp).toHaveLength(1); // info and agente now reach the desktop too
    sp.length = 0;
    n.setConfig({ desktop: { categorias: { missao: false } } });
    n.emitir({ categoria: "missao", nivel: "erro", titulo: "off", texto: "x", origem: "t" }); t += 4000;
    n.setConfig({ desktop: { categorias: { missao: true } }, silencio: { ativo: true, inicio: "11:00", fim: "13:00" } });
    n.emitir({ categoria: "missao", nivel: "erro", titulo: "quiet", texto: "x", origem: "t" }); t += 4000;
    expect(sp).toHaveLength(0);
    n.setConfig({ silencio: { ativo: false }, desktop: { ligado: false } });
    n.emitir({ categoria: "missao", nivel: "erro", titulo: "master", texto: "x", origem: "t" });
    expect(sp).toHaveLength(0);
    expect(notifs().map((x) => x.titulo)).toContain("quiet"); // still in the center
  });
  it("silently skips when notify-send is missing or spawn throws", () => {
    const n = mk({ achar: () => undefined });
    n.emitir({ categoria: "missao", nivel: "erro", titulo: "x", texto: "y", origem: "t" });
    expect(sp).toHaveLength(0);
    const n2 = mk({ spawn: () => { throw new Error("ENOENT"); } });
    t += 120_000;
    expect(() => n2.emitir({ categoria: "missao", nivel: "erro", titulo: "z", texto: "y", origem: "t" })).not.toThrow();
  });
});

describe("afiliados: actions", () => {
  it("saved, conflict, restored", () => {
    const n = mk(); n.afiliados("salvo"); n.afiliados("conflito"); n.afiliados("restaurado");
    expect(notifs().map((x) => x.titulo)).toEqual(["Configuração salva: falta sincronizar", "Conflito ao salvar", "Backup restaurado: falta sincronizar"]);
  });
});

describe("afiliados: poll", () => {
  const env = (v: string) => writeFileSync(join(af, ".env"), `DRY_RUN=${v}\nWA_MAX_PER_DAY=10\nSECRET_TOKEN=abc123\n`);
  const rel = (name: string, status = "ok") => writeFileSync(join(af, ".claude", "ops-reports", name), `---\nstatus: ${status}\n---\ncorpo 5511999998888@g.us`);
  const ev = (...l: unknown[]) => appendFileSync(join(af, ".claude", "ops-reports", "events.jsonl"), l.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n") + "\n");

  it("DRY_RUN off is reported once, not when it stays off", () => {
    const n = mk(); env("true"); n.poll(); expect(notifs()).toHaveLength(0);
    env("false"); n.poll(); n.poll(); t += 70_000; n.poll();
    expect(notifs().map((x) => x.titulo)).toEqual(["DRY_RUN está desligado"]);
    expect(JSON.stringify(notifs())).not.toMatch(/abc123|SECRET/);
  });
  it("reports: baseline silent, new and changed notified, only allowlisted metadata", () => {
    rel("ops-2026-01-04.md"); const n = mk(); n.poll();
    expect(notifs()).toHaveLength(0);
    rel("deal-auditor-2026-01-05.md", "falhou"); n.poll();
    expect(notifs()).toHaveLength(1);
    expect(notifs()[0]).toMatchObject({ categoria: "afiliados", nivel: "aviso", titulo: "Relatório de auditoria de ofertas", texto: "2026-01-05. Status: falhou" });
    expect(JSON.stringify(notifs())).not.toContain("corpo");
    n.poll(); expect(notifs()).toHaveLength(1);
    t += 5000; writeFileSync(join(af, ".claude", "ops-reports", "ops-2026-01-04.md"), "---\nstatus: ok\n---\nmudou"); // mtime bump
    const f = join(af, ".claude", "ops-reports", "ops-2026-01-04.md"); const s = Date.now() / 1000 + 100; require_utimes(f, s);
    n.poll(); expect(notifs()).toHaveLength(2);
  });
  it("events: first look starts at the end; run-fim, erro, orcamento; malformed lines tolerated; jid masked", () => {
    ev({ tipo: "run-fim", contagem: 99 }); env("true");
    const n = mk(); n.poll(); expect(notifs()).toHaveLength(0);
    ev("{not json", { tipo: "run-inicio", nicho: "tech" }, { tipo: "run-fim", nicho: "tech", contagem: 3, ts: "2026-01-05T10:00:00Z" },
      { tipo: "erro", nicho: "tech", mensagem: "falha em 5511999998888-1234@g.us token=abcd1234 tag=loja-20 ok" }, { tipo: "oferta-publicada", contagem: 1 }, { tipo: "coisa" }, { tipo: "orcamento", contagem: 8, ts: "2026-01-05T11:00:00Z" }, { tipo: "orcamento", contagem: 9, ts: "2026-01-05T11:05:00Z" });
    n.poll();
    const l = notifs();
    expect(l.map((x) => x.titulo)).toEqual(["Rodada iniciada (tech)", "Rodada concluída (tech)", "Erro no bot (tech)", "Orçamento diário em 80%"]);
    expect(l[1]).toMatchObject({ nivel: "sucesso", texto: "3 ofertas publicadas." });
    expect(l[2]!.texto).not.toMatch(/5511999998888|abcd1234|loja-20/);
    expect(l[2]!.texto).toContain("5511…@g.us");
    n.poll(); expect(notifs()).toHaveLength(4); // offset remembered
  });
  it("a partial last line waits for its newline", () => {
    mkdirSync(join(af, ".claude", "ops-reports"), { recursive: true });
    writeFileSync(join(af, ".claude", "ops-reports", "events.jsonl"), "");
    const n = mk(); n.poll();
    appendFileSync(join(af, ".claude", "ops-reports", "events.jsonl"), '{"tipo":"run-fim","contag');
    n.poll(); expect(notifs()).toHaveLength(0);
    appendFileSync(join(af, ".claude", "ops-reports", "events.jsonl"), 'em":2}\n');
    n.poll(); expect(notifs()).toHaveLength(1);
  });
  it("truncation and rotation restart from zero", () => {
    const f = join(af, ".claude", "ops-reports", "events.jsonl");
    writeFileSync(f, ""); const n = mk(); n.poll();
    ev({ tipo: "run-fim", contagem: 1 }); n.poll(); expect(notifs()).toHaveLength(1);
    writeFileSync(f, JSON.stringify({ tipo: "erro", mensagem: "a" }) + "\n"); // truncated and shorter
    t += 1; n.poll(); expect(notifs()).toHaveLength(2);
    renameSync(f, f + ".1"); writeFileSync(f, JSON.stringify({ tipo: "erro", mensagem: "b" }) + "\n" + "x".repeat(10) + "\n"); // rotated: new inode, larger offset irrelevant
    t += 1; n.poll(); expect(notifs()).toHaveLength(3);
  });
  it("caps the notifications per poll", () => {
    const f = join(af, ".claude", "ops-reports", "events.jsonl"); writeFileSync(f, ""); const n = mk(); n.poll();
    for (let i = 0; i < 30; i++) ev({ tipo: "erro", mensagem: `e${i}` });
    n.poll();
    expect(notifs().length).toBeLessThanOrEqual(11);
    expect(notifs().at(-1)!.titulo).toMatch(/^Mais \d+ eventos/);
  });
  it("does nothing without the project or after close()", () => {
    const n = mk({ afiliados: () => undefined }); n.poll(); expect(notifs()).toHaveLength(0);
    const m2 = mk(); m2.close(); m2.sistema("a", "b"); expect(notifs()).toHaveLength(0);
  });
  it("start() uses the injectable timer and close() stops it", () => {
    let stopped = false; let fn: (() => void) | undefined; let ms = 0;
    const n = mk({ every: (f, p) => { fn = f; ms = p; return () => { stopped = true; }; } });
    n.start(); expect(ms).toBe(60_000); expect(fn).toBeTypeOf("function");
    n.close(); expect(stopped).toBe(true);
  });
});

describe("limpar", () => {
  it("masks jids, secrets, tags, phones; caps", () => {
    expect(limpar("g 120363025@g.us e 5511987654321@s.whatsapp.net")).toBe("g 1203…@g.us e 5511…@s.whatsapp.net");
    expect(limpar("api_key=ZZZ senha: hunter2 tag=x-20")).not.toMatch(/ZZZ|hunter2|x-20/);
    expect(limpar("tel 5511987654321")).not.toContain("5511987654321");
    expect(limpar("abc ".repeat(200), 50)).toHaveLength(50);
  });
});

import { utimesSync } from "node:fs";
function require_utimes(f: string, sec: number) { utimesSync(f, sec, sec); }
