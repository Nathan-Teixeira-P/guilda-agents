// Planejador de agenda: funções puras e determinísticas. Fuso só para descrições.
export const FUSO = "America/Sao_Paulo";
const DIA = 1440;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export type Slot = { key: string; hhmm: string };
export type Concentracao = { a: Slot; b: Slot; distanciaMin: number };

const pad = (n: number) => String(n).padStart(2, "0");
const minutos = (hhmm: string) => {
  const m = HHMM.exec(hhmm);
  if (!m) throw new Error(`horário inválido: "${hhmm}" (use HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
};
const hhmmDe = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
// distância circular: 23:50 e 00:10 estão a 20 min
const dist = (x: number, y: number) => Math.min(Math.abs(x - y), DIA - Math.abs(x - y));

export function horasParaCron(hhmm: string): string {
  const t = minutos(hhmm);
  return `${t % 60} ${Math.floor(t / 60)} * * *`;
}

export function descreverCron(cron: string): string {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron.trim());
  if (!m || Number(m[1]) > 59 || Number(m[2]) > 23) return "expressão personalizada";
  // ponytail: instante UTC fixo (-03:00, sem horário de verão desde 2019); revisar se o fuso voltar a ter DST
  const d = new Date(Date.UTC(2026, 0, 1, Number(m[2]) + 3, Number(m[1])));
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `todo dia às ${hora}`;
}

export function detectarConcentracao(slots: Slot[], intervaloMin = 45): Concentracao[] {
  const s = [...slots].sort((p, q) => minutos(p.hhmm) - minutos(q.hhmm) || p.key.localeCompare(q.key));
  const at = (i: number) => s[i] as Slot;
  const out: Concentracao[] = [];
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      const d = dist(minutos(at(i).hhmm), minutos(at(j).hhmm));
      if (d < intervaloMin) out.push({ a: at(i), b: at(j), distanciaMin: d });
    }
  return out;
}

export type NichoAgenda = { key: string; horas?: string[]; envios: number };
export type Sugestao = {
  slots: Array<Slot & { cron: string }>;
  impossiveis: Array<{ key: string; faltam: number }>;
};

// grade padrão (08:00–21:45, a cada 15 min) quando o nicho não informa horas candidatas
const GRADE = Array.from({ length: 56 }, (_, i) => hhmmDe(480 + i * 15));

/**
 * Intercala os nichos em rodadas (um envio por nicho por rodada, ordem por key) e escolhe,
 * para cada envio, o primeiro horário candidato a >= intervaloMin de todos já alocados.
 * Se não houver, o envio vai para `impossiveis` em vez de violar o intervalo.
 */
export function sugerirAgenda(p: { nichos: NichoAgenda[]; intervaloMin?: number }): Sugestao {
  const intervaloMin = p.intervaloMin ?? 45;
  const nichos = [...p.nichos].sort((a, b) => a.key.localeCompare(b.key));
  const cand = new Map(nichos.map((n) => [n.key, [...new Set(n.horas?.length ? n.horas : GRADE)].sort((a, b) => minutos(a) - minutos(b))]));
  const falta = new Map(nichos.map((n) => [n.key, Math.max(0, Math.floor(n.envios))]));
  const slots: Slot[] = [];
  const impossiveis = new Map<string, number>();
  while ([...falta.values()].some((v) => v > 0)) {
    for (const n of nichos) {
      if (!falta.get(n.key)) continue;
      falta.set(n.key, falta.get(n.key)! - 1);
      const h = cand.get(n.key)!.find((c) => slots.every((s) => dist(minutos(s.hhmm), minutos(c)) >= intervaloMin));
      if (h) slots.push({ key: n.key, hhmm: h });
      else impossiveis.set(n.key, (impossiveis.get(n.key) ?? 0) + 1);
    }
  }
  slots.sort((a, b) => minutos(a.hhmm) - minutos(b.hhmm) || a.key.localeCompare(b.key));
  return {
    slots: slots.map((s) => ({ ...s, cron: horasParaCron(s.hhmm) })),
    impossiveis: [...impossiveis].map(([key, faltam]) => ({ key, faltam })),
  };
}

export type TotalDiario = { total: number; limiteDiario?: number; excede: boolean };

/** Soma maxPerRun × execuções. Só alerta (excede), nunca bloqueia. */
export function totalDiario(nichos: Array<{ maxPerRun: number; execucoes: number }>, limiteDiario?: number): TotalDiario {
  const total = nichos.reduce((t, n) => t + n.maxPerRun * n.execucoes, 0);
  return { total, limiteDiario, excede: limiteDiario !== undefined && total > limiteDiario };
}
