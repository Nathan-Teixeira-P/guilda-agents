import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, PROMOTE_DIRS, planPromotion, type StagedFile } from "../src/promote.ts";

const f = (path: string, over: Partial<StagedFile> = {}): StagedFile => ({ path, kind: "file", size: 10, ...over });
const refused = (files: StagedFile[]) => {
  const r = planPromotion(files);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.reason;
};

describe("planPromotion", () => {
  it("accepts every allowed subfolder and keeps the relative path", () => {
    const files = PROMOTE_DIRS.map((d) => f(`${d}/a/b.md`));
    const r = planPromotion(files);
    expect(r).toEqual({ ok: true, files: files.map((x) => ({ path: x.path, size: 10 })) });
  });

  it("accepts the four extensions, case-insensitively", () => {
    for (const e of ["md", "json", "svg", "png", "PNG"]) expect(planPromotion([f(`design/x.${e}`)]).ok).toBe(true);
  });

  it("refuses traversal, absolute, empty segments and backslashes", () => {
    for (const p of ["../x.md", "prd/../../x.md", "prd/../x.md", "/etc/x.md", "prd//x.md", "prd/x.md/", "./prd/x.md", "prd\\x.md", "", "C:/x.md"])
      refused([f(p)]);
  });

  it("refuses control characters", () => {
    refused([f("prd/a\nb.md")]);
    refused([f("prd/a\0b.md")]);
    refused([f("prd/a\x7fb.md")]);
  });

  it("refuses symlinks and special files", () => {
    expect(refused([f("prd/a.md", { kind: "symlink" })])).toMatch(/symlink/);
    refused([f("prd/a.md", { kind: "other" })]);
  });

  it("refuses bad extension", () => {
    refused([f("prd/a.sh")]);
    refused([f("prd/a")]);
    refused([f("prd/.md")]);
  });

  it("refuses a subfolder outside the closed list, or a top-level file", () => {
    refused([f("src/a.md")]);
    refused([f("PRD/a.md")]);
    refused([f("a.md")]);
    refused([f(".claude/prd/a.md")]);
  });

  it("enforces size limits", () => {
    refused([f("prd/a.md", { size: MAX_FILE_BYTES + 1 })]);
    expect(planPromotion([f("prd/a.md", { size: MAX_FILE_BYTES })]).ok).toBe(true);
    const n = Math.floor(MAX_TOTAL_BYTES / MAX_FILE_BYTES) + 1;
    refused(Array.from({ length: n }, (_, i) => f(`prd/${i}.md`, { size: MAX_FILE_BYTES })));
    refused([f("prd/a.md", { size: -1 })]);
    refused([f("prd/a.md", { size: Number.NaN })]);
  });

  it("refuses duplicates after normalization (case, unicode)", () => {
    refused([f("prd/A.md"), f("prd/a.md")]);
    refused([f("prd/\u00e9.md"), f("prd/e\u0301.md")]);
    refused([f("prd/a.md"), f("prd/a.md")]);
  });

  it("refuses an empty list", () => {
    refused([]);
  });

  it("one bad file refuses the whole plan", () => {
    refused([f("prd/ok.md"), f("../bad.md")]);
  });
});
