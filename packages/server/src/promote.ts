import * as nodeFs from "node:fs";
import { dirname, join } from "node:path";
import { planPromotion, PROMOTE_DIRS, type StagedFile } from "@lab/core/src/promote.ts";

export type PromoteResult = { ok: true; promoted: string[] } | { ok: false; reason: string };
export interface PromoteOpts {
  fs?: typeof nodeFs; // injectable for failure tests
}

/** Recursive `lstat` walk: never follows symlinks (a symlinked dir is reported as a symlink entry). */
function scan(fs: typeof nodeFs, root: string, rel = ""): StagedFile[] {
  const out: StagedFile[] = [];
  for (const name of fs.readdirSync(rel ? join(root, rel) : root)) {
    const p = rel ? `${rel}/${name}` : name;
    const st = fs.lstatSync(join(root, p));
    if (st.isDirectory()) out.push(...scan(fs, root, p));
    else out.push({ path: p, kind: st.isSymbolicLink() ? "symlink" : st.isFile() ? "file" : "other", size: st.size });
  }
  return out;
}

const lstatOrNull = (fs: typeof nodeFs, p: string) => fs.lstatSync(p, { throwIfNoEntry: false }) ?? null;

/**
 * Atomically (all or nothing) copies `<staging>` into `<project>/.claude/<subfolder>/...`.
 * Phase 1 copies every file to a temp name next to its destination; phase 2 renames them into
 * place, keeping a `.bak` of any existing destination. Any failure undoes everything.
 * Only touches `<project>/.claude/<allowed subfolder>`; runs nothing from the project.
 */
export function promoteDraft(staging: string, project: string, opts: PromoteOpts = {}): PromoteResult {
  const fs = opts.fs ?? nodeFs;
  const claudeDir = join(project, ".claude");
  const undo: (() => void)[] = []; // run in reverse on failure
  const cleanup: (() => void)[] = []; // run on success
  try {
    const plan = planPromotion(scan(fs, staging));
    if (!plan.ok) return plan;

    // `.claude` and the subfolders must be real directories (or absent), never symlinks.
    for (const d of [claudeDir, ...PROMOTE_DIRS.map((x) => join(claudeDir, x))]) {
      const st = lstatOrNull(fs, d);
      if (st && !st.isDirectory()) return { ok: false, reason: `destination is not a real directory: ${d}` };
    }

    const staged: { src: string; dest: string; tmp: string }[] = [];
    plan.files.forEach((f, i) => {
      const dest = join(claudeDir, f.path);
      const created = fs.mkdirSync(dirname(dest), { recursive: true });
      if (created) undo.push(() => fs.rmSync(created, { recursive: true, force: true }));
      const tmp = join(dirname(dest), `.promote-${process.pid}-${i}.tmp`);
      undo.push(() => fs.rmSync(tmp, { force: true }));
      fs.copyFileSync(join(staging, f.path), tmp, nodeFs.constants.COPYFILE_EXCL);
      staged.push({ src: f.path, dest, tmp });
    });

    for (const [i, s] of staged.entries()) {
      const old = lstatOrNull(fs, s.dest);
      if (old) {
        if (!old.isFile()) throw new Error(`destination is not a regular file: ${s.dest}`);
        const bak = `${s.dest}.bak`;
        if (lstatOrNull(fs, bak)) {
          const aside = `${s.dest}.promote-${process.pid}-${i}.bak.old`;
          fs.renameSync(bak, aside);
          undo.push(() => fs.renameSync(aside, bak));
          cleanup.push(() => fs.rmSync(aside, { force: true }));
        }
        fs.renameSync(s.dest, bak);
        undo.push(() => fs.renameSync(bak, s.dest));
      }
      fs.renameSync(s.tmp, s.dest);
      undo.push(() => fs.rmSync(s.dest, { force: true }));
    }
    cleanup.forEach((c) => c());
    return { ok: true, promoted: staged.map((s) => s.src) };
  } catch (e) {
    // Undo in reverse order; keep going if an undo step itself fails.
    for (const u of undo.reverse()) {
      try { u(); } catch { /* best effort */ }
    }
    return { ok: false, reason: `promotion failed and was rolled back: ${e instanceof Error ? e.message : String(e)}` };
  }
}
