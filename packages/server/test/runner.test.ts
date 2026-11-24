import { spawn as realSpawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { newBreaker, recordLoop } from "@lab/core/src/breaker.ts";
import { newMission, transition, type Mission } from "@lab/core/src/mission.ts";
import { buildArgs, runPhase, type SpawnFn } from "../src/runner.ts";

const fixture = (n: string) => new URL(`../../../tests/fixtures/${n}.jsonl`, import.meta.url).pathname;
const fake = new URL("./fake-agent.mjs", import.meta.url).pathname;
const now = () => new Date("2026-01-01T00:00:00Z");

let root: string, project: string, missionsDir: string, missionDir: string;
let calls: { file: string; args: string[] }[];
const agent =
  (n: string, mode = ""): SpawnFn =>
  (file, args, o) => {
    calls.push({ file, args });
    return realSpawn(process.execPath, [fake, fixture(n), mode], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });
  };
const base = () => ({ projectDir: project, missionsDir, prompt: "go", tetoUsd: 5, now });
const m0 = (stage: "planejando" | "aguardando-aprovacao"): Mission => {
  let m = transition(newMission("m1", project, now), "planejando", { now });
  if (stage === "aguardando-aprovacao") m = transition(m, "aguardando-aprovacao", { now });
  return m;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "runner-"));
  project = join(root, "proj");
  missionsDir = join(root, "missions");
  missionDir = join(missionsDir, "m1");
  mkdirSync(project);
  mkdirSync(missionDir, { recursive: true });
  calls = [];
});

