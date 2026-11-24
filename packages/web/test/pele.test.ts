import { describe, expect, it } from "vitest";
import { estadoAfiliados } from "../src/logic/afiliados.ts";
import { duracaoCarimbo, lerMovimento, lerTema, movimentoReduzido } from "../src/logic/tema.ts";
import { alarmesDe, avisosDe } from "../src/logic/alarmes.ts";
import { novosAguardando } from "../src/logic/notificacao.ts";
import { distribuir, infoDistrito, novosHandoffs } from "../src/logic/mapa.ts";
import type { M } from "../src/logic/stages.ts";
import type { Ev } from "../src/logic/events.ts";
import type { Projeto } from "../src/api.ts";

const m = (id: string, stage: M["stage"], extra: Partial<M> = {}): M => ({ id, project: "p", stage, costUsd: 0, createdAt: "", updatedAt: "", ...extra });
const ini = (agentId: string, subagentType: string) => ({ kind: "subagent-started", agentId, subagentType }) as unknown as Ev;
const fim = (agentId: string, status: string) => ({ kind: "subagent-finished", agentId, status }) as unknown as Ev;

describe("tema e movimento", () => {
  it("dark and motion on are the defaults; garbage falls back", () => {
    expect(lerTema(null)).toBe("escuro");
    expect(lerTema("claro")).toBe("claro");
    expect(lerTema("rosa")).toBe("escuro");
    expect(lerMovimento("off")).toBe("off");
    expect(lerMovimento("x")).toBe("on");
  });
  it("reduces motion by user choice or OS, and the stamp lasts 0 then", () => {
    expect(movimentoReduzido("on", false)).toBe(false);
    expect(movimentoReduzido("off", false)).toBe(true);
    expect(movimentoReduzido("on", true)).toBe(true);
    expect(duracaoCarimbo(true)).toBe(0);
    expect(duracaoCarimbo(false)).toBeGreaterThan(0);
  });
});

describe("alarmesDe", () => {
  it("maps breaker, cap and agent failure; ignores the rest", () => {
    const ms = [m("a", "pausada", { pauseReason: "disjuntor: 9 handoffs seguidos" }), m("b", "pausada", { pauseReason: "teto de uso do plano: 10 de 10 pp" }), m("c", "executando"), m("d", "concluida")];
    const a = alarmesDe(ms, { c: [ini("x1", "coder"), fim("x1", "failed")] });
    expect(a.map((x) => x.tipo)).toEqual(["disjuntor", "teto", "falha"]);
    expect(a[2]!.texto).toContain("Ferreiro");
    expect(alarmesDe([m("e", "pausada")], {})).toEqual([]);
  });
});

describe("novosAguardando", () => {
  it("first call is a baseline; later only newcomers", () => {
    const a = novosAguardando(undefined, [m("1", "aguardando-aprovacao")]);
    expect(a.novos).toEqual([]);
    const b = novosAguardando(a.ids, [m("1", "aguardando-aprovacao"), m("2", "aguardando-aprovacao"), m("3", "executando")]);
    expect(b.novos.map((x) => x.id)).toEqual(["2"]);
  });
});

describe("mapa", () => {
  const p = (id: string) => ({ id }) as Projeto;
  it("fills 8 lots in order and overflows the rest", () => {
    const d = distribuir(Array.from({ length: 10 }, (_, i) => p(`p${i}`)));
    expect(d.lotes.length).toBe(8);
    expect(d.lotes[7]!.id).toBe("p7");
    expect(d.extras.map((x) => x.id)).toEqual(["p8", "p9"]);
    expect(distribuir([]).lotes.every((l) => l === undefined)).toBe(true);
  });
  it("counts active missions and alarms per district", () => {
    expect(infoDistrito([m("1", "executando"), m("2", "parada"), m("3", "concluida")], "p")).toEqual({ ativas: 1, alarmes: 1 });
  });
  it("handoffs: baseline first, then only new starts", () => {
    const e1 = { a: [ini("x", "coder")] };
    const r1 = novosHandoffs(undefined, e1);
    expect(r1.novos).toEqual([]);
    const r2 = novosHandoffs(r1.contagem, { a: [ini("x", "coder"), ini("y", "tester")] });
    expect(r2.novos).toEqual([{ id: "a:y", missionId: "a", tipo: "tester" }]);
  });
});

describe("avisosDe", () => {
  it("lists alarms plus paused missions no alarm covers, once each", () => {
    const ms = [m("d", "pausada", { pauseReason: "disjuntor: 3 voltas" }), m("x", "pausada", { pauseReason: "dúvida" }), m("y", "pausada")];
    const a = avisosDe(ms, {});
    expect(a.map((x) => x.chave)).toEqual(["d:d", "p:x", "p:y"]);
    expect(a[1]!.texto).toContain("dúvida");
    expect(avisosDe([m("z", "executando")], {})).toEqual([]);
  });
});

describe("estadoAfiliados", () => {
  const pr = (id: string, nome: string) => ({ id, nome, apelidos: [], origem: { tipo: "pasta", valor: "/x" }, caminho: "/x", comandos: [], criadoEm: "" }) as Projeto;
  it("finds the afiliados project by id or name, else asks to attach it", () => {
    expect(estadoAfiliados([pr("a", "Outro")])).toEqual({ tipo: "sem-projeto" });
    expect(estadoAfiliados([pr("a", "Outro"), pr("b", "Afiliados")]).tipo).toBe("sem-relatorio");
    expect(estadoAfiliados([pr("afiliados", "x")]).tipo).toBe("sem-relatorio");
  });
});
