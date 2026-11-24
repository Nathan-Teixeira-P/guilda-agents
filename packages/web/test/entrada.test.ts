import { expect, it } from "vitest";
import { classificarEntrada, dicaEntrada } from "../src/logic/entrada.ts";

it("classifies link vs text and hints in pt-BR", () => {
  expect(classificarEntrada("https://app.clickup.com/t/1")).toBe("clickup-url");
  expect(classificarEntrada("https://x.com/t/1")).toBe("texto");
  expect(dicaEntrada("")).toMatch(/ClickUp/);
  expect(dicaEntrada("https://app.clickup.com/t/1")).toMatch(/detectado/);
  expect(dicaEntrada("fazer X")).toMatch(/Texto livre/);
});
