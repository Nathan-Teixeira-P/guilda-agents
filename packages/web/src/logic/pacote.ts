export interface Arquivo { path: string; content: string }
export type GrupoId = "plano" | "prd" | "specs" | "design" | "outros";

const ROTULO: Record<GrupoId, string> = { plano: "Plano", prd: "PRD", specs: "Specs", design: "Design", outros: "Outros arquivos" };
const ORDEM: readonly GrupoId[] = ["plano", "prd", "specs", "design", "outros"];

const grupoDe = (path: string): GrupoId =>
  /(^|\/)plan\.md$/.test(path) ? "plano" : path.startsWith("prd/") ? "prd" : path.startsWith("specs/") ? "specs" : path.startsWith("design/") ? "design" : "outros";

/** Package files (paths relative to the project's .claude/) grouped for the reader; empty groups are dropped. */
export function agruparPacote(files: readonly Arquivo[]): { grupo: GrupoId; rotulo: string; arquivos: Arquivo[] }[] {
  const by = new Map<GrupoId, Arquivo[]>();
  for (const f of files) by.set(grupoDe(f.path), [...(by.get(grupoDe(f.path)) ?? []), f]);
  return ORDEM.filter((g) => by.has(g)).map((g) => ({ grupo: g, rotulo: ROTULO[g], arquivos: by.get(g)!.sort((a, b) => a.path.localeCompare(b.path)) }));
}
