/** Circuit breaker for rework loops and chained handoffs. Pure; the caller injects the clock. */
export const MAX_LOOPS_PER_SPEC = 2;
export const MAX_CHAINED_HANDOFFS = 8;

export interface BreakerLimits {
  maxLoops?: number;
  maxHandoffs?: number;
}
export interface BreakerState {
  loops: Record<string, number>; // rework turns per step (same shape as Mission.loops)
  handoffs: number; // chained handoffs since the last user intervention
  lastResetAt?: string;
}
export type Verdict = { ok: true } | { ok?: never; parar: true; motivo: string; motivoPt: string };

export const newBreaker = (): BreakerState => ({ loops: {}, handoffs: 0 });

export function recordLoop(s: BreakerState, step: string, _now: () => Date): BreakerState {
  return { ...s, loops: { ...s.loops, [step]: (s.loops[step] ?? 0) + 1 } };
}

export function recordHandoff(s: BreakerState, _now: () => Date): BreakerState {
  return { ...s, handoffs: s.handoffs + 1 };
}

/** The user stepped in: clear both counters. */
export function userIntervened(_s: BreakerState, now: () => Date): BreakerState {
  return { loops: {}, handoffs: 0, lastResetAt: now().toISOString() };
}

/** Over the limit (strictly greater) stops: 2 loops ok, 3 stops; 8 handoffs ok, 9 stops. */
export function check(s: BreakerState, step: string, limits: BreakerLimits = {}): Verdict {
  const maxLoops = limits.maxLoops ?? MAX_LOOPS_PER_SPEC;
  const maxHandoffs = limits.maxHandoffs ?? MAX_CHAINED_HANDOFFS;
  const n = s.loops[step] ?? 0;
  if (n > maxLoops) {
    return { parar: true, motivo: `step "${step}" had ${n} rework loops (limit ${maxLoops}); ask the user`, motivoPt: `o passo "${step}" teve ${n} voltas de retrabalho (limite ${maxLoops}); pergunte ao usuário` };
  }
  if (s.handoffs > maxHandoffs) {
    return { parar: true, motivo: `${s.handoffs} chained handoffs without user input (limit ${maxHandoffs}); ask the user`, motivoPt: `${s.handoffs} trocas encadeadas sem intervenção do usuário (limite ${maxHandoffs}); pergunte ao usuário` };
  }
  return { ok: true };
}
