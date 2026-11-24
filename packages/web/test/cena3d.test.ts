import { describe, expect, it } from "vitest";
import { anguloRitmo, arcoUso, contagem, dePlanta, escolherVista, ESCALA, lerVista, paraMundo } from "../src/logic/cena3d.ts";
import { montarPlanta, VIEW } from "../src/logic/escritorio.ts";

describe("paraMundo", () => {
  it("centres the plan on the origin and scales", () => {
    expect(paraMundo(VIEW.w / 2, VIEW.h / 2)).toEqual({ x: 0, z: 0 });
    expect(paraMundo(0, 0)).toEqual({ x: -400 * ESCALA, z: -240 * ESCALA });
    expect(paraMundo(800, 480).x).toBeCloseTo(20);
  });
  it("round-trips every waypoint and keeps room order (north = smaller z)", () => {
    const p = montarPlanta();
    for (const n of Object.values(p.nos)) { const w = paraMundo(n.x, n.y); const b = dePlanta(w.x, w.z); expect(b.x).toBeCloseTo(n.x); expect(b.y).toBeCloseTo(n.y); }
    expect(paraMundo(0, p.nos["s:planner"]!.y).z).toBeLessThan(paraMundo(0, p.nos["s:coder"]!.y).z);
  });
});

describe("arcoUso", () => {
  it("maps utilization to a clockwise arc from 12 o'clock", () => {
    expect(arcoUso(0).arco).toBe(0);
    expect(arcoUso(25).arco).toBeCloseTo(Math.PI / 2);
    expect(arcoUso(25).rotacao).toBeCloseTo(0); // quarter: spans [0, pi/2] = 3 o'clock to 12
    expect(arcoUso(100).arco).toBeCloseTo(Math.PI * 2);
    expect(arcoUso(61).arco).toBeCloseTo(0.61 * Math.PI * 2);
  });
  it("clamps and survives garbage", () => {
    expect(arcoUso(-5).arco).toBe(0);
    expect(arcoUso(140).arco).toBeCloseTo(Math.PI * 2);
    expect(arcoUso(NaN).arco).toBe(0);
  });
  it("pace marker starts at the top and moves clockwise", () => {
    expect(anguloRitmo(0)).toBeCloseTo(Math.PI / 2);
    expect(anguloRitmo(0.25)).toBeCloseTo(0);
    expect(anguloRitmo(2)).toBeCloseTo(Math.PI / 2 - Math.PI * 2);
  });
});

describe("contagem", () => {
  const now = Date.UTC(2026, 0, 1);
  const em = (s: number) => now / 1000 + s;
  it("uses seconds below a day and drops them above", () => {
    expect(contagem(em(45), now)).toBe("45s");
    expect(contagem(em(9 * 60 + 5), now)).toBe("9min 05s");
    expect(contagem(em(2 * 3600 + 10 * 60 + 5), now)).toBe("2h 10min 05s");
    expect(contagem(em(4 * 86400 + 3 * 3600 + 7 * 60 + 59), now)).toBe("4d 3h 07min");
  });
  it("ticks every second and never goes negative", () => {
    expect(contagem(em(100), now)).not.toBe(contagem(em(100), now + 1000));
    expect(contagem(em(0), now)).toBe("reiniciando");
    expect(contagem(em(-50), now)).toBe("reiniciando");
  });
});

describe("escolherVista", () => {
  it("defaults to 3d when WebGL works, honours the saved choice", () => {
    expect(escolherVista({ preferida: undefined, webgl: true })).toEqual({ vista: "3d" });
    expect(escolherVista({ preferida: "2d", webgl: true })).toEqual({ vista: "2d" });
  });
  it("falls back to 2d with a notice when WebGL is missing or the context failed", () => {
    expect(escolherVista({ preferida: "3d", webgl: false }).vista).toBe("2d");
    expect(escolherVista({ preferida: "3d", webgl: false }).aviso).toMatch(/WebGL/);
    const f = escolherVista({ preferida: "3d", webgl: true, falha: "contexto perdido" });
    expect(f.vista).toBe("2d");
    expect(f.aviso).toMatch(/contexto perdido/);
  });
  it("parses the stored value", () => {
    expect(lerVista("3d")).toBe("3d");
    expect(lerVista("x")).toBeUndefined();
    expect(lerVista(null)).toBeUndefined();
  });
});