describe("buildArgs", () => {
  const a = () => ({ ...base(), mission: m0("planejando") });
  it("phase 1: staging-only write via dontAsk, no bypass, no Bash", () => {
    const args = buildArgs({ ...a(), phase: 1 }, "sid-1");
    const staging = join(missionDir, "out");
    expect(args).toEqual(expect.arrayContaining(["-p", "go", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"]));
    expect(args).toContain("--session-id");
    expect(args[args.indexOf("--session-id") + 1]).toBe("sid-1");
    expect(args[args.indexOf("--add-dir") + 1]).toBe(staging);
    expect(args).toContain(`Edit(/${staging}/**)`);
    expect(args.join(" ")).not.toContain("bypassPermissions");
    const denied = args.slice(args.indexOf("--disallowedTools") + 1);
    expect(denied).toContain("Bash");
    expect(denied).toContain(`Edit(/${join(project, ".claude")}/**)`);
    expect(args).toContain("--max-budget-usd");
  });
  it("phase 2: resume, tests allowed, commit/push denied", () => {
    const args = buildArgs({ ...a(), phase: 2, mission: { ...m0("aguardando-aprovacao"), sessionId: "sid-1" }, testCommands: ["npm test"] }, "x");
    expect(args[args.indexOf("--resume") + 1]).toBe("sid-1");
    expect(args).not.toContain("--session-id");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(args).toContain("Bash(npm test:*)");
    const denied = args.slice(args.indexOf("--disallowedTools") + 1);
    expect(denied).toEqual(expect.arrayContaining(["Bash(git commit:*)", "Bash(git push:*)"]));
  });
  it("phase 2: only validated commands reach --allowedTools, no commands means no Bash rule", () => {
    const mk = (testCommands?: string[]) => buildArgs({ ...a(), phase: 2, mission: { ...m0("aguardando-aprovacao"), sessionId: "sid-1" }, ...(testCommands ? { testCommands } : {}) }, "x");
    expect(() => mk(["npm test; rm -rf /"])).toThrow();
    expect(() => mk(["ls"])).toThrow();
    for (const args of [mk(), mk([])]) expect(args.slice(0, args.indexOf("--disallowedTools")).some((x) => x.startsWith("Bash(") && !x.startsWith("Bash(git "))).toBe(false);
  });
  it("phase 2: hub local helper allowed for exactly three subcommands, only with a hub", () => {
    const mk = (hubDir?: string) => buildArgs({ ...a(), phase: 2, mission: { ...m0("aguardando-aprovacao"), sessionId: "sid-1" }, ...(hubDir ? { hubDir } : {}) }, "x");
    const allowed = (l: string[]) => l.slice(l.indexOf("--allowedTools"), l.indexOf("--disallowedTools"));
    const rules = allowed(mk("/hub")).filter((x) => x.startsWith("Bash(") && !x.startsWith("Bash(git "));
    expect(allowed(mk())).toEqual(expect.arrayContaining(["Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)"]));
    expect(rules).toEqual(["Bash(node /hub/scripts/local.ts run:*)", "Bash(node /hub/scripts/local.ts compact-test-log:*)", "Bash(node /hub/scripts/local.ts list-relevant-files:*)"]);
    expect(allowed(mk()).some((x) => x.startsWith("Bash(") && !x.startsWith("Bash(git "))).toBe(false);
    expect(() => mk("/hub/*")).toThrow();
    expect(() => mk("rel")).toThrow();
  });
  it("passes --disable-slash-commands, and phase 2 with semResume opens a fresh session instead of resuming", () => {
    const p1 = buildArgs({ ...a(), phase: 1, mission: m0("planejando") }, "s");
    expect(p1).toContain("--disable-slash-commands");
    const fresh = buildArgs({ ...a(), phase: 2, semResume: true, mission: m0("aguardando-aprovacao") }, "new-sid");
    expect(fresh).not.toContain("--resume");
    expect(fresh.slice(fresh.indexOf("--session-id"), fresh.indexOf("--session-id") + 2)).toEqual(["--session-id", "new-sid"]);
    expect(buildArgs({ ...a(), phase: 2, mission: { ...m0("aguardando-aprovacao"), sessionId: "sid-1" } }, "x")).toContain("--resume");
  });
  it("rejects unsafe ids and paths", () => {
    expect(() => buildArgs({ ...a(), phase: 1, mission: { ...m0("planejando"), id: "../x" } }, "s")).toThrow();
    expect(() => buildArgs({ ...a(), phase: 1, projectDir: "/tmp/a*b" }, "s")).toThrow();
  });
});

describe("local model counters", () => {
  const linha = (cmd: string) => JSON.stringify({ type: "assistant", message: { id: "x", role: "assistant", content: [{ type: "tool_use", id: "t", name: "Bash", input: { command: cmd } }] } });
  const jsonl = (cmd: string) => { const f = join(root, "s.jsonl"); writeFileSync(f, `${readFileSync(fixture("stream-basic"), "utf8").split("\n").filter(Boolean).slice(0, 1).join("\n")}\n${linha(cmd)}\n${readFileSync(fixture("stream-basic"), "utf8")}`); return f; };
  const run = async (cmd: string) => {
    const hub = join(root, "hub"); mkdirSync(hub);
    writeFileSync(join(missionDir, "approved"), '{"approved":true}');
    const stat = (via: string, s: number) => JSON.stringify({ task: "compact-test-log", via, tokensSaved: s, ms: 1 });
    const spawn: SpawnFn = (_f, _a, o) => {
      writeFileSync(join(hub, "local-stats.jsonl"), `${stat("local", 40)}\n${stat("fallback", 0)}\n${stat("passthrough", 0)}\n`); // what the helper appends during the run
      return realSpawn(process.execPath, [fake, jsonl(cmd), ""], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });
    };
    return runPhase({ ...base(), phase: 2, hubDir: hub, mission: { ...m0("aguardando-aprovacao"), sessionId: "s" } }, { spawn });
  };
  it("counts helper calls seen in the stream, with outcomes from the helper stats", async () => {
    const out = await run("node /hub/scripts/local.ts run npm test");
    expect(out.mission.local).toEqual({ localTasks: 1, fallbacks: 1, tokensSaved: 40 });
  });
  it("ignores other Bash calls even if stats changed", async () => {
    expect((await run("npm test")).mission.local).toBeUndefined();
  });
});

describe("runPhase", () => {
  it("phase 1 ok: no shell, stdin ignored, mission advances with cost and session", async () => {
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando") }, { spawn: agent("stream-basic") });
    expect(calls[0]?.file).toBe("claude"); // spawn(file, args[]): argv array, never a shell string
    expect(Array.isArray(calls[0]?.args)).toBe(true);
    expect(out.mission.stage).toBe("aguardando-aprovacao");
    expect(out.mission.sessionId).toBeTruthy();
    expect(out.mission.costUsd).toBeCloseTo(0.0019062, 6);
    expect(out.costByModel).toHaveProperty("claude-haiku-5-5");
    expect(out.lastResult?.text).toContain("SPIKE-OK");
    expect(out.rateLimit?.fiveHour?.utilization).toBe(0.14);
    expect(JSON.parse(readFileSync(join(missionDir, "mission.json"), "utf8")).stage).toBe("aguardando-aprovacao");
  });

  it("phase 2 does not start without the approval seal (fail closed)", async () => {
    const m = { ...m0("aguardando-aprovacao"), sessionId: "s" };
    await expect(runPhase({ ...base(), phase: 2, mission: m }, { spawn: agent("stream-basic") })).rejects.toThrow(/approv/i);
    writeFileSync(join(missionDir, "approved"), "garbage");
    await expect(runPhase({ ...base(), phase: 2, mission: m }, { spawn: agent("stream-basic") })).rejects.toThrow(/approv/i);
    expect(calls).toHaveLength(0);
  });

  it("phase 2 runs with seal and finishes concluida", async () => {
    writeFileSync(join(missionDir, "approved"), '{"approved":true}');
    const m = { ...m0("aguardando-aprovacao"), sessionId: "s" };
    const out = await runPhase({ ...base(), phase: 2, mission: m }, { spawn: agent("stream-basic") });
    expect(calls[0]?.args).toContain("--resume");
    expect(out.mission.stage).toBe("concluida");
  });

  it("budget signal kills the process and pauses the mission", async () => {
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando") }, { spawn: agent("stream-budget-exceeded", "hang") });
    expect(out.stopped).toMatch(/budget/);
    expect(out.mission.stage).toBe("pausada");
    expect(out.mission["pauseReason"]).toMatch(/^teto de uso: a CLI informou/);
  });

  it("server-side spend cap kills even without the CLI signal, and pauses", async () => {
    const out = await runPhase({ ...base(), tetoUsd: 0.001, phase: 1, mission: m0("planejando") }, { spawn: agent("stream-basic", "hang") });
    expect(out.stopped).toMatch(/budget/);
    expect(out.mission.stage).toBe("pausada");
    expect(out.mission["pauseReason"]).toMatch(/^teto de uso: gastou /);
  });

  it("breaker trip kills the process and pauses the mission", async () => {
    let b = newBreaker();
    for (let i = 0; i < 3; i++) b = recordLoop(b, "spec-1", now);
    const out = await runPhase(
      { ...base(), phase: 1, mission: m0("planejando"), breaker: { get: () => b, step: "spec-1" } },
      { spawn: agent("stream-basic", "hang") },
    );
    expect(out.stopped).toMatch(/rework loops/);
    expect(out.mission.stage).toBe("pausada");
    expect(out.mission["pauseReason"]).toMatch(/^disjuntor: o passo "spec-1" teve 3 voltas de retrabalho \(limite 2\)/);
  });

  it("counts subagent handoffs and persists them to mission.json", async () => {
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando") }, { spawn: agent("stream-subagent") });
    expect(out.mission.handoffs).toBe(1);
    expect(JSON.parse(readFileSync(join(missionDir, "mission.json"), "utf8")).handoffs).toBe(1);
  });

  it("trips the breaker when chained handoffs pass the limit", async () => {
    const m = { ...m0("planejando"), handoffs: 8 };
    const out = await runPhase({ ...base(), phase: 1, mission: m }, { spawn: agent("stream-subagent", "hang") });
    expect(out.stopped).toMatch(/^breaker: 9 chained handoffs/);
    expect(out.mission.stage).toBe("pausada");
    expect(out.mission["pauseReason"]).toMatch(/^disjuntor: 9 trocas encadeadas sem intervenção do usuário \(limite 8\)/);
    expect(out.mission.handoffs).toBe(9);
  });

  it("trips on persisted loops without an injected breaker", async () => {
    const m = { ...m0("planejando"), loops: { "spec-1": 3 } };
    const out = await runPhase({ ...base(), phase: 1, mission: m }, { spawn: agent("stream-basic", "hang") });
    expect(out.mission["pauseReason"]).toMatch(/^disjuntor: o passo "spec-1"/);
  });

  it("counts VOLTA lines from the main agent only and trips on the 3rd round", async () => {
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando") }, { spawn: agent("stream-loops", "hang") });
    expect(out.mission.loops).toEqual({ "007": 3 }); // 2 plain + 1 trailing; "VOLTA 007 e mais" and the subagent line are ignored
    expect(out.stopped).toMatch(/^breaker: step "007" had 3 rework loops/);
    expect(out.mission.stage).toBe("pausada");
    expect(out.mission["pauseReason"]).toMatch(/^disjuntor: o passo "007" teve 3 voltas/);
    expect(JSON.parse(readFileSync(join(missionDir, "mission.json"), "utf8")).loops).toEqual({ "007": 3 });
  });

  it("user abort ends in parada, not pausada", async () => {
    const ac = new AbortController();
    ac.abort();
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando"), signal: ac.signal }, { spawn: agent("stream-basic", "hang") });
    expect(out.stopped).toBe("stopped by user");
    expect(out.mission.stage).toBe("parada");
  });

  it("nonzero exit parks the mission", async () => {
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando") }, { spawn: agent("stream-permission-denied", "fail") });
    expect(out.mission.stage).toBe("parada");
    expect(out.stopped).toMatch(/exit/);
  });

  it("subagent stream: last non-empty result, tokens per agent, no double counting", async () => {
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando") }, { spawn: agent("stream-subagent") });
    expect(out.lastResult?.text).toContain("HELPER-OK");
    expect(out.tokensByAgent["ae5eca652855e8963"]).toBeGreaterThan(0);
    expect(out.tokensByAgent["main"]).toBeGreaterThan(0);
    expect(out.mission.costUsd).toBeCloseTo(0.002285945, 6);
    expect(out.subagentTypes).toEqual({ ae5eca652855e8963: "helper" });
    expect(out.mission["subagentTypes"]).toEqual({ ae5eca652855e8963: "helper" });
  });

  it("invalid lines are counted, not fatal", async () => {
    const bad = join(root, "bad.jsonl");
    writeFileSync(bad, `{oops\n${readFileSync(fixture("stream-basic"), "utf8")}`);
    const sp: SpawnFn = (_f, _a, o) => realSpawn(process.execPath, [fake, bad], { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });
    const out = await runPhase({ ...base(), phase: 1, mission: m0("planejando") }, { spawn: sp });
    expect(out.unknownLines).toBeGreaterThanOrEqual(1);
    expect(out.mission.stage).toBe("aguardando-aprovacao");
  });
});
