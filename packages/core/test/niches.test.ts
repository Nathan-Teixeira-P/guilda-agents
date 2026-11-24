import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mascararJid, nicheConfigSchema, nichesFileSchema } from "../src/niches.js";

const AFILIADOS = process.env.AFILIADOS_DIR ?? "/home/nathan/Projetos/pessoal/afiliados";
const base = {
  key: "tech-1", label: "Tech", groupJid: "120363000000000001@g.us", instance: "i1",
  ml: { keywords: ["x"] }, cronSlots: ["0 9 * * *"],
};
const com = (o: Record<string, unknown>) => ({ ...base, ...o });
const sem = (k: string) => { const { [k]: _, ...r } = base as Record<string, unknown>; return r; };

const nicheCases: Array<[string, unknown]> = [
  ["válido mínimo", base],
  ["válido completo", com({ enabled: false, priority: -2, audience: "a", minDealScore: 100, maxPerRun: 5, amazon: { browseNodeIds: ["1"] } })],
  ["chave extra descartada", com({ extra: 1 })],
  ["jid com hífen", com({ groupJid: "1203-6300@g.us" })],
  ["sem key", sem("key")], ["key vazia", com({ key: "" })], ["key maiúscula", com({ key: "Tech" })],
  ["key com espaço", com({ key: "a b" })], ["key número", com({ key: 1 })],
  ["sem label", sem("label")], ["label vazio", com({ label: "" })],
  ["jid privado", com({ groupJid: "5511999@s.whatsapp.net" })], ["jid com letra", com({ groupJid: "abc@g.us" })],
  ["sem groupJid", sem("groupJid")],
  ["sem instance", sem("instance")], ["instance vazia", com({ instance: "" })],
  ["enabled string", com({ enabled: "true" })], ["priority fracionário", com({ priority: 1.5 })],
  ["priority string", com({ priority: "1" })], ["audience número", com({ audience: 3 })],
  ["score -1", com({ minDealScore: -1 })], ["score 101", com({ minDealScore: 101 })], ["score 50.5", com({ minDealScore: 50.5 })],
  ["maxPerRun 0", com({ maxPerRun: 0 })], ["maxPerRun 1.5", com({ maxPerRun: 1.5 })],
  ["sem cronSlots", sem("cronSlots")], ["cronSlots vazio", com({ cronSlots: [] })], ["cronSlots número", com({ cronSlots: [1] })],
  ["sem fonte", com({ ml: undefined })], ["fontes vazias", com({ ml: { keywords: [] }, amazon: {} })],
  ["ml.keywords inválido", com({ ml: { keywords: [1] } })], ["amazon só keywords", com({ ml: undefined, amazon: { keywords: ["k"] } })],
  ["null", null], ["string", "x"], ["array", []],
];
const fileCases: Array<[string, unknown]> = [
  ["um nicho", [base]],
  ["lista vazia", []],
  ["não é lista", base],
  ["key duplicada", [base, com({ groupJid: "1203@g.us" })]],
  ["jid duplicado", [base, com({ key: "outro" })]],
  ["distintos", [base, com({ key: "outro", groupJid: "1203@g.us" })]],
  ["item inválido", [base, com({ key: "" })]],
];

describe("espelho do schema de nichos", () => {
  it("aplica defaults", () => {
    const r = nicheConfigSchema.parse(base);
    expect(r).toMatchObject({ enabled: true, priority: 0, minDealScore: 50, maxPerRun: 1, amazon: { browseNodeIds: [], keywords: [] } });
  });
  it("descarta chaves extras", () => {
    expect(nicheConfigSchema.parse(com({ extra: 1 }))).not.toHaveProperty("extra");
  });
  it.each([
    [sem("key"), "key"], [com({ key: "A" }), "key"], [com({ label: "" }), "label"], [com({ groupJid: "1@s.whatsapp.net" }), "groupJid"],
    [com({ instance: "" }), "instance"], [com({ minDealScore: 101 }), "minDealScore"], [com({ maxPerRun: 0 }), "maxPerRun"],
    [com({ cronSlots: [] }), "cronSlots"], [com({ ml: undefined }), "key"],
  ])("mensagem pt-BR por campo", (input, campo) => {
    const r = nicheConfigSchema.safeParse(input);
    expect(r.success).toBe(false);
    const i = r.error!.issues.find((x) => x.path[0] === campo)!;
    expect(i).toBeDefined();
    expect(i.message).not.toMatch(/must|required|Invalid|expected/i);
  });
  it("aceita o example do afiliados, se presente", () => {
    const f = join(AFILIADOS, "config/niches.example.json");
    if (!existsSync(f)) return;
    expect(nichesFileSchema.safeParse(JSON.parse(readFileSync(f, "utf8"))).success).toBe(true);
  });
  it("mascara jid", () => {
    expect(mascararJid("120363000000000001@g.us")).toBe("1203…@g.us");
    expect(mascararJid("12@g.us")).toBe("…@g.us");
  });
});

// Conformidade com o schema real do afiliados (opcional: pula com aviso se não carregar).
type Real = { nicheConfigSchema: { safeParse(x: unknown): { success: boolean } }; nichesFileSchema: { safeParse(x: unknown): { success: boolean } } };
let real: Real | undefined;
try {
  real = (await import(/* @vite-ignore */ join(AFILIADOS, "src/niches/schema.ts"))) as Real;
  if (!real.nicheConfigSchema || !real.nichesFileSchema) throw new Error("exports ausentes");
} catch (e) {
  console.warn(`[conformidade] schema real indisponível, teste pulado: ${(e as Error).message}`);
}

describe("conformidade com o schema real", () => {
  it.skipIf(!real).each(nicheCases)("nicho: %s", (_n, input) => {
    expect(nicheConfigSchema.safeParse(input).success).toBe(real!.nicheConfigSchema.safeParse(input).success);
  });
  it.skipIf(!real).each(fileCases)("arquivo: %s", (_n, input) => {
    expect(nichesFileSchema.safeParse(input).success).toBe(real!.nichesFileSchema.safeParse(input).success);
  });
});
