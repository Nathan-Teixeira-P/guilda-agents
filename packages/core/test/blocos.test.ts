import { describe, expect, it } from "vitest";
import { dependenciasFaltando, montarBlocos } from "../src/blocos.ts";

const spec = (n: number, deps = "") => ({ name: `00${n}-x.spec.md`, text: `---\ndependencies: [${deps}]\n---` });
const specs = [spec(1), spec(2, '"001"'), spec(3, "2"), spec(4), spec(5), spec(6)];

describe("montarBlocos", () => {
  it("uses blocks.json and derives block dependencies from the specs", () => {
    const r = montarBlocos(JSON.stringify([{ nome: "A", specs: [1] }, { nome: "B", specs: ["002", 3] }, { nome: "C", specs: [4, 5, 6] }]), specs);
    expect(r.aviso).toBeUndefined();
    expect(r.blocos.map((b) => b.depende)).toEqual([[], [1], []]);
    expect(dependenciasFaltando(r.blocos, [2], [])).toEqual([1]);
    expect(dependenciasFaltando(r.blocos, [2], [1])).toEqual([]);
  });
  it("falls back to groups of 5 when a spec is missing from the file", () => {
    const r = montarBlocos(JSON.stringify([{ nome: "A", specs: [1] }]), specs);
    expect(r.aviso).toMatch(/blocks\.json/);
    expect(r.blocos.map((b) => b.specs)).toEqual([[1, 2, 3, 4, 5], [6]]);
  });
});
