import { describe, expect, it } from "vitest";
import { LOCAL_TASKS, runLocal, type LocalDeps } from "../src/local-tasks.js";
import { allOf, citedPathsExist, formatMatches, maxSize, requiredTerms } from "../src/verify.js";
import { newMission, recordLocal } from "../src/mission.js";

const mk = (text: string | null, over: Partial<LocalDeps> = {}) => {
  const calls = { ollama: 0, fallback: 0 };
  const deps: LocalDeps = {
    enabled: true,
    ollama: async () => {
      calls.ollama++;
      return text === null ? { ok: false } : { ok: true, text };
    },
    fallback: async () => {
      calls.fallback++;
      return "claude";
    },
    exists: (p) => p === "src/a.ts",
    ...over,
  };
  return { deps, calls };
};

describe("runLocal", () => {
  it("refuses anything outside the allowlist without calling anyone", async () => {
    for (const t of ["write-code", "write-spec", "review", "final-text", "decision"]) {
      const { deps, calls } = mk("x");
      expect(await runLocal(t, "in", deps)).toEqual({ via: "refused" });
      expect(calls).toEqual({ ollama: 0, fallback: 0 });
    }
    expect(LOCAL_TASKS).toHaveLength(4);
  });
  it("accepts valid local output", async () => {
    const { deps } = mk("feat(core): add x");
    const r = await runLocal("commit-message-draft", "diff", deps);
    expect(r.via).toBe("local");
  });
  it("invalid output, down, or throwing ollama => fallback", async () => {
    expect((await runLocal("commit-message-draft", "d", mk("Random text").deps)).via).toBe("claude-fallback");
    expect((await runLocal("compact-test-log", "d", mk(null).deps)).via).toBe("claude-fallback");
    const t = mk("x", { ollama: async () => { throw new Error("boom"); } });
    expect((await runLocal("compact-test-log", "d", t.deps)).via).toBe("claude-fallback");
  });
  it("list-relevant-files rejects missing paths", async () => {
    expect((await runLocal("list-relevant-files", "q", mk("src/a.ts\nsrc/zz.ts").deps)).via).toBe("claude-fallback");
    expect((await runLocal("list-relevant-files", "q", mk("- src/a.ts").deps)).via).toBe("local");
  });
  it("disabled => fallback and ollama never called", async () => {
    const { deps, calls } = mk("feat: x", { enabled: false });
    expect((await runLocal("commit-message-draft", "d", deps)).via).toBe("claude-fallback");
    expect(calls).toEqual({ ollama: 0, fallback: 1 });
  });
});

describe("verifiers", () => {
  it("format", () => {
    expect(formatMatches(/^a/)("ab")).toBe(true);
    expect(formatMatches(/^a/)("b")).toBe(false);
  });
  it("maxSize", () => {
    expect(maxSize(3)("abc")).toBe(true);
    expect(maxSize(3)("abcd")).toBe(false);
    expect(maxSize(3)("  ")).toBe(false);
  });
  it("requiredTerms", () => {
    expect(requiredTerms(["a", "b"])("ab")).toBe(true);
    expect(requiredTerms(["a", "c"])("ab")).toBe(false);
  });
  it("citedPathsExist", () => {
    const v = citedPathsExist((p) => p === "src/a.ts");
    expect(v("src/a.ts")).toBe(true);
    expect(v("src/b.ts")).toBe(false);
    expect(allOf(v, maxSize(5))("src/a.ts")).toBe(false);
  });
});

describe("counters", () => {
  it("optional on old missions; recordLocal updates", () => {
    const m = newMission("m1", "p", () => new Date(0));
    expect(m.local).toBeUndefined();
    const a = recordLocal(m, { via: "local", tokensSaved: 10 });
    const b = recordLocal(a, { via: "claude-fallback" });
    expect(recordLocal(b, { via: "refused" }).local).toEqual({ localTasks: 1, fallbacks: 1, tokensSaved: 10 });
  });
});

import { compactLog, inputDerivedTerms, isShortLog, keyLines } from "../src/verify.js";
const LOG = [
  ...Array.from({ length: 80 }, (_, i) => `  ✓ test ${i} passes`),
  " FAIL  src/a.test.ts > sum > adds",
  "AssertionError: expected 3 to be 4",
  "  at src/a.test.ts:12:5",
  ...Array.from({ length: 30 }, (_, i) => `  ✓ more ${i}`),
  " Tests  1 failed | 110 passed (111)",
].join("\n");

describe("compact-test-log input-derived verifier", () => {
  it("finds key lines in the raw log", () => {
    const k = keyLines(LOG);
    expect(k).toEqual(expect.arrayContaining(["FAIL src/a.test.ts > sum > adds", "AssertionError: expected 3 to be 4", "at src/a.test.ts:12:5", "Tests 1 failed | 110 passed (111)"]));
    expect(k.some((l) => l.includes("passes"))).toBe(false);
  });
  it("accepts output that keeps every key line, rejects one that drops a failure line", async () => {
    const good = compactLog(LOG);
    expect(inputDerivedTerms(LOG)(good)).toBe(true);
    const bad = good.split("\n").filter((l) => !l.includes("AssertionError")).join("\n");
    expect(inputDerivedTerms(LOG)(bad)).toBe(false);
    const ok = await runLocal("compact-test-log", LOG, mk(good).deps);
    expect(ok.via).toBe("local");
    expect(ok).toMatchObject({ tokensSaved: expect.any(Number) });
    expect((await runLocal("compact-test-log", LOG, mk(bad).deps)).via).toBe("claude-fallback");
  });
  it("cannot verify a log with no key lines => reject", () => {
    expect(inputDerivedTerms("a\nb")("a")).toBe(false);
  });
  it("compactLog is short, keeps context and summary; isShortLog gates the model", () => {
    const c = compactLog(LOG);
    expect(c.split("\n").length).toBeLessThan(15);
    expect(c).toContain("110 passed");
    expect(isShortLog("a\nb")).toBe(true);
    expect(isShortLog(LOG)).toBe(false);
  });
});
