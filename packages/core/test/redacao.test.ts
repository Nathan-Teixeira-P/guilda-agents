import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Mission, newMission, transition } from "../src/mission.js";
import {
  ARTEFATOS, PedidoRedacao, avancar, caminhoDentro, estadoDoArtigo, podarVersoes, podeAvancar, slugDoTema, validarSugestoes,
} from "../src/redacao.js";

const now = () => new Date("2026-01-01T00:00:00.000Z");
const iso = "2026-11-21T10:00:00.000Z";

describe("PedidoRedacao", () => {
  it("aplica padrões", () => {
    const p = PedidoRedacao.parse({ modo: "sugerir" });
    expect(p.palavras).toBe(1200);
    expect(p.idioma).toBe("pt-BR");
    expect(p.referencias).toEqual([]);
  });
  it("definido sem tema é recusado, em português", () => {
    const r = PedidoRedacao.safeParse({ modo: "definido" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/tema/);
  });
  it("palavras fora de 200-5000 recusadas", () => {
    expect(PedidoRedacao.safeParse({ modo: "sugerir", palavras: 100 }).success).toBe(false);
    expect(PedidoRedacao.safeParse({ modo: "sugerir", palavras: 5001 }).success).toBe(false);
    expect(PedidoRedacao.safeParse({ modo: "definido", tema: "x", palavras: 300 }).success).toBe(true);
  });
});

describe("slugDoTema", () => {
  it("normaliza acentos e símbolos", () => expect(slugDoTema("Inteligência Artificial: o início!")).toBe("inteligencia-artificial-o-inicio"));
  it("sufixa na colisão", () => {
    expect(slugDoTema("Tema", ["tema"])).toBe("tema-2");
    expect(slugDoTema("Tema", ["tema", "tema-2"])).toBe("tema-3");
  });
  it("respeita o formato e 64 caracteres", () => expect(slugDoTema("a".repeat(100), [])).toMatch(/^[a-z0-9-]{1,64}$/));
  it("tema só com símbolos gera slug válido", () => expect(slugDoTema("???")).toMatch(/^[a-z0-9-]{1,64}$/));
});

describe("estados e gate", () => {
  it("mapeia estágios", () => {
    expect(estadoDoArtigo("planejando")).toBe("rascunho");
    expect(estadoDoArtigo("aguardando-aprovacao")).toBe("em-revisao");
    expect(estadoDoArtigo("executando")).toBe("edicao-final");
    expect(estadoDoArtigo("concluida")).toBe("aprovado");
    expect(estadoDoArtigo("parada")).toBe("cancelado");
    expect(estadoDoArtigo("planejando", true)).toBe("pausado");
  });
  it("aprovar só em revisão; pedir-ajustes exige comentário", () => {
    expect(podeAvancar("em-revisao", { tipo: "aprovar" })).toMatchObject({ ok: true, stage: "executando" });
    expect(podeAvancar("rascunho", { tipo: "aprovar" }).ok).toBe(false);
    expect(podeAvancar("em-revisao", { tipo: "pedir-ajustes", comentario: " " }).ok).toBe(false);
    expect(podeAvancar("em-revisao", { tipo: "pedir-ajustes", comentario: "x" })).toMatchObject({ ok: true, stage: "planejando" });
  });
  it("reabrir só de aprovado/cancelado e gera nova versão", () => {
    expect(podeAvancar("aprovado", { tipo: "reabrir" })).toMatchObject({ ok: true, novaVersao: true });
    expect(podeAvancar("cancelado", { tipo: "reabrir" }).ok).toBe(true);
    expect(podeAvancar("rascunho", { tipo: "reabrir" }).ok).toBe(false);
  });
  it("edição final sem aprovar lança erro", () => {
    const m = { ...newMission("a", "redacao", now), stage: "aguardando-aprovacao" as const };
    expect(() => transition(m, "executando", { now })).toThrow();
    expect(avancar(m, { tipo: "aprovar" }, now).stage).toBe("executando");
    expect(() => avancar({ ...m, stage: "planejando" }, { tipo: "aprovar" }, now)).toThrow();
    expect(avancar({ ...m, stage: "parada" }, { tipo: "reabrir" }, now).stage).toBe("planejando");
  });
  it("missão antiga sem kind segue válida; com kind redacao também", () => {
    const base = { id: "a", project: "p", stage: "intake", createdAt: "x", updatedAt: "x" };
    expect(Mission.safeParse(base).success).toBe(true);
    expect(Mission.safeParse({ ...base, kind: "redacao" }).success).toBe(true);
  });
});

describe("caminhoDentro", () => {
  const dir = mkdtempSync(join(tmpdir(), "red-"));
  const fora = mkdtempSync(join(tmpdir(), "fora-"));
  mkdirSync(join(dir, "sub"));
  symlinkSync(fora, join(dir, "link"));
  it("aceita relativo interno e artefatos", () => {
    expect(caminhoDentro(dir, ARTEFATOS.final)).toBe(join(dir, "final.md"));
    expect(caminhoDentro(dir, "sub/novo.md")).toBe(join(dir, "sub", "novo.md"));
  });
  it("recusa .., absoluto e symlink de saída", () => {
    expect(() => caminhoDentro(dir, "../x")).toThrow();
    expect(() => caminhoDentro(dir, "sub/../../x")).toThrow();
    expect(() => caminhoDentro(dir, "/etc/passwd")).toThrow();
    expect(() => caminhoDentro(dir, "link/x.md")).toThrow();
  });
});

describe("podarVersoes", () => {
  const v = (n: number, atual = false) => ({ versao: n, atual });
  it("mantém as 3 mais recentes", () => expect(podarVersoes([v(1), v(2), v(3), v(4, true), v(5)]).map((x) => x.versao)).toEqual([5, 4, 3]));
  it("nunca remove a atual", () => expect(podarVersoes([v(1, true), v(2), v(3), v(4), v(5)]).map((x) => x.versao)).toEqual([5, 4, 1]));
  it("lista curta intacta", () => expect(podarVersoes([v(1), v(2)])).toHaveLength(2));
});

describe("validarSugestoes", () => {
  const s = (rank: number, extra = {}) => ({ tema: `t${rank}`, motivo: "agora", rank, fontes: [{ url: "https://a.b", acessadoEm: iso }], ...extra });
  it("ordena por rank", () => expect(validarSugestoes([s(2), s(1)]).validas.map((x) => x.rank)).toEqual([1, 2]));
  it("aceita acessadoEm só com a data", () => expect(validarSugestoes([s(1, { fontes: [{ url: "https://a.b", acessadoEm: "2026-11-24" }] })]).validas).toHaveLength(1));
  it("recusa sem fonte", () => {
    const r = validarSugestoes([s(1, { fontes: [] })]);
    expect(r.validas).toEqual([]);
    expect(r.recusadas[0]?.erros[0]).toMatch(/fonte/);
  });
  it("recusa fonte sem data de acesso", () => {
    const r = validarSugestoes([s(1, { fontes: [{ url: "https://a.b" }] })]);
    expect(r.recusadas[0]?.erros.join()).toMatch(/acessadoEm/);
  });
  it("recusa sem motivo e entrada que não é lista", () => {
    expect(validarSugestoes([s(1, { motivo: "" })]).recusadas).toHaveLength(1);
    expect(validarSugestoes({}).recusadas).toHaveLength(1);
  });
});
