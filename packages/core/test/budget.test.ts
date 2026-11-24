import { describe, expect, it } from "vitest";
import { addUsage, excedeu, newBudget, recordResult } from "../src/budget.js";

describe("budget", () => {
  it("accumulates cost per agent and total", () => {
    let b = newBudget();
    b = addUsage(b, { agent: "coder", costUsd: 0.5 });
    b = addUsage(b, { agent: "coder", costUsd: 0.25 });
    b = addUsage(b, { agent: "tester", costUsd: 0.25 });
    expect(b.byAgent).toEqual({ coder: 0.75, tester: 0.25 });
    expect(b.totalUsd).toBe(1);
  });
  it("excedeu by accumulated cost (reaching the cap counts)", () => {
    const b = addUsage(newBudget(), { agent: "a", costUsd: 1 });
    expect(excedeu(b, 1.01)).toBe(false);
    expect(excedeu(b, 1)).toBe(true);
    expect(excedeu(b, 0.5)).toBe(true);
  });
  it("excedeu by error_max_budget_usd signal even if cost looks low", () => {
    const b = recordResult(newBudget(), { subtype: "error_max_budget_usd", total_cost_usd: 0.0012 });
    expect(b.totalUsd).toBe(0.0012);
    expect(excedeu(b, 100)).toBe(true);
  });
  it("excedeu by terminal_reason budget_exhausted", () => {
    const b = recordResult(newBudget(), { terminal_reason: "budget_exhausted" });
    expect(excedeu(b, 100)).toBe(true);
  });
  it("normal result sets cumulative total (no double counting) and does not trip", () => {
    let b = recordResult(newBudget(), { subtype: "success", total_cost_usd: 0.2 });
    b = recordResult(b, { subtype: "success", total_cost_usd: 0.3 });
    expect(b.totalUsd).toBe(0.3);
    expect(excedeu(b, 1)).toBe(false);
  });
  it("is pure", () => {
    const b = newBudget();
    addUsage(b, { agent: "a", costUsd: 1 });
    expect(b).toEqual(newBudget());
  });
});
