import { expect, it } from "vitest";
import { posicionar } from "../src/logic/fortaleza.ts";
import { ALVO_X, ARQUEIRO_X, arqueiro, criarTreino, duelo, FENO_X, saltador, TORRE_ALT, escalador, arremesso, CORDA_X } from "../src/logic/treino.ts";
import { ROSTER } from "../src/roster.ts";

const fincadas = (fs: { visivel: boolean; voando: boolean }[]) => fs.filter((f) => f.visivel && !f.voando).length;
it("the archer shoots three, walks to the target, takes them out and comes back", () => {
  expect(arqueiro(500, 0).pose.gesto).toBe("mira");
  expect(arqueiro(1350, 0).flechas[0]!.voando).toBe(true);
  expect([1700, 3500, 5300].map((t) => fincadas(arqueiro(t, 0).flechas))).toEqual([1, 2, 3]);
  expect(arqueiro(6500, 0).pose.gesto).toBe("anda");
  expect(fincadas(arqueiro(6500, 0).flechas)).toBe(3); // still in the target
  expect(arqueiro(7700, 0).pose.x).toBeGreaterThan(ALVO_X - 40);
  expect(fincadas(arqueiro(8300, 0).flechas)).toBe(0);
  expect(arqueiro(9000, 0).pose).toMatchObject({ face: -1, arma: "flecha" });
  expect(arqueiro(10_600, 0).pose.x).toBe(ARQUEIRO_X);
});
it("a pair takes turns, one attacks while the other defends", () => {
  expect([duelo(300, 1, 0).gesto, duelo(300, -1, 0).gesto]).toEqual(["ataca", "defende"]);
  expect([duelo(1500, 1, 0).gesto, duelo(1500, -1, 0).gesto]).toEqual(["defende", "ataca"]);
  expect(duelo(300, 1, 0).choque).toBe(true);
});
it("idle members train; a called one stops training and walks to its room", () => {
  const quadro = criarTreino(), ordem = ROSTER.map((r) => r.tecnico);
  const livre = quadro(0, 33, posicionar({}).lugar, ordem);
  const armas = Object.values(livre.poses).map((p) => p.arma);
  expect(armas.filter((a) => a === "arco")).toHaveLength(2);
  expect(armas.filter((a) => a === "espada").length).toBeGreaterThanOrEqual(12);
  expect(livre.poses["orchestrator"]!.arma).toBe("nada");
  const { lugar } = posicionar({ coder: { ativo: true, falhou: false, projeto: "A" } });
  expect(quadro(33, 33, lugar, ordem).poses["coder"]!.gesto).toBe("anda");
  for (let i = 2; i < 400; i++) quadro(i * 33, 33, lugar, ordem);
  expect(quadro(14000, 33, lugar, ordem).poses["coder"]).toMatchObject({ x: lugar["coder"]!.x, y: lugar["coder"]!.y, arma: "nada" });
});

it("two jumpers take turns: climb, dive into the hay, come back", () => {
  const eu = (t: number) => saltador(t, 1);
  expect(eu(1500).gesto).toBe("sobe");
  expect(eu(3000)).toMatchObject({ gesto: "abre", alt: TORRE_ALT });
  expect(eu(4099).x).toBeCloseTo(FENO_X, 0);
  expect(eu(4500).oculto).toBe(true);
  for (let t = 0; t < 22_000; t += 100) expect((saltador(t, 0).alt ?? 0) > 0 && (saltador(t, 1).alt ?? 0) > 0).toBe(false);
});

it("climbers go up and come back down; only one is on the rope at a time", () => {
  expect(escalador(0, 0).alt).toBe(0);
  expect(escalador(3000, 0)).toMatchObject({ alt: TORRE_ALT, x: CORDA_X });
  expect(escalador(7000, 0).alt).toBe(0);
  for (let t = 0; t < 20_000; t += 100) expect(escalador(t, 0).alt! > 0 && escalador(t, 2).alt! > 0).toBe(false);
});
it("the thrower sticks three knives in the straw man and then fetches them", () => {
  expect(arremesso(100).pose.arma).toBe("faca");
  expect(arremesso(900).facas[0]!.voando).toBe(true);
  expect([1200, 2500, 3800].map((t) => fincadas(arremesso(t).facas))).toEqual([1, 2, 3]);
  expect(arremesso(4500).pose.gesto).toBe("anda");
  expect(fincadas(arremesso(6100).facas)).toBe(0);
  expect(arremesso(6500).pose).toMatchObject({ face: -1, arma: "faca" });
});
