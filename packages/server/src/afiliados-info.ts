import { closeSync, constants, fstatSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { mascararTexto } from "./afiliados-store.ts";

const LIMITE = 256 * 1024;

/** Regular-file read, no symlinks, capped; any failure means undefined. Read-only. */
function lerTexto(arq: string): string | undefined {
  try {
    const fd = openSync(arq, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!fstatSync(fd).isFile()) return undefined;
      const buf = Buffer.alloc(LIMITE);
      return buf.subarray(0, readSync(fd, buf, 0, LIMITE, 0)).toString("utf8");
    } finally { closeSync(fd); }
  } catch { return undefined; }
}

/** `.env` line by line; ONLY DRY_RUN and WA_MAX_PER_DAY are kept, everything else is dropped on the spot. */
export function lerInfo(caminho: string): { dryRun?: boolean; waMaxPerDay?: number } {
  const out: { dryRun?: boolean; waMaxPerDay?: number } = {};
  for (const linha of (lerTexto(join(caminho, ".env")) ?? "").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?(DRY_RUN|WA_MAX_PER_DAY)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m) continue;
    const v = (m[2] ?? "").replace(/^(["'])(.*)\1$/, "$2").replace(/\s+#.*$/, "").trim().toLowerCase();
    if (m[1] === "DRY_RUN") {
      if (["true", "1", "yes", "on"].includes(v)) out.dryRun = true;
      else if (["false", "0", "no", "off"].includes(v)) out.dryRun = false;
    } else if (/^\d{1,9}$/.test(v) && Number(v) > 0) out.waMaxPerDay = Number(v);
  }
  return out;
}

export type Relatorio = { existe: false } | { existe: true; arquivo: string; data?: string; nichos?: string[]; status?: string; achados?: string | string[]; corpo: string };

/** Tolerant frontmatter: `key: value`, `[a, b]` and `- item` lists; anything else is ignored. */
function frontmatter(txt: string): { meta: Record<string, string | string[]>; corpo: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(txt);
  if (!m) return { meta: {}, corpo: txt };
  const meta: Record<string, string | string[]> = {};
  let chave: string | undefined;
  for (const l of (m[1] ?? "").split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(l) ?? /^-\s+(.*)$/.exec(l);
    if (item && chave) {
      const cur = meta[chave];
      meta[chave] = [...(Array.isArray(cur) ? cur : cur ? [cur] : []), (item[1] ?? "").trim()];
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
    if (!kv) continue;
    chave = kv[1]!;
    const v = (kv[2] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
    if (v === "") delete meta[chave];
    else meta[chave] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(",").map((s) => s.trim().replace(/^(["'])(.*)\1$/, "$2")).filter(Boolean) : v;
  }
  return { meta, corpo: txt.slice(m[0].length) };
}

/** Latest `<tipo>-YYYY-MM-DD*.md` in `<afiliados>/.claude/ops-reports/`, chosen by the date in the file name. */
export function ultimoRelatorio(caminho: string, tipo: "ops" | "deal-auditor"): Relatorio {
  const dir = join(caminho, ".claude", "ops-reports");
  const re = new RegExp(`^${tipo}-(\\d{4}-\\d{2}-\\d{2}).*\\.md$`);
  let nomes: string[];
  try { nomes = readdirSync(dir).filter((n) => re.test(n)); } catch { return { existe: false }; }
  nomes.sort((a, b) => (re.exec(b)![1]! + b).localeCompare(re.exec(a)![1]! + a));
  const arquivo = nomes[0];
  const txt = arquivo ? lerTexto(join(dir, arquivo)) : undefined;
  if (!arquivo || txt === undefined || txt.trim() === "") return { existe: false };
  const { meta, corpo } = frontmatter(txt);
  const lista = (v?: string | string[]) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
  const achados = meta["achados"];
  const s = (v?: string | string[]) => (v === undefined ? undefined : mascararTexto(Array.isArray(v) ? v.join(", ") : v));
  return {
    existe: true,
    arquivo,
    ...(s(meta["data"]) !== undefined ? { data: s(meta["data"])! } : {}),
    ...(lista(meta["nichos"]) ? { nichos: lista(meta["nichos"])!.map(mascararTexto) } : {}),
    ...(s(meta["status"]) !== undefined ? { status: s(meta["status"])! } : {}),
    ...(achados !== undefined ? { achados: Array.isArray(achados) ? achados.map(mascararTexto) : mascararTexto(achados) } : {}),
    corpo: mascararTexto(corpo),
  };
}

/** Allowlisted metadata of ONE report file (for notifications): masked, short `status` only. Read-only; undefined when unreadable. */
export function metaRelatorio(caminho: string, arquivo: string): { status?: string } | undefined {
  if (!/^(ops|deal-auditor)-\d{4}-\d{2}-\d{2}[\w.-]*\.md$/.test(arquivo)) return undefined;
  const txt = lerTexto(join(caminho, ".claude", "ops-reports", arquivo));
  if (txt === undefined) return undefined;
  const s = frontmatter(txt).meta["status"];
  return typeof s === "string" ? { status: mascararTexto(s).slice(0, 40) } : {};
}
