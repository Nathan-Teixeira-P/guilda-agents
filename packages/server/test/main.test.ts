import { mkdtempSync } from "node:fs";
import { request } from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHub } from "../src/main.ts";

let hub: Awaited<ReturnType<typeof startHub>>;
beforeAll(async () => { hub = await startHub({ hubDir: mkdtempSync(join(tmpdir(), "hub-")), port: 0 }); });
afterAll(() => hub.close());

const get = (path: string, host?: string, port = hub.port, hostname = "127.0.0.1") =>
  new Promise<{ status: number; json: any }>((resolve, reject) => {
    const r = request({ host: hostname, port, path, headers: host ? { host } : {} }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode!, json: t.startsWith("{") ? JSON.parse(t) : t }));
    });
    r.on("error", reject);
    r.end();
  });

describe("hub smoke", () => {
  it("lists are empty", async () => {
    expect(await get("/missions")).toEqual({ status: 200, json: { missions: [] } });
    expect(await get("/projects")).toEqual({ status: 200, json: { projects: [] } });
  });
  it("usage starts unavailable (GET never calls the model)", async () => {
    expect(await get("/usage")).toEqual({ status: 200, json: { estado: "indisponivel", motivo: "sem leitura" } });
  });
  it("rejects a foreign Host", async () => {
    expect((await get("/missions", "evil.com")).status).toBe(403);
  });
  it("serves the front-end/help page on /", async () => {
    expect((await get("/")).status).toBe(200);
  });
  it("binds loopback only", async () => {
    expect(hub.server.server.address()).toMatchObject({ address: "127.0.0.1" });
    const ext = Object.values(networkInterfaces()).flat().find((i) => i && !i.internal && i.family === "IPv4");
    if (ext) await expect(get("/missions", undefined, hub.port, ext.address)).rejects.toThrow();
  });
});
