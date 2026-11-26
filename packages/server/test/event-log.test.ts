import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gravarEvento, lerEventos } from "../src/event-log.ts";

describe("event log", () => {
  it("replays what the screen reads and never stores commands or agent prose", () => {
    const dir = mkdtempSync(join(tmpdir(), "ev-"));
    try {
      expect(lerEventos(dir)).toEqual([]);
      gravarEvento(dir, { kind: "tool", agent: "a", name: "Bash", command: "cat segredo" });
      gravarEvento(dir, { kind: "text", agent: "main", text: "pensando" });
      gravarEvento(dir, { kind: "text", agent: "main", text: "OK 446" });
      expect(lerEventos(dir)).toEqual([{ kind: "tool", agent: "a", name: "Bash" }, { kind: "text", agent: "main", text: "OK 446" }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
