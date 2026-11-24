// Real phase-1 e2e (spec 021). Run ONCE per attempt: `node spikes/e2e-fase1.ts` (uses the real `claude`, Claude Pro plan usage).
// Temp project and missions dir live only in the scratchpad; nothing here touches the hub or ~/.claude.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newMission, transition } from "@lab/core/src/mission.ts";
import { runPhase } from "../packages/server/src/runner.ts";
import { promoteDraft } from "../packages/server/src/promote.ts";
import { promptFase1 } from "../packages/server/src/prompt.ts";
import { parseLine } from "../packages/server/src/stream.ts";

const SCRATCH = "/tmp/guilda-agents-tests";
const proj = join(SCRATCH, "e2e-proj");
const missionsDir = join(SCRATCH, "e2e-missions");
const DEMANDA = "Adicionar uma CLI que converte temperaturas entre Celsius e Fahrenheit, com testes e README";
const TETO = 2;

rmSync(proj, { recursive: true, force: true });
rmSync(missionsDir, { recursive: true, force: true });
mkdirSync(proj, { recursive: true });
const git = (...a: string[]) => spawnSync("git", a, { cwd: proj, stdio: "ignore" });
git("init", "-q");
writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "temp-conv", version: "0.0.0", type: "module", scripts: { test: "node --test" } }, null, 2));
writeFileSync(join(proj, "README.md"), "# temp-conv\n\nTiny sandbox project for the e2e test.\n");

/** Usage probe: one minimal haiku call, reads the last rate_limit_event from the stream. */
function probe() {
  const r = spawnSync("claude", ["-p", "ok", "--model", "haiku", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--disallowedTools", "Bash", "Edit", "Write", "--max-budget-usd", "0.05"], { cwd: proj, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let w: { fiveHour?: { utilization?: number }; sevenDay?: { utilization?: number } } | undefined;
  for (const line of r.stdout.split("\n")) for (const e of parseLine(line)) if (e.kind === "rate-limit") w = e;
  return w;
}
const pct = (u?: number) => (u === undefined ? "?" : `${(u * 100).toFixed(1)}%`);
const before = probe();
console.log("probe before:", JSON.stringify(before));

const clock = () => new Date();
const id = "m-e2e0001";
let m = transition(newMission(id, "e2e-proj", clock), "planejando", { now: clock });
m = { ...m, demanda: DEMANDA };
const staging = join(missionsDir, id, "out");
const events: string[] = [];
const out = await runPhase({
  phase: 1, mission: m, projectDir: proj, missionsDir, tetoUsd: TETO, now: clock, agent: "orchestrator",
  prompt: promptFase1({ demanda: DEMANDA, stagingDir: staging, projetoPath: proj }),
  onEvent: (e) => events.push(JSON.stringify(e)),
});
writeFileSync(join(SCRATCH, "e2e-events.jsonl"), events.join("\n"));
console.log("stage:", out.mission.stage, "stopped:", out.stopped, "cost(list) USD:", out.mission.costUsd.toFixed(4));
console.log("tokensByAgent:", JSON.stringify(out.tokensByAgent), "costByModel:", JSON.stringify(out.costByModel));
console.log("denials:", JSON.stringify(out.denials));
console.log("last result:", (out.lastResult?.text ?? "").slice(0, 600));
const after = out.rateLimit ?? probe();
console.log(`plan usage 5h: ${pct(before?.fiveHour?.utilization)} -> ${pct(after?.fiveHour?.utilization)}; 7d: ${pct(before?.sevenDay?.utilization)} -> ${pct(after?.sevenDay?.utilization)}`);

const walk = (d: string, rel = ""): string[] =>
  existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`])) : [];
const files = walk(staging);
console.log("staging files:", files);

const problems: string[] = [];
if (out.mission.stage !== "aguardando-aprovacao") problems.push(`stage is ${out.mission.stage}`);
if (!files.some((f) => f.startsWith("handoff/") && /plan/i.test(f))) problems.push("no plan under handoff/");
if (!files.some((f) => /^prd\/.+\.prd\.md$/.test(f))) problems.push("no PRD");
const specs = files.filter((f) => /^specs\/\d+-.+\.spec\.md$/.test(f));
if (specs.length === 0) problems.push("no specs");
if (!files.includes("specs/INDEX.md")) problems.push("no specs/INDEX.md");
const KEYS = ["title", "number", "priority", "tags", "dependencies", "related_prd", "status", "created"];
const SECTIONS = ["Overview", "Related PRD", "Prerequisites", "Dependencies", "Implementation Tasks", "Acceptance Criteria", "Verification", "Rollback Plan"];
for (const f of specs) {
  const t = readFileSync(join(staging, f), "utf8");
  const fm = /^---\n([\s\S]*?)\n---/.exec(t)?.[1] ?? "";
  for (const k of KEYS) if (!new RegExp(`^${k}:`, "m").test(fm)) problems.push(`${f}: frontmatter missing ${k}`);
  for (const s of SECTIONS) if (!new RegExp(`^#+\\s*${s}\\b`, "mi").test(t)) problems.push(`${f}: section missing ${s}`);
}
const verdict = /STATUS:?\s*\**\s*(ok|falhou)/i.exec(out.lastResult?.text ?? "")?.[1];
console.log("orchestrator-reported STATUS:", verdict);

if (problems.length === 0) {
  const r = promoteDraft(staging, proj);
  console.log("promote:", JSON.stringify(r));
  if (!r.ok) problems.push(r.reason);
  else {
    for (const d of ["prd", "specs"]) if (walk(join(proj, ".claude", d)).length === 0) problems.push(`.claude/${d} empty after promotion`);
    console.log("promoted files:", walk(join(proj, ".claude")));
  }
}
console.log(problems.length ? `FAIL:\n- ${problems.join("\n- ")}` : "PASS");
process.exit(problems.length ? 1 : 0);
