import { describe, expect, it } from "vitest";
import { adiantado, ariaUso, arcoFantasma, cruzouAlerta, efetivo, piorFaixa, ritmo, tempoExtenso, textoCompacto, type Uso } from "../src/logic/emblem.ts";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const s = NOW / 1000;
const ok = (p5: number, pw: number, r5 = s + 7800, rw = s + 3 * 86400): Uso => ({
  estado: "ok", atualizadoEm: "x",
  cincoHoras: { percentual: p5, reiniciaEm: r5, faixa: p5 > 90 ? "critico" : p5 > 80 ? "atencao" : "normal" },
  semana: { percentual: pw, reiniciaEm: rw, faixa: "normal" },
});

describe("emblem logic", () => {
  it("ritmo: fraction of the window elapsed", () => {
    expect(ritmo(s + 9000, "cincoHoras", NOW)).toBeCloseTo(0.5);
    expect(ritmo(s - 10, "cincoHoras", NOW)).toBe(1);
    expect(ritmo(s + 99999999, "semana", NOW)).toBe(0);
    expect(adiantado(62, 0.4)).toBe(true);
    expect(adiantado(20, 0.4)).toBe(false);
  });
  it("stale or missing reading is unavailable, never 0%", () => {
    expect(efetivo(undefined, NOW).estado).toBe("indisponivel");
    expect(efetivo(ok(10, 10, s - 1), NOW).estado).toBe("indisponivel");
    expect(efetivo(ok(10, 10), NOW).estado).toBe("ok");
  });
  it("ghost arc clamps at 100", () => {
    expect(arcoFantasma(62, 10)).toEqual({ de: 62, tam: 10 });
    expect(arcoFantasma(95, 10)).toEqual({ de: 95, tam: 5 });
  });
  it("texts", () => {
    expect(tempoExtenso(s + 7800, NOW)).toBe("2 horas e 10 minutos");
    expect(tempoExtenso(s + 3 * 86400, NOW)).toBe("3 dias");
    expect(textoCompacto(ok(62, 35), NOW)).toBe("5h 62% · 2h10");
    expect(textoCompacto({ estado: "indisponivel", motivo: "x" }, NOW)).toBe("uso indisponível");
    expect(ariaUso(ok(62, 35), NOW)).toBe("Uso do plano: janela de 5 horas 62%, reinicia em 2 horas e 10 minutos; semana 35%, reinicia em 3 dias");
  });
  it("alert crosses 80% once", () => {
    expect(cruzouAlerta(ok(70, 10), ok(81, 10))).toBe(true);
    expect(cruzouAlerta(ok(81, 10), ok(85, 10))).toBe(false);
    expect(cruzouAlerta(undefined, ok(90, 10))).toBe(true);
    expect(cruzouAlerta(ok(10, 10), { estado: "indisponivel", motivo: "x" })).toBe(false);
    expect(piorFaixa(ok(95, 10))).toBe("critico");
    expect(piorFaixa(ok(10, 10))).toBe("normal");
  });
});
