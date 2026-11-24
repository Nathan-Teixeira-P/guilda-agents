import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const DEFAULT_MODEL = "qwen2.5:3b"; // small on purpose: the machine also runs a browser
export const LocalConfig = z.object({
  enabled: z.boolean().default(false),
  model: z.string().min(1).max(100).default(DEFAULT_MODEL),
  port: z.number().int().min(1).max(65535).default(11434),
});
export type LocalConfig = z.infer<typeof LocalConfig>;
const Stat = z.object({ task: z.string(), via: z.enum(["local", "fallback", "passthrough"]), tokensSaved: z.number().min(0), ms: z.number().min(0) });
export type Stat = z.infer<typeof Stat>;

const CFG = "local.json";
const STATS = "local-stats.jsonl";

/** Missing or corrupt file => defaults (disabled). */
export function readLocalConfig(hub: string): LocalConfig {
  try {
    const r = LocalConfig.safeParse(JSON.parse(readFileSync(join(hub, CFG), "utf8")));
    if (r.success) return r.data;
  } catch { /* defaults */ }
  return LocalConfig.parse({});
}

/** Temp + rename. */
export function writeLocalConfig(hub: string, c: LocalConfig): void {
  mkdirSync(hub, { recursive: true });
  const tmp = join(hub, `${CFG}.tmp-${process.pid}`);
  writeFileSync(tmp, JSON.stringify(c, null, 2));
  renameSync(tmp, join(hub, CFG));
}

/** One short JSON line; never any content of the input or output. */
export function appendStat(hub: string, s: Stat): void {
  try { mkdirSync(hub, { recursive: true }); appendFileSync(join(hub, STATS), `${JSON.stringify(Stat.parse(s))}\n`); } catch { /* stats are best effort */ }
}

const STATS_READ_MAX = 1024 * 1024;
export function readStats(hub: string) {
  const calls = { local: 0, fallback: 0, passthrough: 0 };
  let saved = 0;
  try {
    const f = join(hub, STATS);
    const text = readFileSync(f, "utf8");
    for (const line of (statSync(f).size > STATS_READ_MAX ? text.slice(-STATS_READ_MAX) : text).split("\n")) {
      try {
        const r = Stat.safeParse(JSON.parse(line));
        if (r.success) { calls[r.data.via]++; saved += r.data.tokensSaved; }
      } catch { /* skip bad line */ }
    }
  } catch { /* no file yet */ }
  return { calls, fallbacks: calls.fallback, tokensSavedEstimate: saved, estimate: true as const };
}

/** Installed models from the loopback Ollama; undefined when it is down. */
export async function ollamaModels(port: number, timeoutMs = 2000): Promise<string[] | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return undefined;
    const j = z.object({ models: z.array(z.object({ name: z.string() })) }).safeParse(await res.json());
    return j.success ? j.data.models.map((m) => m.name) : undefined;
  } catch { return undefined; }
}
