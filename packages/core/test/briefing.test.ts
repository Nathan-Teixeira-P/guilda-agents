import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classificarEntrada, parseBriefing } from "../src/briefing.ts";

describe("classificarEntrada", () => {
  it("clickup url vs text, never throws", () => {
    expect(classificarEntrada(" https://app.clickup.com/t/86abc ")).toBe("clickup-url");
    for (const t of ["http://app.clickup.com/t/1", "https://evil.com/app.clickup.com", "https://u:p@app.clickup.com/t/1", "https://app.clickup.com/t/1 e mais texto", "https://", "", "faça X"])
      expect(classificarEntrada(t)).toBe("texto");
  });
});

describe("parseBriefing", () => {
  it("parses the fixture", () => {
    const r = parseBriefing(readFileSync(new URL("../../../tests/fixtures/briefing-clickup.md", import.meta.url), "utf8"));
    expect(r.ok && r.briefing).toMatchObject({ origem: "link", clickupUrl: "https://app.clickup.com/t/86abc123", anexos: ["layout.png"], links: ["https://example.com/design"] });
    expect(r.ok && r.briefing.criteriosAceite).toHaveLength(2);
  });
  it("text origin without url; placeholders dropped", () => {
    const r = parseBriefing("# Briefing\norigem: texto\n## Objetivo\nFazer X\n## Critérios de aceite\n- (não informado)\n## Anexos\n## Links\n");
    expect(r).toMatchObject({ ok: true, briefing: { origem: "texto", criteriosAceite: [] } });
  });
  it("rejects malformed without throwing", () => {
    expect(parseBriefing("lixo").ok).toBe(false);
    expect(parseBriefing("origem: outra\n## Objetivo\nx").ok).toBe(false);
  });
});
