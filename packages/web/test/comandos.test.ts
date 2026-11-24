import { expect, it } from "vitest";
import { validarComando } from "@lab/core/src/projects.ts";
import { comandoValido, motivoRejeicao } from "../src/logic/comandos.ts";

const ok = ["npm test", "npm run lint", "npm run test:unit", "npx vitest run", "npx tsc --noEmit", "node --test", "pytest -q tests/", "go test ./pkg", "cargo test", "make test", "make lint", "pnpm test", "yarn run build", "bun test", "composer run test", "npm test -- --reporter=dot"];
const ruins: [string, RegExp][] = [
  ["npm test | cat", /Pipes/], ["npm test; ls", /';'/], ["npm test && ls", /&&/], ["npm test &", /&/], ["npm test > out", /Redirecion/],
  ["npm test $(id)", /Substitui/], ["npm test `id`", /Substitui/], ["npm test 'x'", /Aspas/], ["npm test *", /curingas/], ["npm test\nls", /linha/],
  ["sudo npm test", /sudo/], ["npm test rm", /'rm'/], ["npm test curl", /curl/], ["git push", /git/], ["npm test ..", /\.\./], ["npm test ../x", /\.\./],
  ["npm install", /não reconhecido/], ["bash -c x", /não reconhecido/], ["", /Digite/], ["x".repeat(300), /longo/], [" npm test", /espaço/], ["npm  test", /espaço/],
  ["npm test /etc/passwd", /"\/etc\/passwd".*absoluto/], ["npm test ~/x", /Aspas|absoluto/],
  ["make deploy", /não reconhecido/], ["npm testx", /Argumentos/],
];

it("mirrors the server's validarComando", () => {
  for (const c of [...ok, ...ruins.map(([c]) => c)]) expect(comandoValido(c), c).toBe(validarComando(c));
});
it("accepts allowed commands with no reason", () => {
  for (const c of ok) expect(motivoRejeicao(c), c).toBeUndefined();
});
it("explains rejections in pt-BR", () => {
  for (const [c, re] of ruins) expect(motivoRejeicao(c), c).toMatch(re);
});
