import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as core from "@lab/core/src/agenda.ts";
import { mascararJid as mascararCore, nicheConfigSchema, nichesFileSchema } from "@lab/core/src/niches.ts";
import { api } from "../src/api.ts";
import { NICHO_NOVO, analiseAgenda, cronParaHoras, descreverCron, detectarConcentracao, horasDoNicho, horasParaCron, lerHoras, linhasAgenda, listaDeTexto, mascararJid, resumoMudancas, totalDiario, validarLista, validarNicho, type Nicho } from "../src/logic/afiliados.ts";
import { Afiliados, AvisoConflito, Painel, SemAfiliados, type Dados, type Secao } from "../src/screens/Afiliados.tsx";
import type { Live } from "../src/store.ts";

const JID = "120363000000000001@g.us";
const nicho = (key: string, extra: Partial<Nicho> = {}): Nicho => ({
  key, label: `Grupo ${key}`, enabled: true, priority: 1, groupJid: mascararJid(JID), instance: "bot",
  ml: { categoryIds: [], keywords: ["fone bluetooth", "mouse gamer"] }, amazon: { browseNodeIds: [], keywords: ["teclado mecanico"] },
  minDealScore: 60, maxPerRun: 2, cronSlots: ["0 9 * * *", "20 9 * * *"], ...extra,
});
const dados = (over: Partial<Dados> = {}, pend = true): Dados => ({
  nichos: { configurado: true, ok: true, hash: "h", mtimeMs: 1, pendenteSync: pend, nichos: [nicho("tech"), nicho("casa", { groupJid: "1203…@g.us", cronSlots: ["0 18 * * *"] })] },
  info: { configurado: true, dryRun: true, waMaxPerDay: 3, comandoSync: "npm run niches:sync", pendenteSync: pend },
  ops: { configurado: true, existe: false }, auditor: { configurado: true, existe: false }, backups: [], ...over,
});
const html = (secao: Secao, d = dados(), aviso?: string) => renderToStaticMarkup(createElement(Painel, { dados: d, secaoInicial: secao, onRecarregar: () => {}, aviso }));

describe("mirror of core", () => {
  it("masks like core and validates with the same messages", () => {
    expect(mascararJid(JID)).toBe(mascararCore(JID));
    expect(mascararJid("12@g.us")).toBe(mascararCore("12@g.us"));
    const ruins = [
      { ...nicho("Ruim Key"), key: "Ruim Key", groupJid: "5511@s.whatsapp.net", label: "", instance: "", minDealScore: 101, maxPerRun: 0, cronSlots: [] },
      { ...nicho("x"), minDealScore: -1, priority: 1.5 },
      { ...nicho("y", { ml: { categoryIds: [], keywords: [] }, amazon: { browseNodeIds: [], keywords: [] } }), groupJid: JID },
    ];
    for (const r of ruins) {
      const doCore = new Set(nicheConfigSchema.safeParse(r).error?.issues.map((i) => i.message));
      const meu = new Set(Object.values(validarNicho(r)));
      expect(meu).toEqual(doCore);
    }
    expect(Object.keys(validarNicho({ ...nicho("ok"), groupJid: JID }))).toEqual([]);
    expect(nichesFileSchema.safeParse([{ ...nicho("ok"), groupJid: JID }]).success).toBe(true);
  });
  it("agenda helpers give the same answers as core", () => {
    for (const h of ["00:00", "09:05", "23:59"]) { expect(horasParaCron(h)).toBe(core.horasParaCron(h)); expect(descreverCron(horasParaCron(h))).toBe(core.descreverCron(core.horasParaCron(h))); }
    expect(descreverCron("*/5 * * * *")).toBe(core.descreverCron("*/5 * * * *"));
    const slots = [{ key: "a", hhmm: "23:50" }, { key: "b", hhmm: "00:10" }, { key: "c", hhmm: "12:00" }, { key: "d", hhmm: "12:30" }];
    expect(detectarConcentracao(slots, 45)).toEqual(core.detectarConcentracao(slots, 45));
    const n = [{ maxPerRun: 2, execucoes: 3 }, { maxPerRun: 1, execucoes: 4 }];
    expect(totalDiario(n, 8)).toEqual(core.totalDiario(n, 8));
    expect(cronParaHoras("5 9 * * *")).toBe("09:05");
  });
});

