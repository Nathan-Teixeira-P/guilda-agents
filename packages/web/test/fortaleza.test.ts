import { expect, it } from "vitest";
import { andar, PORTARIA, posicionar, TREINO } from "../src/logic/fortaleza.ts";
import { ROSTER } from "../src/roster.ts";

it("everyone trains until called, then stands inside the project's room", () => {
  const calmo = posicionar({});
  expect(calmo.salas).toEqual([]);
  expect(Object.keys(calmo.lugar)).toHaveLength(ROSTER.length);
  const r = posicionar({ coder: { ativo: true, falhou: false, projeto: "A" }, tester: { ativo: true, falhou: false, projeto: "B" } });
  expect(r.salas.map((s) => s.nome).sort()).toEqual(["A", "B"]);
  for (const t of ["coder", "tester"]) {
    const l = r.lugar[t]!, s = r.salas.find((x) => x.nome === l.projeto)!;
    expect(l.x > s.x && l.x < s.x + s.w && l.y > s.y && l.y < s.y + s.h).toBe(true);
  }
  expect(r.lugar["planner"]!.y).toBeGreaterThan(TREINO.y);
});

it("the Regente stays at the gate, and its contract still gets a room", () => {
  const r = posicionar({ orchestrator: { ativo: true, falhou: false, projeto: "A" } });
  expect(r.salas.map((s) => s.nome)).toEqual(["A"]);
  const l = r.lugar["orchestrator"]!;
  expect(l.y > PORTARIA.y && l.y < TREINO.y).toBe(true);
  expect(posicionar({}).lugar["orchestrator"]!.y).toBe(l.y);
});

it("walks from training to a contract through the gate and stops there", () => {
  const a = { x: 40, y: 400 }, destino = { x: 700, y: 120 };
  let passou = false, passos = 0;
  while (andar(a, destino, 100) && passos++ < 500) if (Math.abs(a.x - 400) < 12 && Math.abs(a.y - (PORTARIA.y + 34)) < 12) passou = true;
  expect(passou).toBe(true);
  expect(a).toEqual(destino);
});
