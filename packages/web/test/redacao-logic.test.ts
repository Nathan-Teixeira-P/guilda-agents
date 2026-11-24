import { describe, expect, it } from "vitest";
import { aplicarEventoArtigo, contarPorEstado, estadoDoArtigo, filtrarPorEstado, rotuloEstado, slugDaRota, textoParaCopiar, type Artigo } from "../src/logic/redacao.ts";
import { parseHash } from "../src/router.ts";

const a = (id: string, stage: Artigo["stage"], extra: Partial<Artigo> = {}): Artigo => ({ id, stage, tema: id, versao: 1, costUsd: 0, createdAt: "", updatedAt: "", ...extra });
const L = [a("a", "planejando"), a("b", "aguardando-aprovacao"), a("c", "concluida"), a("d", "pausada")];

describe("redacao logic", () => {
  it("maps stage to estado", () => {
    expect(L.map(estadoDoArtigo)).toEqual(["rascunho", "em-revisao", "aprovado", "pausado"]);
  });
  it("filters and counts by estado", () => {
    expect(filtrarPorEstado(L, "em-revisao").map((x) => x.id)).toEqual(["b"]);
    expect(filtrarPorEstado(L)).toHaveLength(4);
    expect(contarPorEstado(L)).toMatchObject({ rascunho: 1, "em-revisao": 1, aprovado: 1, pausado: 1, cancelado: 0, pesquisando: 0 });
  });
  it("labels every estado", () => {
    expect(rotuloEstado("em-revisao")).toBe("Em revisão do usuário");
    expect(rotuloEstado("pesquisando")).toBe("Pesquisando");
    expect(rotuloEstado("cancelado")).toBe("Cancelado");
  });
  it("applies SSE events", () => {
    const upd = aplicarEventoArtigo(L, { slug: "a", estado: "em-revisao" });
    expect(estadoDoArtigo(upd.lista[0]!)).toBe("em-revisao");
    expect(upd.recarregar).toBe(true);
    expect(aplicarEventoArtigo(L, { slug: "a", estado: "rascunho" }).recarregar).toBe(false);
    expect(aplicarEventoArtigo(L, { slug: "b", estado: "excluido" }).lista.map((x) => x.id)).toEqual(["a", "c", "d"]);
    expect(aplicarEventoArtigo(L, { slug: "novo", estado: "pesquisando" })).toEqual({ lista: L, recarregar: true });
    expect(L[0]!.estado).toBeUndefined(); // input not mutated
  });
  it("copy text prefers final over draft", () => {
    expect(textoParaCopiar({ final: "F", rascunho: "R" })).toBe("F");
    expect(textoParaCopiar({ final: " ", rascunho: "R" })).toBe("R");
    expect(textoParaCopiar({})).toBe("");
  });
  it("parses redacao routes", () => {
    expect(parseHash("#/redacao").path).toBe("/redacao");
    expect(slugDaRota(parseHash("#/redacao/meu-tema").path)).toBe("meu-tema");
    expect(slugDaRota("/redacao")).toBeUndefined();
  });
});
