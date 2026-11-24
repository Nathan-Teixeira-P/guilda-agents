import { isAbsolute } from "node:path";
import { z } from "zod";

export const PROJECT_ID = /^[a-z0-9-]{1,64}$/;

export const Projeto = z.looseObject({
  id: z.string().regex(PROJECT_ID),
  nome: z.string().min(1),
  apelidos: z.array(z.string()).default([]),
  origem: z.object({ tipo: z.enum(["url", "pasta"]), valor: z.string().min(1) }),
  caminho: z.string().min(1),
  clickupListUrl: z.string().optional(),
  comandos: z.array(z.string()).default([]), // phase 2 Bash allow-list; each entry passed validarComando
  criadoEm: z.string(),
});
export type Projeto = z.infer<typeof Projeto>;

export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export type Resolucao =
  | { ok: true; projeto: Projeto }
  | { ok: false; ambiguo: true; candidatos: Projeto[] }
  | { ok: false; naoEncontrado: true };

/** Matches by normalized name or alias. Never picks on its own when several projects match. */
export function resolverProjeto(consulta: string, projetos: Projeto[]): Resolucao {
  const q = normalizar(consulta);
  const hits = q === "" ? [] : projetos.filter((p) => [p.nome, ...p.apelidos].some((n) => normalizar(n) === q));
  if (hits.length === 1) return { ok: true, projeto: hits[0]! };
  if (hits.length > 1) return { ok: false, ambiguo: true, candidatos: hits };
  return { ok: false, naoEncontrado: true };
}

export type Origem = { ok: true; tipo: "url" | "pasta"; valor: string } | { ok: false; reason: string };

const HOST = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const SCP = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*:[A-Za-z0-9._~/][A-Za-z0-9._~/-]*$/;
const bad = (reason: string): Origem => ({ ok: false, reason });

/**
 * Allow-list for what may reach `git clone` or the filesystem: https, ssh, scp-like `user@host:path`,
 * or an absolute local directory path. Everything else (file://, ext::, option-looking values) fails closed.
 */
export function validarOrigem(valor: string): Origem {
  if (typeof valor !== "string" || valor === "" || valor.length > 2048) return bad("invalid length");
  if (/[\p{Cc}\s]/u.test(valor)) return bad("control characters or spaces");
  if (valor.startsWith("-")) return bad("looks like an option");
  if (valor.startsWith("/")) {
    return isAbsolute(valor) && !valor.split("/").includes("..") ? { ok: true, tipo: "pasta", valor } : bad("invalid path");
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(valor)?.[1]?.toLowerCase();
  if (scheme === "https" || scheme === "ssh") {
    if (!valor.toLowerCase().startsWith(`${scheme}://`)) return bad("malformed url");
    let u: URL;
    try { u = new URL(valor); } catch { return bad("malformed url"); }
    if (!HOST.test(u.hostname)) return bad("invalid host");
    if (scheme === "https" && (u.username || u.password)) return bad("credentials in url");
    if (scheme === "ssh" && (u.password || u.username.startsWith("-"))) return bad("invalid ssh user");
    return { ok: true, tipo: "url", valor };
  }
  return SCP.test(valor) ? { ok: true, tipo: "url", valor } : bad("unsupported origin");
}

/** ClickUp list links: https on app.clickup.com only, no embedded credentials. */
export function validarClickupUrl(valor: string): boolean {
  try {
    const u = new URL(valor);
    return u.protocol === "https:" && u.hostname === "app.clickup.com" && !u.username && !u.password && u.port === "";
  } catch { return false; }
}

const PREFIXES = [/^npm test/, /^npm run [A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)*/, /^npx vitest/, /^npx tsc/, /^node --test/, /^pytest/, /^go test/, /^cargo test/, /^make (test|lint|build)/, /^(pnpm|yarn|bun) test/, /^(pnpm|yarn|bun|composer) run [A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)*/];
const ARGS = /^( [A-Za-z0-9_./=@:+,-]+)*$/; // no shell metacharacters, quotes, globs, parens or control chars
const FORBIDDEN = new Set(["sudo", "rm", "curl", "wget", "git"]);

/**
 * Closed-format check for a phase 2 Bash command: a known test/typecheck prefix plus plain arguments.
 * Fails closed on chaining, redirection, substitution, globs, quoting and dangerous executables.
 */
export function validarComando(c: unknown): c is string {
  if (typeof c !== "string" || c.length === 0 || c.length > 200) return false;
  const m = PREFIXES.map((re) => re.exec(c)).find((x) => x);
  if (!m) return false;
  const tokens = c.split(" ");
  if (!ARGS.test(c.slice(m[0].length)) || tokens.includes("..") || tokens.some((t) => FORBIDDEN.has(t) || t.split("/").includes("..") || t.startsWith("/") || t.startsWith("~"))) return false;
  return true;
}

export type Sugestao = { comando: string; motivo: string };
export type LeitorProjeto = {
  /** Text of a top-level project file, or undefined when missing, a symlink, unreadable or over the size cap. */
  ler: (nome: string) => string | undefined;
  existe: (nome: string) => boolean;
  /** Names of top-level entries (no symlinks), used only by analisarSubida. */
  listar?: () => string[];
};

const NOME_SCRIPT = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
const SCRIPTS_NPM = ["lint", "build", "typecheck", "type-check", "check", "test:unit"];
const json = (t: string | undefined): Record<string, unknown> => {
  try { const v: unknown = t === undefined ? undefined : JSON.parse(t); return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}; } catch { return {}; }
};
const runnerDe = (l: LeitorProjeto) => (l.existe("pnpm-lock.yaml") ? "pnpm" : l.existe("yarn.lock") ? "yarn" : l.existe("bun.lock") || l.existe("bun.lockb") ? "bun" : "npm");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Pure: suggestions from project files read through the injected reader. Never executes anything; only
 * emits fixed command shapes (`<runner> test`, `<runner> run <validated name>`, `make X`, ...), never script bodies.
 */
