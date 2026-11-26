import { describe, expect, it } from "vitest";
import { NOTES_PROMPT_LIMIT, promptFase1, promptFase2, instrucaoExecucao } from "../src/prompt.ts";

const base = { demanda: "add a CLI", stagingDir: "/m/m-1/out", projetoPath: "/p/proj" };

describe("promptFase1", () => {
  it("carries the demand, paths and the fixed rules", () => {
    const p = promptFase1({ ...base, briefingPath: "/m/m-1/brief.md" });
    expect(p).toContain("add a CLI");
    expect(p).toContain("/m/m-1/out");
    expect(p).toContain("/p/proj");
    expect(p).toContain("/m/m-1/brief.md");
    expect(p).toMatch(/only write (files )?(in|under) \/m\/m-1\/out/i);
    expect(p).toMatch(/never commit or push/i);
    expect(p).toMatch(/subagents? (cannot|can't|do not|don't) (create|spawn|call)/i);
    expect(p).toMatch(/one at a time/i);
    expect(p).toMatch(/LEAN.*no planner, PRD, specs/);
  });
  it("names the sequence explorer, planner, prd-writer, spec-writer", () => {
    const p = promptFase1(base);
    const at = ["explorer", "planner", "prd-writer", "spec-writer"].map((n) => p.indexOf(n));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it("appends project notes capped at the limit, and omits the section without notes", () => {
    expect(promptFase1(base)).not.toMatch(/project notes/i);
    const p = promptFase1({ ...base, notas: "N".repeat(NOTES_PROMPT_LIMIT + 500) });
    expect(p).toMatch(/project notes/i);
    expect(p.match(/N/g)!.length).toBeLessThanOrEqual(NOTES_PROMPT_LIMIT + 30); // + the letter N elsewhere in the fixed text
    expect(p).not.toContain("N".repeat(NOTES_PROMPT_LIMIT + 1));
  });
  it("includes the user's feedback when adjusting", () => {
    expect(promptFase1({ ...base, comentario: "more tests" })).toContain("more tests");
  });
  it("stays short: no file contents, only fixed text plus inputs", () => {
    expect(promptFase1(base).length).toBeLessThan(2500);
  });
});

describe("promptFase2", () => {
  it("lists spec paths, the project, and forbids commit/push", () => {
    const p = promptFase2({ specs: ["/p/proj/.claude/specs/001-a.spec.md"], projetoPath: "/p/proj" });
    expect(p).toContain("/p/proj/.claude/specs/001-a.spec.md");
    expect(p).toContain("/p/proj");
    expect(p).toMatch(/never commit or push/i);
  });
});

describe("promptFase2 resume comment", () => {
  it("includes the user comment only when given", () => {
    const i = { specs: ["/p/a.spec.md"], projetoPath: "/p" };
    expect(promptFase2({ ...i, comentario: "keep going" })).toContain("keep going");
    expect(promptFase2(i)).not.toContain("resumed");
    expect(promptFase2(i)).not.toContain("local.ts");
    expect(promptFase2({ ...i, hubDir: "/hub" })).toContain("node /hub/scripts/local.ts compact-test-log");
  });
});

describe("promptFase2 without specs", () => {
  it("points at the approved plan", () => {
    expect(promptFase2({ specs: [], projetoPath: "/p" })).toContain("/p/.claude/handoff/plan.md");
  });
});

describe("instrucaoExecucao", () => {
  it("lists the allowed commands, or says there are none", () => {
    expect(instrucaoExecucao(["npm test"])).toContain("`npm test`");
    expect(instrucaoExecucao([])).toContain("No project commands");
    expect(instrucaoExecucao([])).toContain("OK <spec-number>");
    expect(instrucaoExecucao([], "/hub/scripts/go-test.sh")).toContain("/hub/scripts/go-test.sh ./pkg/");
    expect(instrucaoExecucao([], "/g")).toContain("BUILD <command>");
  });
});
