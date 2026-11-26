import { describe, expect, it } from "vitest";
import { groupByStage, STAGE_ORDER, type M } from "../src/logic/stages.ts";
import { consumoPp, faixa, formatDesde, formatTempoRestante } from "../src/logic/time.ts";
import { cronicaDe, gateState, ondeMaisGastou, ehComando, contarTrocas, type Ev } from "../src/logic/events.ts";

const m = (id: string, stage: M["stage"], updatedAt = "2026-01-01T00:00:00Z"): M => ({ id, project: "p", stage, costUsd: 0, createdAt: updatedAt, updatedAt });

describe("groupByStage", () => {
  it("has every stage, newest first", () => {
    const g = groupByStage([m("a", "executando", "2026-01-01T00:00:00Z"), m("b", "executando", "2026-01-02T00:00:00Z"), m("c", "parada")]);
    expect(Object.keys(g).sort()).toEqual([...STAGE_ORDER].sort());
    expect(g.executando.map((x) => x.id)).toEqual(["b", "a"]);
    expect(g.intake).toEqual([]);
  });
});

describe("formatTempoRestante", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const at = (s: number) => now.getTime() / 1000 + s;
  it("formats minutes, hours and days", () => {
    expect(formatTempoRestante(at(47 * 60), now)).toBe("47min");
    expect(formatTempoRestante(at(2 * 3600 + 10 * 60), now)).toBe("2h10");
    expect(formatTempoRestante(at(3 * 86400 + 4 * 3600), now)).toBe("3d 4h");
  });
  it("expired window", () => expect(formatTempoRestante(at(-5), now)).toBe("já reiniciou"));
});

describe("formatDesde", () => {
  const now = new Date("2026-01-01T01:00:00Z");
  it("relative", () => {
    expect(formatDesde("2026-01-01T00:59:40Z", now)).toBe("agora");
    expect(formatDesde("2026-01-01T00:45:00Z", now)).toBe("há 15min");
    expect(formatDesde("2025-12-31T22:00:00Z", now)).toBe("há 3h");
    expect(formatDesde("2025-12-29T01:00:00Z", now)).toBe("há 3d");
    expect(formatDesde("lixo", now)).toBe("—");
  });
});

describe("faixa", () => {
  it("thresholds 80/90", () => {
    expect(faixa(79.9)).toBe("normal");
    expect(faixa(80)).toBe("atencao");
    expect(faixa(89.9)).toBe("atencao");
    expect(faixa(90)).toBe("critico");
  });
});

describe("consumoPp", () => {
  it("difference in percentage points, never negative", () => {
    expect(consumoPp(0.35, 0.39)).toBe(4);
    expect(consumoPp(0.35, 0.3)).toBe(0); // window reset in between
    expect(consumoPp(undefined, 0.4)).toBeUndefined();
  });
});

describe("gateState", () => {
  it("maps stage to the seal state", () => {
    expect(gateState({ ...m("a", "aguardando-aprovacao") })).toBe("aguardando");
    expect(gateState(m("a", "executando"))).toBe("selado");
    expect(gateState(m("a", "concluida"))).toBe("selado");
    expect(gateState({ ...m("a", "pausada"), pausedFrom: "executando" })).toBe("selado");
    expect(gateState({ ...m("a", "pausada"), pausedFrom: "planejando" })).toBe("fechado");
    expect(gateState(m("a", "planejando"))).toBe("fechado");
  });
});

describe("ondeMaisGastou", () => {
  it("aggregates tokens by agent across missions", () => {
    const r = ondeMaisGastou([
      { ...m("a", "concluida"), tokensByAgent: { coder: 300, tester: 100 }, costByModel: { sonnet: 3 } },
      { ...m("b", "concluida"), tokensByAgent: { coder: 100 }, costByModel: { sonnet: 1, haiku: 0.1 } },
    ]);
    expect(r).toEqual({ agente: "coder", pct: 80 });
  });
  it("undefined when nothing was spent", () => expect(ondeMaisGastou([m("a", "concluida")])).toBeUndefined());
});

describe("cronicaDe", () => {
  it("turns events into lines, groups repeated tools, hides unknown", () => {
    const lines = cronicaDe([
      { kind: "subagent-started", agentId: "t1", subagentType: "coder" },
      { kind: "tool", agent: "t1", name: "Read" },
      { kind: "tool", agent: "t1", name: "Read" },
      { kind: "tool", agent: "t1", name: "Read" },
      { kind: "desconhecido", reason: "unrecognized" },
      { kind: "tool", agent: "t1", name: "Edit" },
      { kind: "subagent-finished", agentId: "t1", status: "failed" },
      { kind: "result", isError: false, text: "ok", modelUsage: {}, permissionDenials: [] },
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      "Regente convocou Ferreiro",
      "Ferreiro usou Read (3x)",
      "Ferreiro usou Edit",
      "Ferreiro terminou com erro (failed)",
      "A execução terminou",
    ]);
    expect(lines[3]?.tone).toBe("erro");
  });
});

describe("background commands are not agents", () => {
  it("drops untyped tasks and restarts the chain count on OK", () => {
    const comandos = new Set<string>();
    const evs: Ev[] = [
      { kind: "subagent-started", agentId: "bash1" },
      { kind: "subagent-started", agentId: "c1", subagentType: "coder" },
      { kind: "subagent-finished", agentId: "bash1", status: "failed" },
    ];
    expect(evs.filter((e) => !ehComando(e, comandos))).toEqual([evs[1]]);
    const ok: Ev = { kind: "text", agent: "main", text: "OK 446" };
    expect(contarTrocas([evs[1]!, ok])).toBe(0);
    expect(contarTrocas([ok, evs[1]!, ok])).toBe(1);
  });
});
