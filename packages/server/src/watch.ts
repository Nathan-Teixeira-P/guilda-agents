import { watch } from "node:fs";

export interface FileEvent {
  root: "mission" | "project";
  path: string; // relative to the watched dir (never absolute)
}

/** Watches dirs and reports changed files (debounced per path). Tolerates missing dirs and watch errors. Returns `close`. */
export function watchDirs(dirs: Partial<Record<FileEvent["root"], string>>, emit: (e: FileEvent) => void, debounceMs = 50): () => void {
  const watchers: ReturnType<typeof watch>[] = [];
  const timers = new Map<string, NodeJS.Timeout>();
  for (const [root, dir] of Object.entries(dirs) as [FileEvent["root"], string][]) {
    try {
      const w = watch(dir, { recursive: true }, (_ev, name) => {
        if (!name) return;
        const key = `${root}:${name}`;
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => { timers.delete(key); emit({ root, path: String(name) }); }, debounceMs));
      });
      w.on("error", () => {}); // ponytail: a dead watcher is silently dropped; SSE just loses file events
      watchers.push(w);
    } catch { /* dir missing: nothing to watch */ }
  }
  return () => {
    watchers.forEach((w) => w.close());
    timers.forEach(clearTimeout);
    timers.clear();
  };
}
