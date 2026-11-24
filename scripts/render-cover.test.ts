import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "render-cover.sh");
const hasChrome = spawnSync("which", ["google-chrome"]).status === 0;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627"><rect width="1200" height="627" fill="#0f172a"/><circle cx="600" cy="313" r="120" fill="#38bdf8"/></svg>`;

describe("render-cover.sh", () => {
  it.skipIf(!hasChrome)("renders a 1200x627 PNG under 1 MB (skipped: google-chrome not installed)", () => {
    const d = mkdtempSync(join(tmpdir(), "cover-"));
    const [inp, out] = [join(d, "capa.svg"), join(d, "capa.png")];
    writeFileSync(inp, svg);
    const r = spawnSync("bash", [script, inp, out], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const png = readFileSync(out);
    expect(png.length).toBeGreaterThan(0);
    expect(png.length).toBeLessThan(1024 * 1024);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 627]);
  });

  it("fails with a clear message when the input is missing", () => {
    const d = mkdtempSync(join(tmpdir(), "cover-"));
    const out = join(d, "x.png");
    const r = spawnSync("bash", [script, join(d, "nope.svg"), out], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/não encontrad|not found/i);
    expect(existsSync(out)).toBe(false);
  });
});
