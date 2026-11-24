import { describe, expect, it } from "vitest";
import { capaUrl } from "../src/api.ts";
import { linkSeguro, trechos } from "../src/logic/doc.ts";
import { FORM_VAZIO, abaInicial, acoesDe, aplicarEventoArtigo, comCapa, contarPorEstado, copiarTexto, equipeDe, estadoDoArtigo, filtrarPorEstado, formDaSugestao, montarPedido, motivoDoArtigo, motivoPt, rotuloArtigo, semFontesConfiaveis, type Artigo, type EstadoArtigo } from "../src/logic/redacao.ts";

const a = (id: string, stage: Artigo["stage"], extra: Partial<Artigo> = {}): Artigo => ({ id, stage, tema: id, versao: 1, costUsd: 0, createdAt: "", updatedAt: "", ...extra });
const ESTADOS: EstadoArtigo[] = ["pesquisando", "rascunho", "em-revisao", "edicao-final", "aprovado", "cancelado", "pausado"];

describe("lista e SSE", () => {
  const L = [a("a", "planejando"), a("b", "aguardando-aprovacao"), a("c", "concluida"), a("s", "concluida", { pedido: { modo: "sugerir" } })];
  it("filtra por estado e rotula sugestões prontas em vez de aprovado", () => {
    expect(filtrarPorEstado(L, "aprovado").map((x) => x.id)).toEqual(["c", "s"]);
    expect(contarPorEstado(L).aprovado).toBe(2);
    expect(rotuloArtigo(L[3]!)).toBe("Sugestões prontas");
    expect(rotuloArtigo(L[2]!)).toBe("Aprovado");
  });
  it("evento SSE muda o estado na lista sem mutar a entrada", () => {
    const r = aplicarEventoArtigo(L, { slug: "a", estado: "em-revisao" });
    expect(estadoDoArtigo(r.lista[0]!)).toBe("em-revisao");
    expect(L[0]!.estado).toBeUndefined();
  });
});

describe("ações", () => {
  it("aprovar só em revisão do usuário", () => {
    expect(ESTADOS.filter((e) => acoesDe(e).aprovar)).toEqual(["em-revisao"]);
    expect(ESTADOS.filter((e) => acoesDe(e).ajustes)).toEqual(["em-revisao"]);
  });
  it("cancelar, reabrir e retomar seguem o núcleo", () => {
    expect(ESTADOS.filter((e) => acoesDe(e).cancelar)).toEqual(["pesquisando", "rascunho", "em-revisao", "edicao-final", "pausado"]);
    expect(ESTADOS.filter((e) => acoesDe(e).reabrir)).toEqual(["aprovado", "cancelado"]);
    expect(ESTADOS.filter((e) => acoesDe(e).retomar)).toEqual(["pausado"]);
  });
  it("sugestões não oferecem aprovar nem reabrir", () => {
    expect(acoesDe("aprovado", true)).toMatchObject({ aprovar: false, reabrir: false });
  });
});

describe("copiar texto (clipboard simulado)", () => {
  it("usa a clipboard API", async () => {
    let got = "";
    expect(await copiarTexto("oi", { clipboard: { writeText: async (t) => { got = t; } } })).toBe(true);
    expect(got).toBe("oi");
  });
  it("cai no caminho legado quando a clipboard recusa", async () => {
    let got = "";
    const r = await copiarTexto("x", { clipboard: { writeText: async () => { throw new Error("negado"); } }, copiarLegado: (t) => { got = t; return true; } });
    expect([r, got]).toEqual([true, "x"]);
  });
  it("devolve false sem lançar quando nada funciona", async () => {
    expect(await copiarTexto("x", {})).toBe(false);
    expect(await copiarTexto("x", { copiarLegado: () => { throw new Error("x"); } })).toBe(false);
  });
});

describe("capas", () => {
  it("galeria: só aprovados que não são sugestão; URL do PNG", () => {
    const L = [a("ok", "concluida"), a("sug", "concluida", { pedido: { modo: "sugerir" } }), a("rev", "aguardando-aprovacao")];
    expect(comCapa(L).map((x) => x.id)).toEqual(["ok"]);
    expect(capaUrl("meu-tema")).toBe("/redacao/meu-tema/capa.png");
  });
});

