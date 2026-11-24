import { extname } from "node:path";

/** Closed list of destination subfolders under `<project>/.claude/`. */
export const PROMOTE_DIRS = ["prd", "specs", "design", "handoff", "agent-notes", "learnings"] as const;
export const PROMOTE_EXTS = [".md", ".json", ".svg", ".png"] as const;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

/** One entry found in the staging dir (from `lstat`, never following symlinks). */
export interface StagedFile {
  path: string; // relative to staging, "/" separated
  kind: "file" | "symlink" | "other";
  size: number;
}

/** `path` is relative to both staging and `<project>/.claude/`. */
export type PromotionPlan = { ok: true; files: { path: string; size: number }[] } | { ok: false; reason: string };

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Fail-closed: any doubt about any file refuses the whole plan. */
export function planPromotion(files: readonly StagedFile[]): PromotionPlan {
  const no = (reason: string): PromotionPlan => ({ ok: false, reason });
  if (files.length === 0) return no("nothing to promote");
  const seen = new Set<string>();
  let total = 0;
  for (const f of files) {
    const p = f.path;
    if (f.kind === "symlink") return no(`symlink not allowed: ${JSON.stringify(p)}`);
    if (f.kind !== "file") return no(`not a regular file: ${JSON.stringify(p)}`);
    if (typeof p !== "string" || p === "" || CONTROL.test(p) || p.includes("\\") || p.startsWith("/") || /^[A-Za-z]:/.test(p))
      return no(`invalid path: ${JSON.stringify(p)}`);
    const segs = p.split("/");
    if (segs.some((s) => s === "" || s === "." || s === "..")) return no(`invalid path segment: ${JSON.stringify(p)}`);
    if (segs.length < 2 || !(PROMOTE_DIRS as readonly string[]).includes(segs[0]!))
      return no(`destination folder not allowed: ${JSON.stringify(p)}`);
    const base = segs[segs.length - 1]!;
    if (!(PROMOTE_EXTS as readonly string[]).includes(extname(base).toLowerCase()) || base.startsWith("."))
      return no(`extension not allowed: ${JSON.stringify(p)}`);
    if (!Number.isFinite(f.size) || f.size < 0) return no(`invalid size: ${JSON.stringify(p)}`);
    if (f.size > MAX_FILE_BYTES) return no(`file too large: ${JSON.stringify(p)}`);
    total += f.size;
    if (total > MAX_TOTAL_BYTES) return no("total size too large");
    const key = p.normalize("NFC").toLowerCase();
    if (seen.has(key)) return no(`duplicate name: ${JSON.stringify(p)}`);
    seen.add(key);
  }
  return { ok: true, files: files.map((f) => ({ path: f.path, size: f.size })) };
}
