import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agruparPorGrupo, FICHA } from "../src/logic/guilda.ts";
import { ROSTER } from "../src/roster.ts";

describe("guilda", () => {
  it("groups every roster member exactly once, Porteiro in Direção", () => {
    const g = agruparPorGrupo();
    expect(g.flatMap((s) => s.membros)).toHaveLength(ROSTER.length);
    expect(new Set(g.map((s) => s.grupo.id)).size).toBe(g.length);
    expect(g[0]!.membros.map((m) => m.codinome)).toContain("Porteiro");
  });
  it("has a ficha for every member, model matching agents/*.md", () => {
    for (const m of ROSTER) {
      const md = readFileSync(new URL(`../../../agents/${m.tecnico}.md`, import.meta.url), "utf8");
      expect(FICHA[m.tecnico]?.funcao, m.tecnico).toBeTruthy();
      expect(FICHA[m.tecnico]!.modelo, m.tecnico).toBe(/^model:\s*(\w+)/m.exec(md)![1]);
    }
  });
});
