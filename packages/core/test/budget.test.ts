import { describe, expect, it } from "vitest";
import { addUsage, newBudget, recordResult } from "../src/budget.js";

describe("budget", () => {
  it("accumulates cost per agent and total", () => {
    let b = newBudget();
    b = addUsage(b, { agent: "coder", costUsd: 0.5 });
    b = addUsage(b, { agent: "coder", costUsd: 0.25 });
    b = addUsage(b, { agent: "tester", costUsd: 0.25 });
    expect(b.byAgent).toEqual({ coder: 0.75, tester: 0.25 });
    expect(b.totalUsd).toBe(1);
  });
  it("normal result sets cumulative total (no double counting) and does not trip", () => {
    let b = recordResult(newBudget(), { subtype: "success", total_cost_usd: 0.2 });
    b = recordResult(b, { subtype: "success", total_cost_usd: 0.3 });
    expect(b.totalUsd).toBe(0.3);
  });
  it("is pure", () => {
    const b = newBudget();
    addUsage(b, { agent: "a", costUsd: 1 });
    expect(b).toEqual(newBudget());
  });
});
