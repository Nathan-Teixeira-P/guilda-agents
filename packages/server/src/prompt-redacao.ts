/** Pure prompt builders for articles (spec 029). Only paths and the request go in: never file contents. */
import type { PedidoRedacao } from "@lab/core/src/redacao.ts";

export interface RedacaoInput {
  pedido: PedidoRedacao;
  hub?: string; // absolute hub folder: where scripts/render-cover.sh lives
  dir: string; // absolute article folder: the only place the agents may write
  leitura?: string[]; // user-given local references, read-only
  comentario?: string; // user feedback (adjustments) on the previous draft
}

const REGRA_FINAL = "Nunca publique, agende nem envie o artigo: apenas grave os arquivos na pasta do artigo.";

const pedidoLinhas = (i: RedacaoInput) => [
  `Tema: ${i.pedido.tema ?? "(a sugerir)"}`,
  `Idioma: ${i.pedido.idioma}. Palavras: cerca de ${i.pedido.palavras}.`,
  ...(i.pedido.publico ? [`Público: ${i.pedido.publico}`] : []),
  ...(i.pedido.tom ? [`Tom: ${i.pedido.tom}`] : []),
  ...(i.pedido.referencias.filter((r) => r.tipo !== "caminho").map((r) => `Referência (${r.tipo}): ${r.valor}`)),
  ...(i.leitura?.length ? ["Referências locais (SOMENTE LEITURA, não altere):", ...i.leitura.map((p) => `- ${p}`)] : []),
];

export function promptSugestoes(i: RedacaoInput): string {
  return [
    "Sugerir temas de artigo. Use só o researcher.",
    ...pedidoLinhas(i),
    "",
    `Grave ${i.dir}/sugestoes.json: lista ranqueada de objetos { tema, motivo (por que vale agora), fontes: [{ url, acessadoEm (data ISO, ex.: 2026-11-24) }], rank }.`,
    "Nunca invente fonte; sem fonte localizada, não sugira o tema.",
    REGRA_FINAL,
  ].join("\n");
}

export function promptPesquisa(i: RedacaoInput): string {
  return [
    `1. researcher: pesquise o tema e grave ${i.dir}/pesquisa.md (cada afirmação com link e data de acesso; seção do que não foi confirmado).`,
    `2. fact-checker: confira ${i.dir}/pesquisa.md e grave ${i.dir}/checagem.md. Se não houver fontes confiáveis, escreva na primeira linha "SEM FONTES CONFIÁVEIS" e PARE: não escreva o rascunho.`,
  ].join("\n");
}

export function promptFase1Redacao(i: RedacaoInput): string {
  return [
    `Fase 1 (rascunho) do artigo. Pasta do artigo: ${i.dir}. Escreva só dentro dela.`,
    ...pedidoLinhas(i),
    ...(i.comentario ? ["", "Ajustes pedidos pelo usuário sobre o rascunho anterior:", i.comentario, "Reescreva levando isso em conta."] : []),
    "",
    "Etapas, uma por vez, chamadas por você (subagente não cria subagente):",
    promptPesquisa(i),
    `3. writer: escreva ${i.dir}/rascunho.md a partir de pesquisa.md e checagem.md.`,
    "Passe caminhos aos agentes, nunca conteúdo. Depois do rascunho, pare: o usuário aprova antes da edição final.",
    REGRA_FINAL,
  ].join("\n");
}

export function promptFase2Redacao(i: RedacaoInput): string {
  return [
    `Rascunho aprovado. Fase 2 (edição final) do artigo. Pasta do artigo: ${i.dir}. Escreva só dentro dela.`,
    ...(i.comentario ? ["", "A execução foi pausada; o usuário retomou com este comentário:", i.comentario, ""] : []),
    `1. editor: edite ${i.dir}/rascunho.md e grave ${i.dir}/final.md.`,
    `2. illustrator: grave ${i.dir}/capa.svg (1200x627) e, como última etapa, rode exatamente \`${i.hub ?? "."}/scripts/render-cover.sh capa.svg capa.png\` (nenhum outro comando).`,
    "Passe caminhos aos agentes, nunca conteúdo.",
    REGRA_FINAL,
  ].join("\n");
}
