import { describe, expect, it } from "vitest";
import { caminho, criarSim, derivarPainel, montarPlanta, recadosNovos, type Atividade, type Ret } from "../src/logic/escritorio.ts";
import type { Ev } from "../src/logic/events.ts";
import { ROSTER } from "../src/roster.ts";
import type { M } from "../src/logic/stages.ts";

const P = montarPlanta();
const dentro = (r: Ret, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const lcg = (seed = 7) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const m = (stage: M["stage"], id = "m1"): M => ({ id, project: "p", stage, costUsd: 0, createdAt: "", updatedAt: "" });

describe("planta", () => {
  it("gives every roster member exactly one seat", () => {
    expect(Object.keys(P.assento).sort()).toEqual(ROSTER.map((r) => r.tecnico).sort());
  });
  it("keeps the 5 zones the user asked for", () => {
    const z = (id: string) => P.salas.find((s) => s.id === id)!.agentes;
    expect(z("guerra")).toEqual(["planner", "frontend-architect", "prd-writer", "spec-writer", "spec-checker", "explorer"]);
    expect(z("torre")).toEqual(["ops", "deal-auditor"]);
    expect(P.sala["orchestrator"]).toBe("mesa");
  });
  it("never walks through a desk, and crosses walls only at doors", () => {
    for (const n of Object.values(P.nos)) {
      for (const v of n.viz) {
        const o = P.nos[v]!;
        expect(o.viz, `${n.id}<->${v} symmetric`).toContain(n.id);
        for (let t = 0; t <= 1; t += 0.02) {
          const x = n.x + (o.x - n.x) * t, y = n.y + (o.y - n.y) * t;
          for (const d of P.mesas) expect(dentro(d, x, y), `${n.id}->${v} inside a desk`).toBe(false);
        }
        if (n.zona !== o.zona) expect(n.id.startsWith("p:") || o.id.startsWith("p:"), `${n.id}->${v} skips the door`).toBe(true);
      }
    }
  });
  it("reaches every seat from every other", () => {
    for (const a of Object.values(P.assento)) expect(caminho(P, P.assento["orchestrator"]!, a).length, a).toBeGreaterThan(0);
  });
});

describe("simulação", () => {
  it("walks idle agents between waypoints, never off the graph's bounding box, and sits again", () => {
    const sim = criarSim(P, lcg(), { maxPasseio: 6 });
    const fases = new Set<string>();
    let ruim = 0;
    for (let i = 0; i < 6000; i++) {
      sim.passo(33, {});
      for (const a of sim.atores) { fases.add(a.fase); if (a.x < 0 || a.x > 800 || a.y < 0 || a.y > 480 || P.mesas.some((d) => dentro(d, a.x, a.y))) ruim++; }
    }
    expect(ruim).toBe(0);
    expect([...fases].sort()).toEqual(["andando", "ocioso", "sentado"]);
  });
  it("caps wanderers", () => {
    const sim = criarSim(P, lcg(3), { maxPasseio: 2 });
    for (let i = 0; i < 5000; i++) { sim.passo(33, {}); expect(sim.atores.filter((a) => a.fase !== "sentado").length).toBeLessThanOrEqual(2 + 0); }
  });
  it("sends an active agent to its desk and keeps it there; releases it when done", () => {
    const sim = criarSim(P, lcg(5), { maxPasseio: 10 });
    for (let i = 0; i < 600; i++) sim.passo(33, {});
    const on: Record<string, Atividade> = { coder: { ativo: true, falhou: false } };
    for (let i = 0; i < 1500; i++) sim.passo(33, on);
    const a = sim.atores.find((x) => x.id === "coder")!;
    expect(a.fase).toBe("sentado");
    expect(a.no).toBe(P.assento["coder"]);
    for (let i = 0; i < 3000; i++) { sim.passo(33, on); expect(a.fase).toBe("sentado"); }
    for (let i = 0; i < 3000; i++) sim.passo(33, {});
    expect(a.motivo).toBe("passeio");
  });
  it("carries a scroll from the sender's desk to the receiver's desk", () => {
    const sim = criarSim(P, () => 0.99, { maxPasseio: 0 });
    sim.recado({ de: "orchestrator", para: "coder" });
    const a = sim.atores.find((x) => x.id === "coder")!;
    let viuRolo = false, viuVazio = false;
    for (let i = 0; i < 2000 && !(a.fase === "sentado"); i++) { sim.passo(33, { coder: { ativo: true, falhou: false } }); if (a.carrega) viuRolo = true; else viuVazio = true; }
    expect(viuVazio && viuRolo).toBe(true);
    expect(a.fase).toBe("sentado");
    expect(a.carrega).toBe(false);
  });
  it("static pose puts everyone at their desk", () => {
    const sim = criarSim(P, lcg());
    for (let i = 0; i < 2000; i++) sim.passo(33, {});
    sim.parar();
    expect(sim.atores.every((a) => a.fase === "sentado" && a.no === a.casa)).toBe(true);
  });
});

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
  it("derives handoffs from the previous started agent, first call is baseline", () => {
    const base = recadosNovos(undefined, evs);
    expect(base.novos).toEqual([]);
    const mais: Record<string, Ev[]> = { m1: [...evs["m1"]!, { kind: "subagent-started", agentId: "a4", subagentType: "reviewer" }] };
    expect(recadosNovos(base.contagem, mais).novos).toEqual([{ de: "tester", para: "reviewer" }]);
    expect(recadosNovos({}, { m1: [evs["m1"]![0]!] }).novos).toEqual([{ de: "orchestrator", para: "planner" }]);
  });
});
