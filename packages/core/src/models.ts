/** Single source of truth for agent models. routing.md and the agent validator both read this. */
export const MODELS = ["haiku", "sonnet", "opus"] as const;
export type Model = (typeof MODELS)[number];

export const AGENT_MODELS: Record<string, Model> = {
  orchestrator: "sonnet",
  intake: "haiku",
  planner: "opus",
  "frontend-architect": "opus",
  "prd-writer": "sonnet",
  "spec-writer": "sonnet",
  "spec-checker": "haiku",
  explorer: "haiku",
  coder: "sonnet",
  "frontend-builder": "sonnet",
  reviewer: "sonnet",
  tester: "haiku",
  debugger: "sonnet",
  researcher: "sonnet",
  "fact-checker": "haiku",
  writer: "sonnet",
  editor: "haiku",
  ops: "haiku",
  "deal-auditor": "haiku",
  scribe: "haiku",
  illustrator: "sonnet",
  refactorer: "sonnet",
  "security-reviewer": "sonnet",
};

/** Agents that must never hold write-capable tools. */
export const READ_ONLY_AGENTS = ["explorer", "security-reviewer", "reviewer", "ops", "deal-auditor", "spec-checker", "fact-checker"];
export const WRITE_TOOLS = ["Write", "Edit", "Bash", "NotebookEdit"];

/** Agents exempt from the short response pattern. */
export const FRONTEND_AGENTS = ["frontend-architect", "frontend-builder"];
export const RESPONSE_PATTERN = "STATUS/RESUMO/ARQUIVOS/PRÓXIMO";
