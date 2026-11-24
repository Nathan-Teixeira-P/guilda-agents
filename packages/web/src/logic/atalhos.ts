export type Atalho = "nova" | "ajuda" | "salao" | "quadro" | "arsenal" | "projetos" | "selar" | "ajustes";
const KEYS: Record<string, Atalho> = { n: "nova", "?": "ajuda", "1": "salao", "2": "quadro", "3": "arsenal", "4": "projetos", a: "selar", j: "ajustes" };

/** Single-key shortcuts: silent while typing, with a dialog open or with modifier keys. */
export function atalho(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, typing: boolean, dialogOpen: boolean): Atalho | undefined {
  if (typing || dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return undefined;
  return KEYS[e.key.toLowerCase()];
}
