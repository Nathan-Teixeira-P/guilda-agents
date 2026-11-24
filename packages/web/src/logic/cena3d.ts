import { VIEW } from "./escritorio.ts";

// Pure helpers of the 3D hall: coordinate mapping, gauge arcs, countdown text and the 2D/3D decision. No three.js here (stays in the main bundle).

/** World units per viewbox unit: the 800x480 plan becomes a 40x24 floor centred on the origin (x east, z south, y up). */
export const ESCALA = 0.05;
export const paraMundo = (x: number, y: number) => ({ x: (x - VIEW.w / 2) * ESCALA, z: (y - VIEW.h / 2) * ESCALA });
export const dePlanta = (x: number, z: number) => ({ x: x / ESCALA + VIEW.w / 2, y: z / ESCALA + VIEW.h / 2 });

/** Torus arc for a utilization percent: fills clockwise from 12 o'clock. `rotacao` is the mesh rotation.z (arcs grow counter-clockwise from +x). */
export function arcoUso(percentual: number) {
  const p = Math.min(100, Math.max(0, Number.isFinite(percentual) ? percentual : 0));
  const arco = (p / 100) * Math.PI * 2;
  return { arco, rotacao: Math.PI / 2 - arco };
}
/** Angle (from +x, counter-clockwise) of the pace marker at elapsed fraction f of the window, also clockwise from 12 o'clock. */
export const anguloRitmo = (f: number) => Math.PI / 2 - Math.min(1, Math.max(0, f)) * Math.PI * 2;

/** Ticking countdown to a reset (epoch seconds): seconds resolution below a day. */
export function contagem(reiniciaEm: number, now: number): string {
  const s = Math.floor((reiniciaEm * 1000 - now) / 1000);
  if (s <= 0) return "reiniciando";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h ${dois(m)}min`;
  if (h > 0) return `${h}h ${dois(m)}min ${dois(x)}s`;
  if (m > 0) return `${m}min ${dois(x)}s`;
  return `${x}s`;
}

export type Vista = "2d" | "3d";
export const lerVista = (v: string | null | undefined): Vista | undefined => (v === "2d" || v === "3d" ? v : undefined);
/** Which renderer to show. 3D is the default when WebGL works; a failure (context lost, init error) forces 2D with a short notice. */
export function escolherVista(o: { preferida: Vista | undefined; webgl: boolean; falha?: string | undefined }): { vista: Vista; aviso?: string } {
  if (o.falha) return { vista: "2d", aviso: `Vista 3D indisponível (${o.falha}). Mostrando a vista 2D.` };
  if (!o.webgl) return { vista: "2d", aviso: "Este navegador não oferece WebGL. Mostrando a vista 2D." };
  return { vista: o.preferida ?? "3d" };
}
