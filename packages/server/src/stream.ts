import { z } from "zod";

/** Typed events from `claude -p --output-format stream-json --verbose`. Never throws: bad input becomes `desconhecido`. */
export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}
export interface RateWindow {
  utilization: number; // fraction 0..1
  resetsAt: number; // epoch seconds
  status: string;
}
export type StreamEvent =
  | { kind: "init"; sessionId: string; model?: string; permissionMode?: string }
  | { kind: "usage"; messageId: string; agent: string; model?: string; tokens: Tokens }
  | { kind: "text"; agent: string; text: string }
  | { kind: "tool"; agent: string; name: string; command?: string }
  | { kind: "subagent-started"; agentId: string; toolUseId?: string; subagentType?: string }
  | { kind: "subagent-progress"; agentId: string; subagentType?: string; totalTokens?: number }
  | { kind: "subagent-finished"; agentId: string; toolUseId?: string; status?: string; totalTokens?: number }
  | { kind: "rate-limit"; status?: string; fiveHour?: RateWindow; sevenDay?: RateWindow }
  | {
      kind: "result";
      subtype?: string;
      isError: boolean;
      terminalReason?: string | null;
      text: string;
      costUsd?: number;
      modelUsage: Record<string, number>; // model -> costUSD
      permissionDenials: { toolName: string; toolInput?: unknown }[];
      sessionId?: string;
      numTurns?: number;
      usage?: { input: number; output: number; cacheRead: number; cacheCreation: number }; // session totals reported by the CLI
    }
  | { kind: "desconhecido"; reason: "invalid-json" | "unrecognized"; type?: string };

export const MAIN_AGENT = "main";

const Env = z.looseObject({
  type: z.string(),
  subtype: z.string().optional(),
  session_id: z.string().optional(),
  agent_id: z.string().nullish(),
  parent_tool_use_id: z.string().nullish(),
});
const Init = z.looseObject({ session_id: z.string(), model: z.string().optional(), permissionMode: z.string().optional() });
const Usage = z.looseObject({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_input_tokens: z.number().default(0),
  cache_creation_input_tokens: z.number().default(0),
});
const Assistant = z.looseObject({
  message: z.looseObject({
    id: z.string().optional(),
    model: z.string().optional(),
    usage: Usage.optional(),
    content: z.array(z.looseObject({ type: z.string(), name: z.string().optional(), text: z.string().optional(), input: z.unknown().optional() })).default([]),
  }),
});
const TaskStarted = z.looseObject({ task_id: z.string(), tool_use_id: z.string().optional(), subagent_type: z.string().optional() });
const TaskDone = z.looseObject({
  task_id: z.string(),
  tool_use_id: z.string().optional(),
  status: z.string().optional(),
  usage: z.looseObject({ total_tokens: z.number().optional() }).optional(),
});
const TaskProgress = z.looseObject({ task_id: z.string(), subagent_type: z.string().optional(), usage: z.looseObject({ total_tokens: z.number().optional() }).optional() });
const Window = z.looseObject({ utilization: z.number(), resetsAt: z.number(), status: z.string() });
const RateLimit = z.looseObject({
  rate_limit_info: z.looseObject({
    status: z.string().optional(),
    unifiedWindows: z.looseObject({ five_hour: Window.optional(), seven_day: Window.optional() }).optional(),
  }),
});
const Result = z.looseObject({
  subtype: z.string().optional(),
  is_error: z.boolean().default(false),
  terminal_reason: z.string().nullish(),
  result: z.string().nullish(),
  total_cost_usd: z.number().optional(),
  num_turns: z.number().optional(),
  usage: z.looseObject({ input_tokens: z.number().default(0), output_tokens: z.number().default(0), cache_read_input_tokens: z.number().default(0), cache_creation_input_tokens: z.number().default(0) }).optional(),
  modelUsage: z.record(z.string(), z.looseObject({ costUSD: z.number().default(0) })).default({}),
  permission_denials: z.array(z.looseObject({ tool_name: z.string(), tool_input: z.unknown().optional() })).default([]),
});

const bad = (type?: string): StreamEvent[] => [{ kind: "desconhecido", reason: "unrecognized", ...(type ? { type } : {}) }];

