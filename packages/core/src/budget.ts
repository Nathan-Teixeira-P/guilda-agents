/** Spend accounting from stream events. Pure. USD is only known per model/session, so per-agent cost is whatever the caller attributes. */
export interface BudgetState {
  byAgent: Record<string, number>;
  totalUsd: number;
  exhausted: boolean; // CLI said the cap was hit
}
export interface UsageEvent {
  agent: string;
  costUsd: number;
}
/** Subset of the stream-json `result` event. */
export interface ResultEvent {
  subtype?: string;
  terminal_reason?: string;
  total_cost_usd?: number;
}

export const newBudget = (): BudgetState => ({ byAgent: {}, totalUsd: 0, exhausted: false });

export function addUsage(s: BudgetState, e: UsageEvent): BudgetState {
  return {
    ...s,
    byAgent: { ...s.byAgent, [e.agent]: (s.byAgent[e.agent] ?? 0) + e.costUsd },
    totalUsd: s.totalUsd + e.costUsd,
  };
}

/** `total_cost_usd` is cumulative for the session, so it replaces the total instead of adding. */
export function recordResult(s: BudgetState, r: ResultEvent): BudgetState {
  return {
    ...s,
    totalUsd: r.total_cost_usd ?? s.totalUsd,
    exhausted: s.exhausted || r.subtype === "error_max_budget_usd" || r.terminal_reason === "budget_exhausted",
  };
}
