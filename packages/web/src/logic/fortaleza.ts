import { ROSTER } from "../roster.ts";
import type { Atividade } from "./escritorio.ts";

// The 2D hideout (viewbox 800x480): project rooms on top, the gatehouse with the Regente in the middle, the training hall below. Pure.
export interface SalaProjeto { nome: string; x: number; y: number; w: number; h: number }
export interface Lugar { x: number; y: number; projeto?: string }
export const PORTARIA = { x: 16, y: 182, w: 768, h: 68 } as const;
export const REGENTE_X = 522; // beside the gate, never on the way through it
export const TREINO = { x: 16, y: 256, w: 768, h: 208 } as const;

export function posicionar(atividade: Record<string, Atividade | undefined>): { salas: SalaProjeto[]; lugar: Record<string, Lugar> } {
  const porProjeto = new Map<string, string[]>();
  const parados: string[] = [];
  for (const { tecnico } of ROSTER) {
    const a = atividade[tecnico];
    const ativo = a?.ativo && a.projeto ? a.projeto : undefined;
    // the Regente never leaves the gate, but its contract still gets a room
    if (ativo) porProjeto.set(ativo, [...(porProjeto.get(ativo) ?? []), ...(tecnico === "orchestrator" ? [] : [tecnico])]);
    if (!ativo && tecnico !== "orchestrator") parados.push(tecnico);
  }
  const w = (768 - 8 * (porProjeto.size - 1)) / Math.max(1, porProjeto.size);
  const lugar: Record<string, Lugar> = {};
  const salas = [...porProjeto].map(([nome, agentes], i): SalaProjeto => {
    const sala = { nome, x: 16 + i * (w + 8), y: 16, w, h: 160 };
    const cols = Math.max(1, Math.min(agentes.length, Math.floor(w / 64)));
    const linhas = Math.ceil(agentes.length / cols);
    agentes.forEach((t, k) => { lugar[t] = { x: sala.x + (w / cols) * ((k % cols) + 0.5), y: sala.y + (linhas === 1 ? 120 : 94 + Math.floor(k / cols) * (50 / (linhas - 1))), projeto: nome }; });
    return sala;
  });
  const porLinha = 12;
  parados.forEach((t, k) => { lugar[t] = { x: TREINO.x + (TREINO.w / porLinha) * ((k % porLinha) + 0.5), y: TREINO.y + 122 + Math.floor(k / porLinha) * 52 }; });
  const regente = atividade["orchestrator"];
  lugar["orchestrator"] = { x: REGENTE_X, y: PORTARIA.y + 57, ...(regente?.ativo && regente.projeto ? { projeto: regente.projeto } : {}) };
  return { salas, lugar };
}

const PASSAGEM = { x: 400, y: PORTARIA.y + 34 };
const VELOCIDADE = 110; // plan units per second

/** One step towards `destino`; whoever goes between training and a contract passes through the gate. True while still walking. */
export function andar(a: { x: number; y: number }, destino: { x: number; y: number }, ms: number): boolean {
  let resta = (VELOCIDADE * Math.min(ms, 100)) / 1000;
  while (resta > 0) {
    const alvo = (a.y - PASSAGEM.y) * (destino.y - PASSAGEM.y) < 0 ? PASSAGEM : destino;
    const d = Math.hypot(alvo.x - a.x, alvo.y - a.y);
    if (d <= resta) {
      a.x = alvo.x; a.y = alvo.y; resta -= d;
      if (alvo === destino) return false;
    } else {
      a.x += ((alvo.x - a.x) / d) * resta; a.y += ((alvo.y - a.y) / d) * resta; resta = 0;
    }
  }
  return true;
}
