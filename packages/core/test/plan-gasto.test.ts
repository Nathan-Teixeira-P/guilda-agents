import { describe, expect, it } from "vitest";
import { somarGasto } from "../src/plan-budget.ts";

const l = (h: number, s: number, reinicia = 1) => ({ cincoHoras: { percentual: h, reiniciaEm: reinicia }, semana: { percentual: s, reiniciaEm: 9 } });

describe("somarGasto", () => {
  it("accumulates runs, and counts a restarted window from zero", () => {
    const um = somarGasto(undefined, l(10, 50), l(25, 52));
    expect(um).toEqual({ cincoHoras: 15, semana: 2 });
    expect(somarGasto(um, l(90, 52), l(4, 53, 2))).toEqual({ cincoHoras: 19, semana: 3 });
  });
});
