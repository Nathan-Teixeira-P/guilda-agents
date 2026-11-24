import { describe, expect, it } from "vitest";
import { consumo, deveParar, LIMIAR_5H, LIMIAR_SEMANA, podeIniciar } from "../src/plan-budget.ts";
import type { Estado } from "../src/usage.ts";

const ok = (c: number, s: number): Estado => ({
  estado: "ok",
  cincoHoras: { percentual: c, reiniciaEm: 1000, status: "allowed" },
  semana: { percentual: s, reiniciaEm: 5000, status: "allowed" },
  atualizadoEm: "t",
});

describe("constants", () => {
  it("are the documented defaults", () => expect([LIMIAR_5H, LIMIAR_SEMANA]).toEqual([80, 90]));
});

describe("podeIniciar", () => {
  it("is free at or below the thresholds", () => {
    expect(podeIniciar(ok(80, 90))).toEqual({ ok: true });
    expect(podeIniciar(ok(0, 0))).toEqual({ ok: true });
  });
  it("asks for confirmation above 80% in the 5h window", () => {
    const r = podeIniciar(ok(81, 10));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/5 horas/);
  });
  it("asks for confirmation above 90% in the week", () => {
    const r = podeIniciar(ok(10, 91));
    expect(r.ok === false && r.motivo).toMatch(/semana/);
  });
  it("never assumes free without data or with a stale reading", () => {
    expect(podeIniciar({ estado: "indisponivel", motivo: "sem leitura" }).ok).toBe(false);
    expect(podeIniciar({ estado: "indisponivel", motivo: "obsoleto" }).ok).toBe(false);
  });
  it("honors custom thresholds", () => expect(podeIniciar(ok(50, 10), { cincoHoras: 40, semana: 90 }).ok).toBe(false));
});

describe("consumo", () => {
  const ini = { percentual: 20, reiniciaEm: 1000 };
  it("is the difference in percentage points", () => expect(consumo(ini, { percentual: 27, reiniciaEm: 1000 })).toBe(7));
  it("is never negative", () => expect(consumo(ini, { percentual: 15, reiniciaEm: 1000 })).toBe(0));
  it("treats a reset window as a restart: current usage counts", () => expect(consumo(ini, { percentual: 4, reiniciaEm: 19000 })).toBe(4));
});

describe("deveParar", () => {
  const ini = { percentual: 20, reiniciaEm: 1000 };
  it("stops when the cap is reached", () => {
    expect(deveParar(ini, { percentual: 29, reiniciaEm: 1000 }, 10)).toBe(false);
    expect(deveParar(ini, { percentual: 30, reiniciaEm: 1000 }, 10)).toBe(true);
  });
  it("fails closed on a bad cap", () => {
    expect(deveParar(ini, { percentual: 20, reiniciaEm: 1000 }, 0)).toBe(true);
    expect(deveParar(ini, { percentual: 20, reiniciaEm: 1000 }, Number.NaN)).toBe(true);
  });
});
