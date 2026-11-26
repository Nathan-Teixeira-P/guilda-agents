import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const STAGES = [
  "intake",
  "planejando",
  "aguardando-aprovacao",
  "executando",
  "pausada", // resumable by the user; `parada` can also be resumed explicitly
  "concluida",
  "parada",
] as const;
export type Stage = (typeof STAGES)[number];

export const Mission = z.looseObject({
  id: z.string().min(1),
  project: z.string().min(1),
  stage: z.enum(STAGES),
  kind: z.enum(["redacao", "relatorio"]).optional(), // absent = code mission (plan, PRD, specs, seal, code); "relatorio" = report only, never edits the project
  sessionId: z.string().optional(),
  pauseReason: z.string().optional(), // set only while `pausada`
  pausedFrom: z.enum(["planejando", "executando"]).optional(), // phase to resume
  costUsd: z.number().nonnegative().default(0),
  loops: z.record(z.string(), z.number().int().nonnegative()).default({}), // rework turns per step
  handoffs: z.number().int().nonnegative().default(0), // chained subagent handoffs since the last user intervention
  // optional local-model counters (read-only for the UI); absent on old missions
  local: z
    .object({
      localTasks: z.number().int().nonnegative().default(0),
      fallbacks: z.number().int().nonnegative().default(0),
      tokensSaved: z.number().nonnegative().default(0), // estimated
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Mission = z.infer<typeof Mission>;

const NEXT: Record<Stage, readonly Stage[]> = {
  intake: ["planejando", "parada"],
  planejando: ["aguardando-aprovacao", "pausada", "parada"],
  // feedback comment restarts phase 1
  "aguardando-aprovacao": ["executando", "planejando", "parada"],
  executando: ["concluida", "pausada", "parada"],
  pausada: ["planejando", "executando", "parada"],
  concluida: ["executando", "aguardando-aprovacao"], // follow-up in the same session, or blocks still unsealed
  parada: ["planejando", "executando"], // a recolhida can be taken up again by the user (the caller decides the phase)
};

export function newMission(id: string, project: string, now: () => Date): Mission {
  const t = now().toISOString();
  return Mission.parse({ id, project, stage: "intake", createdAt: t, updatedAt: t });
}

/**
 * Pure transition. Entering `executando` requires the caller to pass `approved` from the gate.
 * Entering `pausada` requires a `reason`; leaving it clears the pause fields. A paused plan
 * (phase 1) can never resume straight into `executando`.
 */
export function transition(
  m: Mission,
  to: Stage,
  opts: { now: () => Date; approved?: boolean; reason?: string },
): Mission {
  if (!NEXT[m.stage].includes(to)) throw new Error(`invalid transition ${m.stage} -> ${to}`);
  if (to === "executando" && m.stage === "pausada" && m.pausedFrom !== "executando") {
    throw new Error("invalid transition pausada -> executando: the paused phase was planning");
  }
  if (to === "executando" && opts.approved !== true) {
    throw new Error("approval gate not open: cannot start execution");
  }
  if (to === "pausada" && !opts.reason) throw new Error("a pause reason is required");
  const { pauseReason: _r, pausedFrom: _f, ...rest } = m;
  const next = { ...rest, stage: to, updatedAt: opts.now().toISOString() };
  return to === "pausada" ? { ...next, pauseReason: opts.reason, pausedFrom: m.stage as "planejando" | "executando" } : next;
}

/** Never throws: bad file data yields `undefined`. */
export function parseMission(text: string): Mission | undefined {
  try {
    const r = Mission.safeParse(JSON.parse(text));
    return r.success ? r.data : undefined;
  } catch {
    return undefined;
  }
}

/** Atomic write: temp file in the same dir, then rename. */
export function writeMission(dir: string, m: Mission): void {
  const tmp = join(dir, `mission.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(m, null, 2));
  renameSync(tmp, join(dir, "mission.json"));
}

/** Pure counter update from a runLocal result; refused tasks are not counted. */
export function recordLocal(m: Mission, r: { via: "local" | "claude-fallback" | "refused"; tokensSaved?: number }): Mission {
  if (r.via === "refused") return m;
  const c = m.local ?? { localTasks: 0, fallbacks: 0, tokensSaved: 0 };
  return {
    ...m,
    local:
      r.via === "local"
        ? { ...c, localTasks: c.localTasks + 1, tokensSaved: c.tokensSaved + (r.tokensSaved ?? 0) }
        : { ...c, fallbacks: c.fallbacks + 1 },
  };
}
