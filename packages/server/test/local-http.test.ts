import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer as createHttp, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/http.ts";
import { createStore } from "../src/store.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const clock = () => new Date("2026-11-21T12:00:00Z");
let root: string, hub: string, srv: ReturnType<typeof createServer>, port: number, ollama: Server | undefined;

const call = (method: string, path: string, body?: object, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; json: any }>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolve({ status: res.statusCode!, json: JSON.parse(t) }));
    });
    r.on("error", reject);
    r.end(body ? JSON.stringify(body) : undefined);
  });
const fakeOllama = async (models: string[]) => {
  ollama = createHttp((_q, s) => s.end(JSON.stringify({ models: models.map((name) => ({ name })) })));
  await new Promise<void>((r) => ollama!.listen(0, "127.0.0.1", r));
  const p = (ollama.address() as AddressInfo).port;
  writeFileSync(join(hub, "local.json"), JSON.stringify({ enabled: false, model: "qwen2.5:3b", port: p }));
};
const boot = async (withHub = true) => {
  srv = createServer({ runner: async () => { throw new Error("x"); }, store: createStore(join(root, "missions")), clock, host: "127.0.0.1", ...(withHub ? { hubDir: hub } : {}) });
  port = await srv.listen(0);
};

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "loc-"));
  hub = join(root, "hub");
  mkdirSync(hub);
});
afterEach(async () => { await srv.close(); ollama?.closeAllConnections(); ollama?.close(); ollama = undefined; });

describe("/local", () => {
  it("defaults: disabled, ollama down; 501 without hubDir", async () => {
    writeFileSync(join(hub, "local.json"), JSON.stringify({ port: 1 }));
    await boot();
    expect((await call("GET", "/local")).json).toEqual({ enabled: false, model: "qwen2.5:3b", ollama: "down", installed: [] });
    await srv.close();
    await boot(false);
    expect((await call("GET", "/local")).status).toBe(501);
  });
  it("PUT toggles enabled and picks only an installed model, atomically", async () => {
    await fakeOllama(["qwen2.5:3b", "qwen2.5:7b"]);
    await boot();
    expect((await call("GET", "/local")).json).toMatchObject({ ollama: "up", installed: ["qwen2.5:3b", "qwen2.5:7b"] });
    expect((await call("PUT", "/local", { enabled: true, model: "qwen2.5:7b" })).json).toEqual({ enabled: true, model: "qwen2.5:7b" });
    const saved = JSON.parse(readFileSync(join(hub, "local.json"), "utf8"));
    expect(saved).toMatchObject({ enabled: true, model: "qwen2.5:7b" });
    expect(readdirSync(hub).filter((f) => f.includes("tmp"))).toEqual([]);
    expect((await call("PUT", "/local", { model: "llama3:70b" })).status).toBe(400);
    expect((await call("PUT", "/local", { port: 80 })).status).toBe(400); // only enabled/model
    expect((await call("PUT", "/local", { enabled: "yes" })).status).toBe(400);
    expect(JSON.parse(readFileSync(join(hub, "local.json"), "utf8")).model).toBe("qwen2.5:7b");
  });
  it("model change with Ollama down => 503; enabled alone still works", async () => {
    writeFileSync(join(hub, "local.json"), JSON.stringify({ port: 1 }));
    await boot();
    expect((await call("PUT", "/local", { model: "qwen2.5:3b" })).status).toBe(503);
    expect((await call("PUT", "/local", { enabled: true })).json.enabled).toBe(true);
  });
  it("Host/Origin rules apply", async () => {
    await boot();
    expect((await call("GET", "/local", undefined, { host: "evil.com" })).status).toBe(403);
    expect((await call("PUT", "/local", { enabled: true }, { origin: "http://evil.com" })).status).toBe(403);
  });
});

describe("GET /local/stats", () => {
  it("aggregates by via, labels tokens as an estimate, skips bad lines", async () => {
    writeFileSync(join(hub, "local-stats.jsonl"), [
      { task: "compact-test-log", via: "local", tokensSaved: 100, ms: 5 },
      { task: "compact-test-log", via: "fallback", tokensSaved: 0, ms: 5 },
      { task: "compact-test-log", via: "passthrough", tokensSaved: 0, ms: 1 },
    ].map((x) => JSON.stringify(x)).join("\n") + "\nnot json\n");
    await boot();
    expect((await call("GET", "/local/stats")).json).toEqual({ calls: { local: 1, fallback: 1, passthrough: 1 }, fallbacks: 1, tokensSavedEstimate: 100, estimate: true });
  });
});
