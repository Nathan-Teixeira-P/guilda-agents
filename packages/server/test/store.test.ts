import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { newMission } from "@lab/core/src/mission.ts";
import { createStore } from "../src/store.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const now = () => new Date("2026-01-01T00:00:00Z");
let dir: string;
beforeEach(() => { mkdirSync(SCRATCH, { recursive: true }); dir = mkdtempSync(join(SCRATCH, "store-")); });

describe("store", () => {
  it("saves atomically, reads back, lists, ignores junk dirs and corrupt files", () => {
    const s = createStore(dir);
    s.save(newMission("m-1", "p", now));
    expect(s.get("m-1")?.stage).toBe("intake");
    expect(readdirSync(join(dir, "m-1"))).toEqual(["mission.json"]); // no temp leftovers
    mkdirSync(join(dir, "BAD..id"));
    mkdirSync(join(dir, "m-2"));
    expect(s.list().map((m) => m.id)).toEqual(["m-1"]);
    expect(s.get("m-2")).toBeUndefined();
  });
  it("refuses ids that could escape the missions dir", () => {
    const s = createStore(dir);
    expect(() => s.dirOf("../x")).toThrow();
    expect(s.get("../x")).toBeUndefined();
  });
});
