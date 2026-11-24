import { z } from "zod";

// Espelho do schema do projeto afiliados (src/niches/schema.ts). Mesma rigidez:
// objetos descartam chaves extras, sem coerção, defaults idênticos.
const fonteVazia = <T extends Record<string, string[]>>(o: T) => o;

export const nicheConfigSchema = z
  .object({
    key: z
      .string("key deve ser texto")
      .min(1, "key é obrigatória")
      .regex(/^[a-z0-9-]+$/, "key deve ter apenas letras minúsculas, números e hífens"),
    label: z.string("label deve ser texto").min(1, "label é obrigatório"),
    enabled: z.boolean("enabled deve ser verdadeiro ou falso").default(true),
    priority: z.number("priority deve ser número").int("priority deve ser inteiro").default(0),
    groupJid: z
      .string("groupJid deve ser texto")
      .regex(/^[\d-]+@g\.us$/, "groupJid deve terminar em @g.us (grupo, não conversa privada)"),
    instance: z.string("instance deve ser texto").min(1, "instance é obrigatória"),
    audience: z.string("audience deve ser texto").optional(),
    ml: z
      .object({
        categoryIds: z.array(z.string("categoryIds deve conter textos")).default([]),
        keywords: z.array(z.string("keywords deve conter textos")).default([]),
      })
      .default(fonteVazia({ categoryIds: [], keywords: [] })),
    amazon: z
      .object({
        browseNodeIds: z.array(z.string("browseNodeIds deve conter textos")).default([]),
        keywords: z.array(z.string("keywords deve conter textos")).default([]),
      })
      .default(fonteVazia({ browseNodeIds: [], keywords: [] })),
    minDealScore: z
      .number("minDealScore deve ser número")
      .int("minDealScore deve ser inteiro")
      .min(0, "minDealScore deve ser no mínimo 0")
      .max(100, "minDealScore deve ser no máximo 100")
      .default(50),
    maxPerRun: z
      .number("maxPerRun deve ser número")
      .int("maxPerRun deve ser inteiro")
      .min(1, "maxPerRun deve ser no mínimo 1")
      .default(1),
    cronSlots: z
      .array(z.string("cronSlots deve conter textos"), "cronSlots deve ser uma lista")
      .min(1, "cronSlots deve ter ao menos uma expressão cron"),
  })
  .superRefine((d, ctx) => {
    if (!d.ml.categoryIds.length && !d.ml.keywords.length && !d.amazon.browseNodeIds.length && !d.amazon.keywords.length) {
      ctx.addIssue({
        code: "custom",
        message: "O nicho precisa de ao menos uma fonte de busca (ML categoryIds/keywords ou Amazon browseNodeIds/keywords)",
        path: ["key"],
      });
    }
  });

export type NicheConfig = z.infer<typeof nicheConfigSchema>;

const duplicados = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

export const nichesFileSchema = z
  .array(nicheConfigSchema, "O arquivo de nichos deve ser uma lista")
  .min(1, "Ao menos um nicho deve ser configurado")
  .superRefine((ns, ctx) => {
    const keys = duplicados(ns.map((n) => n.key));
    if (keys.length) ctx.addIssue({ code: "custom", message: `Keys duplicadas: ${keys.join(", ")}. Cada key deve ser única.` });
    const jids = duplicados(ns.map((n) => n.groupJid));
    if (jids.length) ctx.addIssue({ code: "custom", message: `groupJids duplicados: ${jids.join(", ")}. Cada grupo só pode pertencer a um nicho.` });
  });

export type NichesFile = z.infer<typeof nichesFileSchema>;

/** "120363000000000001@g.us" -> "1203…@g.us" (miolo oculto). */
export function mascararJid(jid: string): string {
  const i = jid.indexOf("@");
  const id = i < 0 ? jid : jid.slice(0, i);
  const sufixo = i < 0 ? "" : jid.slice(i);
  return id.length <= 4 ? `…${sufixo}` : `${id.slice(0, 4)}…${sufixo}`;
}
