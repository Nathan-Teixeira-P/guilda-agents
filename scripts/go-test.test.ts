import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const run = (...a: string[]) => spawnSync(join(import.meta.dirname, "go-test.sh"), a, { encoding: "utf8" });

describe("go-test.sh", () => {
  it("refuses dangerous or heavy arguments before running anything", () => {
    for (const a of [[], ["./..."], ["./ent/..."], ["./pkg/../x"], ["-exec", "sh", "./pkg/"], ["-toolexec=sh", "./pkg/"], ["./pkg/", "-run", "a;b"], ["/etc"]])
      expect(run(...a).status, a.join(" ")).toBe(2);
  });
});
