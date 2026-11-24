import { describe, expect, it } from "vitest";
import { linhasDoc } from "../src/logic/doc.ts";
import { agruparPacote } from "../src/logic/pacote.ts";
import { pavio } from "../src/logic/fuse.ts";
import { linhasAgente, linhasModelo, tokensDe } from "../src/logic/arsenal.ts";
import { erroDeAcao } from "../src/logic/erros.ts";
import { atalho } from "../src/logic/atalhos.ts";
import { aguardamSelo, contagemPorEstagio, type M } from "../src/logic/stages.ts";
import { contarTrocas, membrosDe, tokensVivos, type Ev } from "../src/logic/events.ts";
import { membro, ROSTER } from "../src/roster.ts";

const m = (id: string, stage: M["stage"], extra: Partial<M> = {}): M => ({ id, project: "p", stage, costUsd: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...extra });

describe("roster", () => {
  it("has the 22 agents of agents/ plus the Porteiro, unique names", () => {
    expect(ROSTER).toHaveLength(23);
    expect(new Set(ROSTER.map((r) => r.codinome)).size).toBe(23);
  });
  it("maps main to the Regente and unknown to Recruta", () => {
    expect(membro("main").codinome).toBe("Regente");
    expect(membro("coder").codinome).toBe("Ferreiro");
    expect(membro("ae5eca652855e8963").codinome).toBe("Recruta");
    expect(membro(undefined).codinome).toBe("Recruta");
  });
});

describe("linhasDoc", () => {
  it("marks headings, list items and blank lines by hand, text stays text", () => {
    expect(linhasDoc("# Plano\n\n- um\n  * dois\n## Sub\nTexto <b>x</b>")).toEqual([
      { tipo: "h1", texto: "Plano" },
      { tipo: "vazia", texto: "" },
      { tipo: "li", texto: "um" },
      { tipo: "li", texto: "dois" },
      { tipo: "h2", texto: "Sub" },
      { tipo: "p", texto: "Texto <b>x</b>" },
    ]);
  });
  it("does not treat lines inside code fences as headings or lists", () => {
    expect(linhasDoc("```\n# nope\n- nope\n```\n# sim").map((l) => l.tipo)).toEqual(["codigo", "codigo", "codigo", "codigo", "h1"]);
  });
  it("deep headings cap at h3 and a # without space is plain text", () => {
    expect(linhasDoc("###### x")[0]?.tipo).toBe("h3");
    expect(linhasDoc("#tag")[0]?.tipo).toBe("p");
  });
});

describe("agruparPacote", () => {
  it("groups plan, PRD, specs, design, others, in that order; empty groups vanish", () => {
    const f = (path: string) => ({ path, content: "" });
    const g = agruparPacote([f("specs/002-b.spec.md"), f("handoff/map.md"), f("prd/a.prd.md"), f("specs/001-a.spec.md"), f("handoff/plan.md"), f("specs/INDEX.md")]);
    expect(g.map((x) => x.grupo)).toEqual(["plano", "prd", "specs", "outros"]);
    expect(g[2]?.arquivos.map((a) => a.path)).toEqual(["specs/001-a.spec.md", "specs/002-b.spec.md", "specs/INDEX.md"]);
    expect(g[3]?.arquivos[0]?.path).toBe("handoff/map.md");
  });
  it("nothing in, nothing out", () => expect(agruparPacote([])).toEqual([]));
});

describe("pavio", () => {
  it("ok, attention on the penultimate notch, blown past the limit", () => {
    expect(pavio(3, 8)).toMatchObject({ estado: "ok", texto: "3 de 8" });
    expect(pavio(7, 8).estado).toBe("atencao");
    expect(pavio(8, 8).estado).toBe("atencao");
    expect(pavio(9, 8)).toMatchObject({ estado: "estourou", texto: "9 de 8" });
  });
  it("bar fill is clamped to the limit", () => expect(pavio(12, 8).cheios).toBe(8));
});

describe("arsenal", () => {
  const ms = [
    m("a", "concluida", { tokensByAgent: { main: 100, coder: 300 }, costByModel: { sonnet: 1, haiku: 0.5 } }),
    m("b", "concluida", { tokensByAgent: { coder: 100 }, costByModel: { sonnet: 1 } }),
    m("c", "concluida"),
  ];
  it("sums per agent with share, descending, ignoring missions without data", () => {
    expect(linhasAgente(ms)).toEqual([{ agente: "coder", tokens: 400, pct: 80 }, { agente: "main", tokens: 100, pct: 20 }]);
    expect(linhasAgente([])).toEqual([]);
  });
  it("sums per model, descending", () => expect(linhasModelo(ms)).toEqual([{ modelo: "sonnet", usd: 2 }, { modelo: "haiku", usd: 0.5 }]));
  it("tokens of one mission", () => {
    expect(tokensDe(ms[0]!)).toBe(400);
    expect(tokensDe(ms[2]!)).toBe(0);
  });
});

