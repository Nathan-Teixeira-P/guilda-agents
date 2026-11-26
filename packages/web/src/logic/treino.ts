import { andar, type Lugar } from "./fortaleza.ts";

// Training choreography shared by the 2D and 3D hideout, in plan units (800x480). Pure: time and step are injected.
export type Gesto = "arremessa" | "sobe" | "abre" | "descanso" | "anda" | "guarda" | "ataca" | "defende" | "mira" | "solta" | "arranca";
export type Arma = "faca" | "espada" | "arco" | "flecha" | "nada";
/** `alt` = height above the floor, `giro` = body rotation in degrees, `oculto` = buried in the hay. */
export interface Pose { x: number; y: number; face: 1 | -1; gesto: Gesto; k: number; arma: Arma; dist: number; alt?: number; giro?: number; oculto?: boolean }
/** An arrow or knife; `dy` spreads the ones stuck in the same target. */
export interface Flecha { x: number; y: number; visivel: boolean; voando: boolean; dy?: number }
export interface Quadro { poses: Record<string, Pose>; flechas: Flecha[]; faiscas: { x: number; y: number }[] }

export const RAIAS = [383, 450] as const;
export const ARQUEIRO_X = 540, ALVO_X = 750;
export const BONECOS = [416, 476] as const;
const CICLO_ARCO = 11_000, TIRO = 1800, CICLO_FACA = 7600, ARREMESSO = 1300, ESPALHA = [-6, 1, 7], CICLO_ESPADA = 2400, CICLO_SALTO = 11_000;
export const FENO_X = 96, TORRE_X = 146, SALTO_Y = 318, TORRE_ALT = 58;
export const ESCALADA_X = [696, 718, 740] as const; // three holds on the climbing tower, across the hall
export const CORDA_X = 666, FACA_X = 365, VITIMA_X = 478;

type Posto = { tipo: "duelo"; x: number; y: number; face: 1 | -1; par: number } | { tipo: "arco"; raia: number } | { tipo: "faca" } | { tipo: "salto"; vez: number } | { tipo: "escalada"; vez: number } | { tipo: "boneco" | "forma"; x: number; y: number };
/** Stations in the order they are filled: archers first, then sword pairs, dummies and solo forms. */
export const POSTOS: readonly Posto[] = [
  { tipo: "arco", raia: 0 }, { tipo: "arco", raia: 1 }, { tipo: "salto", vez: 0 }, { tipo: "salto", vez: 1 },
  ...ESCALADA_X.map((_, vez): Posto => ({ tipo: "escalada", vez })),
  ...RAIAS.flatMap((y, l) => [62, 172, 282].flatMap((x, i): Posto[] => [{ tipo: "duelo", x, y, face: 1, par: l * 3 + i }, { tipo: "duelo", x: x + 40, y, face: -1, par: l * 3 + i }])),
  { tipo: "boneco", x: BONECOS[0] - 26, y: RAIAS[0] }, { tipo: "boneco", x: BONECOS[1] - 26, y: RAIAS[0] },
  { tipo: "faca" }, { tipo: "forma", x: 505, y: RAIAS[1] },
];

const trecho = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** Three shots from `de` into a target at `fincada`: who is stuck, who is flying. `t` = time since the first draw. */
function salva(t: number, tiro: number, solta: number, de: number, fincada: number, y: number): Flecha[] {
  return [0, 1, 2].map((n) => {
    const voo = trecho(t - n * tiro, solta, solta + 320);
    return { x: de + (fincada - de) * voo, y, dy: ESPALHA[n]!, visivel: voo > 0, voando: voo > 0 && voo < 1 };
  });
}
/** All three stuck, then taken out one by one as `k` goes from 0 to 1. */
const retiradas = (fincada: number, y: number, k: number): Flecha[] => [0, 1, 2].map((n) => ({ x: fincada, y, dy: ESPALHA[n]!, visivel: k < (n + 1) / 3, voando: false }));

