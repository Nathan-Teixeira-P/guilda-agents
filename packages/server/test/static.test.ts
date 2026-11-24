import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStatic } from "../src/static.ts";

let root: string, outside: string, port: number, close: () => Promise<void>;
let noDist: number, closeNo: () => Promise<void>;

const listen = async (dist: string) => {
  const s = createServer(createStatic(dist));
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  return { port: (s.address() as { port: number }).port, close: () => new Promise<void>((ok) => { s.closeAllConnections(); s.close(() => ok()); }) };
};
// raw request so `..` is not normalized by a client
const get = (p: number, path: string, method = "GET") =>
  new Promise<{ status: number; headers: Record<string, unknown>; text: string }>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port: p, path, method }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, text: t }));
    });
    r.on("error", reject);
    r.end();
  });

beforeAll(async () => {
  const base = mkdtempSync(join(tmpdir(), "static-"));
  root = join(base, "dist");
  outside = join(base, "secret.txt");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<html>SPA</html>");
  writeFileSync(join(root, "assets/app.js"), "console.log(1)");
  writeFileSync(join(root, "assets/a.css"), "a{}");
  writeFileSync(outside, "TOP SECRET");
  symlinkSync(outside, join(root, "link.txt"));
  symlinkSync(base, join(root, "up"));
  ({ port, close } = await listen(root));
  ({ port: noDist, close: closeNo } = await listen(join(base, "missing")));
});
afterAll(async () => { await close(); await closeNo(); });

describe("static", () => {
  it("serves files with MIME and security headers", async () => {
    const r = await get(port, "/assets/app.js");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/^text\/javascript/);
    expect((await get(port, "/assets/a.css")).headers["content-type"]).toMatch(/^text\/css/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(String(r.headers["content-security-policy"])).toContain("default-src 'self'");
    expect(String(r.headers["content-security-policy"])).toContain("frame-ancestors 'none'");
  });
  it("falls back to index.html for SPA routes, but 404s missing assets", async () => {
    expect((await get(port, "/m/m-abc123")).text).toBe("<html>SPA</html>");
    expect((await get(port, "/")).text).toBe("<html>SPA</html>");
    expect((await get(port, "/assets/missing.js")).status).toBe(404);
  });
  it("blocks traversal (plain, encoded, null byte)", async () => {
    for (const p of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt", "/..%2fsecret.txt", "/%00", "/%zz"]) {
      const r = await get(port, p);
      expect(r.text, p).not.toContain("TOP SECRET");
      expect([400, 404], p).toContain(r.status);
    }
  });
  it("blocks symlinks that leave dist", async () => {
    for (const p of ["/link.txt", "/up/secret.txt"]) {
      const r = await get(port, p);
      expect(r.text, p).not.toContain("TOP SECRET");
      expect(r.status, p).not.toBe(200);
    }
  });
  it("only GET and HEAD", async () => {
    expect((await get(port, "/", "POST")).status).toBe(405);
    expect((await get(port, "/", "HEAD")).status).toBe(200);
  });
  it("explains how to build when dist is missing", async () => {
    const r = await get(noDist, "/");
    expect(r.status).toBe(200);
    expect(r.text).toContain("npm run build:web");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});
