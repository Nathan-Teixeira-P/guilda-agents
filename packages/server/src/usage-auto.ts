import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ConsultResult, UsageSource } from "./usage-source.ts";

export const AutoCfg = z.object({ auto: z.boolean().default(true), intervaloMin: z.number().int().min(5).max(60).default(15) });
export type AutoCfg = z.infer<typeof AutoCfg>;
export const AutoPut = z.object({ auto: z.boolean().optional(), intervaloMin: z.number().int().min(5).max(60).optional() });
const Dia = z.object({ auto: z.number().int().min(0), manual: z.number().int().min(0) });
const Stats = z.object({ dias: z.record(z.string(), Dia).default({}), deltas: z.array(z.number().min(0)).max(20).default([]) });
type Stats = z.infer<typeof Stats>;

const CFG = "usage-auto.json";
const STATS = "usage-auto-stats.json";
const MAX_BACKOFF_MIN = 60;
const PAUSA_PP = 95;
const MAX_DIAS = 14;

function ler<T>(f: string | undefined, s: z.ZodType<T>, vazio: T): T {
  if (!f) return vazio;
  try { const r = s.safeParse(JSON.parse(readFileSync(f, "utf8"))); if (r.success) return r.data; } catch { /* missing or corrupt: defaults */ }
  return vazio;
}
function gravar(f: string | undefined, v: unknown) {
  if (!f) return;
  try { mkdirSync(join(f, ".."), { recursive: true }); const tmp = `${f}.tmp-${process.pid}`; writeFileSync(tmp, JSON.stringify(v, null, 2)); renameSync(tmp, f); } catch { /* best effort */ }
}

export interface AutoDeps {
  dir?: string; // hub folder; memory only without it
  clock: () => Date;
  usage: UsageSource;
  ocupado: () => boolean; // a mission or article is running
  clientes: () => { conectados: number; visiveis: number };
  aoMudar: () => void; // status changed: the server publishes SSE `uso-auto`
  aoLer: () => void; // a consult produced a reading: the server publishes SSE `usage`
  every?: (fn: () => void, ms: number) => () => void; // injectable timer; the default is unref'd
  tickMs?: number;
}

const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const everyReal = (fn: () => void, ms: number) => { const t = setInterval(fn, ms); t.unref(); return () => clearInterval(t); };

/** Opt-out refresher of the plan usage: calls `usage.consultar()` only when every guard holds. Each consult spends a bit of the window. */
export function createUsageAuto(d: AutoDeps) {
  const cfgFile = d.dir ? join(d.dir, CFG) : undefined;
  const statsFile = d.dir ? join(d.dir, STATS) : undefined;
  let cfg = ler(cfgFile, AutoCfg, AutoCfg.parse({}));
  let stats: Stats = ler(statsFile, Stats, Stats.parse({}));
  let emVoo = false;
  let falhas = 0;
  let erro: string | undefined;
  let bloqueadoAte = 0; // epoch ms: backoff after a failure or a throttle
  let parar: (() => void) | undefined;
  let ultimoJson = "";

  const cinco = () => { const e = d.usage.atual(); return e.estado === "ok" ? e.cincoHoras : undefined; };

  /** Why it is not polling now (undefined = free to poll once the interval elapsed). */
  function pausa(): string | undefined {
    if (!cfg.auto) return "desligado";
    const c = d.clientes();
    if (c.conectados === 0) return "nenhuma aba aberta";
    if (c.visiveis === 0) return "aba oculta";
    if (d.ocupado()) return "missão em andamento";
    const j = cinco();
    if (j && j.percentual >= PAUSA_PP) return `janela de 5h em ${j.percentual}% (acima de ${PAUSA_PP - 1}%)`;
    return undefined;
  }
  function proximaMs(): number {
    const ult = d.usage.ultimaLeitura();
    return Math.max(ult === undefined ? 0 : ult + cfg.intervaloMin * 60_000, bloqueadoAte);
  }

  function status() {
    const now = d.clock();
    const motivo = pausa();
    const deltas = stats.deltas;
    const hoje = stats.dias[dia(now)] ?? { auto: 0, manual: 0 };
    return {
      auto: cfg.auto,
      intervaloMin: cfg.intervaloMin,
      estado: !cfg.auto ? "desligado" : motivo ? "pausado" : "ativo",
      ...(cfg.auto && motivo ? { motivo } : {}),
      ...(cfg.auto && !motivo ? { proximaEm: new Date(Math.max(proximaMs(), now.getTime())).toISOString() } : {}),
      ...(erro ? { erro, falhasSeguidas: falhas } : {}),
      consultasHoje: hoje,
      custoPp: { ultimos: deltas, ...(deltas.length ? { media: Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100 } : {}) },
    };
  }
  const notificar = () => { const j = JSON.stringify(status()); if (j !== ultimoJson) { ultimoJson = j; d.aoMudar(); } };

  async function consultar(origem: "auto" | "manual"): Promise<ConsultResult> {
    if (emVoo) return { ok: false, reason: "throttled", retryAfterSeconds: 30 };
    emVoo = true;
    const antes = cinco();
    try {
      const r = await d.usage.consultar();
      const now = d.clock();
      if (r.ok) {
        falhas = 0; erro = undefined; bloqueadoAte = 0;
        d.aoLer();
        const depois = cinco();
        if (antes && depois && antes.reiniciaEm === depois.reiniciaEm) stats.deltas = [...stats.deltas, Math.max(0, depois.percentual - antes.percentual)].slice(-20);
      } else if (r.reason === "failed") {
        falhas++;
        erro = r.motivo;
        bloqueadoAte = now.getTime() + Math.min(MAX_BACKOFF_MIN, cfg.intervaloMin * 2 ** (falhas - 1)) * 60_000;
      } else bloqueadoAte = Math.max(bloqueadoAte, now.getTime() + r.retryAfterSeconds * 1000);
      if (r.ok || r.reason === "failed") {
        const k = dia(now);
        const h = stats.dias[k] ?? { auto: 0, manual: 0 };
        stats.dias = Object.fromEntries(Object.entries({ ...stats.dias, [k]: { ...h, [origem]: h[origem] + 1 } }).sort().slice(-MAX_DIAS));
        gravar(statsFile, stats);
      }
      return r;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
      return { ok: false, reason: "failed", motivo: erro };
    } finally {
      emVoo = false;
      notificar();
    }
  }

  /** One scheduler step. Never throws. */
  async function tick(): Promise<void> {
    try {
      if (emVoo || pausa() !== undefined || d.clock().getTime() < proximaMs()) return;
      await consultar("auto");
    } catch { /* never throw */ }
  }

  return {
    status,
    notificar,
    consultar,
    tick,
    config: () => cfg,
    set(p: z.infer<typeof AutoPut>) {
      cfg = { ...cfg, ...(p.auto !== undefined ? { auto: p.auto } : {}), ...(p.intervaloMin !== undefined ? { intervaloMin: p.intervaloMin } : {}) };
      gravar(cfgFile, cfg);
      notificar();
    },
    start() { parar ??= (d.every ?? everyReal)(() => void tick(), d.tickMs ?? 60_000); },
    stop() { parar?.(); parar = undefined; },
  };
}
export type UsageAuto = ReturnType<typeof createUsageAuto>;