/** One stdout line -> zero or more events (an assistant message can carry usage plus several tool calls). */
export function parseLine(line: string): StreamEvent[] {
  if (line.trim() === "") return [];
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return [{ kind: "desconhecido", reason: "invalid-json" }];
  }
  const env = Env.safeParse(json);
  if (!env.success) return bad();
  const { type, subtype } = env.data;
  const agent = env.data.agent_id ?? (env.data.parent_tool_use_id ? env.data.parent_tool_use_id : MAIN_AGENT);

  if (type === "system" && subtype === "init") {
    const r = Init.safeParse(json);
    if (!r.success) return bad(type);
    const d = r.data;
    return [{ kind: "init", sessionId: d.session_id, ...(d.model ? { model: d.model } : {}), ...(d.permissionMode ? { permissionMode: d.permissionMode } : {}) }];
  }
  if (type === "system" && subtype === "task_started") {
    const r = TaskStarted.safeParse(json);
    if (!r.success) return bad(type);
    return [{ kind: "subagent-started", agentId: r.data.task_id, toolUseId: r.data.tool_use_id, subagentType: r.data.subagent_type }];
  }
  if (type === "system" && subtype === "task_progress") {
    const r = TaskProgress.safeParse(json);
    if (!r.success) return bad(type);
    return [{ kind: "subagent-progress", agentId: r.data.task_id, ...(r.data.subagent_type ? { subagentType: r.data.subagent_type } : {}), ...(r.data.usage?.total_tokens !== undefined ? { totalTokens: r.data.usage.total_tokens } : {}) }];
  }
  if (type === "system" && subtype === "task_notification") {
    const r = TaskDone.safeParse(json);
    if (!r.success) return bad(type);
    return [{ kind: "subagent-finished", agentId: r.data.task_id, toolUseId: r.data.tool_use_id, status: r.data.status, totalTokens: r.data.usage?.total_tokens }];
  }
  if (type === "assistant") {
    const r = Assistant.safeParse(json);
    if (!r.success) return bad(type);
    const m = r.data.message;
    const out: StreamEvent[] = [];
    if (m.usage) {
      out.push({
        kind: "usage",
        messageId: m.id ?? "",
        agent,
        model: m.model,
        tokens: {
          input: m.usage.input_tokens,
          output: m.usage.output_tokens,
          cacheRead: m.usage.cache_read_input_tokens,
          cacheCreation: m.usage.cache_creation_input_tokens,
        },
      });
    }
    for (const c of m.content) {
      if (c.type === "tool_use" && c.name) out.push({ kind: "tool", agent, name: c.name, ...(c.name === "Bash" && typeof (c.input as { command?: unknown } | null)?.command === "string" ? { command: (c.input as { command: string }).command } : {}) });
      else if (c.type === "text" && c.text) out.push({ kind: "text", agent, text: c.text });
    }
    return out;
  }
  if (type === "rate_limit_event") {
    const r = RateLimit.safeParse(json);
    if (!r.success) return bad(type);
    const info = r.data.rate_limit_info;
    return [{ kind: "rate-limit", status: info.status, fiveHour: info.unifiedWindows?.five_hour, sevenDay: info.unifiedWindows?.seven_day }];
  }
  if (type === "result") {
    const r = Result.safeParse(json);
    if (!r.success) return bad(type);
    const d = r.data;
    return [
      {
        kind: "result",
        subtype: d.subtype,
        isError: d.is_error,
        terminalReason: d.terminal_reason,
        text: d.result ?? "",
        costUsd: d.total_cost_usd,
        modelUsage: Object.fromEntries(Object.entries(d.modelUsage).map(([k, v]) => [k, v.costUSD])),
        permissionDenials: d.permission_denials.map((p) => ({ toolName: p.tool_name, toolInput: p.tool_input })),
        sessionId: env.data.session_id,
        ...(d.num_turns !== undefined ? { numTurns: d.num_turns } : {}),
        ...(d.usage ? { usage: { input: d.usage.input_tokens, output: d.usage.output_tokens, cacheRead: d.usage.cache_read_input_tokens, cacheCreation: d.usage.cache_creation_input_tokens } } : {}),
      },
    ];
  }
  return bad(type); // known-shaped but irrelevant (hooks, thinking_tokens, user, ...)
}
