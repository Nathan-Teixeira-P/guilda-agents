import { describe, expect, it } from "vitest";
import { alarmesDe } from "../src/logic/alarmes.ts";
import { aplicarNotificacao, contarBadge, filtrar, lerConfig, lerLocais, lidaDe, linkSeguro, mostrarNoNavegador, mostrarToast, novasDe, pendenciasDe, unirLocais, type Notificacao } from "../src/logic/notificacoes.ts";
import type { M } from "../src/logic/stages.ts";

const n = (id: string, o: Partial<Notificacao> = {}): Notificacao => ({ id, ts: `2026-01-01T00:00:0${id}Z`, categoria: "missao", nivel: "info", titulo: "t", texto: "x", origem: "missao:m1", lida: false, ...o });
const m = (id: string, stage: M["stage"], extra: Partial<M> = {}): M => ({ id, project: "p", stage, costUsd: 0, createdAt: "x", updatedAt: "x", ...extra });

describe("lista", () => {
  it("newest first, no duplicate ids, drops the transient quiet flag, caps", () => {
    let l: Notificacao[] = [];
    l = aplicarNotificacao(l, n("1")); l = aplicarNotificacao(l, n("2", { silencio: true })); l = aplicarNotificacao(l, n("1"));
    expect(l.map((x) => x.id)).toEqual(["2", "1"]);
    expect("silencio" in l[0]!).toBe(false);
    for (let i = 0; i < 400; i++) l = aplicarNotificacao(l, { ...n("9"), id: `x${i}`, ts: `2027-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z` });
    expect(l).toHaveLength(300);
  });
  it("filters by category", () => {
    const l = [n("1"), n("2", { categoria: "uso" })];
    expect(filtrar(l, "uso").map((x) => x.id)).toEqual(["2"]);
    expect(filtrar(l, "todas")).toHaveLength(2);
  });
  it("novasDe: baseline on first call, then only unseen ones, oldest first", () => {
    const l = [n("2"), n("1")];
    const a = novasDe(undefined, l);
    expect(a.novas).toEqual([]);
    const b = novasDe(a.ids, [n("4"), n("3"), ...l]);
    expect(b.novas.map((x) => x.id)).toEqual(["3", "4"]);
  });
});

describe("regras de aviso", () => {
  it("toast: never info, never in quiet hours; browser: only with the tab hidden", () => {
    expect(mostrarToast(n("1", { nivel: "info" }))).toBe(false);
    expect(mostrarToast(n("1", { nivel: "erro" }))).toBe(true);
    expect(mostrarToast(n("1", { nivel: "aviso", silencio: true }))).toBe(false);
    expect(mostrarNoNavegador(n("1", { nivel: "sucesso" }), false)).toBe(false);
    expect(mostrarNoNavegador(n("1", { nivel: "sucesso" }), true)).toBe(true);
  });
  it("link: only app hash routes", () => {
    expect(linkSeguro("#/missao/m-1")).toBe("#/missao/m-1");
    expect(linkSeguro("javascript:alert(1)")).toBeUndefined();
    expect(linkSeguro("https://x.com")).toBeUndefined();
    expect(linkSeguro("#/a b")).toBeUndefined();
  });
});

describe("alarmes antigos entram no centro", () => {
  const ms = [m("a", "pausada", { pauseReason: "disjuntor: 3 loops" }), m("b", "pausada", { pauseReason: "teto de 5%" }), m("c", "executando")];
  const alarmes = alarmesDe(ms, { c: [{ kind: "subagent-started", agentId: "t1", subagentType: "coder" }, { kind: "subagent-finished", agentId: "t1", status: "failed" }] });
  it("maps disjuntor/teto/falha to pendências with level and link", () => {
    const p = pendenciasDe(alarmes);
    expect(p.map((x) => [x.titulo, x.nivel, x.categoria])).toEqual([["Disjuntor acionado", "erro", "missao"], ["Teto atingido", "aviso", "missao"], ["Agente falhou", "erro", "agente"]]);
    expect(p[0]!.link).toBe("#/missao/a");
  });
  it("badge counts pendências + unread, without double counting the same mission story", () => {
    const p = pendenciasDe(alarmes);
    const l = [n("1", { origem: "missao:a", nivel: "erro" }), n("2", { origem: "missao:zzz" }), n("3", { lida: true })];
    expect(contarBadge(l, p, new Set())).toEqual({ total: 4, critico: true }); // 3 pendências + unread "2"
    expect(contarBadge(l, [], new Set(["1", "2"]))).toEqual({ total: 0, critico: false });
    expect(contarBadge([n("5", { nivel: "aviso" })], [], new Set())).toEqual({ total: 1, critico: false });
  });
});

describe("estado local e config", () => {
  it("local read fallback tolerates garbage", () => {
    expect(lerLocais("lixo").size).toBe(0);
    expect(lerLocais('["a",1,"b"]')).toEqual(new Set(["a", "b"]));
    expect(lerLocais(null).size).toBe(0);
    expect(lidaDe({ id: "a", lida: false }, new Set(["a"]))).toBe(true);
    expect(unirLocais(new Set(["a"]), ["a", "b"])).toEqual(["a", "b"]);
  });
  it("lerConfig falls back to defaults on odd input", () => {
    expect(lerConfig(undefined).desktop.categorias.agente).toBe(false);
    const c = lerConfig({ categorias: { uso: false, x: 1 }, desktop: { ligado: false }, silencio: { ativo: true, inicio: "99:00", fim: "06:30" } });
    expect(c.categorias.uso).toBe(false);
    expect(c.categorias.missao).toBe(true);
    expect(c.desktop.ligado).toBe(false);
    expect(c.silencio).toEqual({ ativo: true, inicio: "22:00", fim: "06:30" });
  });
});
