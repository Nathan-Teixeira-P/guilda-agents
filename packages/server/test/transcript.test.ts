import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lerConversas, mascarar } from "../src/transcript.ts";

it("reads each agent's conversation, hiding secrets", () => {
  const raiz = mkdtempSync(join(tmpdir(), "tr-"));
  const sub = join(raiz, "-p", "s-1", "subagents");
  mkdirSync(sub, { recursive: true });
  const l = (type: string, content: unknown) => JSON.stringify({ type, message: { content } });
  writeFileSync(join(raiz, "-p", "s-1.jsonl"), l("user", "faça isso"));
  writeFileSync(join(sub, "agent-a.meta.json"), JSON.stringify({ agentType: "coder" }));
  writeFileSync(join(sub, "agent-a.jsonl"), [
    l("assistant", [{ type: "text", text: "vou ler" }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/p/.env" } }]),
    l("user", [{ type: "tool_result", tool_use_id: "t1", content: "X=abc" }]),
  ].join("\n"));
  const r = lerConversas(raiz, "s-1");
  expect(r.map((c) => c.tipo)).toEqual(["main", "coder"]);
  expect(r[1]!.itens.map((i) => i.t)).toEqual(["fala", "acao", "saida"]);
  expect(r[1]!.itens[2]!.texto).not.toContain("abc");
  expect(mascarar("API_KEY=abc123 postgres://u:pw@h Authorization: Bearer xyz")).not.toMatch(/abc123|pw@|xyz/);
  expect(lerConversas(raiz, "../x")).toEqual([]);
  rmSync(raiz, { recursive: true });
});
