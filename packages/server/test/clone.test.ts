import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { cloneRepo, checkPasta } from "../src/clone.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
let dir: string;
beforeEach(() => { mkdirSync(SCRATCH, { recursive: true }); dir = mkdtempSync(join(SCRATCH, "clone-")); });

function fakeSpawn(code: number | "hang" | "error") {
  const calls: { file: string; args: string[]; opts: any }[] = [];
  const spawn = (file: string, args: string[], opts: any) => {
    calls.push({ file, args, opts });
    const c: any = new EventEmitter();
    c.killed = false;
    c.kill = () => { c.killed = true; c.emit("close", null); };
    setImmediate(() => (code === "hang" ? undefined : code === "error" ? c.emit("error", new Error("ENOENT")) : c.emit("close", code)));
    return c;
  };
  return { spawn: spawn as any, calls };
}

describe("cloneRepo", () => {
  it("runs git without a shell, with exact args, hooks off, destination under workspaces/<id>", async () => {
    const f = fakeSpawn(0);
    const r = await cloneRepo({ origem: "https://github.com/a/b.git", id: "meu-proj", workspacesDir: dir, spawn: f.spawn });
    const dest = join(dir, "meu-proj");
    expect(r).toEqual({ ok: true, caminho: dest });
    const c = f.calls[0]!;
    expect(c.file).toBe("git");
    expect(c.args).toEqual([
      "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "-c", "core.fsmonitor=false",
      "clone", "--", "https://github.com/a/b.git", dest,
    ]);
    expect(c.opts.shell).toBeFalsy();
    expect(c.opts.env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(c.opts.env.GIT_ALLOW_PROTOCOL).toBe("https:ssh");
  });
  it("refuses invalid origins and ids without spawning", async () => {
    const f = fakeSpawn(0);
    for (const origem of ["file:///etc", "--upload-pack=x", "ext::sh -c x", "/some/folder"])
      expect(await cloneRepo({ origem, id: "ok", workspacesDir: dir, spawn: f.spawn })).toMatchObject({ ok: false });
    for (const id of ["../x", "A", "a/b", ""])
      expect(await cloneRepo({ origem: "https://h.io/a", id, workspacesDir: dir, spawn: f.spawn })).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0);
  });
  it("refuses an existing destination", async () => {
    mkdirSync(join(dir, "dup"));
    const f = fakeSpawn(0);
    expect(await cloneRepo({ origem: "https://h.io/a", id: "dup", workspacesDir: dir, spawn: f.spawn })).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0);
  });
  it("fails on non-zero exit, spawn error and timeout (killing the child)", async () => {
    expect(await cloneRepo({ origem: "https://h.io/a", id: "a1", workspacesDir: dir, spawn: fakeSpawn(128).spawn })).toMatchObject({ ok: false });
    expect(await cloneRepo({ origem: "https://h.io/a", id: "a2", workspacesDir: dir, spawn: fakeSpawn("error").spawn })).toMatchObject({ ok: false });
    expect(await cloneRepo({ origem: "https://h.io/a", id: "a3", workspacesDir: dir, spawn: fakeSpawn("hang").spawn, timeoutMs: 20 })).toMatchObject({ ok: false, reason: expect.stringContaining("timeout") });
  });
});

describe("checkPasta", () => {
  it("accepts an existing directory and refuses missing paths and files", () => {
    expect(checkPasta(dir)).toMatchObject({ ok: true });
    writeFileSync(join(dir, "f"), "x");
    expect(checkPasta(join(dir, "f"))).toMatchObject({ ok: false });
    expect(checkPasta(join(dir, "nope"))).toMatchObject({ ok: false });
    expect(checkPasta("relative")).toMatchObject({ ok: false });
  });
});
