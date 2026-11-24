import { describe, expect, it } from "vitest";
import {
  check,
  MAX_CHAINED_HANDOFFS,
  MAX_LOOPS_PER_SPEC,
  newBreaker,
  recordHandoff,
  recordLoop,
  userIntervened,
} from "../src/breaker.js";

const now = () => new Date("2026-01-01T00:00:00.000Z");
const later = () => new Date("2026-01-01T00:05:00.000Z");

function loops(n: number, step = "spec-1") {
  let s = newBreaker();
  for (let i = 0; i < n; i++) s = recordLoop(s, step, now);
  return s;
}
function hops(n: number) {
  let s = newBreaker();
  for (let i = 0; i < n; i++) s = recordHandoff(s, now);
  return s;
}

describe("breaker", () => {
  it("uses PRD defaults", () => {
    expect(MAX_LOOPS_PER_SPEC).toBe(2);
    expect(MAX_CHAINED_HANDOFFS).toBe(8);
  });

  it("allows 0..2 loops per spec and stops at 3", () => {
    expect(check(loops(0), "spec-1")).toEqual({ ok: true });
    expect(check(loops(2), "spec-1")).toEqual({ ok: true });
    const v = check(loops(3), "spec-1");
    expect(v).toMatchObject({ parar: true });
    expect("motivo" in v && v.motivo).toMatch(/spec-1/);
  });

  it("counts loops per step independently", () => {
    const s = recordLoop(loops(3, "a"), "b", now);
    expect(check(s, "b")).toEqual({ ok: true });
    expect(check(s, "a")).toMatchObject({ parar: true });
  });

  it("allows 8 chained handoffs and stops at 9", () => {
    expect(check(hops(8), "x")).toEqual({ ok: true });
    const v = check(hops(9), "x");
    expect(v).toMatchObject({ parar: true });
    expect("motivo" in v && v.motivo.length).toBeGreaterThan(0);
    expect("motivoPt" in v && v.motivoPt).toMatch(/9 trocas encadeadas/);
  });

  it("resets both counters when the user intervenes", () => {
    let s = recordHandoff(loops(3), now);
    s = hops(9);
    s = userIntervened(recordLoop(s, "spec-1", now), later);
    expect(s.loops).toEqual({});
    expect(s.handoffs).toBe(0);
    expect(s.lastResetAt).toBe(later().toISOString());
    expect(check(s, "spec-1")).toEqual({ ok: true });
  });

  it("is pure: does not mutate input", () => {
    const s = newBreaker();
    recordLoop(s, "a", now);
    recordHandoff(s, now);
    expect(s).toEqual(newBreaker());
  });

  it("honors per-mission limits", () => {
    expect(check(loops(1), "spec-1", { maxLoops: 0 })).toMatchObject({ parar: true });
    expect(check(hops(3), "x", { maxHandoffs: 2 })).toMatchObject({ parar: true });
    expect(check(hops(2), "x", { maxHandoffs: 2 })).toEqual({ ok: true });
  });
});
