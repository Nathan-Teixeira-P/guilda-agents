import { z } from "zod";

export const Briefing = z.looseObject({
  objetivo: z.string().min(1),
  criteriosAceite: z.array(z.string()),
  anexos: z.array(z.string()),
  links: z.array(z.string()),
  origem: z.enum(["link", "texto"]),
  clickupUrl: z.string().optional(),
});
export type Briefing = z.infer<typeof Briefing>;

/** Pure: a valid https://app.clickup.com/... link is "clickup-url"; anything else (invalid link included) is "texto". Never throws. */
export function classificarEntrada(entrada: string): "clickup-url" | "texto" {
  const s = entrada.trim();
  if (/\s/.test(s)) return "texto";
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname === "app.clickup.com" && !u.username && !u.password && u.port === "" ? "clickup-url" : "texto";
  } catch { return "texto"; }
}

const SECOES: Record<string, "objetivo" | "criteriosAceite" | "anexos" | "links"> = {
  "objetivo": "objetivo", "critérios de aceite": "criteriosAceite", "anexos": "anexos", "links": "links",
};
const VAZIO = "(não informado)";

/** Parses the fixed briefing.md format. Never throws; `ok: false` on any deviation. */
export function parseBriefing(md: string): { ok: true; briefing: Briefing } | { ok: false; error: string } {
  const raw: Record<string, unknown> = { criteriosAceite: [], anexos: [], links: [] };
  let secao: string | undefined;
  const texto: string[] = [];
  for (const linha of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(linha);
    if (h) { secao = SECOES[h[1]!.toLowerCase()]; continue; }
    const kv = /^(origem|clickupUrl):\s*(.*)$/.exec(linha);
    if (kv && secao === undefined) { raw[kv[1]!] = kv[2]!.trim(); continue; }
    if (!secao || !linha.trim()) continue;
    if (secao === "objetivo") { texto.push(linha.trim()); continue; }
    const item = /^-\s+(.*)$/.exec(linha)?.[1]?.trim();
    if (item && item !== VAZIO) (raw[secao] as string[]).push(item);
  }
  raw.objetivo = texto.join("\n");
  if (raw.clickupUrl === "") delete raw.clickupUrl;
  const r = Briefing.safeParse(raw);
  return r.success ? { ok: true, briefing: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
