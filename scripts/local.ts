// Usage: node scripts/local.ts <compact-test-log|list-relevant-files> <file>
//        node scripts/local.ts run <allowlisted test command...>   (runs it WITHOUT a shell, prints the compact output + "exit code: N")
// Prints ONLY the compact result. Model off/down/rejected => deterministic filter, exit 0.
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runLocal, type LocalDeps } from "../packages/core/src/local-tasks.ts";
import { validarComando } from "../packages/core/src/projects.ts";
import { compactLog, isShortLog } from "../packages/core/src/verify.ts";
import { appendStat, readLocalConfig } from "../packages/server/src/local-config.ts";
import { ensureUp, markActive, markIdle, touchUse, type LifecycleDeps } from "../packages/server/src/ollama-lifecycle.ts";
import { ollamaGenerate } from "../packages/server/src/ollama.ts";

const CLI_TASKS = ["compact-test-log", "list-relevant-files"];
const MAX_FILE = 5 * 1024 * 1024;
const MODEL_MAX_CHARS = 12_000; // a small model with a default context silently truncates; bigger logs get the deterministic filter only
const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

/** Refuses paths outside cwd, symlinks (anywhere in the path), non-files and oversize files. */
export function readInput(cwd: string, file: string): string {
  const real = realpathSync(cwd);
  const abs = resolve(real, file);
  if (!abs.startsWith(real + sep)) throw new Error("path outside the working directory");
  if (realpathSync(abs) !== abs || lstatSync(abs).isSymbolicLink()) throw new Error("symlinks are not allowed");
  const st = lstatSync(abs);
  if (!st.isFile()) throw new Error("not a regular file");
  if (st.size > MAX_FILE) throw new Error("file too large");
  return readFileSync(abs, "utf8");
}

function listFiles(root: string, max = 400): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= max || e.name.startsWith(".") || SKIP.has(e.name)) continue;
      if (e.isDirectory() && depth < 6) walk(join(dir, e.name), depth + 1);
      else if (e.isFile()) out.push(relative(root, join(dir, e.name)));
    }
  };
  walk(root, 0);
  return out;
}

const listFallback = (query: string, files: string[]): string => {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])];
  const hit = files.filter((f) => words.some((w) => f.toLowerCase().includes(w))).slice(0, 30);
  return hit.length ? hit.join("\n") : "(none)";
};

type CliOpts = { cwd: string; hub: string; port?: number; lifecycle?: Partial<LifecycleDeps>; allowed?: string[]; timeoutMs?: number };
const MAX_OUT = 5 * 1024 * 1024;

/** Command must pass the closed allowlist and, when the runner passed the project's saved commands, match one of them. */
export function checkCommand(tokens: string[], allowed?: string[]): string | undefined {
  if (tokens.length === 0 || tokens.some((t) => /\s/.test(t))) return "invalid command";
  const c = tokens.join(" ");
  if (!validarComando(c)) return "command not allowed";
  if (allowed && !allowed.some((a) => c === a || c.startsWith(`${a} `))) return "command is not one of the project commands";
  return undefined;
}