describe("lógica", () => {
  it("erros por campo, key duplicada e jid mascarado só vale se inalterado", () => {
    const e = validarNicho({ ...NICHO_NOVO("bot"), key: "", groupJid: "123@c.us" });
    expect(e.key).toBeDefined(); expect(e.groupJid).toMatch(/@g\.us/); expect(e.label).toBeDefined();
    expect(validarNicho(nicho("a"), nicho("a")).groupJid).toBeUndefined();
    expect(validarNicho(nicho("a")).groupJid).toBeDefined();
    const l = validarLista([nicho("a"), nicho("a")], [nicho("a")]);
    expect(l.lista.join()).toMatch(/Keys duplicadas: a/);
    expect(validarLista([], []).lista[0]).toMatch(/Ao menos um nicho/);
  });
  it("resumo de mudanças e listas", () => {
    const a = [nicho("a"), nicho("b")];
    expect(resumoMudancas(a, a).total).toBe(0);
    const r = resumoMudancas(a, [{ ...nicho("a"), maxPerRun: 5 }, nicho("c")]);
    expect(r).toMatchObject({ alterados: ["Grupo a"], removidos: ["Grupo b"], novos: ["Grupo c"], total: 3 });
    expect(listaDeTexto("a, b ,, c")).toEqual(["a", "b", "c"]);
  });
  it("lerHoras normaliza, ordena e aponta inválidas", () => {
    expect(lerHoras("9:00, 12:30 21:5")).toEqual({ horas: ["09:00", "12:30"], invalidas: ["21:5"] });
    expect(horasDoNicho({ cronSlots: ["30 12 * * *", "*/5 * * * *"] })).toEqual({ horas: ["12:30"], custom: ["*/5 * * * *"] });
  });
  it("concentração e total diário vs limite", () => {
    const l = linhasAgenda([nicho("tech"), nicho("casa", { cronSlots: ["30 9 * * *"], maxPerRun: 1 }), nicho("off", { enabled: false, cronSlots: ["31 9 * * *"] })]);
    const r = analiseAgenda(l, 45, 3);
    expect(r.concentracoes.length).toBe(3); // 09:00 x 09:20 x 09:30 (desligado fora)
    expect(r.total).toEqual({ total: 5, limiteDiario: 3, excede: true });
    expect(analiseAgenda(l, 45).total.excede).toBe(false);
  });
});

describe("telas (SSR)", () => {
  const BOTOES_PROIBIDOS = /enviar|disparar|executar|rodar agora|ligar dry|desligar dry|alterar dry|testar envio/i;
  const botoes = (h: string) => [...h.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ""));

  it("sem afiliados: instrução, não erro", () => {
    const h = renderToStaticMarkup(createElement(SemAfiliados));
    expect(h).toMatch(/Anexar projeto/); expect(h).toMatch(/afiliados/); expect(h).not.toMatch(/class="err"/);
    const live = { loading: false, projects: [], reload() {} } as unknown as Live;
    expect(renderToStaticMarkup(createElement(Afiliados, { live }))).toMatch(/ainda não está registrado/);
  });
  it("nichos: rótulo, jid mascarado, chips, ligado e nunca o jid completo", () => {
    const h = html("grupos");
    expect(h).toContain("Grupo tech"); expect(h).toContain("1203…@g.us"); expect(h).toContain("fone bluetooth"); expect(h).toContain("teclado mecanico");
    expect(h).toMatch(/Nota mínima <strong>60/); expect(h).toContain("Ligado");
    expect(h).not.toContain("120363000000000001");
    expect(h).not.toMatch(/Revelar jid/); // reveal only inside the editor
  });
  it("nenhuma seção tem botão de envio, execução ou DRY_RUN", () => {
    for (const s of ["grupos", "agenda", "saude", "aplicar"] as const) {
      const bs = botoes(html(s, dados({ info: { configurado: true, dryRun: false, comandoSync: "npm run niches:sync", pendenteSync: true } })));
      expect(bs.length).toBeGreaterThan(0);
      for (const b of bs) expect(b).not.toMatch(BOTOES_PROIBIDOS);
    }
    expect(html("saude")).not.toMatch(/<input[^>]*dry/i);
  });
  it("agenda: alerta de concentração, total vs limite e cron em português", () => {
    const h = html("agenda");
    expect(h).toContain("Alerta de concentração"); expect(h).toMatch(/09:00 e Grupo tech 09:20/); expect(h).toContain("ACIMA do limite WA_MAX_PER_DAY de 3");
    expect(h).toContain("todo dia às 09:00"); expect(h).toContain("Sugerir horários"); expect(h).toContain("America/Sao_Paulo");
  });
  it("saúde: sem relatório, DRY_RUN desligado em destaque", () => {
    const h = html("saude", dados({ info: { configurado: true, dryRun: false, comandoSync: "x", pendenteSync: false } }));
    expect(h).toMatch(/Ainda não há relatório do agente ops/); expect(h).toMatch(/Ainda não há relatório do agente deal-auditor/);
    expect(h).toContain("DRY_RUN DESLIGADO"); expect(h).toMatch(/dry off/); expect(h).toContain('role="alert"');
    expect(html("saude")).toContain("DRY_RUN ligado");
    const com = html("saude", dados({ ops: { configurado: true, existe: true, arquivo: "ops-2026-11-20.md", data: "2026-11-20T12:00:00Z", status: "ok", corpo: "tudo certo" } }));
    expect(com).toContain("ops-2026-11-20.md"); expect(com).toContain("tudo certo");
  });
  it("aplicar: comando, copiar, badge pendente e marcar sincronizado", () => {
    const h = html("aplicar");
    expect(h).toContain("npm run niches:sync"); expect(h).toContain("Copiar comando"); expect(h).toContain("Pendente de sincronizar"); expect(h).toContain("Marcar como sincronizado");
    expect(html("aplicar", dados({}, false))).toContain(">Sincronizado<");
  });
  it("conflito 409 oferece recarregar", () => {
    expect(renderToStaticMarkup(createElement(AvisoConflito, { onRecarregar: () => {} }))).toMatch(/Recarregar/);
  });
});

describe("api", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("409 vira Result com status 409 (a tela mostra o aviso de recarregar)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "changed", recarregar: true }), { status: 409 })));
    const r = await api.afGravar({ nichos: [], hash: "h", mtimeMs: 1 });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
});
