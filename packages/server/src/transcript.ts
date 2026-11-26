/** Full conversation of each agent, read from Claude Code's own session files: what it was asked, said, ran and got back. Read-only. */
import { closeSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Item { t: "pedido" | "fala" | "acao" | "saida" | "erro"; texto: string; em: string }
export interface Conversa { tipo: string; itens: Item[] }

const CAUDA = 256 * 1024; // bytes read from the end of each transcript
const MAX_ITENS = 80;
const POR_PAPEL = 3; // newest instances of a role

// ponytail: pattern-based masking, not a guarantee; the screen is local (127.0.0.1) and the same text already sits on disk
export const mascarar = (s: string) => s
  .replace(/((?:api[_-]?key|secret|token|passw(?:or)?d|senha|authorization|private[_-]?key|credential)[\w-]*["']?\s*[=:]\s*["']?)(?:Bearer\s+)?[^\s"',]+/gi, "$1•••")
  .replace(/\b(?:sk-[\w-]{16,}|gh[pousr]_\w{20,}|glpat-[\w-]{16,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+)/g, "•••")
  .replace(/(:\/\/[^\s/:@]+:)[^\s/@]+@/g, "$1•••@");

const corta = (s: string, linhas: number, max: number) => {
  const ls = mascarar(s.trim()).split("\n");
  const t = ls.slice(0, linhas).join("\n").slice(0, max);
  return ls.length > linhas || t.length < ls.slice(0, linhas).join("\n").length ? `${t}\n… ${ls.length > linhas ? `(+${ls.length - linhas} linhas)` : "(cortado)"}` : t;
};

const alvoDe = (i: Record<string, unknown>) => {
  const v = [i["command"], i["file_path"], i["pattern"], i["description"], i["summary"], i["prompt"]].find((x) => typeof x === "string" && x !== "");
  return typeof v === "string" ? v : "";
};

type Bloco = { type?: string; text?: string; name?: string; id?: string; tool_use_id?: string; is_error?: boolean; input?: unknown; content?: unknown };

export function itensDe(jsonl: string): Item[] {
  const out: Item[] = [];
  const secretos = new Set<string>(); // results of reading these calls are never shown
  for (const linha of jsonl.split("\n")) {
    let e: { type?: string; timestamp?: string; message?: { content?: unknown } };
    try { e = JSON.parse(linha); } catch { continue; } // the first line of a tail is usually cut
    if (e.type !== "user" && e.type !== "assistant") continue;
    const em = e.timestamp ?? "";
    const c = e.message?.content;
    if (typeof c === "string") {
      if (e.type === "user") out.push({ t: "pedido", texto: corta(c, 12, 1500), em });
      continue;
    }
    if (!Array.isArray(c)) continue;
    for (const b of c as Bloco[]) {
      if (b.type === "text" && b.text?.trim()) out.push({ t: e.type === "user" ? "pedido" : "fala", texto: corta(b.text, 30, 2500), em });
      else if (b.type === "tool_use") {
        const alvo = alvoDe((b.input ?? {}) as Record<string, unknown>);
        if (/\.env\b|credentials|id_rsa|\.pem\b/.test(alvo) && b.id) secretos.add(b.id);
        out.push({ t: "acao", texto: corta(`${b.name} ${alvo}`, 6, 600), em });
      } else if (b.type === "tool_result") {
        const r = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? (b.content as Bloco[]).map((x) => x.text ?? "").join("\n") : "";
        if (r.trim()) out.push({ t: b.is_error ? "erro" : "saida", texto: secretos.has(b.tool_use_id ?? "") ? "(conteúdo oculto: arquivo de segredos)" : corta(r, 12, 1200), em });
      }
    }
  }
  return out;
}

function cauda(arquivo: string): string {
  const fd = openSync(arquivo, "r");
  try {
    const tam = fstatSync(fd).size, n = Math.min(tam, CAUDA), buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, tam - n);
    return buf.toString("utf8");
  } finally { closeSync(fd); }
}

/** `main` first, then one entry per agent type. Anything missing or unreadable just yields less. */
export function lerConversas(raiz: string, sessionId: string): Conversa[] {
  if (!/^[\w-]+$/.test(sessionId)) return [];
  let proj: string | undefined;
  try { proj = readdirSync(raiz).find((d) => { try { return statSync(join(raiz, d, `${sessionId}.jsonl`)).isFile(); } catch { return false; } }); } catch { return []; }
  if (!proj) return [];
  const base = join(raiz, proj);
  const out: Conversa[] = [{ tipo: "main", itens: itensDe(cauda(join(base, `${sessionId}.jsonl`))).slice(-MAX_ITENS) }];
  const dir = join(base, sessionId, "subagents");
  const porTipo = new Map<string, { arquivo: string; quando: number }[]>();
  let nomes: string[] = [];
  try { nomes = readdirSync(dir).filter((n) => n.endsWith(".jsonl")); } catch { /* no subagents yet */ }
  for (const n of nomes) {
    try {
      const tipo = (JSON.parse(readFileSync(join(dir, n.replace(/\.jsonl$/, ".meta.json")), "utf8")) as { agentType?: string }).agentType ?? "";
      const arquivo = join(dir, n);
      porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), { arquivo, quando: statSync(arquivo).mtimeMs }]);
    } catch { /* half-written: next poll */ }
  }
  for (const [tipo, arquivos] of porTipo) {
    const novos = arquivos.sort((a, b) => a.quando - b.quando).slice(-POR_PAPEL);
    out.push({ tipo, itens: novos.flatMap((a) => { try { return itensDe(cauda(a.arquivo)); } catch { return []; } }).slice(-MAX_ITENS) });
  }
  return out;
}