/** One archer's cycle: three arrows into the target, walk there, pull them out, walk back. */
export function arqueiro(t: number, raia: number): { pose: Omit<Pose, "dist">; flechas: Flecha[] } {
  const y = RAIAS[raia]!, c = (((t + raia * CICLO_ARCO / 2) % CICLO_ARCO) + CICLO_ARCO) % CICLO_ARCO;
  const perto = ALVO_X - 26, fincada = ALVO_X - 6;
  const p = (x: number, face: 1 | -1, gesto: Gesto, k: number, arma: Arma) => ({ x, y, face, gesto, k, arma });
  if (c < 3 * TIRO) {
    const s = c % TIRO;
    const pose = s < 1200 ? p(ARQUEIRO_X, 1, "mira", trecho(s, 0, 1000), "arco") : s < 1550 ? p(ARQUEIRO_X, 1, "solta", trecho(s, 1200, 1550), "arco") : p(ARQUEIRO_X, 1, "descanso", 0, "arco");
    return { pose, flechas: salva(c, TIRO, 1200, ARQUEIRO_X + 14, fincada, y) };
  }
  const todas = retiradas(fincada, y, 0), nada = retiradas(fincada, y, 1);
  if (c < 7300) return { pose: p(ARQUEIRO_X + (perto - ARQUEIRO_X) * trecho(c, 5500, 7300), 1, "anda", 0, "arco"), flechas: todas };
  if (c < 8200) return { pose: p(perto, 1, "arranca", ((c - 7300) % 300) / 300, "arco"), flechas: retiradas(fincada, y, trecho(c, 7300, 8200)) };
  if (c < 10_300) return { pose: p(perto + (ARQUEIRO_X - perto) * trecho(c, 8200, 10_300), -1, "anda", 0, "flecha"), flechas: nada };
  return { pose: p(ARQUEIRO_X, 1, "descanso", 0, "arco"), flechas: nada };
}

/** Leap of faith, one jumper at a time: climb the tower, open the arms, dive into the hay, climb out, walk back. */
export function saltador(t: number, vez: number): Omit<Pose, "dist"> {
  const c = (((t + (1 - vez) * CICLO_SALTO / 2) % CICLO_SALTO) + CICLO_SALTO) % CICLO_SALTO;
  const espera = TORRE_X + 24 + vez * 18;
  const p = (x: number, gesto: Gesto, k = 0, extra: Partial<Pose> = {}, face: 1 | -1 = -1) => ({ x, y: SALTO_Y, face, gesto, k, arma: "nada" as const, ...extra });
  if (c < 600) return p(espera + (TORRE_X - espera) * trecho(c, 0, 600), "anda");
  if (c < 2400) return p(TORRE_X, "sobe", trecho(c, 600, 2400), { alt: TORRE_ALT * trecho(c, 600, 2400) });
  if (c < 3300) return p(TORRE_X, "abre", 0, { alt: TORRE_ALT });
  if (c < 4100) { const k = trecho(c, 3300, 4100); return p(TORRE_X + (FENO_X - TORRE_X) * k, "abre", k, { alt: TORRE_ALT * (1 - k * k) + 22 * Math.sin(Math.PI * k) * (1 - k) + 6 * k, giro: -170 * k }); }
  if (c < 4900) return p(FENO_X, "descanso", 0, { oculto: true });
  if (c < 5900) return p(FENO_X + (espera - FENO_X) * trecho(c, 4900, 5900), "anda", 0, {}, 1);
  return p(espera, "descanso");
}

/** Climbing drill. The middle one uses the holds of the wall; the other two take turns on the rope: up hand over hand, hold, slide down, step aside. */
export function escalador(t: number, vez: number): Omit<Pose, "dist"> {
  const corda = vez !== 1, ciclo = corda ? 10_000 : 8000;
  const c = (((t + (vez === 2 ? ciclo / 2 : 0)) % ciclo) + ciclo) % ciclo;
  const alto = c < 400 ? 0 : c < 2800 ? trecho(c, 400, 2800) : c < 3400 ? 1 : 1 - trecho(c, 3400, 4600);
  const noChao = alto === 0;
  // whoever is waiting for the rope stands clear of it
  const x = !corda ? ESCALADA_X[1] : noChao && (c < 150 || c > 4800) ? CORDA_X - 20 - vez * 9 : CORDA_X;
  return { x, y: SALTO_Y, face: 1, gesto: noChao ? "descanso" : "sobe", k: alto, arma: "nada", alt: TORRE_ALT * alto };
}

