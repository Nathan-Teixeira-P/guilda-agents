/** Mechanical checks of a drafted spec set, done by the hub so no agent spends tokens on them. Pure. */
export type SpecFile = { name: string; text: string };

const KEYS = ["title", "number", "priority", "tags", "dependencies", "related_prd", "status", "created"];
const SECTIONS = ["Overview", "Related PRD", "Prerequisites", "Dependencies", "Implementation Tasks", "Acceptance Criteria", "Verification", "Rollback Plan"];
const MAX_FILES = 5;

const num = (s: string) => /\d+/.exec(s)?.[0];

export function conferirSpecs(files: SpecFile[]): string[] {
  const out: string[] = [];
  const specs = files.filter((f) => /^\d+.*\.spec\.md$/.test(f.name));
  if (!specs.length) return out;
  const index = files.find((f) => f.name === "INDEX.md")?.text;
  if (index === undefined) out.push("INDEX.md ausente");
  const nums = specs.map((f) => Number(num(f.name))).sort((a, b) => a - b);
  const min = nums[0]!;
  nums.forEach((n, i) => {
    if (i && n === nums[i - 1]) out.push(`número ${n} repetido`);
    else if (i && n !== nums[i - 1]! + 1) out.push(`numeração pula de ${nums[i - 1]} para ${n}`);
  });

  const deps = new Map<number, number[]>();
  for (const f of specs) {
    const err = (s: string) => out.push(`${f.name}: ${s}`);
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(f.text)?.[1] ?? "";
    const faltam = KEYS.filter((k) => !new RegExp(`^${k}:`, "m").test(front));
    if (faltam.length) err(`frontmatter sem ${faltam.join(", ")}`);
    const semSecao = SECTIONS.filter((s) => !new RegExp(`^## ${s}\\s*$`, "m").test(f.text));
    if (semSecao.length) err(`sem as seções ${semSecao.join(", ")}`);
    if (index !== undefined && !index.includes(f.name)) err("fora do INDEX.md");

    const n = Number(num(f.name));
    const ds = (/^dependencies:\s*\[(.*)\]/m.exec(front)?.[1] ?? "").split(",").map(num).filter(Boolean).map(Number);
    deps.set(n, ds);
    // lower than the first drafted number = a spec already in the project
    for (const d of ds) if (d >= min && !nums.includes(d)) err(`depende de ${d}, que não existe`);

    // ponytail: counts list items that start with a `path.ext` under Implementation Tasks; prose mentions are ignored
    const tasks = /^## Implementation Tasks\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(f.text)?.[1] ?? "";
    const arquivos = new Set([...tasks.matchAll(/^\s*- (?:\[[ x]\] )?`([^`\s]+\.[A-Za-z0-9]+)`/gm)].map((m) => m[1]));
    if (arquivos.size > MAX_FILES) err(`${arquivos.size} arquivos (máximo ${MAX_FILES})`);
  }

  const visto = new Map<number, "indo" | "ok">();
  const ciclo = (n: number): boolean => {
    if (visto.get(n)) return visto.get(n) === "indo";
    visto.set(n, "indo");
    const achou = (deps.get(n) ?? []).some(ciclo);
    visto.set(n, "ok");
    return achou;
  };
  if (nums.some(ciclo)) out.push("dependências em ciclo");
  return out;
}