describe("pedido", () => {
  it("modo definido exige tema; sugerir não", () => {
    expect(montarPedido({ ...FORM_VAZIO, modo: "definido" })).toMatchObject({ ok: false, erros: { tema: expect.any(String) } });
    expect(montarPedido(FORM_VAZIO)).toEqual({ ok: true, pedido: { modo: "sugerir", palavras: 1200, idioma: "pt-BR" } });
  });
  it("valida palavras 200..5000 e idioma", () => {
    for (const p of ["199", "5001", "12.5", ""]) expect(montarPedido({ ...FORM_VAZIO, palavras: p })).toMatchObject({ ok: false, erros: { palavras: expect.any(String) } });
    expect(montarPedido({ ...FORM_VAZIO, idioma: "p" })).toMatchObject({ ok: false });
  });
  it("monta referências, descarta vazias e recusa link/caminho inválidos", () => {
    const r = montarPedido({ ...FORM_VAZIO, modo: "definido", tema: " Cache ", publico: "devs", referencias: [{ tipo: "url", valor: "https://a.dev/x" }, { tipo: "texto", valor: " " }, { tipo: "caminho", valor: "/tmp/a.md" }] });
    expect(r).toEqual({ ok: true, pedido: { modo: "definido", tema: "Cache", publico: "devs", palavras: 1200, idioma: "pt-BR", referencias: [{ tipo: "url", valor: "https://a.dev/x" }, { tipo: "caminho", valor: "/tmp/a.md" }] } });
    expect(montarPedido({ ...FORM_VAZIO, referencias: [{ tipo: "url", valor: "javascript:alert(1)" }] })).toMatchObject({ ok: false, erros: { referencias: expect.any(String) } });
    expect(montarPedido({ ...FORM_VAZIO, referencias: [{ tipo: "caminho", valor: "rel/a.md" }] })).toMatchObject({ ok: false });
  });
  it("Escolher leva tema e fontes para o pedido definido", () => {
    const f = formDaSugestao({ tema: "T", motivo: "m", rank: 1, fontes: [{ url: "https://x.org", acessadoEm: "2026-01-01T00:00:00Z" }] });
    expect(f).toMatchObject({ modo: "definido", tema: "T", referencias: [{ tipo: "url", valor: "https://x.org" }] });
  });
});

describe("avisos em português", () => {
  it("traduz motivos do servidor e mantém o resto", () => {
    expect(motivoPt("stopped by user")).toBe("Cancelado por você.");
    expect(motivoPt("runner error: boom")).toBe("Erro ao executar o agente: boom");
    expect(motivoPt("pedido inválido")).toBe("pedido inválido");
    expect(motivoDoArtigo({ pauseReason: "teto de uso: 12 pp" })).toEqual({ titulo: "Pausado", texto: "Teto de uso: 12 pp" });
    expect(motivoDoArtigo({ stopReason: "stopped" })?.titulo).toBe("Parado");
    expect(motivoDoArtigo({})).toBeUndefined();
  });
  it("sem fontes confiáveis: sem links ou dito pelo agente", () => {
    expect(semFontesConfiaveis(undefined)).toBe(false);
    expect(semFontesConfiaveis("# Pesquisa\nsó opinião")).toBe(true);
    expect(semFontesConfiaveis("Fonte: https://a.dev (acessado 2026-01-01)")).toBe(false);
    expect(semFontesConfiaveis("Sem fontes confiáveis. https://a.dev")).toBe(true);
  });
  it("aba inicial e equipe por fase", () => {
    expect(abaInicial(["pesquisa.md", "rascunho.md"])).toBe("rascunho");
    expect(abaInicial([])).toBe("pesquisa");
    expect(equipeDe("rascunho").filter((p) => p.estado === "ativo").map((p) => p.agente)).toEqual(["researcher", "fact-checker", "writer"]);
    expect(equipeDe("edicao-final").filter((p) => p.estado === "ativo").map((p) => p.agente)).toEqual(["editor", "illustrator"]);
    expect(equipeDe("aprovado").every((p) => p.estado === "concluido")).toBe(true);
    expect(equipeDe("aprovado", true)).toHaveLength(1);
  });
});

describe("links do markdown", () => {
  it("só http(s) vira âncora", () => {
    expect(linkSeguro("https://a.dev/x?y=1")).toBe("https://a.dev/x?y=1");
    for (const u of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "/rel", "ftp://a"]) expect(linkSeguro(u)).toBeUndefined();
  });
  it("separa texto, [rótulo](url) e URL solta sem a pontuação final", () => {
    expect(trechos("veja [doc](https://a.dev) e https://b.dev/x.")).toEqual([
      { texto: "veja " }, { texto: "doc", href: "https://a.dev/" }, { texto: " e " }, { texto: "https://b.dev/x", href: "https://b.dev/x" }, { texto: "." },
    ]);
    expect(trechos("[x](javascript:alert(1))").some((t) => t.href)).toBe(false);
    expect(trechos("<b>x</b>")).toEqual([{ texto: "<b>x</b>" }]);
  });
});
