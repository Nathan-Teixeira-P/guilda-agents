/** Delivery blocks of a spec set: the user seals all of them or some. Pure. */
export type Bloco = { nome: string; resumo?: string; specs: number[]; depende: number[] }; // depende: 1-based block ids

const POR_BLOCO = 5;
const num = (s: string) => Number(/\d+/.exec(s)?.[0]);

/** `json` is `handoff/blocks.json`; anything wrong with it falls back to groups of 5 in spec order, with a warning. */
export function montarBlocos(json: string | undefined, specs: { name: string; text: string }[]): { blocos: Bloco[]; aviso?: string } {
  const deps = new Map<number, number[]>();
  for (const f of specs) {
    const lista = /^dependencies:\s*\[(.*)\]/m.exec(f.text)?.[1] ?? "";
    deps.set(num(f.name), (lista.match(/\d+/g) ?? []).map(Number));
  }
  const todos = [...deps.keys()].sort((a, b) => a - b);
  let base: Omit<Bloco, "depende">[] | undefined;
  try {
    const lidos = (JSON.parse(json ?? "") as { nome?: unknown; resumo?: unknown; specs?: unknown }[]).map((b) => ({
      nome: String(b.nome), ...(typeof b.resumo === "string" ? { resumo: b.resumo } : {}), specs: (b.specs as unknown[]).map((s) => num(String(s))),
    }));
    const citados = lidos.flatMap((b) => b.specs).sort((a, b) => a - b);
    if (lidos.every((b) => b.specs.length) && citados.join() === todos.join()) base = lidos; // every spec exactly once
  } catch { /* fallback below */ }
  const aviso = !base && todos.length > POR_BLOCO ? `handoff/blocks.json ausente ou inválido: specs agrupadas de ${POR_BLOCO} em ${POR_BLOCO}` : undefined;
  base ??= Array.from({ length: Math.ceil(todos.length / POR_BLOCO) }, (_, i) => ({ nome: `Bloco ${i + 1}`, specs: todos.slice(i * POR_BLOCO, (i + 1) * POR_BLOCO) }));
  const dono = new Map(base.flatMap((b, i) => b.specs.map((s) => [s, i + 1] as const)));
  const blocos = base.map((b, i) => ({
    ...b,
    depende: [...new Set(b.specs.flatMap((s) => deps.get(s) ?? []).map((d) => dono.get(d)).filter((d): d is number => d !== undefined && d !== i + 1))].sort((a, b) => a - b),
  }));
  return { blocos, ...(aviso ? { aviso } : {}) };
}

export const blocoFeito = (b: Bloco, feitas: readonly number[]) => b.specs.every((s) => feitas.includes(s));

/** Blocks that the chosen ones need and that are neither chosen nor done. */
export const dependenciasFaltando = (blocos: readonly Bloco[], escolhidos: readonly number[], feitas: readonly number[]): number[] =>
  [...new Set(escolhidos.flatMap((id) => blocos[id - 1]?.depende ?? []))].filter((id) => !escolhidos.includes(id) && !blocoFeito(blocos[id - 1]!, feitas)).sort((a, b) => a - b);
