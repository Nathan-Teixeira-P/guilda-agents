import { spawn as realSpawn, type ChildProcess } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { PROJECT_ID, validarOrigem } from "@lab/core/src/projects.ts";

export type CloneSpawn = (file: string, args: string[], opts: { env: NodeJS.ProcessEnv; stdio: "ignore"; shell: false }) => Pick<ChildProcess, "on" | "kill">;
export type CloneResult = { ok: true; caminho: string } | { ok: false; reason: string };

/**
 * `git clone` with no shell. Nothing from the cloned repository is ever executed:
 * hooks are pointed at /dev/null, file/ext transports are off, no install or script step exists.
 */
export function cloneRepo(o: { origem: string; id: string; workspacesDir: string; spawn?: CloneSpawn; timeoutMs?: number }): Promise<CloneResult> {
  const v = validarOrigem(o.origem);
  if (!v.ok || v.tipo !== "url") return Promise.resolve({ ok: false, reason: "invalid repository url" });
  if (!PROJECT_ID.test(o.id)) return Promise.resolve({ ok: false, reason: "invalid project id" });
  const dest = join(resolve(o.workspacesDir), o.id);
  if (existsSync(dest)) return Promise.resolve({ ok: false, reason: "destination already exists" });
  const args = [
    "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", "-c", "core.fsmonitor=false",
    "clone", "--", v.valor, dest,
  ];
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "https:ssh", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" };
  const child = (o.spawn ?? (realSpawn as unknown as CloneSpawn))("git", args, { env, stdio: "ignore", shell: false });
  return new Promise((done) => {
    let settled = false;
    const end = (r: CloneResult) => { if (!settled) { settled = true; clearTimeout(timer); done(r); } };
    const timer = setTimeout(() => { end({ ok: false, reason: "clone timeout" }); child.kill("SIGKILL"); }, o.timeoutMs ?? 120_000);
    child.on("error", () => end({ ok: false, reason: "git failed to start" }));
    child.on("close", (code) => end(code === 0 ? { ok: true, caminho: dest } : { ok: false, reason: `git clone failed (exit ${code})` }));
  });
}

/** Local folder: must be an absolute path to an existing directory. It is referenced, never copied. */
export function checkPasta(p: string): CloneResult {
  const v = validarOrigem(p);
  if (!v.ok || v.tipo !== "pasta" || !isAbsolute(p)) return { ok: false, reason: "invalid folder path" };
  try {
    const real = realpathSync(p);
    return statSync(real).isDirectory() ? { ok: true, caminho: real } : { ok: false, reason: "not a directory" };
  } catch { return { ok: false, reason: "folder does not exist" }; }
}
