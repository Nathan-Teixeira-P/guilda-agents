import { describe, expect, it } from "vitest";
import type { Uso } from "../src/logic/emblem.ts";
import { desatualizado, idadeMin, lerAuto, textoConsultasHoje, textoFrescor, textoProxima, type AutoStatus } from "../src/logic/frescor.ts";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const uso = (minAtras: number): Uso => ({ estado: "ok", atualizadoEm: new Date(NOW - minAtras * 60_000).toISOString(), cincoHoras: { percentual: 10, reiniciaEm: NOW / 1000 + 3600, faixa: "normal" }, semana: { percentual: 5, reiniciaEm: NOW / 1000 + 86400, faixa: "normal" } });
const auto = (o: Partial<AutoStatus> = {}): AutoStatus => ({ auto: true, intervaloMin: 15, estado: "ativo", consultasHoje: { auto: 3, manual: 0 }, custoPp: { ultimos: [] }, ...o });

describe("frescor", () => {
  it("idadeMin handles bad input", () => {
    expect(idadeMin("x", NOW)).toBeUndefined();
    expect(idadeMin(new Date(NOW + 5000).toISOString(), NOW)).toBe(0);
  });
  it("stale only when auto is on and age exceeds 2x interval", () => {
    expect(desatualizado(uso(30), auto(), NOW)).toBe(false);
    expect(desatualizado(uso(31), auto(), NOW)).toBe(true);
    expect(desatualizado(uso(31), auto({ auto: false }), NOW)).toBe(false);
    expect(desatualizado(uso(999), undefined, NOW)).toBe(false);
    expect(desatualizado({ estado: "indisponivel", motivo: "x" }, auto(), NOW)).toBe(false);
  });
  it("freshness text, including the stale and window-reset cases", () => {
    expect(textoFrescor(uso(0), auto(), NOW)).toBe("atualizado agora");
    expect(textoFrescor(uso(4), auto(), NOW)).toBe("atualizado há 4 min");
    expect(textoFrescor(uso(120), auto({ auto: false }), NOW)).toBe("atualizado há 2 h");
    expect(textoFrescor(uso(40), auto(), NOW)).toBe("desatualizado (leitura há 40 min)");
    expect(textoFrescor({ estado: "indisponivel", motivo: "obsoleto" }, auto(), NOW)).toContain("desatualizado");
    expect(textoFrescor({ estado: "indisponivel", motivo: "sem leitura" }, auto(), NOW)).toBe("sem leitura");
  });
  it("next-consult text", () => {
    expect(textoProxima(undefined, NOW)).toBeUndefined();
    expect(textoProxima(auto({ proximaEm: new Date(NOW + 150_000).toISOString() }), NOW)).toBe("próxima consulta em ~3 min");
    expect(textoProxima(auto({ proximaEm: new Date(NOW - 1000).toISOString() }), NOW)).toBe("próxima consulta em instantes");
    expect(textoProxima(auto({ estado: "pausado", motivo: "aba oculta" }), NOW)).toBe("pausado: aba oculta");
    expect(textoProxima(auto({ auto: false, estado: "desligado" }), NOW)).toBe("atualização automática desligada");
  });
  it("count text and payload parse", () => {
    expect(textoConsultasHoje(auto())).toBe("3 consultas automáticas hoje");
    expect(textoConsultasHoje(auto({ consultasHoje: { auto: 1, manual: 0 } }))).toBe("1 consulta automática hoje");
    expect(lerAuto({ error: "x" })).toBeUndefined();
    expect(lerAuto(null)).toBeUndefined();
    expect(lerAuto(auto())).toBeDefined();
  });
});

import { exibido } from "../src/logic/frescor.ts";
import { ariaUso, textoCompacto } from "../src/logic/emblem.ts";
describe("exibido", () => {
  it("hides the number of a stale reading", () => {
    const e = exibido(uso(40), auto(), NOW);
    expect(e).toEqual({ estado: "indisponivel", motivo: "desatualizado" });
    expect(textoCompacto(e, NOW)).toBe("uso desatualizado");
    expect(ariaUso(e, NOW)).toBe("Uso do plano desatualizado");
    expect(exibido(uso(40), auto({ auto: false }), NOW).estado).toBe("ok");
    expect(exibido(undefined, auto(), NOW)).toMatchObject({ motivo: "sem leitura" });
  });
});
