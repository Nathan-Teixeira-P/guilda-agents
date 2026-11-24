import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ollamaGenerate } from "../src/ollama.js";
import { runLocal } from "../../core/src/local-tasks.js";

let srv: Server | undefined;
afterEach(() => srv?.close());
const start = async (h: Parameters<typeof createServer>[1]) => {
  srv = createServer(h);
  await new Promise<void>((r) => srv!.listen(0, "127.0.0.1", r));
  return (srv.address() as AddressInfo).port;
};

describe("ollamaGenerate", () => {
  it("returns text from the fake server", async () => {
    const port = await start((_q, s) => s.end(JSON.stringify({ response: " feat: x " })));
    expect(await ollamaGenerate("p", { model: "m", port })).toEqual({ ok: true, text: "feat: x" });
  });
  it("invalid body, http error, timeout, down => ok:false", async () => {
    let port = await start((_q, s) => s.end("not json"));
    expect((await ollamaGenerate("p", { model: "m", port })).ok).toBe(false);
    srv!.close();
    port = await start((_q, s) => { s.statusCode = 500; s.end(); });
    expect((await ollamaGenerate("p", { model: "m", port })).ok).toBe(false);
    srv!.close();
    port = await start(() => {}); // never answers
    expect((await ollamaGenerate("p", { model: "m", port, timeoutMs: 50 })).ok).toBe(false);
    srv!.closeAllConnections();
    srv!.close();
    expect((await ollamaGenerate("p", { model: "m", port, timeoutMs: 200 })).ok).toBe(false);
  });
  it("serializes requests (one at a time)", async () => {
    let active = 0, max = 0;
    const port = await start((_q, s) => {
      max = Math.max(max, ++active);
      setTimeout(() => { active--; s.end(JSON.stringify({ response: "ok" })); }, 20);
    });
    await Promise.all([1, 2, 3].map(() => ollamaGenerate("p", { model: "m", port })));
    expect(max).toBe(1);
  });
  it("disabled => no HTTP call; fallback used", async () => {
    let hits = 0;
    const port = await start((_q, s) => { hits++; s.end(JSON.stringify({ response: "feat: x" })); });
    const r = await runLocal("commit-message-draft", "d", {
      enabled: false,
      ollama: (_t, i) => ollamaGenerate(i, { model: "m", port }),
      fallback: async () => "claude",
      exists: () => true,
    });
    expect(r.via).toBe("claude-fallback");
    expect(hits).toBe(0);
  });
});
