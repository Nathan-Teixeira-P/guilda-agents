import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, lstatSync, readlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_MODELS, MODELS, RESPONSE_PATTERN } from "../packages/core/src/models.ts";
import { ARTEFATOS } from "../packages/core/src/redacao.ts";
import { parseFrontmatter, validateAgent } from "./validate-agents.ts";

const agent = (o: { name?: string; model?: string; tools?: string; body?: string } = {}) =>
  `---\nname: ${o.name ?? "coder"}\ndescription: faz coisas\ntools: ${o.tools ?? "Read, Write, Edit"}\nmodel: ${o.model ?? "sonnet"}\n---\n${o.body ?? `Responda em ${RESPONSE_PATTERN}.`}\n`;

describe("parseFrontmatter", () => {
  it("parses keys and comma-separated tools", () => {
    const r = parseFrontmatter(agent({ tools: "Read, Grep ,Glob" }));
    expect(r.data.tools).toEqual(["Read", "Grep", "Glob"]);
    expect(r.data.model).toBe("sonnet");
    expect(r.body).toContain("STATUS");
  });
  it("rejects missing, unterminated and malformed frontmatter", () => {
    expect(() => parseFrontmatter("no frontmatter")).toThrow();
    expect(() => parseFrontmatter("---\nname: x\n")).toThrow();
    expect(() => parseFrontmatter("---\nname x\n---\n")).toThrow();
    expect(() => parseFrontmatter("---\nfoo: x\n---\n")).toThrow();
  });
});

describe("validateAgent", () => {
  it("accepts a valid agent", () => expect(validateAgent("coder.md", agent())).toEqual([]));
  it("fails reader agents with write tools", () => {
    for (const t of ["Write", "Edit", "Bash"])
      expect(validateAgent("reviewer.md", agent({ name: "reviewer", tools: `Read, ${t}` })).length).toBeGreaterThan(0);
    expect(validateAgent("reviewer.md", agent({ name: "reviewer", tools: "Read, Grep", model: "sonnet" }))).toEqual([]);
  });
  it("fails model outside the table", () => {
    expect(validateAgent("coder.md", agent({ model: "gpt" })).length).toBeGreaterThan(0);
    expect(validateAgent("coder.md", agent({ model: "opus" })).length).toBeGreaterThan(0); // coder is sonnet
  });
  it("fails invalid frontmatter, name/file mismatch, empty tools", () => {
    expect(validateAgent("coder.md", "oops").length).toBeGreaterThan(0);
    expect(validateAgent("coder.md", agent({ name: "other" })).length).toBeGreaterThan(0);
    expect(validateAgent("coder.md", agent({ tools: "" })).length).toBeGreaterThan(0);
  });
  it("requires the response pattern except for frontend agents", () => {
    expect(validateAgent("coder.md", agent({ body: "sem padrão" })).length).toBeGreaterThan(0);
    for (const n of ["frontend-architect", "frontend-builder"])
      expect(validateAgent(`${n}.md`, agent({ name: n, model: AGENT_MODELS[n], body: "livre" }))).toEqual([]);
  });
});

describe("routing.md", () => {
  it("lists every agent with its table model and mentions every model", () => {
    const md = readFileSync("routing.md", "utf8");
    for (const m of MODELS) expect(md).toContain(m);
    for (const [a, m] of Object.entries(AGENT_MODELS)) expect(md).toMatch(new RegExp(`\\|\\s*\`${a}\`\\s*\\|\\s*${m}\\s*\\|`));
  });
});

describe("install-agents.sh", () => {
  const run = (dest: string, src: string, ...args: string[]) => {
    try {
      const out = execFileSync("bash", ["scripts/install-agents.sh", ...args], {
        env: { ...process.env, LAB_AGENTS_DEST: dest, LAB_AGENTS_SRC: src }, encoding: "utf8", stdio: "pipe",
      });
      return { code: 0, out };
    } catch (e: any) { return { code: e.status as number, out: String(e.stdout) + String(e.stderr) }; }
  };
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), "lab-"));
    const src = join(root, "src"), dest = join(root, "dest");
    mkdirSync(src); mkdirSync(dest);
    writeFileSync(join(src, "a.md"), "a"); writeFileSync(join(src, "b.md"), "b");
    return { src, dest };
  };
  it("dry-run changes nothing", () => {
    const { src, dest } = setup();
    const r = run(dest, src, "--dry-run");
    expect(r.code).toBe(0);
    expect(existsSync(join(dest, "a.md"))).toBe(false);
  });
  it("creates symlinks and is idempotent", () => {
    const { src, dest } = setup();
    expect(run(dest, src).code).toBe(0);
    expect(readlinkSync(join(dest, "a.md"))).toBe(join(src, "a.md"));
    expect(run(dest, src).code).toBe(0);
  });
  it("refuses to overwrite a real file and links nothing", () => {
    const { src, dest } = setup();
    writeFileSync(join(dest, "b.md"), "mine");
    const r = run(dest, src);
    expect(r.code).not.toBe(0);
    expect(lstatSync(join(dest, "b.md")).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(dest, "b.md"), "utf8")).toBe("mine");
    expect(existsSync(join(dest, "a.md"))).toBe(false);
  });
  it("replaces an existing symlink", () => {
    const { src, dest } = setup();
    symlinkSync("/nonexistent", join(dest, "a.md"));
    expect(run(dest, src).code).toBe(0);
    expect(readlinkSync(join(dest, "a.md"))).toBe(join(src, "a.md"));
  });
});

describe("orchestrator: Redação", () => {
  const md = readFileSync(join(import.meta.dirname, "../agents/orchestrator.md"), "utf8");
  it("cita os 5 agentes, os artefatos e a regra de nunca publicar", () => {
    for (const a of ["researcher", "fact-checker", "writer", "editor", "illustrator"]) expect(md).toContain(`\`${a}\``);
    for (const f of Object.values(ARTEFATOS).filter((f) => f !== "artigo.json")) expect(md).toContain(f);
    expect(md).toMatch(/Nunca publicar/);
  });
});
