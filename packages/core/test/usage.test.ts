import { describe, expect, it } from "vitest";
import { avaliar, faixa, ritmo, snapshotDeLimite, tempoRestante, Snapshot, vista } from "../src/usage.ts";

const H = 3600;
const RESET5 = 1795243200; // fixture values
const RESET7 = 1795762800;
const at = (epochS: number) => new Date(epochS * 1000);
const win = (utilization: number, resetsAt: number) => ({ utilization, resetsAt, status: "allowed" });
const snap = (): Snapshot => ({
  cincoHoras: { percentual: 14, reiniciaEm: RESET5, status: "allowed" },
  semana: { percentual: 10, reiniciaEm: RESET7, status: "allowed" },
  atualizadoEm: "2026-01-01T00:00:00.000Z",
});

describe("snapshotDeLimite", () => {
  it("converts utilization 0..1 to a rounded percentage", () => {
    const s = snapshotDeLimite({ fiveHour: win(0.146, RESET5), sevenDay: win(0.1, RESET7) }, "t");
    expect(s).toEqual({ cincoHoras: { percentual: 15, reiniciaEm: RESET5, status: "allowed" }, semana: { percentual: 10, reiniciaEm: RESET7, status: "allowed" }, atualizadoEm: "t" });
  });
  it("fails closed: a missing window means no snapshot (never a fake zero)", () => {
    expect(snapshotDeLimite({ fiveHour: win(0.5, RESET5) }, "t")).toBeUndefined();
    expect(snapshotDeLimite({}, "t")).toBeUndefined();
  });
  it("clamps out-of-range utilization", () => {
    expect(snapshotDeLimite({ fiveHour: win(1.4, RESET5), sevenDay: win(-1, RESET7) }, "t")).toMatchObject({ cincoHoras: { percentual: 100 }, semana: { percentual: 0 } });
  });
  it("rejects non-finite numbers", () => {
    expect(snapshotDeLimite({ fiveHour: win(Number.NaN, RESET5), sevenDay: win(0.1, RESET7) }, "t")).toBeUndefined();
  });
});

describe("tempoRestante", () => {
  it("returns seconds until reset, never negative", () => {
    expect(tempoRestante(RESET5, at(RESET5 - 90))).toBe(90);
    expect(tempoRestante(RESET5, at(RESET5 + 5))).toBe(0);
  });
});

describe("faixa", () => {
  it("normal up to 80, atencao above 80, critico above 90", () => {
    expect(faixa(0)).toBe("normal");
    expect(faixa(80)).toBe("normal");
    expect(faixa(81)).toBe("atencao");
    expect(faixa(90)).toBe("atencao");
    expect(faixa(91)).toBe("critico");
    expect(faixa(100)).toBe("critico");
  });
});

describe("ritmo", () => {
  it("is the elapsed fraction of the 5 h window", () => {
    expect(ritmo(snap().cincoHoras, "cincoHoras", at(RESET5 - 4 * H))).toBeCloseTo(0.2);
    expect(ritmo(snap().cincoHoras, "cincoHoras", at(RESET5 - 5 * H))).toBe(0);
  });
  it("is the elapsed fraction of the 7 day window", () => {
    expect(ritmo(snap().semana, "semana", at(RESET7 - 3.5 * 24 * H))).toBeCloseTo(0.5);
  });
  it("clamps to 0..1", () => {
    expect(ritmo(snap().cincoHoras, "cincoHoras", at(RESET5 - 9 * H))).toBe(0);
    expect(ritmo(snap().cincoHoras, "cincoHoras", at(RESET5 + 9 * H))).toBe(1);
  });
});

describe("avaliar / vista", () => {
  it("no snapshot is unavailable, never zero", () => {
    expect(avaliar(undefined, at(RESET5 - H))).toEqual({ estado: "indisponivel", motivo: "sem leitura" });
  });
  it("valid snapshot is ok", () => {
    expect(avaliar(snap(), at(RESET5 - H))).toMatchObject({ estado: "ok", cincoHoras: { percentual: 14 } });
  });
  it("drops a snapshot whose reset already passed (stale)", () => {
    expect(avaliar(snap(), at(RESET5 + 1))).toEqual({ estado: "indisponivel", motivo: "obsoleto" });
  });
  it("view adds remaining time, pace and band computed from the injected clock", () => {
    const v = vista(avaliar({ ...snap(), cincoHoras: { percentual: 85, reiniciaEm: RESET5, status: "allowed" } }, at(RESET5 - H)), at(RESET5 - H));
    expect(v).toMatchObject({ estado: "ok", cincoHoras: { percentual: 85, restanteSegundos: H, faixa: "atencao" }, semana: { faixa: "normal" } });
    expect((v as any).cincoHoras.ritmo).toBeCloseTo(0.8);
  });
  it("view of unavailable passes through", () => {
    expect(vista({ estado: "indisponivel", motivo: "x" }, at(0))).toEqual({ estado: "indisponivel", motivo: "x" });
  });
  it("schema rejects out-of-range percentages", () => {
    expect(Snapshot.safeParse({ ...snap(), semana: { ...snap().semana, percentual: 101 } }).success).toBe(false);
  });
});