describe("erroDeAcao", () => {
  it("never leaks raw errors for the known cases", () => {
    expect(erroDeAcao({ error: "servidor fora do ar", status: 0 })).toMatch(/servidor/);
    expect(erroDeAcao({ error: "cannot approve in stage executando", status: 409 })).toMatch(/mudou de estágio/);
    expect(erroDeAcao({ error: "approval gate not open: cannot resume execution", status: 409 })).toMatch(/selo não foi reconhecido/);
    expect(erroDeAcao({ error: "mission not found", status: 404 })).toMatch(/não encontrada/);
    expect(erroDeAcao({ error: "invalid input: comment", status: 400 })).toContain("invalid input: comment");
    expect(erroDeAcao({ error: "boom", status: 500 })).toContain("boom");
  });
});

describe("atalho", () => {
  const k = (key: string, o: object = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...o });
  it("maps single keys", () => {
    expect(atalho(k("n"), false, false)).toBe("nova");
    expect(atalho(k("N"), false, false)).toBe("nova");
    expect(atalho(k("?"), false, false)).toBe("ajuda");
    expect(atalho(k("1"), false, false)).toBe("salao");
    expect(atalho(k("a"), false, false)).toBe("selar");
    expect(atalho(k("j"), false, false)).toBe("ajustes");
  });
  it("is silent while typing, with a dialog open or with modifiers", () => {
    expect(atalho(k("n"), true, false)).toBeUndefined();
    expect(atalho(k("n"), false, true)).toBeUndefined();
    expect(atalho(k("n", { ctrlKey: true }), false, false)).toBeUndefined();
    expect(atalho(k("x"), false, false)).toBeUndefined();
  });
});

describe("stages helpers", () => {
  const all = [m("a", "aguardando-aprovacao", { updatedAt: "2026-01-02T00:00:00Z" }), m("b", "aguardando-aprovacao", { updatedAt: "2026-01-01T00:00:00Z", project: "q" }), m("c", "executando")];
  it("oldest waiting seal first", () => expect(aguardamSelo(all).map((x) => x.id)).toEqual(["b", "a"]));
  it("counts per stage for one project", () => {
    const c = contagemPorEstagio(all, "p");
    expect(c["aguardando-aprovacao"]).toBe(1);
    expect(c.executando).toBe(1);
    expect(c.concluida).toBe(0);
  });
});

describe("live events", () => {
  const ev: Ev[] = [
    { kind: "subagent-started", agentId: "t1", subagentType: "coder" },
    { kind: "usage", messageId: "m1", agent: "main", tokens: { input: 10, output: 5, cacheRead: 100, cacheCreation: 0 } },
    { kind: "usage", messageId: "m1", agent: "main", tokens: { input: 10, output: 20, cacheRead: 100, cacheCreation: 0 } }, // same message again: last wins
    { kind: "usage", messageId: "m2", agent: "t1", tokens: { input: 0, output: 10, cacheRead: 0, cacheCreation: 50 } },
    { kind: "subagent-started", agentId: "t2", subagentType: "tester" },
  ];
  it("counts handoffs", () => expect(contarTrocas(ev)).toBe(2));
  it("dedupes tokens by message id and reports cache share", () => {
    const t = tokensVivos(ev);
    expect(t.total).toBe(10 + 20 + 100 + 10 + 50);
    expect(t.porAgente).toEqual({ main: 130, t1: 60 });
    expect(t.cachePct).toBe(Math.round((100 / (10 + 100 + 50)) * 100));
  });
  it("no usage, no cache share", () => expect(tokensVivos([])).toMatchObject({ total: 0, cachePct: 0 }));
});

describe("membrosDe", () => {
  it("lists convened agents with state and last tool; unknown ids never appear", () => {
    const ms = membrosDe([
      { kind: "subagent-started", agentId: "t1", subagentType: "coder" },
      { kind: "tool", agent: "t1", name: "Read" },
      { kind: "tool", agent: "t1", name: "Edit" },
      { kind: "tool", agent: "zz", name: "Bash" },
      { kind: "subagent-started", agentId: "t2", subagentType: "tester" },
      { kind: "subagent-finished", agentId: "t2", status: "failed" },
      { kind: "subagent-started", agentId: "t3" },
      { kind: "subagent-finished", agentId: "t3", status: "completed" },
    ]);
    expect(ms).toEqual([
      { id: "t1", tipo: "coder", estado: "ativo", ferramenta: "Edit" },
      { id: "t2", tipo: "tester", estado: "falhou" },
      { id: "t3", tipo: "", estado: "concluido" },
    ]);
  });
});
