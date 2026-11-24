import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLine, type StreamEvent } from "../src/stream.ts";

const fx = (n: string): StreamEvent[] =>
  readFileSync(new URL(`../../../tests/fixtures/${n}.jsonl`, import.meta.url), "utf8").split("\n").flatMap(parseLine);
const kinds = (es: StreamEvent[], k: string) => es.filter((e) => e.kind === k);

describe("parseLine", () => {
  it("basic: init, usage, rate-limit and result", () => {
    const es = fx("stream-basic");
    expect(kinds(es, "init")).toHaveLength(1);
    expect(kinds(es, "usage")[0]).toMatchObject({ agent: "main", tokens: { cacheCreation: 9475 } });
    expect(kinds(es, "rate-limit")[0]).toMatchObject({ fiveHour: { utilization: 0.14, resetsAt: 1795243200, status: "allowed" } });
    const r = kinds(es, "result")[0];
    expect(r).toMatchObject({ subtype: "success", isError: false, text: "SPIKE-OK oi! Como posso ajudar?" });
    expect((r as { modelUsage: object }).modelUsage).toHaveProperty("claude-haiku-5-5");
  });

  it("subagent fixture: several inits/results, task events, agent attribution", () => {
    const es = fx("stream-subagent");
    expect(kinds(es, "init").length).toBeGreaterThan(1);
    expect(kinds(es, "result")).toHaveLength(3);
    expect(kinds(es, "subagent-started")[0]).toMatchObject({ agentId: "ae5eca652855e8963", subagentType: "helper" });
    expect(kinds(es, "subagent-finished")[0]).toMatchObject({ status: "completed", totalTokens: 4840 });
    expect(kinds(es, "tool").map((t) => (t as { name: string }).name)).toContain("Agent");
    expect(kinds(es, "usage").some((u) => (u as { agent: string }).agent !== "main")).toBe(true);
  });

  it("budget fixture carries the exhaustion signal", () => {
    expect(kinds(fx("stream-budget-exceeded"), "result")[0]).toMatchObject({
      subtype: "error_max_budget_usd",
      isError: true,
      terminalReason: "budget_exhausted",
    });
  });

  it("permission denials are collected", () => {
    const r = kinds(fx("stream-permission-denied"), "result")[0] as { permissionDenials: { toolName: string }[] };
    expect(r.permissionDenials.map((p) => p.toolName)).toEqual(["Write", "Bash", "Edit"]);
  });

  it("never throws on bad lines", () => {
    expect(parseLine("{not json")).toEqual([{ kind: "desconhecido", reason: "invalid-json" }]);
    expect(parseLine("[1,2]")[0]).toMatchObject({ kind: "desconhecido" });
    expect(parseLine('{"type":"system","subtype":"init"}')[0]).toMatchObject({ kind: "desconhecido" });
    expect(parseLine('{"type":"result","total_cost_usd":"x"}')[0]).toMatchObject({ kind: "desconhecido" });
    expect(parseLine("   ")).toEqual([]);
  });

  it("tolerates extra fields", () => {
    const l = '{"type":"system","subtype":"init","session_id":"s","novo":{"a":1}}';
    expect(parseLine(l)[0]).toMatchObject({ kind: "init", sessionId: "s" });
  });
});

describe("text events", () => {
  it("emits main-agent and subagent text blocks with attribution", () => {
    const t = kinds(fx("stream-loops"), "text") as { agent: string; text: string }[];
    expect(t[0]).toEqual({ kind: "text", agent: "main", text: "SPIKE-OK oi! Como posso ajudar?" });
    expect(t.filter((e) => e.agent !== "main")).toHaveLength(1);
  });
});

describe("Bash command", () => {
  it("tool events carry the Bash command only", () => {
    const l = (name: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name, input: { command: "npm test" } }] } });
    expect(parseLine(l("Bash"))).toEqual([{ kind: "tool", agent: "main", name: "Bash", command: "npm test" }]);
    expect(parseLine(l("Read"))).toEqual([{ kind: "tool", agent: "main", name: "Read" }]);
  });
});

describe("task_progress", () => {
  it("becomes a subagent-progress event with the running token total", () => {
    const line = JSON.stringify({ type: "system", subtype: "task_progress", task_id: "a1", subagent_type: "explorer", usage: { total_tokens: 4777 } });
    expect(parseLine(line)).toEqual([{ kind: "subagent-progress", agentId: "a1", subagentType: "explorer", totalTokens: 4777 }]);
  });
});
