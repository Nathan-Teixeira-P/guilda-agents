import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  AGENT_MODELS, FRONTEND_AGENTS, MODELS, READ_ONLY_AGENTS, RESPONSE_PATTERN, WRITE_TOOLS,
} from "../packages/core/src/models.ts";

const KEYS = ["name", "description", "model", "tools"];
export interface Parsed { data: { name?: string; description?: string; model?: string; tools?: string[] }; body: string }

/** Minimal frontmatter parser: `key: value` lines only; `tools` is comma-separated (commas inside parentheses, as in `Agent(a,b)`, do not split). */
export function parseFrontmatter(text: string): Parsed {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error("frontmatter missing or unterminated");
  const data: Record<string, string | string[]> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.indexOf(":");
    if (i < 1) throw new Error(`malformed frontmatter line: ${line}`);
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    if (!KEYS.includes(k)) throw new Error(`unknown frontmatter key: ${k}`);
    data[k] = k === "tools" ? v.split(/,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean) : v;
  }
  return { data: data as Parsed["data"], body: m[2]! };
}

export function validateAgent(file: string, text: string): string[] {
  let p: Parsed;
  try { p = parseFrontmatter(text); } catch (e) { return [`${file}: ${(e as Error).message}`]; }
  const { name, description, model, tools } = p.data;
  const errs: string[] = [];
  const err = (s: string) => errs.push(`${file}: ${s}`);
  if (!name) err("missing name");
  else if (name !== basename(file, ".md")) err(`name "${name}" does not match filename`);
  if (!description) err("missing description");
  if (!tools?.length) err("tools missing or empty (declare minimal tools)");
  if (!model || !(MODELS as readonly string[]).includes(model)) err(`model "${model}" not in ${MODELS.join("|")}`);
  else if (name && AGENT_MODELS[name] && AGENT_MODELS[name] !== model) err(`model "${model}" differs from table (${AGENT_MODELS[name]})`);
  if (name && READ_ONLY_AGENTS.includes(name))
    for (const t of tools ?? []) if (WRITE_TOOLS.includes(t)) err(`read-only agent has ${t}`);
  if (name && !FRONTEND_AGENTS.includes(name) && !p.body.includes(RESPONSE_PATTERN)) err(`missing response pattern line (${RESPONSE_PATTERN})`);
  return errs;
}

export function validateDir(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".md")).flatMap((f) => validateAgent(f, readFileSync(join(dir, f), "utf8")));
}

if (import.meta.main) {
  const errs = validateDir(process.argv[2] ?? "agents");
  errs.forEach((e) => console.error(e));
  process.exit(errs.length ? 1 : 0);
}
