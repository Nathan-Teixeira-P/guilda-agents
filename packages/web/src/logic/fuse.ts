// Mirrors packages/core/src/breaker.ts (not imported, like the stages): over the limit stops.
export const MAX_HANDOFFS = 8;
export const MAX_LOOPS = 2;

export type EstadoPavio = "ok" | "atencao" | "estourou";
/** One fuse: attention from the penultimate notch, blown when strictly over the limit. */
export function pavio(usado: number, limite: number): { estado: EstadoPavio; texto: string; cheios: number; limite: number } {
  const estado: EstadoPavio = usado > limite ? "estourou" : usado >= limite - 1 ? "atencao" : "ok";
  return { estado, texto: `${usado} de ${limite}`, cheios: Math.min(usado, limite), limite };
}
