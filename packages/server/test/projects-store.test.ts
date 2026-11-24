import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { newMission } from "@lab/core/src/mission.ts";
import type { Projeto } from "@lab/core/src/projects.ts";
import { createProjectsStore, lerRetomada, NOTES_LIMIT } from "../src/projects-store.ts";
import { createStore } from "../src/store.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
let dir: string;
beforeEach(() => { mkdirSync(SCRATCH, { recursive: true }); dir = mkdtempSync(join(SCRATCH, "pstore-")); });
const proj = (id: string, caminho = "/x"): Projeto => ({ id, nome: id, apelidos: [], comandos: [], origem: { tipo: "pasta", valor: caminho }, caminho, criadoEm: "2026-01-01T00:00:00Z" });

describe("projects store", () => {
  it("persists atomically, reloads, gets, removes", () => {
    const f = join(dir, "projects.json");
    const s = createProjectsStore(f);
    s.add(proj("a"));
    s.add(proj("b"));
    expect(readdirSync(dir)).toEqual(["projects.json"]);
    const again = createProjectsStore(f);
    expect(again.list().map((p) => p.id)).toEqual(["a", "b"]);
    expect(again.get("a")?.id).toBe("a");
    expect(again.get("../x")).toBeUndefined();
    expect(again.remove("a")).toBe(true);
    expect(again.remove("a")).toBe(false);
    expect(createProjectsStore(f).list().map((p) => p.id)).toEqual(["b"]);
  });
  it("setComandos persists, and old records without comandos load as []", () => {
    const f = join(dir, "projects.json");
    writeFileSync(f, JSON.stringify({ projects: [{ id: "old", nome: "old", origem: { tipo: "pasta", valor: "/x" }, caminho: "/x", criadoEm: "t" }] }));
    const s = createProjectsStore(f);
    expect(s.get("old")?.comandos).toEqual([]);
    expect(s.setComandos("old", ["npm test"])?.comandos).toEqual(["npm test"]);
    expect(createProjectsStore(f).get("old")?.comandos).toEqual(["npm test"]);
    expect(s.setComandos("nope", [])).toBeUndefined();
  });
  it("backs up a corrupt file and starts empty", () => {
    const f = join(dir, "projects.json");
    writeFileSync(f, "{not json");
    const s = createProjectsStore(f);
    expect(s.list()).toEqual([]);
    expect(readdirSync(dir).some((n) => n.startsWith("projects.json.corrupt"))).toBe(true);
    s.add(proj("a"));
    expect(JSON.parse(readFileSync(f, "utf8")).projects).toHaveLength(1);
  });
  it("drops invalid entries on schema failure (backup, empty)", () => {
    const f = join(dir, "projects.json");
    writeFileSync(f, JSON.stringify({ projects: [{ id: "../x" }] }));
    expect(createProjectsStore(f).list()).toEqual([]);
  });
  it("works in memory without a file", () => {
    const s = createProjectsStore();
    s.add(proj("a"));
    expect(s.list()).toHaveLength(1);
  });
});

describe("lerRetomada", () => {
  const now = () => new Date("2026-01-01T00:00:00Z");
  it("returns notes (size-limited) and the latest mission of the project", () => {
    const p = join(dir, "p");
    mkdirSync(join(p, ".claude"), { recursive: true });
    writeFileSync(join(p, ".claude/project-notes.md"), "x".repeat(NOTES_LIMIT * 3));
    const ms = createStore(join(dir, "missions"));
    ms.save({ ...newMission("m-1", "a", now), createdAt: "2026-01-01T00:00:00Z" });
    ms.save({ ...newMission("m-2", "a", now), createdAt: "2026-02-01T00:00:00Z" });
    ms.save({ ...newMission("m-3", "other", now), createdAt: "2026-03-01T00:00:00Z" });
    const r = lerRetomada(proj("a", p), ms);
    expect(r.notes?.length).toBe(NOTES_LIMIT);
    expect(r.lastMission?.id).toBe("m-2");
  });
  it("returns nothing when absent, and never follows symlinks", () => {
    const p = join(dir, "p");
    mkdirSync(join(p, ".claude"), { recursive: true });
    const ms = createStore(join(dir, "missions"));
    expect(lerRetomada(proj("a", p), ms)).toEqual({});
    writeFileSync(join(dir, "secret"), "SECRET");
    symlinkSync(join(dir, "secret"), join(p, ".claude/project-notes.md"));
    expect(lerRetomada(proj("a", p), ms).notes).toBeUndefined();
  });
});
