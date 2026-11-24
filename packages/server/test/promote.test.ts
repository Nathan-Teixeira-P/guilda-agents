import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as realFs from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_FILE_BYTES } from "@lab/core/src/promote.ts";
import { promoteDraft } from "../src/promote.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
let staging: string, project: string;
const put = (rel: string, body = "x") => {
  const p = join(staging, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
};
const tree = (dir: string, base = dir): string[] =>
  !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)]);

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "promote-"));
  staging = join(root, "out");
  project = join(root, "proj");
  mkdirSync(staging);
  mkdirSync(project);
});

describe("promoteDraft", () => {
  it("copies files to <project>/.claude/<subfolder> and lists them", () => {
    put("prd/a.prd.md", "A");
    put("specs/001-x.spec.md", "B");
    const r = promoteDraft(staging, project);
    expect(r).toEqual({ ok: true, promoted: ["prd/a.prd.md", "specs/001-x.spec.md"] });
    expect(readFileSync(join(project, ".claude/prd/a.prd.md"), "utf8")).toBe("A");
    expect(tree(project).sort()).toEqual([".claude/prd/a.prd.md", ".claude/specs/001-x.spec.md"]);
  });

  it("keeps a .bak of an existing destination", () => {
    mkdirSync(join(project, ".claude/prd"), { recursive: true });
    writeFileSync(join(project, ".claude/prd/a.md"), "OLD");
    put("prd/a.md", "NEW");
    expect(promoteDraft(staging, project).ok).toBe(true);
    expect(readFileSync(join(project, ".claude/prd/a.md"), "utf8")).toBe("NEW");
    expect(readFileSync(join(project, ".claude/prd/a.md.bak"), "utf8")).toBe("OLD");
  });

  it("replaces an older .bak on a second promotion", () => {
    put("prd/a.md", "1");
    promoteDraft(staging, project);
    put("prd/a.md", "2");
    promoteDraft(staging, project);
    put("prd/a.md", "3");
    promoteDraft(staging, project);
    expect(readFileSync(join(project, ".claude/prd/a.md"), "utf8")).toBe("3");
    expect(readFileSync(join(project, ".claude/prd/a.md.bak"), "utf8")).toBe("2");
  });

  it("refuses a symlink in staging and writes nothing", () => {
    put("prd/ok.md");
    writeFileSync(join(SCRATCH, "secret.md"), "S");
    symlinkSync(join(SCRATCH, "secret.md"), join(staging, "prd/link.md"));
    const r = promoteDraft(staging, project);
    expect(r.ok).toBe(false);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  it("refuses a symlinked directory in staging", () => {
    mkdirSync(join(SCRATCH, "elsewhere"), { recursive: true });
    writeFileSync(join(SCRATCH, "elsewhere/a.md"), "S");
    symlinkSync(join(SCRATCH, "elsewhere"), join(staging, "prd"));
    expect(promoteDraft(staging, project).ok).toBe(false);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  it("refuses invalid extension, oversize, unknown subfolder and top-level file", () => {
    for (const [rel, body] of [["prd/a.sh", "x"], ["prd/big.md", "x".repeat(MAX_FILE_BYTES + 1)], ["src/a.md", "x"], ["a.md", "x"]] as const) {
      beforeEachReset();
      put("prd/ok.md");
      put(rel, body);
      expect(promoteDraft(staging, project).ok, rel).toBe(false);
      expect(existsSync(join(project, ".claude")), rel).toBe(false);
    }
  });

  it("refuses an empty staging and a missing staging", () => {
    expect(promoteDraft(staging, project).ok).toBe(false);
    expect(promoteDraft(join(staging, "nope"), project).ok).toBe(false);
  });

  it("refuses when <project>/.claude is a symlink", () => {
    mkdirSync(join(SCRATCH, "target"), { recursive: true });
    symlinkSync(join(SCRATCH, "target"), join(project, ".claude"));
    put("prd/a.md");
    expect(promoteDraft(staging, project).ok).toBe(false);
    expect(existsSync(join(SCRATCH, "target/prd"))).toBe(false);
  });

  it("rolls back everything when a rename fails midway", () => {
    mkdirSync(join(project, ".claude/prd"), { recursive: true });
    writeFileSync(join(project, ".claude/prd/a.md"), "OLD");
    put("prd/a.md", "NEW");
    put("specs/b.md", "B");
    put("specs/c.md", "C");
    let n = 0;
    const fs = {
      ...realFs,
      renameSync: (a: realFs.PathLike, b: realFs.PathLike) => {
        if (String(b).endsWith("c.md") && !String(b).endsWith(".bak")) throw new Error("boom");
        n++;
        realFs.renameSync(a, b);
      },
    };
    const r = promoteDraft(staging, project, { fs });
    expect(r.ok).toBe(false);
    expect(n).toBeGreaterThan(0); // something had already been moved
    expect(tree(project).sort()).toEqual([".claude/prd/a.md"]);
    expect(readFileSync(join(project, ".claude/prd/a.md"), "utf8")).toBe("OLD");
  });

  it("leaves no temp files when a copy fails", () => {
    put("prd/a.md");
    put("specs/b.md");
    let n = 0;
    const fs = { ...realFs, copyFileSync: (a: realFs.PathLike, b: realFs.PathLike) => { if (++n === 2) throw new Error("boom"); realFs.copyFileSync(a, b); } };
    expect(promoteDraft(staging, project, { fs }).ok).toBe(false);
    expect(tree(project)).toEqual([]);
  });

  function beforeEachReset() {
    const root = mkdtempSync(join(SCRATCH, "promote-"));
    staging = join(root, "out");
    project = join(root, "proj");
    mkdirSync(staging);
    mkdirSync(project);
  }
});
