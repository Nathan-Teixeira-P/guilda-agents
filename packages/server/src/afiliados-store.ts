import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mascararJid, nichesFileSchema, type NichesFile } from "@lab/core/src/niches.ts";

export const MAX_BACKUPS = 10;
export const COMANDO_SYNC = "npm run niches:sync";
const REL = join("config", "niches.json");
const BACKUP_ID = /^[0-9TZ-]{10,40}$/;
const JID = /\d[\d-]*@g\.us/g;

/** Error text may echo jids (e.g. duplicates): always mask before it leaves this module. */
export const mascararTexto = (s: string) => s.replace(JID, (j) => mascararJid(j));

export type Falha = { ok: false; status: number; erro: string; recarregar?: boolean };
export type Gravado = { ok: true; hash: string; mtimeMs: number; backup?: string };
const falha = (status: number, erro: string, recarregar?: boolean): Falha => ({ ok: false, status, erro, ...(recarregar ? { recarregar } : {}) });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/**
 * Reads/writes only `<afiliados>/config/niches.json`; the path is derived from the registered project, never from the client.
 * Backups and sync state live in the hub. Full groupJid leaves only through `revelarJid`.
 */
export function createAfiliadosStore(o: { hubDir: string; caminho: () => string | undefined; clock: () => Date }) {
  const backups = join(o.hubDir, "afiliados-backups");
  const stateFile = join(o.hubDir, "afiliados-state.json");
  const arquivo = () => { const c = o.caminho(); return c ? join(c, REL) : undefined; };

  const estado = (): { pendenteSync: boolean; hashGravado?: string; quando?: string } => {
    try {
      const s = JSON.parse(readFileSync(stateFile, "utf8"));
      return { pendenteSync: s.pendenteSync === true, ...(typeof s.hashGravado === "string" ? { hashGravado: s.hashGravado } : {}), ...(typeof s.quando === "string" ? { quando: s.quando } : {}) };
    } catch { return { pendenteSync: false }; }
  };
  const gravarEstado = (e: object) => {
    mkdirSync(o.hubDir, { recursive: true });
    const tmp = `${stateFile}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(e, null, 2));
    renameSync(tmp, stateFile);
  };

  const carregar = (): { ok: true; nichos: NichesFile; hash: string; mtimeMs: number } | Falha => {
    const f = arquivo();
    if (!f) return falha(404, "afiliados project is not registered");
    let raw: Buffer, mtimeMs: number;
    try { raw = readFileSync(f); mtimeMs = statSync(f).mtimeMs; } catch { return falha(404, "config/niches.json not found"); }
    let data: unknown;
    try { data = JSON.parse(raw.toString("utf8")); } catch { return falha(422, "config/niches.json is not valid JSON"); }
    const r = nichesFileSchema.safeParse(data);
    if (!r.success) return falha(422, mascararTexto(`config/niches.json is invalid: ${r.error.issues.map((i) => i.message).join("; ")}`));
    return { ok: true, nichos: r.data, hash: sha(raw), mtimeMs };
  };

  const podar = () => {
    const l = listar();
    for (const b of l.slice(MAX_BACKUPS)) rmSync(join(backups, `niches.json.${b.id}.bak`), { force: true });
  };
  const listar = (): Array<{ id: string; tamanho: number }> => {
    try {
      return readdirSync(backups)
        .map((n) => /^niches\.json\.([0-9TZ-]+)\.bak$/.exec(n)?.[1])
        .filter((id): id is string => id !== undefined)
        .sort().reverse() // ids are timestamps: newest first
        .map((id) => ({ id, tamanho: statSync(join(backups, `niches.json.${id}.bak`)).size }));
    } catch { return []; }
  };

  /** Validated list in, backup of the current file, temp + rename, prune, mark pending. */
  const escrever = (nichos: NichesFile): Gravado | Falha => {
    const f = arquivo()!;
    try {
      let backup: string | undefined;
      if (existsSync(f)) {
        mkdirSync(backups, { recursive: true });
        const base = o.clock().toISOString().replace(/[:.]/g, "-");
        backup = base;
        for (let n = 1; existsSync(join(backups, `niches.json.${backup}.bak`)); n++) backup = `${base}-${n}`;
        copyFileSync(f, join(backups, `niches.json.${backup}.bak`));
      }
      const tmp = `${f}.${process.pid}.tmp`;
      try {
        writeFileSync(tmp, `${JSON.stringify(nichos, null, 2)}\n`);
        renameSync(tmp, f);
      } catch (e) { rmSync(tmp, { force: true }); throw e; }
      podar();
      const raw = readFileSync(f);
      gravarEstado({ pendenteSync: true, hashGravado: sha(raw), quando: o.clock().toISOString() });
      return { ok: true, hash: sha(raw), mtimeMs: statSync(f).mtimeMs, ...(backup ? { backup } : {}) };
    } catch {
      return falha(500, "could not write config/niches.json (original kept)");
    }
  };

  return {
    configurado: () => arquivo() !== undefined,
    estado,
    listarBackups: listar,
    lerNichos() {
      const c = carregar();
      if (!c.ok) return c;
      return { ok: true as const, hash: c.hash, mtimeMs: c.mtimeMs, nichos: c.nichos.map((n) => ({ ...n, groupJid: mascararJid(n.groupJid) })) };
    },
    /** Explicit request only; the value is never logged. */
    revelarJid(key: string): string | undefined {
      const c = carregar();
      return c.ok ? c.nichos.find((n) => n.key === key)?.groupJid : undefined;
    },
    gravarNichos(entrada: unknown, ref: { hash: string; mtimeMs: number }): Gravado | Falha {
      const c = carregar();
      if (!c.ok) return c;
      if (c.hash !== ref.hash || c.mtimeMs !== ref.mtimeMs) return falha(409, "niches.json changed since it was loaded; reload and reapply your edits", true);
      // a masked jid sent back for an existing key keeps the stored value
      const orig = new Map(c.nichos.map((n) => [n.key, n.groupJid]));
      const lista = Array.isArray(entrada)
        ? entrada.map((n) => {
            if (n && typeof n === "object" && typeof (n as { key?: unknown }).key === "string" && typeof (n as { groupJid?: unknown }).groupJid === "string") {
              const x = n as { key: string; groupJid: string };
              const o2 = orig.get(x.key);
              if (o2 !== undefined && x.groupJid === mascararJid(o2)) return { ...x, groupJid: o2 };
            }
            return n;
          })
        : entrada;
      const r = nichesFileSchema.safeParse(lista);
      if (!r.success) return falha(400, mascararTexto(`invalid niches: ${r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")}`));
      return escrever(r.data);
    },
    restaurarBackup(id: string): Gravado | Falha {
      if (!BACKUP_ID.test(id)) return falha(400, "invalid backup id");
      if (!arquivo()) return falha(404, "afiliados project is not registered");
      let data: unknown;
      try { data = JSON.parse(readFileSync(join(backups, `niches.json.${id}.bak`), "utf8")); } catch { return falha(404, "backup not found or unreadable"); }
      const r = nichesFileSchema.safeParse(data);
      if (!r.success) return falha(422, "backup content is not a valid niches file");
      return escrever(r.data);
    },
    marcarSincronizado() {
      const e = estado();
      gravarEstado({ ...e, pendenteSync: false, quando: o.clock().toISOString() });
    },
  };
}
export type AfiliadosStore = ReturnType<typeof createAfiliadosStore>;
