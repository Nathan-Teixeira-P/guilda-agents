// Theme and motion preferences. Pure parsing; storage and DOM live in prefs.ts. Dark is the default (design 15).
export type Tema = "escuro" | "claro";
export type Movimento = "on" | "off";

export const lerTema = (v: string | null | undefined): Tema => (v === "claro" ? "claro" : "escuro");
export const lerMovimento = (v: string | null | undefined): Movimento => (v === "off" ? "off" : "on");
/** Motion is reduced when the user turned it off here or the OS asks for it. */
export const movimentoReduzido = (m: Movimento, osPedeReduzir: boolean) => m === "off" || osPedeReduzir;
/** Seal stamp length in ms; 0 means the seal appears already pressed. */
export const duracaoCarimbo = (reduzido: boolean) => (reduzido ? 0 : 540);
