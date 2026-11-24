import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compactLog } from "../packages/core/src/verify.ts";
import { runCli as realRunCli } from "./local.ts";

// Tests must NEVER start a real Ollama: any spawn attempt fails.
const runCli: typeof realRunCli = (a, o) => realRunCli(a, { lifecycle: { spawn: () => { throw new Error("no real ollama in tests"); } }, ...o });

const SCRATCH = "/tmp/guilda-agents-tests";
const LOG = [
  ...Array.from({ length: 90 }, (_, i) => `  ✓ test ${i} passes`),
  " FAIL  src/a.test.ts > sum > adds",
  "AssertionError: expected 3 to be 4",
  "  at src/a.test.ts:12:5",
  " Tests  1 failed | 90 passed (91)",
].join("\n");

let root: string, hub: string, cwd: string, srv: Server | undefined, reply: string | undefined, hits: number;
const fake = async () => {
  srv = createServer((q, s) => { if (q.url === "/api/generate") hits++; s.end(JSON.stringify({ response: reply })); });
  await new Promise<void>((r) => srv!.listen(0, "127.0.0.1", r));
  return (srv.address() as AddressInfo).port;
};
const cfg = (c: object) => writeFileSync(join(hub, "local.json"), JSON.stringify(c));
const stats = () => readFileSync(join(hub, "local-stats.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

beforeEach(() => {
  mkdirSync(SCRATCH, { recursive: true });
  root = mkdtempSync(join(SCRATCH, "cli-"));
  hub = join(root, "hub"); cwd = join(root, "proj");
  mkdirSync(hub); mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(join(cwd, "out.log"), LOG);
  hits = 0; reply = undefined;
});
afterEach(() => { srv?.closeAllConnections(); srv?.close(); srv = undefined; });

describe("local.ts compact-test-log", () => {
  it("short log passes through untouched without calling the model", async () => {
    writeFileSync(join(cwd, "s.log"), "FAIL x\nTests 1 failed");
    const port = await fake(); cfg({ enabled: true, port });
    expect(await runCli(["compact-test-log", "s.log"], { cwd, hub })).toEqual({ out: "FAIL x\nTests 1 failed", code: 0 });
    expect(hits).toBe(0);
    expect(stats()[0]).toMatchObject({ task: "compact-test-log", via: "passthrough", tokensSaved: 0 });
  });
  it("disabled (default, no config) => deterministic filter, no model, keeps failures", async () => {
    const port = await fake();
    const r = await runCli(["compact-test-log", "out.log"], { cwd, hub, port });
    expect(r.code).toBe(0);
    expect(r.out).toBe(compactLog(LOG));
    expect(r.out).toContain("AssertionError: expected 3 to be 4");
    expect(r.out).not.toContain("test 5 passes");
    expect(hits).toBe(0);
    expect(stats()[0].via).toBe("fallback");
  });
  it("enabled + model keeps every failure => local, tokens saved estimate recorded, no content logged", async () => {
    reply = compactLog(LOG) + "\n(model)";
    const port = await fake(); cfg({ enabled: true, port });
    const r = await runCli(["compact-test-log", "out.log"], { cwd, hub });
    expect(r.out).toBe(reply);
    const [s] = stats();
    expect(s).toMatchObject({ via: "local" });
    expect(s.tokensSaved).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toContain("AssertionError");
    expect(Object.keys(s).sort()).toEqual(["ms", "task", "tokensSaved", "via"]);
  });
  it("model drops a failure line => rejected, deterministic fallback keeps it", async () => {
    reply = "FAIL src/a.test.ts > sum > adds\nTests 1 failed | 90 passed (91)";
    const port = await fake(); cfg({ enabled: true, port });
    const r = await runCli(["compact-test-log", "out.log"], { cwd, hub });
    expect(hits).toBe(1);
    expect(r.out).toBe(compactLog(LOG));
    expect(stats()[0].via).toBe("fallback");
  });
  it("Ollama down => silent fallback, exit 0", async () => {
    cfg({ enabled: true, port: 1 });
    const r = await runCli(["compact-test-log", "out.log"], { cwd, hub });
    expect(r).toEqual({ out: compactLog(LOG), code: 0 });
  });
});

describe("local.ts list-relevant-files", () => {
  it("hallucinated path => fallback by keywords; real path => local", async () => {
    writeFileSync(join(cwd, "src", "billing.ts"), "");
    writeFileSync(join(cwd, "q.txt"), "fix the billing rounding");
    reply = "src/ghost.ts";
    const port = await fake(); cfg({ enabled: true, port });
    expect((await runCli(["list-relevant-files", "q.txt"], { cwd, hub })).out).toBe("src/billing.ts");
    expect(stats()[0].via).toBe("fallback");
    reply = "src/billing.ts";
    expect((await runCli(["list-relevant-files", "q.txt"], { cwd, hub })).out).toBe("src/billing.ts");
    expect(stats()[1].via).toBe("local");
  });
});

describe("local.ts input safety", () => {
  it("refuses unknown tasks, extra args, outside paths and symlinks", async () => {
    writeFileSync(join(root, "outside.log"), "x");
    symlinkSync(join(root, "outside.log"), join(cwd, "link.log"));
    symlinkSync(hub, join(cwd, "dir"));
    for (const a of [["commit-message-draft", "out.log"], ["compact-test-log"], ["compact-test-log", "out.log", "x"], ["compact-test-log", "../outside.log"], ["compact-test-log", join(root, "outside.log")], ["compact-test-log", "link.log"], ["compact-test-log", "dir/x"], ["compact-test-log", "src"]]) {
      expect((await runCli(a, { cwd, hub })).code).toBe(2);
    }
  });
});

describe("local.ts run", () => {
  const fx = (testBody: string) => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(cwd, "a.test.js"), testBody);
  };
  it("runs an allowlisted command without a shell and keeps the exit code as the last line", async () => {
    fx('import { test } from "node:test"; test("ok", () => {});');
    const r = await runCli(["run", "node", "--test"], { cwd, hub });
    expect(r.code).toBe(0);
    expect(r.out.trimEnd().split("\n").at(-1)).toBe("exit code: 0");
  });
  it("failing run: compact text keeps the failure, exit code preserved", async () => {
    fx('import { test } from "node:test"; import assert from "node:assert"; test("boom", () => { assert.strictEqual(1, 2); });');
    const r = await runCli(["run", "node", "--test"], { cwd, hub });
    expect(r.code).toBe(1);
    expect(r.out).toContain("boom");
    expect(r.out.trimEnd().split("\n").at(-1)).toBe("exit code: 1");
  });
  it("rejects non-allowlisted commands, shell metacharacters and multi-word tokens (nothing runs)", async () => {
    for (const argv of [["ls"], ["rm", "-rf", "x"], ["npm", "test;", "ls"], ["npm", "test", ">", "out"], ["npm", "test", "$(id)"], ["npm", "test", "a|b"], ["curl", "x"], ["git", "status"], ["npm test && ls"], ["npm", "test", "/etc/passwd"], []]) {
      const r = await runCli(["run", ...argv], { cwd, hub });
      expect(r.code, argv.join(" ")).toBe(2);
    }
  });
  it("when the runner passes the project commands, others are refused", async () => {
    expect((await runCli(["run", "npm", "run", "build"], { cwd, hub, allowed: ["npm test"] })).code).toBe(2);
    expect((await runCli(["run", "node", "--test"], { cwd, hub, allowed: ["node --test"] })).out).toContain("exit code");
  });
});
