import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newMission, parseMission, transition, writeMission, type Stage } from "../src/mission.js";

const now = () => new Date("2026-01-01T00:00:00.000Z");
const later = () => new Date("2026-01-01T00:05:00.000Z");
const at = (stage: Stage) => ({ ...newMission("m1", "proj", now), stage });

describe("transitions", () => {
  it("starts at intake with zero cost", () => {
    const m = newMission("m1", "proj", now);
    expect(m).toMatchObject({ stage: "intake", costUsd: 0, loops: {}, createdAt: now().toISOString() });
  });
  it("intake -> planejando", () =>
    expect(transition(at("intake"), "planejando", { now: later }).stage).toBe("planejando"));
  it("planejando -> aguardando-aprovacao", () =>
    expect(transition(at("planejando"), "aguardando-aprovacao", { now }).stage).toBe("aguardando-aprovacao"));
  it("aguardando-aprovacao -> planejando (feedback)", () =>
    expect(transition(at("aguardando-aprovacao"), "planejando", { now }).stage).toBe("planejando"));
  it("aguardando-aprovacao -> executando with approval", () =>
    expect(transition(at("aguardando-aprovacao"), "executando", { now, approved: true }).stage).toBe("executando"));
  it("executando -> concluida", () =>
    expect(transition(at("executando"), "concluida", { now }).stage).toBe("concluida"));
  it("concluida -> executando (follow-up, needs approval flag)", () =>
    expect(transition(at("concluida"), "executando", { now, approved: true }).stage).toBe("executando"));
  it("executando -> parada", () =>
    expect(transition(at("executando"), "parada", { now }).stage).toBe("parada"));
  it("intake -> parada", () => expect(transition(at("intake"), "parada", { now }).stage).toBe("parada"));
  it("stamps updatedAt from the injected clock", () =>
    expect(transition(at("intake"), "planejando", { now: later }).updatedAt).toBe(later().toISOString()));
  it("does not mutate the input", () => {
    const m = at("intake");
    transition(m, "planejando", { now });
    expect(m.stage).toBe("intake");
  });
});

describe("pausada", () => {
  const paused = (from: "planejando" | "executando") =>
    transition(at(from), "pausada", { now, reason: "disjuntor: x" });
  it.each(["planejando", "executando"] as const)("%s -> pausada keeps reason and origin", (s) => {
    expect(paused(s)).toMatchObject({ stage: "pausada", pauseReason: "disjuntor: x", pausedFrom: s });
  });
  it("pausada needs a reason", () => expect(() => transition(at("planejando"), "pausada", { now })).toThrow(/reason/));
  it("pausada -> planejando clears the pause fields", () => {
    const m = transition(paused("planejando"), "planejando", { now });
    expect(m.stage).toBe("planejando");
    expect(m).not.toHaveProperty("pauseReason");
    expect(m).not.toHaveProperty("pausedFrom");
  });
  it("pausada -> executando needs the gate", () => {
    expect(() => transition(paused("executando"), "executando", { now })).toThrow(/gate/);
    expect(transition(paused("executando"), "executando", { now, approved: true }).stage).toBe("executando");
  });
  it("a paused plan can never jump to executando, even approved", () =>
    expect(() => transition(paused("planejando"), "executando", { now, approved: true })).toThrow(/invalid/));
  it("pausada -> parada", () => expect(transition(paused("executando"), "parada", { now }).stage).toBe("parada"));
  it.each(["aguardando-aprovacao", "concluida", "parada", "pausada"] as const)("%s -> pausada throws", (s) =>
    expect(() => transition(at(s), "pausada", { now, reason: "r" })).toThrow(/invalid/),
  );
  it.each(["concluida", "aguardando-aprovacao", "intake", "pausada"] as const)("pausada -> %s throws", (to) =>
    expect(() => transition(paused("executando"), to, { now, approved: true })).toThrow(/invalid/),
  );
  it("parada can be taken up again, but never skips the gate or completes", () => {
    expect(transition(at("parada"), "planejando", { now }).stage).toBe("planejando");
    expect(() => transition(at("parada"), "executando", { now })).toThrow(/gate/);
    expect(transition(at("parada"), "executando", { now, approved: true }).stage).toBe("executando");
    expect(() => transition(at("parada"), "concluida", { now })).toThrow(/invalid/);
  });
});

describe("gate enforcement", () => {
  it("executando unreachable without approval", () => {
    expect(() => transition(at("aguardando-aprovacao"), "executando", { now })).toThrow(/gate/);
    expect(() => transition(at("aguardando-aprovacao"), "executando", { now, approved: false })).toThrow(/gate/);
  });
  it.each(["intake", "planejando"] as const)("executando unreachable from %s even if approved", (s) =>
    expect(() => transition(at(s), "executando", { now, approved: true })).toThrow(/invalid/),
  );
});

describe("invalid transitions", () => {
  it.each([
    ["intake", "concluida"],
    ["planejando", "executando"],
    ["executando", "planejando"],
  ] as const)("%s -> %s throws", (from, to) =>
    expect(() => transition(at(from), to, { now, approved: true })).toThrow(/invalid/),
  );
});

describe("parseMission", () => {
  const good = JSON.stringify(newMission("m1", "proj", now));
  it("parses valid data", () => expect(parseMission(good)?.id).toBe("m1"));
  it("keeps extra fields", () =>
    expect((parseMission(JSON.stringify({ ...JSON.parse(good), extra: 1 })) as any).extra).toBe(1));
  it("applies defaults for cost and loops", () => {
    const { costUsd, loops, ...rest } = JSON.parse(good);
    expect(parseMission(JSON.stringify(rest))).toMatchObject({ costUsd: 0, loops: {} });
  });
  it.each(["", "{bad", "null", "[]", '{"id":"x"}', '{"id":"x","project":"p","stage":"nope","createdAt":"a","updatedAt":"b"}'])(
    "returns undefined, never throws, for %j",
    (t) => expect(parseMission(t)).toBeUndefined(),
  );
});

describe("writeMission", () => {
  it("writes mission.json atomically, leaving no temp file", () => {
    const dir = mkdtempSync(join(tmpdir(), "mission-"));
    const m = newMission("m1", "proj", now);
    writeMission(dir, m);
    writeMission(dir, { ...m, costUsd: 1.5 });
    expect(readdirSync(dir)).toEqual(["mission.json"]);
    expect(parseMission(readFileSync(join(dir, "mission.json"), "utf8"))?.costUsd).toBe(1.5);
    expect(existsSync(join(dir, "mission.json"))).toBe(true);
  });
});
