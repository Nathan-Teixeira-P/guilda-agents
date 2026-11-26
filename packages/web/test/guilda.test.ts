import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agruparPorGrupo, FICHA, salasDe } from "../src/logic/guilda.ts";
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

it("agents leave the waiting room only while they work on a running mission", () => {
  const m = { id: "m1", project: "p", stage: "executando", updatedAt: "" } as never;
  const r = salasDe([m], { m1: [
    { kind: "subagent-started", agentId: "a", subagentType: "coder" },
    { kind: "subagent-started", agentId: "b", subagentType: "tester" },
    { kind: "subagent-finished", agentId: "b" },
  ] });
  expect(r.salas[0]!.postos.map((x) => x.tipo)).toEqual(["orchestrator", "coder"]);
  expect(r.espera).toContain("tester");
  expect(r.espera).not.toContain("coder");
  expect(salasDe([{ id: "m1", project: "p", stage: "concluida", updatedAt: "" } as never], {}).salas).toEqual([]);
});
