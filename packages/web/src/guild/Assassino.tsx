import type { ReactNode } from "react";
import { corDe, membro } from "../roster.ts";
import { bracos, type Pose } from "../logic/treino.ts";
import { INSIGNIA } from "./Avatar.tsx";

const MANTO = "#ece6da", SOMBRA = "#b9ae9b", DOBRA = "#d3cabb", COURO = "#5a3a26", COURO_L = "#83583a", FAIXA = "#9e1b24", FAIXA_E = "#6e1119", METAL = "#c9a463", ACO = "#d8dde4", TRACO = "#2a1d1b";
/** Skin, hair and eye tones vary by member, so faces differ. */
const PELES = ["#e3b58f", "#c99a74", "#a9744f", "#8a5a3b", "#d8a883"], CABELOS = ["#2b1b14", "#4a2e1c", "#7a4a24", "#16100e", "#8d6a3f"];
const indice = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A member of the brotherhood in human proportions, feet at (0,0), facing right: face with eyes, nose and beard under the hood, layered coat with red lining,
 *  half cape, pauldron, belts, bracers with the hidden blade, tall boots. Drawn once; `posar` moves it. */
export function Assassino({ agente }: { agente: string }) {
  const g = membro(agente).grupo, cor = corDe(agente), n = indice(agente);
  const pele = PELES[n % PELES.length]!, cabelo = CABELOS[(n >> 3) % CABELOS.length]!, barba = n % 3;
  const perna = (classe: string, x: number, calca: string) => (
    <g className={classe}>
      {/* thigh, knee and calf */}
      <path d={`M${x - 0.6} -25h5.2l-.7 11.5l.2 8h-3.6l-.2 -8z`} fill={calca} stroke={TRACO} strokeWidth=".35" />
      <path d={`M${x + 0.2} -10.5h4.4l-.5 8.4l3 .9v1.9h-7z`} fill={COURO} stroke={TRACO} strokeWidth=".5" />
      <path d={`M${x - 0.2} -11.6h5.1v2.1h-5.1z`} fill={COURO_L} />
      <path d={`M${x + 0.4} -6.4h3.8`} stroke={METAL} strokeWidth=".6" />
    </g>
  );
  const braco = (classe: string, manga: string, arma?: ReactNode) => (
    <g className={classe}>
      {/* upper arm, elbow, bracer and hand with fingers */}
      <path d="M-2.7 -.6Q0 -2.6 2.7 -.6L2 8.6H-2z" fill={manga} stroke={TRACO} strokeWidth=".4" />
      <path d="M-2.1 8h4.2l-.6 7.2h-3z" fill={COURO} stroke={TRACO} strokeWidth=".4" />
      <path d="M-1.9 9.6h3.9M-1.6 12.6h3.3" stroke={METAL} strokeWidth=".5" />
      <path d="M1.9 10l.5 9l-1 -1.4l-.3 -7.4z" fill={ACO} />
      <path d="M-1.5 15.2h3l.3 2.4q-.2 1.8 -1.7 1.8q-1.6 0 -1.8 -1.8z" fill={pele} stroke={TRACO} strokeWidth=".35" />
      <path d="M1.5 15.8l1.2 1.4" stroke={pele} strokeWidth="1" strokeLinecap="round" />
      {arma}
    </g>
  );
  return (
    <g className="vira" aria-hidden="true">
      <path d="M-4 -42Q-11 -37 -11.5 -24L-13.5 -9L-9 -14L-7.5 -7L-4.5 -22Z" fill={FAIXA_E} stroke={TRACO} strokeWidth=".5" />
      {perna("perna-t", -4.6, "#2c2326")}
      {perna("perna-f", 0.4, "#3a2f32")}
      <g transform="translate(-4.6 -39)">{braco("braco-t", SOMBRA)}</g>
      {/* coat tails */}
      <path d="M-5.5 -27H5.5L8.5 -12L4 -15L2.5 -9L0 -20L-3 -10L-5 -15L-8.5 -12Z" fill={FAIXA} stroke={TRACO} strokeWidth=".45" />
      <path d="M-5.5 -27H-.8L-2.6 -13L-4.6 -17L-7.4 -14Z" fill={DOBRA} stroke={TRACO} strokeWidth=".4" />
      <path d="M.8 -27H5.5L7.4 -14L4.4 -17L3 -12Z" fill={MANTO} stroke={TRACO} strokeWidth=".4" />
      {/* torso: broad shoulders, narrow waist */}
      <path d="M-6.8 -40.5Q-5 -43 0 -43Q5 -43 6.8 -40.5L5 -33L5 -26H-5L-5 -33Z" fill={MANTO} stroke={TRACO} strokeWidth=".55" />
      <path d="M-6.8 -40.5L-5 -33V-26H-3Q-2 -34 -3 -42Z" fill={SOMBRA} opacity=".7" />
      <path d="M.2 -41V-27M1.6 -39.5L3.8 -36L1.6 -32" stroke={SOMBRA} strokeWidth=".6" fill="none" />
      <path d="M-6 -40.5L5 -28" stroke={COURO} strokeWidth="2" />
      <path d="M-6 -40.5L5 -28" stroke={COURO_L} strokeWidth=".55" />
      <rect x="-2.2" y="-36.4" width="2.8" height="2.8" rx=".5" fill="none" stroke={METAL} strokeWidth=".75" />
      {/* sash, belt, buckle, pouch and hanging cloth */}
      <rect x="-5.6" y="-29.4" width="11.2" height="4.4" fill={FAIXA} stroke={TRACO} strokeWidth=".4" />
      <rect x="-5.6" y="-28" width="11.2" height="1.7" fill={COURO} />
      <circle cy="-27.1" r="1.9" fill={METAL} stroke={TRACO} strokeWidth=".45" />
      <path d="M0 -28.2l.9 1.5h-1.8z" fill={TRACO} />
      <rect x="3.2" y="-26.4" width="3.2" height="3.8" rx="1" fill={COURO_L} stroke={TRACO} strokeWidth=".35" />
      <path d="M-2.2 -25.2H-.8L1.4 -14L-1 -16.4L-3 -13.4Z" fill={FAIXA} stroke={TRACO} strokeWidth=".35" />
      {INSIGNIA[g.id] && <path d={INSIGNIA[g.id]} fill={cor} stroke={TRACO} strokeWidth="1" transform="translate(1 -40) scale(.34)" />}
      {/* neck and head */}
      <path d="M-1.6 -45h3.8v3h-3.8z" fill={pele} />
      <path d="M-3.2 -50.5Q-3 -55 1.4 -55Q5 -54.6 5 -50.8L5.9 -48.6L5 -48.2Q5 -44.4 1.8 -43.9Q-2.4 -44.2 -3.2 -50.5Z" fill={pele} stroke={TRACO} strokeWidth=".35" />
      {barba > 0 && <path d={barba === 1 ? "M0 -47.4Q2 -46 5 -47.4Q4.6 -44.2 2 -43.9Q-.4 -44.4 -1.4 -48z" : "M.6 -46.6q2 .8 3.6 0l-.8 2.2h-2z"} fill={cabelo} opacity=".92" />}
      <path d="M1.8 -50.4h2.2" stroke={cabelo} strokeWidth=".7" />
      <ellipse cx="3.1" cy="-49.4" rx=".75" ry=".55" fill="#fff" />
      <circle cx="3.35" cy="-49.4" r=".45" fill="#231512" />
      <path d="M2.8 -46.4h1.8" stroke="#7a3b32" strokeWidth=".6" />
      {/* the hood shades the brow; its beak points over the face; trim in the member's colour */}
      <path d="M-3 -52.4Q1 -53 5 -51.6L4.8 -50.4Q1 -51.6 -2.6 -50.6z" fill="#1b1012" opacity=".5" />
      <path d="M-5.6 -41.6Q-8.6 -52 -3 -56Q2.6 -59.4 6.2 -54.4L8.2 -50.4L5.2 -51.6Q3.4 -54.2 .4 -53.2Q-2.4 -51 -1.8 -46.4Q-1.4 -43.6 .4 -42Z" fill={MANTO} stroke={TRACO} strokeWidth=".6" />
      <path d="M-5.6 -41.6Q-8.6 -52 -3 -56Q-5 -49 -3 -42z" fill={SOMBRA} />
      <path d="M-1.8 -46.4Q-2.4 -51 .4 -53.2Q3.4 -54.2 5.2 -51.6L8.2 -50.4" stroke={cor} strokeWidth=".9" fill="none" />
      <path d="M-5.6 -41.6Q0 -39.4 5.4 -41.4" stroke={FAIXA} strokeWidth="1.2" fill="none" />
      {/* near arm with the pauldron and the sword */}
      <g transform="translate(3.6 -39)">
        {braco("braco-f", MANTO, <><path className="arma-faca" display="none" d="M-.8 18h1.6l-.3 8l-.5 1.6l-.5 -1.6z M-2 17.4h4v1h-4z" fill={ACO} stroke="#5b616b" strokeWidth=".35" /><g className="arma-espada" display="none"><g transform="translate(0 17.2)"><path d="M-.9 1.4h1.8v16l-.9 3l-.9 -3z" fill={ACO} stroke="#5b616b" strokeWidth=".4" /><path d="M0 3v13" stroke="#8b929c" strokeWidth=".35" /><path d="M-3.6 0Q0 2.4 3.6 0V1.6Q0 3.6 -3.6 1.6Z" fill={METAL} stroke={TRACO} strokeWidth=".3" /><circle cy="-2.4" r="1" fill={METAL} /></g></g></>)}
        <path d="M-3.6 1Q-3.2 -3.6 .8 -3Q4 -2.2 3.2 2Q0 .4 -3.6 1Z" fill={COURO} stroke={METAL} strokeWidth=".7" />
        <circle cx="-.2" cy="-1" r=".7" fill={METAL} />
      </g>
      <g className="arma-arco" display="none" transform="translate(21 -39)"><path d="M-2 -17Q3 -16 6 -9Q9 -3 7 0Q9 3 6 9Q3 16 -2 17" stroke={COURO} strokeWidth="1.9" fill="none" /><path d="M6.6 -2.6v5.2" stroke={FAIXA} strokeWidth="2.5" /><path className="corda" d="M-2 -17L-2 0L-2 17" stroke="#e8e4c8" strokeWidth=".6" fill="none" /><path className="encaixada" display="none" d="M-8 0H12M12 0l-4 -2.4M12 0l-4 2.4M-8 0l-2.6 -2.4M-8 0l-2.6 2.4" stroke="#d8c9a6" strokeWidth="1" fill="none" /></g>
      <path className="arma-flecha" display="none" d="M2 -26L21 -15M21 -15l-5 0M21 -15l-1 -5" stroke="#d8c9a6" strokeWidth="1.1" fill="none" />
    </g>
  );
}

