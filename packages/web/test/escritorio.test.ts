import { describe, expect, it } from "vitest";
import { derivarPainel } from "../src/logic/escritorio.ts";
import type { Ev } from "../src/logic/events.ts";
import type { M } from "../src/logic/stages.ts";

const m = (stage: M["stage"], id = "m1"): M => ({ id, project: "p", stage, costUsd: 0, createdAt: "", updatedAt: "" });

describe("painel", () => {
  const evs: Record<string, Ev[]> = { m1: [
    { kind: "subagent-started", agentId: "a1", subagentType: "planner" },
    { kind: "tool", agent: "a1", name: "Read" },
    { kind: "subagent-finished", agentId: "a1", status: "completed" },
    { kind: "subagent-started", agentId: "a2", subagentType: "coder" },
    { kind: "tool", agent: "a2", name: "Edit" },
    { kind: "tool", agent: "main", name: "Task" },
    { kind: "subagent-started", agentId: "a3", subagentType: "tester" },
    { kind: "subagent-finished", agentId: "a3", status: "failed" },
  ] };
  it("marks active, failed and tools; empty hall when nothing runs", () => {
    const p = derivarPainel([m("executando")], evs);
    expect(p.aoVivo).toBe(true);
    expect(p.atividade["coder"]).toEqual({ ativo: true, falhou: false, ferramenta: "Edit", projeto: expect.any(String) });
    expect(p.atividade["tester"]?.falhou).toBe(true);
    expect(p.atividade["planner"]?.ativo).toBeFalsy();
    expect(p.atividade["orchestrator"]?.ferramenta).toBe("Task");
    const calmo = derivarPainel([m("concluida")], evs);
    expect(calmo.aoVivo).toBe(false);
    expect(calmo.atividade).toEqual({});
  });
});
