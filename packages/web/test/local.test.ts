import { describe, expect, it } from "vitest";
import { aplicarEventoLocal, chipLocal, emUsoAgora, podeUsarLocal, textoOrigem, textoStats, textoViabilidade, type LocalStatus } from "../src/logic/local.ts";

const base: LocalStatus = {
  enabled: true, model: "qwen3:4b",
  ollama: { estado: "ligado", startedByHub: true, modeloCarregado: "qwen3:4b" },
  viavel: { ok: true, memoriaLivreMB: 5120 }, emUso: null, ultimoUso: null,
  elegiveis: [{ agente: "tester", tarefa: "compact-test-log", descricao: "x" }], fora: [{ agente: "coder", motivo: "qualidade" }],
};

describe("local", () => {
  it("chip: hidden when disabled and idle, quiet when idle, loud text when in use", () => {
    expect(chipLocal(undefined).visivel).toBe(false);
    expect(chipLocal({ ...base, enabled: false }).visivel).toBe(false);
    expect(chipLocal(base)).toMatchObject({ visivel: true, texto: "local: ocioso", curto: "local: ocioso", emUso: false });
    const c = chipLocal({ ...base, emUso: { task: "compact-test-log", model: "qwen3:4b", agent: "tester", desde: 1 } });
    expect(c).toEqual({ visivel: true, texto: "Modelo local: em uso — compact-test-log (qwen3:4b)", curto: "local: em uso", emUso: true });
    expect(chipLocal({ ...base, enabled: false, emUso: base.emUso ?? { task: "t", model: "m", agent: "a", desde: 1 } }).visivel).toBe(true);
  });
  it("viability and origin texts", () => {
    expect(textoViabilidade(base)).toBe("memória livre ~5.120 MB — viável");
    expect(textoViabilidade({ ...base, viavel: { ok: false, motivo: "pouca RAM", memoriaLivreMB: 800 } })).toBe("memória livre ~800 MB — não viável: pouca RAM");
    expect(textoViabilidade({ ...base, viavel: { ok: false } })).toContain("não viável");
    expect(textoOrigem(base)).toMatch(/ligado pelo hub/);
    expect(textoOrigem({ ...base, ollama: { ...base.ollama, startedByHub: false } })).toMatch(/já estava ligado por você/);
    expect(textoOrigem({ ...base, ollama: { estado: "parado", startedByHub: false, modeloCarregado: null } })).toBeUndefined();
  });
  it("eligibility and in-use per agent", () => {
    expect(podeUsarLocal(base, "tester")).toBe(true);
    expect(podeUsarLocal(base, "coder")).toBe(false);
    expect(podeUsarLocal(undefined, "tester")).toBe(false);
    expect(emUsoAgora({ ...base, emUso: { task: "t", model: "m", agent: "tester", desde: 1 } }, "tester")).toBe(true);
    expect(emUsoAgora(base, "tester")).toBe(false);
  });
  it("stats label the token number as an estimate", () => {
    const t = textoStats({ calls: { local: 3, fallback: 1, passthrough: 2 }, fallbacks: 1, tokensSavedEstimate: 12000, estimate: true });
    expect(t.tokens).toMatch(/≈ 12\.000.*estimativa/);
    expect(t.semModelo).toMatch(/^2 /);
  });
  it("SSE: applies a full payload without the evento key; malformed asks for refetch and keeps state", () => {
    const r = aplicarEventoLocal(undefined, { evento: "em-uso", ...base, emUso: { task: "t", model: "m", agent: "tester", desde: 1 } });
    expect(r.recarregar).toBe(false);
    expect(r.status?.emUso?.agent).toBe("tester");
    expect(r.status).not.toHaveProperty("evento");
    expect(aplicarEventoLocal(base, { evento: "ligado" })).toEqual({ status: base, recarregar: true });
    expect(aplicarEventoLocal(base, null).status).toBe(base);
  });
});
