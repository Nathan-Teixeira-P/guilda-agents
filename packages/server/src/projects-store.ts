import { closeSync, constants, lstatSync, mkdirSync, openSync, readSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { PROJECT_ID, Projeto } from "@lab/core/src/projects.ts";
import type { Mission } from "@lab/core/src/mission.ts";
import type { Store } from "./store.ts";

const File = z.object({ projects: z.array(Projeto) });

/** Project registry: `projects.json` in the hub (or memory only when no file is given). Never touches project folders. */
export function createProjectsStore(file?: string) {
  let items: Projeto[] = [];
  if (file) {
    try {
      const r = File.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (r.success) items = r.data.projects;
      else renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        try { renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* nothing to back up */ }
      }
    }
  }
  const persist = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify({ projects: items }, null, 2));
    renameSync(tmp, file);
  };
  return {
    list: (): Projeto[] => [...items],
    get: (id: string) => (PROJECT_ID.test(id) ? items.find((p) => p.id === id) : undefined),
    add(p: Projeto) {
      if (items.some((x) => x.id === p.id)) throw new Error("duplicate project id");
      items = [...items, p];
      persist();
    },
    /** Replaces the phase 2 command list (already validated by the caller); undefined when the project is unknown. */
    setComandos(id: string, comandos: string[]): Projeto | undefined {
      const cur = PROJECT_ID.test(id) ? items.find((p) => p.id === id) : undefined;
      if (!cur) return undefined;
      const next = { ...cur, comandos };
      items = items.map((p) => (p === cur ? next : p));
      persist();
      return next;
    },
    /** Removes the record only; the folder on disk is never deleted. */
    remove(id: string): boolean {
      const n = items.length;
      items = items.filter((p) => p.id !== id);
      if (items.length === n) return false;
      persist();
      return true;
    },
  };
}
export type ProjectsStore = ReturnType<typeof createProjectsStore>;

export const NOTES_LIMIT = 4096;

/** "Resume where we left off": capped `project-notes.md` (no symlinks) plus the project's latest mission. */
export function lerRetomada(p: Projeto, store: Store): { notes?: string; lastMission?: Mission } {
  const out: { notes?: string; lastMission?: Mission } = {};
  try {
    const claude = join(p.caminho, ".claude");
    if (!lstatSync(claude).isSymbolicLink()) {
      const fd = openSync(join(claude, "project-notes.md"), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const buf = Buffer.alloc(NOTES_LIMIT);
        const n = readSync(fd, buf, 0, NOTES_LIMIT, 0);
        if (n > 0) out.notes = buf.subarray(0, n).toString("utf8");
      } finally { closeSync(fd); }
    }
  } catch { /* no notes, or symlink/unreadable: skip */ }
  const last = store.list().find((m) => m.project === p.id); // list() is newest first
  if (last) out.lastMission = last;
  return out;
}