/** No shell: argv array, cwd, timeout and output cap. stdout+stderr merged in arrival order. */
function exec(tokens: string[], cwd: string, timeoutMs: number): Promise<{ text: string; code: number }> {
  return new Promise((done) => {
    let text = "", size = 0, over = false, timedOut = false;
    const child = spawn(tokens[0]!, tokens.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    const take = (b: Buffer) => { size += b.length; if (size > MAX_OUT) { over = true; child.kill("SIGKILL"); } else text += b.toString("utf8"); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (e) => { clearTimeout(timer); done({ text: `${text}\n${e.message}`, code: 127 }); });
    child.on("close", (code) => { clearTimeout(timer); done({ text: text + (over ? "\n[output truncated]" : "") + (timedOut ? "\n[timeout]" : ""), code: timedOut ? 124 : (code ?? 1) }); });
  });
}

/** Short => passthrough; else model (verified against the INPUT) => deterministic fallback. Model lifecycle: ensureUp + active mark only. */
async function compactTask(task: string, input: string, o: CliOpts, files: string[] = []): Promise<string> {
  const t0 = Date.now();
  const cfg = readLocalConfig(o.hub);
  const port = o.port ?? cfg.port;
  const done = (out: string, via: "local" | "fallback" | "passthrough", saved: number) => {
    appendStat(o.hub, { task, via, tokensSaved: via === "local" ? saved : 0, ms: Date.now() - t0 }); // counts only; never content
    return out;
  };
  if (task === "compact-test-log" && isShortLog(input)) return done(input, "passthrough", 0);
  const fallbackText = task === "compact-test-log" ? compactLog(input) : listFallback(input, files);
  const prompt = (): string =>
    task === "compact-test-log"
      ? `Reduce the test log below. Copy VERBATIM every failing test line, error line, assertion message, file:line reference, exit code and summary count. Drop only passing lines and noise. Reply with the reduced log only, no commentary.\n\n${input}`
      : `Task description:\n${input}\n\nFiles:\n${files.join("\n")}\n\nReply with the paths (from the list above, one per line, nothing else) that are relevant to the task.`;
  const lc: LifecycleDeps = { hub: o.hub, port, model: cfg.model, ...o.lifecycle };
  let mark: string | undefined;
  let enabled = cfg.enabled && (task !== "compact-test-log" || input.length <= MODEL_MAX_CHARS);
  try {
    if (enabled && !(await ensureUp(lc)).ok) enabled = false; // down and not viable => deterministic filter
    if (enabled) mark = markActive(lc, { task, model: cfg.model });
    const deps: LocalDeps = {
      enabled,
      ollama: (_t, _i) => ollamaGenerate(prompt(), { model: cfg.model, port, timeoutMs: 30_000 }),
      fallback: async () => fallbackText,
      exists: (p) => existsSync(resolve(o.cwd, p)),
    };
    const r = await runLocal(task, input, deps);
    if (r.via === "local") return done(r.output, "local", r.tokensSaved);
    return done(r.via === "claude-fallback" ? r.output : fallbackText, "fallback", 0);
  } finally {
    if (mark) markIdle(lc, mark); // refreshes last-use; the hub reaper unloads/stops after 60 s idle
    else if (enabled) touchUse(lc);
  }
}

export async function runCli(argv: string[], o: CliOpts): Promise<{ out: string; code: number }> {
  if (argv[0] === "run") {
    const tokens = argv.slice(1);
    const bad = checkCommand(tokens, o.allowed);
    if (bad) return { out: bad, code: 2 };
    const r = await exec(tokens, o.cwd, o.timeoutMs ?? 600_000);
    const text = await compactTask("compact-test-log", r.text, o);
    return { out: `${text.trimEnd()}\nexit code: ${r.code}`, code: r.code };
  }
  const [task, file] = argv;
  if (!task || !file || argv.length !== 2 || !CLI_TASKS.includes(task)) return { out: `usage: local.ts <${CLI_TASKS.join("|")}> <file> | run <command...>`, code: 2 };
  let input: string;
  try { input = readInput(o.cwd, file); } catch (e) { return { out: (e as Error).message, code: 2 }; }
  return { out: await compactTask(task, input, o, task === "list-relevant-files" ? listFiles(o.cwd) : []), code: 0 };
}

if (import.meta.main) {
  const hub = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const raw = process.env["LAB_LOCAL_COMMANDS"]; // JSON array of the project's saved commands, set by the hub runner
  let allowed: string[] | undefined;
  try { const v: unknown = raw ? JSON.parse(raw) : undefined; allowed = Array.isArray(v) && v.every((x) => typeof x === "string") ? v : undefined; } catch { allowed = undefined; }
  const r = await runCli(process.argv.slice(2), { cwd: process.cwd(), hub, ...(allowed ? { allowed } : {}) });
  (r.code === 0 ? process.stdout : process.stderr).write(r.out.endsWith("\n") ? r.out : `${r.out}\n`);
  process.exit(r.code);
}
