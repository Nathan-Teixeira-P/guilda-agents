import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { transition, type Mission, type Stage } from "./mission.ts";

export const PedidoRedacao = z
  .looseObject({
    modo: z.enum(["sugerir", "definido"], { error: "modo: use 'sugerir' ou 'definido'" }),
    tema: z.string().trim().min(1, "tema: não pode ser vazio").optional(),
    publico: z.string().optional(),
    tom: z.string().optional(),
    palavras: z
      .number({ error: "palavras: deve ser um número" })
      .int("palavras: deve ser inteiro")
      .min(200, "palavras: mínimo 200")
      .max(5000, "palavras: máximo 5000")
      .default(1200),
    referencias: z
      .array(
        z.object({
          tipo: z.enum(["caminho", "texto", "url"], { error: "referencias.tipo: use caminho, texto ou url" }),
          valor: z.string().min(1, "referencias.valor: não pode ser vazio"),
        }),
      )
      .default([]),
    idioma: z.string().min(2, "idioma: inválido").default("pt-BR"),
  })
  .refine((p) => p.modo !== "definido" || p.tema !== undefined, {
    path: ["tema"],
    message: "tema: obrigatório no modo 'definido'",
  });
export type PedidoRedacao = z.infer<typeof PedidoRedacao>;

/** Lowercase, no accents, `[a-z0-9-]{1,64}`; appends -2, -3... on collision. */
export function slugDoTema(tema: string, existentes: readonly string[] = []): string {
  const base =
    tema
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "artigo";
  if (!existentes.includes(base)) return base;
  for (let n = 2; ; n++) {
    const s = `${base}-${n}`;
    if (!existentes.includes(s)) return s;
  }
}

export type EstadoArtigo = "pesquisando" | "rascunho" | "em-revisao" | "edicao-final" | "aprovado" | "cancelado" | "pausado";

export function estadoDoArtigo(stage: Stage, pausada?: boolean): EstadoArtigo {
  if (pausada || stage === "pausada") return "pausado";
  const map: Record<Exclude<Stage, "pausada">, EstadoArtigo> = {
    intake: "pesquisando",
    planejando: "rascunho",
    "aguardando-aprovacao": "em-revisao",
    executando: "edicao-final",
    concluida: "aprovado",
    parada: "cancelado",
  };
  return map[stage];
}

export type Acao =
  | { tipo: "aprovar" }
  | { tipo: "pedir-ajustes"; comentario: string }
  | { tipo: "cancelar" }
  | { tipo: "reabrir" };

export type Avanco = { ok: true; stage: Stage; novaVersao: boolean } | { ok: false; erro: string };

export function podeAvancar(estado: EstadoArtigo, acao: Acao): Avanco {
  const no = (erro: string): Avanco => ({ ok: false, erro });
  switch (acao.tipo) {
    case "aprovar":
      return estado === "em-revisao" ? { ok: true, stage: "executando", novaVersao: false } : no("aprovar: só é possível em revisão");
    case "pedir-ajustes":
      if (estado !== "em-revisao") return no("pedir-ajustes: só é possível em revisão");
      return acao.comentario?.trim() ? { ok: true, stage: "planejando", novaVersao: true } : no("comentario: obrigatório para pedir ajustes");
    case "cancelar":
      return estado === "aprovado" || estado === "cancelado" ? no("cancelar: artigo já encerrado") : { ok: true, stage: "parada", novaVersao: false };
    case "reabrir":
      return estado === "aprovado" || estado === "cancelado"
        ? { ok: true, stage: "planejando", novaVersao: true }
        : no("reabrir: só é possível de artigo aprovado ou cancelado");
  }
}

/** Applies an action to a mission. Final edit opens only through explicit `aprovar` (gate in `transition`). */
export function avancar(m: Mission, acao: Acao, now: () => Date): Mission {
  const r = podeAvancar(estadoDoArtigo(m.stage), acao);
  if (!r.ok) throw new Error(r.erro);
  if (acao.tipo === "reabrir") return { ...m, stage: r.stage, updatedAt: now().toISOString() }; // terminal stages have no NEXT edge
  return transition(m, r.stage, { now, approved: acao.tipo === "aprovar" });
}

export const ARTEFATOS = {
  pesquisa: "pesquisa.md",
  checagem: "checagem.md",
  rascunho: "rascunho.md",
  final: "final.md",
  capaSvg: "capa.svg",
  capaPng: "capa.png",
  artigo: "artigo.json",
} as const;

/** Resolves `rel` inside `dirArtigo`; throws on `..`, absolute paths or symlink escape. */
export function caminhoDentro(dirArtigo: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error("caminho: absoluto não é permitido");
  const raiz = resolve(dirArtigo);
  const alvo = resolve(raiz, rel);
  const r = relative(raiz, alvo);
  if (r === ".." || r.startsWith("..") || isAbsolute(r)) throw new Error("caminho: sai da pasta do artigo");
  // symlinks: real path of the deepest existing ancestor must stay inside the real root
  let existente = alvo;
  for (;;) {
    try {
      const real = relative(realpathSync(raiz), realpathSync(existente));
      if (real === ".." || real.startsWith("../") || isAbsolute(real)) throw new Error("caminho: link simbólico sai da pasta do artigo");
      return alvo;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      existente = dirname(existente);
    }
  }
}

/** Keeps the `max` most recent versions (highest `versao`); the current one is never dropped. */
export function podarVersoes<T extends { versao: number; atual?: boolean }>(lista: readonly T[], max = 3): T[] {
  const porRecencia = [...lista].sort((a, b) => b.versao - a.versao);
  const atual = porRecencia.find((v) => v.atual);
  const outras = porRecencia.filter((v) => v !== atual).slice(0, Math.max(0, max - (atual ? 1 : 0)));
  return [...(atual ? [atual] : []), ...outras].sort((a, b) => b.versao - a.versao);
}

const Sugestao = z.object({
  tema: z.string().min(1, "tema: obrigatório"),
  motivo: z.string().min(1, "motivo: obrigatório (por que vale agora)"),
  fontes: z
    .array(
      z.object({
        url: z.string().min(1, "fontes.url: obrigatório"),
        acessadoEm: z.iso.datetime({ error: "fontes.acessadoEm: data ISO obrigatória" }),
      }),
      { error: "fontes: obrigatório" },
    )
    .min(1, "fontes: ao menos uma fonte é obrigatória"),
  rank: z.number({ error: "rank: obrigatório" }),
});
export type Sugestao = z.infer<typeof Sugestao>;

/** Never throws. Valid items sorted by `rank` ascending; refused items carry per-field messages. */
export function validarSugestoes(json: unknown): { validas: Sugestao[]; recusadas: { indice: number; erros: string[] }[] } {
  if (!Array.isArray(json)) return { validas: [], recusadas: [{ indice: -1, erros: ["sugestões: esperado uma lista"] }] };
  const validas: Sugestao[] = [];
  const recusadas: { indice: number; erros: string[] }[] = [];
  json.forEach((item, indice) => {
    const r = Sugestao.safeParse(item);
    if (r.success) validas.push(r.data);
    else recusadas.push({ indice, erros: r.error.issues.map((i) => i.message) });
  });
  return { validas: validas.sort((a, b) => a.rank - b.rank), recusadas };
}