/** Knife thrower: three knives into the straw man, walk there, pull them out, walk back. */
export function arremesso(t: number): { pose: Omit<Pose, "dist">; facas: Flecha[] } {
  const c = ((t % CICLO_FACA) + CICLO_FACA) % CICLO_FACA, y = RAIAS[1], fincada = VITIMA_X - 8, perto = VITIMA_X - 28;
  const p = (x: number, face: 1 | -1, gesto: Gesto, k: number, arma: Arma) => ({ x, y, face, gesto, k, arma });
  if (c < 3 * ARREMESSO) {
    const s = c % ARREMESSO;
    const pose = s < 800 ? p(FACA_X, 1, "arremessa", trecho(s, 0, 800), "faca") : p(FACA_X, 1, s < 1100 ? "arremessa" : "descanso", s < 1100 ? 1 : 0, "nada");
    return { pose, facas: salva(c, ARREMESSO, 800, FACA_X + 14, fincada, y) };
  }
  if (c < 5100) return { pose: p(FACA_X + (perto - FACA_X) * trecho(c, 3900, 5100), 1, "anda", 0, "nada"), facas: retiradas(fincada, y, 0) };
  if (c < 6000) return { pose: p(perto, 1, "arranca", ((c - 5100) % 300) / 300, "nada"), facas: retiradas(fincada, y, trecho(c, 5100, 6000)) };
  if (c < 7200) return { pose: p(perto + (FACA_X - perto) * trecho(c, 6000, 7200), -1, "anda", 0, "faca"), facas: retiradas(fincada, y, 1) };
  return { pose: p(FACA_X, 1, "descanso", 0, "faca"), facas: retiradas(fincada, y, 1) };
}

/** Sword pair: they trade attacks; `face` 1 strikes in the first half. `choque` marks the moment the blades meet. */
export function duelo(t: number, face: 1 | -1, par: number): { gesto: Gesto; k: number; avanco: number; choque: boolean } {
  const c = (t + par * 370) % CICLO_ESPADA, meio = CICLO_ESPADA / 2;
  const vez: 1 | -1 = c < meio ? 1 : -1, f = c % meio;
  if (f > 600) return { gesto: "guarda", k: 0, avanco: 0, choque: false };
  const k = f / 600, onda = Math.sin(k * Math.PI);
  return { gesto: vez === face ? "ataca" : "defende", k, avanco: (vez === face ? 8 : -3) * onda * face, choque: k > 0.45 && k < 0.65 };
}

/** Arm angles in degrees (0 down, 90 forward, 180 up) and leg swing, for either renderer. */
export function bracos(p: Pick<Pose, "gesto" | "k" | "dist">): { frente: number; tras: number; perna: number } {
  const onda = Math.sin(p.k * Math.PI);
  switch (p.gesto) {
    case "anda": { const s = Math.sin(p.dist / 6); return { frente: s * 30, tras: -s * 30, perna: s }; }
    case "sobe": { const s = Math.sin(p.k * 14); return { frente: 150 + s * 25, tras: 150 - s * 25, perna: s * 0.6 }; }
    case "arremessa": return { frente: p.k < 0.75 ? 90 + 120 * (p.k / 0.75) : 210 - 140 * ((p.k - 0.75) / 0.25), tras: 55, perna: 0.5 };
    case "abre": return { frente: 100, tras: -100, perna: 0 };
    case "ataca": return { frente: 160 - 110 * p.k, tras: 20, perna: 0.8 * onda };
    case "defende": return { frente: 90 + 35 * onda, tras: 40, perna: -0.5 * onda };
    case "guarda": return { frente: 60, tras: 15, perna: 0.35 };
    case "mira": return { frente: 90, tras: 90 - 55 * p.k, perna: 0.5 };
    case "solta": return { frente: 90, tras: 10, perna: 0.5 };
    case "arranca": return { frente: 95 - 50 * onda, tras: 5, perna: 0.2 };
    default: return { frente: 8, tras: -8, perna: 0 };
  }
}