export function analisarProjeto(leitor: LeitorProjeto): { sugestoes: Sugestao[]; mensagem?: string } {
  const out: Sugestao[] = [];
  const add = (comando: string, motivo: string) => {
    if (validarComando(comando) && !out.some((s) => s.comando === comando)) out.push({ comando, motivo });
  };
  const pkg = json(leitor.ler("package.json"));
  const scripts = obj(pkg.scripts);
  const runner = runnerDe(leitor);
  const tem = (n: string) => typeof scripts[n] === "string" && NOME_SCRIPT.test(n);
  if (tem("test") && !/no test specified/.test(scripts.test as string)) add(`${runner} test`, "package.json: script test");
  for (const n of [...SCRIPTS_NPM, ...Object.keys(scripts).filter((k) => k.startsWith("lint"))]) if (tem(n)) add(`${runner} run ${n}`, `package.json: script ${n}`);
  if (leitor.existe("tsconfig.json") && (obj(pkg.dependencies).typescript !== undefined || obj(pkg.devDependencies).typescript !== undefined)) {
    add("npx tsc --noEmit", "tsconfig.json + typescript nas dependências");
  }
  const make = leitor.ler("Makefile") ?? leitor.ler("makefile");
  if (make !== undefined) for (const t of ["test", "lint", "build"]) if (new RegExp(`^${t}\\s*:`, "m").test(make)) add(`make ${t}`, `Makefile: alvo ${t}`);
  const py = leitor.ler("pyproject.toml");
  if (leitor.existe("pytest.ini") || (py !== undefined && /pytest/.test(py))) add("pytest", "configuração do pytest");
  if (leitor.existe("go.mod")) add("go test ./...", "go.mod");
  if (leitor.existe("Cargo.toml")) add("cargo test", "Cargo.toml");
  const comp = obj(json(leitor.ler("composer.json")).scripts);
  for (const n of ["test", "lint"]) if (typeof comp[n] === "string" || Array.isArray(comp[n])) add(`composer run ${n}`, `composer.json: script ${n}`);
  return out.length ? { sugestoes: out } : { sugestoes: [], mensagem: "Não encontrei nenhum comando de teste conhecido neste projeto. Você pode adicionar um manualmente." };
}

export type PassoSubida = { passo: number; comando: string; motivo: string };

const COMPOSE = /^docker-compose[A-Za-z0-9_.-]*\.ya?ml$/;
const AIR = /^\.air[A-Za-z0-9_.-]*\.toml$/;

/**
 * Pure and informative only: how to bring the project up, read from top-level files. These commands are never
 * executed by the hub nor added to the allow-list. Order: infra (docker) -> dev/frontend -> air/backend.
 */
export function analisarSubida(leitor: LeitorProjeto): PassoSubida[] {
  const itens: Array<{ comando: string; motivo: string }> = [];
  const nomes = [...(leitor.listar?.() ?? [])].sort();
  for (const n of nomes.filter((x) => COMPOSE.test(x))) itens.push({ comando: `docker compose -f ${n} up -d --build`, motivo: `${n}: infraestrutura` });
  const scripts = obj(json(leitor.ler("package.json")).scripts);
  if (typeof scripts.dev === "string") itens.push({ comando: `${runnerDe(leitor)} run dev`, motivo: "package.json: script dev" });
  const make = leitor.ler("Makefile") ?? leitor.ler("makefile");
  if (make !== undefined) for (const t of ["run", "dev", "up"]) if (new RegExp(`^${t}\\s*:`, "m").test(make)) itens.push({ comando: `make ${t}`, motivo: `Makefile: alvo ${t}` });
  for (const n of nomes.filter((x) => AIR.test(x))) itens.push({ comando: `air -c ${n}`, motivo: `${n}: backend Go com hot reload` });
  return itens.map((x, i) => ({ passo: i + 1, ...x }));
}
