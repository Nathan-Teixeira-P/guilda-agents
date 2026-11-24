import type { OllamaResult } from "../../core/src/local-tasks.js";

export type OllamaOpts = { model: string; timeoutMs?: number; port?: number };

let chain: Promise<unknown> = Promise.resolve(); // one model request at a time

/** Loopback only. Never throws: any failure yields {ok:false} so the caller falls back to Claude. */
export function ollamaGenerate(prompt: string, o: OllamaOpts): Promise<OllamaResult> {
  const run = async (): Promise<OllamaResult> => {
    try {
      const res = await fetch(`http://127.0.0.1:${o.port ?? 11434}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: o.model, prompt, stream: false, keep_alive: "60s" }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
      });
      if (!res.ok) return { ok: false, reason: `http ${res.status}` };
      const j = (await res.json()) as { response?: unknown };
      return typeof j.response === "string" && j.response.trim() ? { ok: true, text: j.response.trim() } : { ok: false, reason: "invalid" };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.name : "error" };
    }
  };
  const p = chain.then(run);
  chain = p;
  return p;
}