/** Keeps where everyone is: idle members train, called ones walk through the gate to their room. */
export function criarTreino() {
  const atual: Record<string, { x: number; y: number; dist: number; face: 1 | -1 }> = {};
  /** `calmo`: no motion, everyone already at the station. */
  return function quadro(t: number, ms: number, lugar: Record<string, Lugar>, ordem: readonly string[], calmo = false): Quadro {
    const poses: Record<string, Pose> = {}, flechas: Flecha[] = [], faiscas: { x: number; y: number }[] = [];
    let vaga = 0;
    for (const id of ordem) {
      const destino = lugar[id]!;
      const parado = !destino.projeto && id !== "orchestrator";
      const posto = parado ? POSTOS[vaga++ % POSTOS.length]! : undefined;
      let alvo: Omit<Pose, "dist"> = { x: destino.x, y: destino.y, face: 1, gesto: "descanso", k: 0, arma: "nada" };
      let projeteis: Flecha[] | undefined;
      if (posto?.tipo === "salto") alvo = saltador(calmo ? 8000 : t, posto.vez);
      else if (posto?.tipo === "escalada") alvo = escalador(calmo ? 0 : t, posto.vez);
      else if (posto?.tipo === "faca") { const f = arremesso(calmo ? 0 : t); alvo = f.pose; projeteis = f.facas; }
      else if (posto?.tipo === "arco") { const a = arqueiro(calmo ? 0 : t, posto.raia); alvo = a.pose; projeteis = a.flechas; }
      else if (posto?.tipo === "duelo") { const d = duelo(calmo ? 700 : t, posto.face, posto.par); alvo = { x: posto.x + d.avanco, y: posto.y, face: posto.face, gesto: d.gesto, k: d.k, arma: "espada" }; if (d.choque && posto.face === 1) faiscas.push({ x: posto.x + 20, y: posto.y - 39 }); }
      else if (posto) { const d = duelo(calmo ? 700 : t, 1, vaga); alvo = { x: posto.x, y: posto.y, face: 1, gesto: d.gesto, k: d.k, arma: "espada" }; if (d.choque && posto.tipo === "boneco" && d.gesto === "ataca") faiscas.push({ x: posto.x + 22, y: posto.y - 34 }); }
      const a = (atual[id] ??= { x: alvo.x, y: alvo.y, dist: 0, face: alvo.face });
      const antes = { x: a.x, y: a.y };
      const longe = !calmo && Math.hypot(alvo.x - a.x, alvo.y - a.y) > 14;
      if (longe) andar(a, alvo, ms); else { a.x = alvo.x; a.y = alvo.y; }
      const passo = Math.hypot(a.x - antes.x, a.y - antes.y);
      a.dist += passo;
      if (longe && Math.abs(a.x - antes.x) > 0.2) a.face = a.x > antes.x ? 1 : -1; else if (!longe) a.face = alvo.face;
      poses[id] = { x: a.x, y: a.y, face: a.face, gesto: longe ? "anda" : alvo.gesto, k: alvo.k, arma: longe ? "nada" : alvo.arma, dist: a.dist, ...(longe ? {} : { alt: alvo.alt ?? 0, giro: alvo.giro ?? 0, oculto: !!alvo.oculto }) };
      // the arrow only shows while its archer is really in the lane
      // three slots per station: 0-2 and 3-5 are the archers' arrows, 6-8 the knives
      const qual = posto?.tipo === "arco" ? posto.raia : posto?.tipo === "faca" ? 2 : undefined;
      if (qual !== undefined) for (let n = 0; n < 3; n++) flechas[qual * 3 + n] = projeteis && !longe ? projeteis[n]! : { x: 0, y: 0, visivel: false, voando: false };
    }
    return { poses, flechas, faiscas };
  };
}
