import { describe, expect, it } from "vitest";
import { resumoVazio } from "../src/logic/resumo.ts";

describe("resumoVazio", () => {
  it("is true when everything is empty", () => {
    expect(resumoVazio({ feito: [], pendente: [], acaoUsuario: [] })).toBe(true);
  });
  it("is false with only feito", () => {
    expect(resumoVazio({ feito: ["a"], pendente: [], acaoUsuario: [] })).toBe(false);
  });
  it("is false with only pendente", () => {
    expect(resumoVazio({ feito: [], pendente: ["a"], acaoUsuario: [] })).toBe(false);
  });
  it("is false with only acaoUsuario", () => {
    expect(resumoVazio({ feito: [], pendente: [], acaoUsuario: ["a"] })).toBe(false);
  });
});
