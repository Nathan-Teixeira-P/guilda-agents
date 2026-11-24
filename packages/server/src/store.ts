import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseMission, transition, writeMission, type Mission } from "@lab/core/src/mission.ts";

/** Mission ids are server-generated and only ever `[a-z0-9-]`; anything else never reaches the filesystem. */
export const MISSION_ID = /^[a-z0-9-]{1,64}$/;

export function createStore(dir: string) {
  const base = resolve(dir);
  mkdirSync(base, { recursive: true });
  const dirOf = (id: string) => {
    if (!MISSION_ID.test(id)) throw new Error(`invalid mission id: ${id}`);
    return join(base, id);
  };
  const get = (id: string): Mission | undefined => {
    if (!MISSION_ID.test(id)) return undefined;
    try {
      return parseMission(readFileSync(join(dirOf(id), "mission.json"), "utf8"));
    } catch {
      return undefined; // missing or unreadable
    }
  };
  return {
    dir: base,
    dirOf,
    get,
    save(m: Mission) {
      mkdirSync(dirOf(m.id), { recursive: true });
      writeMission(dirOf(m.id), m);
    },
    list(): Mission[] {
      return readdirSync(base)
        .map(get)
        .filter((m): m is Mission => m !== undefined)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    /** On boot no child process exists: running missions become `pausada` (the user resumes; never restarted by themselves). */
    recover(now: () => Date): string[] {
      const paused: string[] = [];
      for (const m of this.list()) {
        if (m.stage === "intake" || m.stage === "planejando" || m.stage === "executando") {
          const running = m.stage === "intake" ? transition(m, "planejando", { now }) : m; // intake can only pause as planning
          this.save(transition(running, "pausada", { now, reason: "servidor reiniciado" }));
          paused.push(m.id);
        }
      }
      return paused;
    },
  };
}
export type Store = ReturnType<typeof createStore>;
