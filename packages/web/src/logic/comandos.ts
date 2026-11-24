// Mirrors validarComando in packages/core/src/projects.ts (not imported: core pulls zod into the bundle).
// The server re-validates on PATCH; this only gives early, readable feedback. A test keeps both in sync.
const PREFIXES = [/^npm test/, /^npm run [A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)*/, /^npx vitest/, /^npx tsc/, /^node --test/, /^pytest/, /^go test/, /^cargo test/, /^make (test|lint|build)/, /^(pnpm|yarn|bun) test/, /^(pnpm|yarn|bun|composer) run [A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)*/];
const ARGS = /^( [A-Za-z0-9_./=@:+,-]+)*$/;
const FORBIDDEN = new Set(["sudo", "rm", "curl", "wget", "git"]);

export function comandoValido(c: string): boolean {
  if (c.length === 0 || c.length > 200) return false;
  const m = PREFIXES.map((re) => re.exec(c)).find((x) => x);
  if (!m) return false;
  const tokens = c.split(" ");
  return ARGS.test(c.slice(m[0].length)) && !tokens.includes("..") && !tokens.some((t) => FORBIDDEN.has(t) || t.split("/").includes("..") || t.startsWith("/") || t.startsWith("~"));
}

/** pt-BR reason a command is rejected, or undefined when it is allowed. */
export function motivoRejeicao(c: string): string | undefined {
  if (comandoValido(c)) return undefined;
  if (c.length === 0) return "Digite um comando.";
  if (c.length > 200) return "Comando longo demais (máximo 200 caracteres).";
  if (c !== c.trim() || /  /.test(c)) return "Use um único espaço entre as partes, sem espaços nas pontas.";
  if (/[\p{Cc}]/u.test(c)) return "Quebras de linha e caracteres de controle não são permitidos.";
  if (/\|/.test(c)) return "Pipes (|) não são permitidos.";
  if (/;/.test(c)) return "Não é permitido encadear comandos com ';'.";
  if (/&/.test(c)) return "Não é permitido encadear comandos com '&&' nem rodar em segundo plano com '&'.";
  if (/[<>]/.test(c)) return "Redirecionamentos (< e >) não são permitidos.";
  if (/[$`]/.test(c)) return "Substituição de comandos e variáveis ($ e crases) não é permitida.";
  if (/["'\\*?()[\]{}~#!]/.test(c)) return "Aspas, curingas, parênteses e caracteres especiais não são permitidos.";
  const tokens = c.split(" ");
  const proibido = tokens.find((t) => FORBIDDEN.has(t));
  if (proibido) return `O executável '${proibido}' não é permitido.`;
  if (tokens.some((t) => t === ".." || t.split("/").includes(".."))) return "Caminhos com '..' não são permitidos.";
  if (tokens.some((t) => t.startsWith("/") || t.startsWith("~"))) return `O argumento "${tokens.find((t) => t.startsWith("/") || t.startsWith("~"))}" é um caminho absoluto (/ ou ~); use caminhos relativos ao projeto.`;
  if (!PREFIXES.some((re) => re.test(c))) return "Comando não reconhecido. Use testes, lint ou build: npm/pnpm/yarn/bun, npx vitest/tsc, pytest, go test, cargo test, make test|lint|build.";
  return "Argumentos inválidos: use só letras, números e . / = @ : + , -";
}
