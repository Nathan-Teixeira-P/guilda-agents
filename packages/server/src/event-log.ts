/** Per-mission history of what the live screen shows, so reopening it replays the chronicle. Only the fields the UI reads. */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MAIN_AGENT, type StreamEvent } from "./stream.ts";

const ARQUIVO = "eventos.jsonl";
const MAX = 2000; // same cap the UI keeps

const resumir = (e: StreamEvent): object | undefined => {
  if (e.kind === "tool") return { kind: e.kind, agent: e.agent, name: e.name }; // never the command
  if (e.kind === "text") return e.agent === MAIN_AGENT && /^OK\s/m.test(e.text) ? e : undefined; // only what resets the breaker count
  return e.kind === "subagent-started" || e.kind === "subagent-finished" || e.kind === "usage" || e.kind === "result" ? e : undefined;
};

export function gravarEvento(dir: string, e: StreamEvent): void {
  const r = resumir(e);
  if (!r) return;
  try { appendFileSync(join(dir, ARQUIVO), `${JSON.stringify(r)}\n`); } catch { /* history is best effort: never fail a mission over it */ }
}

export function lerEventos(dir: string): unknown[] {
  let texto: string;
  try { texto = readFileSync(join(dir, ARQUIVO), "utf8"); } catch { return []; }
  return texto.split("\n").filter(Boolean).slice(-MAX).flatMap((l) => { try { return [JSON.parse(l) as unknown]; } catch { return []; } });
}
