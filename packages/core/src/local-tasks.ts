import { allOf, citedPathsExist, formatMatches, inputDerivedTerms, maxSize, requiredTerms, type Verifier } from "./verify.ts";

/** Closed allowlist. Code, spec, review, final text and decisions are NEVER local. */
export const LOCAL_TASKS = ["compact-test-log", "list-relevant-files", "commit-message-draft", "extract-briefing-fields"] as const;
export type LocalTask = (typeof LOCAL_TASKS)[number];
export const isLocalTask = (t: string): t is LocalTask => (LOCAL_TASKS as readonly string[]).includes(t);

export type OllamaResult = { ok: true; text: string } | { ok: false; reason?: string };
export type LocalDeps = {
  enabled: boolean; // config local.enabled, default false
  ollama: (task: LocalTask, input: string) => Promise<OllamaResult>;
  fallback: (task: LocalTask, input: string) => Promise<string>; // Claude haiku
  exists: (path: string) => boolean;
};
export type LocalResult =
  | { via: "local"; output: string; tokensSaved: number }
  | { via: "claude-fallback"; output: string }
  | { via: "refused" };

function verifierFor(task: LocalTask, exists: (p: string) => boolean, input: string): Verifier {
  switch (task) {
    case "compact-test-log":
      return allOf(maxSize(4000), inputDerivedTerms(input)); // derived from the INPUT: a dropped failure line rejects the result
    case "list-relevant-files":
      return allOf(maxSize(4000), citedPathsExist(exists));
    case "commit-message-draft":
      return allOf(maxSize(500), formatMatches(/^[a-z]+(\([\w-]+\))?!?: .+/));
    case "extract-briefing-fields":
      return allOf(maxSize(4000), requiredTerms(["objetivo"]));
  }
}

/** ESTIMATE (chars/4), not a measurement. */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

export async function runLocal(task: string, input: string, deps: LocalDeps): Promise<LocalResult> {
  if (!isLocalTask(task)) return { via: "refused" };
  if (deps.enabled) {
    const r = await deps.ollama(task, input).catch((): OllamaResult => ({ ok: false }));
    if (r.ok && verifierFor(task, deps.exists, input)(r.text)) {
      return { via: "local", output: r.text, tokensSaved: Math.max(0, estimateTokens(input) - estimateTokens(r.text)) } // estimate of input that never entered the Claude context;
    }
  }
  return { via: "claude-fallback", output: await deps.fallback(task, input) };
}

/** Closed table shown in the UI: who may use the local model, for what. Anything else is NOT eligible. */
export const LOCAL_ELIGIBLE = [
  { agente: "tester", tarefa: "compact-test-log", descricao: "compacta logs longos de teste" },
] as const;

const FORA_MOTIVO = "qualidade: código/revisão/decisão/texto final nunca vão para modelo local";
export const LOCAL_FORA = [
  ...["coder", "reviewer", "planner", "writer", "editor", "security-reviewer", "debugger", "refactorer", "spec-writer", "spec-checker", "prd-writer", "fact-checker", "researcher", "illustrator", "intake", "deal-auditor", "ops", "orchestrator", "scribe", "frontend-architect", "frontend-builder"].map((agente) => ({ agente, motivo: FORA_MOTIVO })),
  { agente: "explorer", motivo: "sem Bash: não consegue chamar o helper local" },
] as const;