export interface Partes { raiz: SVGGElement; vira: SVGGElement; bf: SVGGElement; bt: SVGGElement; pf: SVGGElement; pt: SVGGElement; espada: SVGGElement; arco: SVGGElement; corda: SVGPathElement; encaixada: SVGPathElement; flecha: SVGPathElement; faca: SVGPathElement }
export const partesDe = (raiz: SVGGElement): Partes => {
  const q = <T extends Element>(s: string) => raiz.querySelector(s) as unknown as T;
  return { raiz, vira: q(".vira"), bf: q(".braco-f"), bt: q(".braco-t"), pf: q(".perna-f"), pt: q(".perna-t"), espada: q(".arma-espada"), arco: q(".arma-arco"), corda: q(".corda"), encaixada: q(".encaixada"), flecha: q(".arma-flecha"), faca: q(".arma-faca") };
};

/** Applies a pose straight to the DOM (called every frame: no React render). */
export function posar(el: Partes, p: Pose) {
  const b = bracos(p);
  el.raiz.setAttribute("transform", `translate(${p.x.toFixed(1)} ${(p.y - (p.alt ?? 0)).toFixed(1)})`);
  el.raiz.style.opacity = p.oculto ? "0" : "";
  el.vira.setAttribute("transform", `rotate(${(p.giro ?? 0).toFixed(0)} 0 -28) scale(${p.face} 1)`);
  el.bf.setAttribute("transform", `rotate(${(-b.frente).toFixed(1)})`);
  el.bt.setAttribute("transform", `rotate(${(-b.tras).toFixed(1)})`);
  el.pf.setAttribute("transform", `translate(${(b.perna * 3.5).toFixed(1)} ${(-Math.max(0, b.perna) * 1.5).toFixed(1)})`);
  el.pt.setAttribute("transform", `translate(${(-b.perna * 3).toFixed(1)} ${(-Math.max(0, -b.perna) * 1.5).toFixed(1)})`);
  el.faca.setAttribute("display", p.arma === "faca" ? "inline" : "none");
  el.espada.setAttribute("display", p.arma === "espada" ? "inline" : "none");
  el.arco.setAttribute("display", p.arma === "arco" ? "inline" : "none");
  el.flecha.setAttribute("display", p.arma === "flecha" ? "inline" : "none");
  const puxa = p.gesto === "mira" ? p.k * 9 : 0;
  el.corda.setAttribute("d", `M-2 -17L${-2 - puxa} 0L-2 17`);
  el.encaixada.setAttribute("display", p.gesto === "mira" ? "inline" : "none");
  el.encaixada.setAttribute("transform", `translate(${-puxa + 4} 0)`);
}
