import { describe, expect, it } from "vitest";
import { descreverCron, detectarConcentracao, horasParaCron, sugerirAgenda, totalDiario } from "../src/agenda.js";

// parser mínimo de 5 campos: números, *, listas, faixas, /passo
function cron5(c: string): boolean {
  const f = c.split(" ");
  const lim = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  return f.length === 5 && f.every((x, i) => x.split(",").every((p) => {
    const m = /^(\*|(\d+)(-(\d+))?)(\/(\d+))?$/.exec(p);
    if (!m) return false;
    return [m[2], m[4]].every((v) => v === undefined || (Number(v) >= lim[i]![0]! && Number(v) <= lim[i]![1]!));
  }));
}
const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

describe("cron", () => {
  it("gera cron simples de 5 campos", () => {
    expect(horasParaCron("09:30")).toBe("30 9 * * *");
    expect(horasParaCron("0:05")).toBe("5 0 * * *");
    expect(cron5(horasParaCron("23:59"))).toBe(true);
  });
  it("recusa horário inválido", () => {
    expect(() => horasParaCron("24:00")).toThrow();
    expect(() => horasParaCron("9h")).toThrow();
  });
  it("descreve formatos do planejador e personalizados", () => {
    expect(descreverCron("30 9 * * *")).toBe("todo dia às 09:30");
    expect(descreverCron("0 0 * * *")).toBe("todo dia às 00:00");
    expect(descreverCron("*/5 * * * *")).toBe("expressão personalizada");
    expect(descreverCron("0 9 * * 1")).toBe("expressão personalizada");
    expect(descreverCron("0 25 * * *")).toBe("expressão personalizada");
  });
});

describe("sugerirAgenda", () => {
  const nichos = [{ key: "b", envios: 2 }, { key: "a", envios: 2 }, { key: "c", envios: 1 }];
  it("intercala nichos e respeita o intervalo", () => {
    const r = sugerirAgenda({ nichos });
    expect(r.impossiveis).toEqual([]);
    expect(r.slots).toHaveLength(5);
    expect(detectarConcentracao(r.slots, 45)).toEqual([]);
    expect(r.slots.every((s) => cron5(s.cron))).toBe(true);
    const ord = r.slots.map((s) => s.key).join("");
    expect(ord).toBe("abcab"); // rodadas: a b c | a b
  });
  it("é determinístico e independe da ordem de entrada", () => {
    expect(sugerirAgenda({ nichos })).toEqual(sugerirAgenda({ nichos: [...nichos].reverse() }));
  });
  it("respeita intervalo configurável", () => {
    const r = sugerirAgenda({ nichos, intervaloMin: 90 });
    const m = r.slots.map((s) => min(s.hhmm));
    for (let i = 1; i < m.length; i++) expect(m[i]! - m[i - 1]!).toBeGreaterThanOrEqual(90);
  });
  it("sinaliza impossibilidade em vez de violar", () => {
    const r = sugerirAgenda({ nichos: [{ key: "a", envios: 3, horas: ["09:00", "09:10", "09:20"] }] });
    expect(r.slots).toEqual([{ key: "a", hhmm: "09:00", cron: "0 9 * * *" }]);
    expect(r.impossiveis).toEqual([{ key: "a", faltam: 2 }]);
    expect(detectarConcentracao(r.slots)).toEqual([]);
  });
  it("considera a virada do dia", () => {
    const r = sugerirAgenda({ nichos: [{ key: "a", envios: 1, horas: ["23:50"] }, { key: "b", envios: 1, horas: ["00:10", "01:00"] }] });
    expect(r.slots.find((s) => s.key === "b")?.hhmm).toBe("01:00");
  });
});

describe("detectarConcentracao", () => {
  it("acha pares mais próximos que o intervalo", () => {
    const s = [{ key: "a", hhmm: "09:00" }, { key: "b", hhmm: "09:30" }, { key: "c", hhmm: "10:30" }];
    const r = detectarConcentracao(s, 45);
    expect(r).toEqual([{ a: s[0], b: s[1], distanciaMin: 30 }]);
    expect(detectarConcentracao(s, 30)).toEqual([]); // exatamente o intervalo é ok
  });
  it("horários idênticos contam como concentração", () => {
    expect(detectarConcentracao([{ key: "a", hhmm: "09:00" }, { key: "b", hhmm: "09:00" }])).toHaveLength(1);
  });
});

describe("totalDiario", () => {
  const ns = [{ maxPerRun: 3, execucoes: 2 }, { maxPerRun: 4, execucoes: 1 }];
  it("soma maxPerRun x execuções e só alerta", () => {
    expect(totalDiario(ns, 10)).toEqual({ total: 10, limiteDiario: 10, excede: false });
    expect(totalDiario(ns, 9).excede).toBe(true);
    expect(totalDiario(ns).excede).toBe(false);
  });
});
