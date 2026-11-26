import type { CSSProperties } from "react";
import { PORTARIA, posicionar, TREINO } from "../logic/fortaleza.ts";
import { ALVO_X, BONECOS, CORDA_X, VITIMA_X, ESCALADA_X, FENO_X, RAIAS, SALTO_Y, TORRE_ALT, TORRE_X } from "../logic/treino.ts";

const EMBLEMA = `${import.meta.env.BASE_URL}emblem-ntp.png`;
const pedra = (pct: number) => `color-mix(in srgb, var(--bronze) ${pct}%, var(--noite-0))`;
const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Tocha({ x, y, i }: { x: number; y: number; i: number }) {
  const s = { animationDelay: `${-(i * 0.37) % 1.6}s` } as CSSProperties;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="halo" r="30" cy="-4" fill="url(#halo)" style={s} />
      <rect x="-1.5" y="0" width="3" height="9" fill="var(--bronze)" />
      <path className="chama" d="M0 -9Q4 -4 3 0Q0 2 -3 0Q-4 -4 0 -9Z" fill="var(--ambar)" style={s} />
    </g>
  );
}

/** Red war banner with the guild emblem. */
const Estandarte = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M-12 0H12V44L0 36L-12 44Z" fill="var(--sangue)" opacity=".75" stroke="var(--bronze)" />
    <image href={EMBLEMA} x="-8" y="8" width="16" height="20" />
  </g>
);

const Barril = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}><path d="M-9 0Q-13 -11 -9 -22H9Q13 -11 9 0Z" fill={pedra(62)} /><path d="M-10.5 -6H10.5M-10.5 -16H10.5" stroke="var(--aco)" strokeWidth="1.6" /><ellipse cy="-22" rx="9" ry="2.6" fill={pedra(80)} /></g>
);
const Caixote = ({ x, y, l = 20 }: { x: number; y: number; l?: number }) => (
  <g transform={`translate(${x - l / 2} ${y - l})`}><rect width={l} height={l} fill={pedra(55)} stroke={pedra(85)} strokeWidth="2" /><path d={`M0 0L${l} ${l}M${l} 0L0 ${l}`} stroke={pedra(85)} strokeWidth="1.4" /></g>
);
const Braseiro = ({ x, y, i }: { x: number; y: number; i: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M-8 0L-3 -16M8 0L3 -16M0 0V-16" stroke="var(--aco)" strokeWidth="2" />
    <circle className="halo" r="30" cy="-26" fill="url(#halo)" style={{ animationDelay: `${-i * 0.5}s` }} />
    <path className="chama" d="M0 -38Q9 -28 6 -20Q0 -17 -6 -20Q-9 -28 0 -38Z" fill="var(--ambar)" style={{ animationDelay: `${-i * 0.3}s` }} />
    <path d="M-11 -20H11L7 -13H-7Z" fill={pedra(75)} />
  </g>
);
const LOMBOS = ["#7f9bb5", "var(--sangue)", "var(--verdete)", "var(--ambar)", "#a77bb0"];
/** Library shelf with scrolls and books. */
const Estante = ({ x, y, w = 56 }: { x: number; y: number; w?: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width={w} height="60" fill="var(--noite-1)" stroke={pedra(80)} strokeWidth="3" />
    {[0, 1, 2].map((p) => <g key={p}><path d={`M0 ${19 + p * 20}H${w}`} stroke={pedra(80)} strokeWidth="2" />{Array.from({ length: Math.floor((w - 6) / 6) }, (_, k) => <rect key={k} x={4 + k * 6} y={5 + p * 20 + ((k + p) % 3)} width="4" height={13 - ((k + p) % 3)} fill={LOMBOS[(k * 2 + p) % 5]} opacity=".85" />)}</g>)}
  </g>
);
/** Round shield with crossed blades. */
const Escudo = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}><path d="M-20 -20L20 20M20 -20L-20 20" stroke="var(--aco)" strokeWidth="2.6" /><circle r="13" fill="var(--sangue)" stroke="var(--ouro)" strokeWidth="2" /><circle r="3.5" fill="var(--ouro)" /></g>
);
/** Iron ring of candles on its chain. */
const Lustre = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}><path d="M0 0V12M0 12L-18 24M0 12L18 24" stroke="var(--aco)" strokeWidth="1.2" /><ellipse cy="25" rx="20" ry="4" fill="none" stroke="var(--aco)" strokeWidth="2" />{[-18, 0, 18].map((c) => <path key={c} className="chama" d={`M${c} 15q3 4 0 7q-3 -3 0 -7z`} fill="var(--ambar)" />)}</g>
);
/** Night skyline seen through the arches' wall: rooftops and a bell tower. */
const Telhados = ({ x, y }: { x: number; y: number }) => (
  <path transform={`translate(${x} ${y})`} d="M0 0V-12l10 -8l10 8v-4h8v-10l6 -7l6 7v10h12l9 -9l9 9v4l8 -6l10 8V0Z" fill="#070a14" opacity=".7" />
);

/** Stone arch opening onto the night. */
const Arco = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <g>
    <path d={`M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z`} fill="#141c38" stroke={pedra(60)} strokeWidth="4" />
    <path d={`M${x + 3} ${y + h}V${y + h - 12}l6 -7v5l8 -12 7 12v-4l9 8V${y + h}Z`} fill="#070a14" />
  </g>
);

/** The training hall: dummies, weapon rack, knife targets, hay for the leap, and the eagle on its beam. */
function Treino() {
  const { x, y, w, h } = TREINO;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={pedra(14)} />
      <rect x={x} y={y} width={w} height={h} fill="url(#pedras)" />
      {[150, 330, 510].map((ax) => <Arco key={ax} x={x + ax} y={y + 10} w={56} h={70} />)}
      <circle cx={x + 372} cy={y + 34} r="7" fill="#e8e4c8" />
      {/* beam, eagle */}
      <rect x={x + 220} y={y + 22} width="100" height="6" fill={pedra(55)} />
      <path className="aguia" d={`M${x + 262} ${y + 22}q2 -12 10 -13q6 0 6 5l5 2l-5 2q-1 5 -6 7l-3 6l-2 -6z`} fill="var(--osso)" opacity=".85" />
      {/* weapon rack */}
      <g transform={`translate(${x + 430} ${y + 34})`}>
        <path d="M0 0H62M0 40H62" stroke={pedra(70)} strokeWidth="4" />
        {[8, 22, 36].map((sx) => <path key={sx} d={`M${sx} 46L${sx + 6} -8l3 -6l1 7l-6 54M${sx - 3} 34h13`} stroke="var(--aco)" strokeWidth="2" fill="none" />)}
        <path d="M52 4q12 18 0 36M52 4V40" stroke="var(--aco)" strokeWidth="1.8" fill="none" />
      </g>
      {/* hay for the leap of faith, under the eagle */}
      <g transform={`translate(${TORRE_X} ${SALTO_Y})`}>
        {/* the tower of the leap of faith, with its jutting plank */}
        <path d={`M-11 0V${-TORRE_ALT}M11 0V${-TORRE_ALT}M-11 -8L11 -30M11 -8L-11 -30M-11 -34L11 -58M11 -34L-11 -58`} stroke={pedra(80)} strokeWidth="3" />
        {[10, 22, 34, 46, 58].map((r) => <path key={r} d={`M-11 ${-r}H11`} stroke={pedra(65)} strokeWidth="1.6" />)}
        <rect x="-28" y={-TORRE_ALT} width="44" height="5" fill={pedra(90)} />
      </g>
      <g transform={`translate(${FENO_X} ${SALTO_Y - 8})`}>
        <path d="M-34 -8H34L28 8H-28Z" fill={pedra(60)} />
        <path d="M-30 -8Q-18 -34 0 -28Q22 -38 30 -8Z" fill="var(--ambar)" opacity=".7" />
        <circle cx="-18" cy="10" r="6" fill="none" stroke="var(--aco)" strokeWidth="2" /><circle cx="18" cy="10" r="6" fill="none" stroke="var(--aco)" strokeWidth="2" />
      </g>
      {/* straw dummies on the floor */}
      {BONECOS.map((bx) => (
        <g key={bx} transform={`translate(${bx} ${RAIAS[0]})`}>
          <path d="M0 0V-44M-14 -30H14" stroke={pedra(70)} strokeWidth="4" />
          <ellipse cy="-22" rx="9" ry="13" fill="var(--ambar)" opacity=".55" />
          <circle cy="-44" r="7" fill="var(--ambar)" opacity=".55" />
          <path d="M-5 -26L5 -18M5 -26L-5 -18" stroke="var(--sangue)" strokeWidth="1.6" />
        </g>
      ))}
      {/* archery lanes: a target at the end of each */}
      {RAIAS.map((ry) => (
        <g key={ry} transform={`translate(${ALVO_X} ${ry})`}>
          <path d="M-6 0L2 -22M10 0L2 -22" stroke={pedra(70)} strokeWidth="3" />
          <ellipse cy="-29" rx="8" ry="19" fill="var(--pergaminho)" /><ellipse cy="-29" rx="5.5" ry="13" fill="var(--sangue)" /><ellipse cy="-29" rx="3" ry="7" fill="var(--pergaminho)" /><ellipse cy="-29" rx="1.2" ry="3" fill="var(--sangue)" />
          <path d={`M-210 4H-8`} stroke="var(--bronze)" strokeOpacity=".35" strokeDasharray="3 6" />
        </g>
      ))}
      <Escudo x={x + 600} y={y + 36} />
      {/* the straw man for the knives: head, trunk, arms and legs, with a mark on the chest */}
      <g transform={`translate(${VITIMA_X} ${RAIAS[1]})`}>
        <path d="M0 -2V-14M0 -14L-8 0M0 -14L8 0M0 -40L-14 -24M0 -40L14 -24" stroke="var(--ambar)" strokeOpacity=".7" strokeWidth="5" strokeLinecap="round" />
        <path d="M-8 -44H8L6 -16H-6Z" fill="var(--ambar)" opacity=".65" stroke={pedra(80)} />
        <circle cy="-52" r="7" fill="var(--ambar)" opacity=".7" stroke={pedra(80)} />
        <circle cy="-33" r="5" fill="var(--pergaminho)" /><circle cy="-33" r="2.2" fill="var(--sangue)" />
      </g>
      {/* the climbing tower, across the hall from the leap */}
      <g transform={`translate(${ESCALADA_X[1]} ${SALTO_Y})`}>
        <rect x="-34" y={-TORRE_ALT - 8} width="68" height={TORRE_ALT + 8} fill={pedra(38)} stroke={pedra(85)} strokeWidth="2.5" />
        {Array.from({ length: 18 }, (_, i) => <rect key={i} x={-28 + (i % 3) * 22 + (Math.floor(i / 3) % 2) * 7} y={-8 - Math.floor(i / 3) * 10} width="7" height="3" rx="1.5" fill={pedra(95)} />)}
        <rect x="-39" y={-TORRE_ALT - 13} width="78" height="5" fill={pedra(90)} />
        {[-34, -10, 14, 28].map((cx) => <rect key={cx} x={cx} y={-TORRE_ALT - 20} width="8" height="7" fill={pedra(70)} />)}
        {/* the rope, tied to an arm jutting from the top, with knots and a coil on the floor */}
        <g transform={`translate(${CORDA_X - ESCALADA_X[1]} 0)`}>
          <path d={`M0 ${-TORRE_ALT - 10}H18`} stroke={pedra(90)} strokeWidth="4" />
          <path d={`M0 ${-TORRE_ALT - 10}V0`} stroke="#c9a56a" strokeWidth="2.4" />
          {[1, 2, 3, 4, 5].map((n) => <circle key={n} cy={-n * 11} r="2.2" fill="#a8864f" />)}
          <ellipse cy="1" rx="7" ry="2.5" fill="none" stroke="#c9a56a" strokeWidth="1.8" />
        </g>
      </g>
      <Braseiro x={x + 396} y={y + 82} i={1} />
      <Barril x={x + 236} y={y + 82} /><Barril x={x + 256} y={y + 84} /><Caixote x={x + 292} y={y + 82} />
      <Estandarte x={x + 20} y={y} />
      <Estandarte x={x + w - 20} y={y} />
      <Tocha x={x + 185} y={y + 52} i={1} />
      <Tocha x={x + 570} y={y + 52} i={3} />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--bronze)" strokeWidth="3" />
      <text x={x + 520} y={y + 14} className="cena-sala">Sala de Treinamento</text>
    </g>
  );
}

/** The gatehouse between training and the contracts: where the Regente receives each mission and sends the others on. */
function Portaria() {
  const { x, y, w, h } = PORTARIA;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={pedra(24)} />
      <rect x={x} y={y} width={w} height={h} fill="url(#pedras)" />
      {/* open gate with its portcullis raised */}
      <path d={`M368 ${y + h}V${y + 30}A32 28 0 0 1 432 ${y + 30}V${y + h}Z`} fill="#0b0f1f" stroke={pedra(75)} strokeWidth="5" />
      <path d={`M376 ${y + 6}v14M388 ${y + 3}v14M400 ${y + 2}v14M412 ${y + 3}v14M424 ${y + 6}v14M372 ${y + 11}h56`} stroke="var(--aco)" strokeWidth="2" />
      {/* carpet from the training hall up to the contracts */}
      <path d={`M384 ${y - 6}h32l8 ${h + 12}h-48z`} fill="var(--vinho)" opacity=".6" />
      {/* crenels */}
      {Array.from({ length: 16 }, (_, i) => <rect key={i} x={x + 12 + i * 49} y={y} width="18" height="7" fill={pedra(55)} />)}
      <Estandarte x={310} y={y + 8} />
      <Estandarte x={490} y={y + 8} />
      <Barril x={118} y={y + h - 10} /><Barril x={138} y={y + h - 6} /><Barril x={128} y={y + h - 24} />
      <Caixote x={186} y={y + h - 8} l={24} /><Caixote x={210} y={y + h - 8} l={18} />
      <Braseiro x={262} y={y + h - 8} i={0} />
      <Braseiro x={538} y={y + h - 8} i={2} />
      <Caixote x={600} y={y + h - 8} l={18} /><Caixote x={624} y={y + h - 8} l={24} />
      <Escudo x={680} y={y + 34} />
      <Barril x={730} y={y + h - 8} /><Barril x={750} y={y + h - 12} />
      <Tocha x={346} y={y + 36} i={2} />
      <Tocha x={454} y={y + 36} i={5} />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--bronze)" strokeWidth="3" />
      <text x={x + 14} y={y + h - 8} className="cena-sala">Portaria</text>
    </g>
  );
}

/** Floors, project rooms, the gatehouse and the training hall. Agents are drawn on top by the scene. */
export function Fortaleza({ salas }: { salas: ReturnType<typeof posicionar>["salas"] }) {
  return (
    <g aria-hidden="true">
      <defs>
        <pattern id="pedras" width="40" height="22" patternUnits="userSpaceOnUse"><path d="M0 0H40M0 11H40M10 0V11M30 11V22" stroke="var(--bronze)" strokeOpacity=".22" fill="none" /></pattern>
        <radialGradient id="halo"><stop offset="0" stopColor="var(--ambar)" stopOpacity=".5" /><stop offset="1" stopColor="var(--ambar)" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="800" height="480" fill="var(--noite-0)" />
      {salas.length === 0 && (
        <g>
          <rect x="16" y="16" width="768" height="160" fill={pedra(8)} stroke="var(--bronze)" strokeOpacity=".4" strokeDasharray="6 5" />
          <Arco x={372} y={34} w={56} h={86} />
          <Telhados x={367} y={120} />
          <Estante x={48} y={62} w={74} /><Estante x={130} y={62} w={56} />
          <Estante x={614} y={62} w={56} /><Estante x={678} y={62} w={74} />
          {[260, 540].map((mx) => <g key={mx} transform={`translate(${mx} 126)`}><path d="M-40 0H40M-32 0V18M32 0V18" stroke={pedra(70)} strokeWidth="5" /><rect x="-30" y="-8" width="44" height="8" fill="var(--pergaminho)" opacity=".7" /><path d="M24 -3v-12" stroke="var(--pergaminho)" strokeWidth="3" /><path className="chama" d="M24 -23q4 5 0 8q-4 -3 0 -8z" fill="var(--ambar)" /></g>)}
          <Lustre x={250} y={18} /><Lustre x={550} y={18} />
          <Braseiro x={334} y={150} i={1} /><Braseiro x={466} y={150} i={3} />
          <Barril x={206} y={168} /><Caixote x={596} y={168} />
          <text x="400" y="170" textAnchor="middle" className="cena-sala">Nenhum contrato em campo</text>
        </g>
      )}
      {salas.map((s, i) => (
        <g key={s.nome} className="sala-contrato">
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={pedra(18)} />
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="url(#pedras)" />
          {/* war table with the map of the contract */}
          <rect x={s.x + s.w / 2 - 44} y={s.y + 36} width="88" height="28" rx="2" fill="color-mix(in srgb, var(--pergaminho) 75%, var(--noite-0))" stroke="var(--bronze)" />
          <path d={`M${s.x + s.w / 2 - 36} ${s.y + 56}q16 -18 30 -4t40 -8`} stroke="var(--sangue)" fill="none" strokeDasharray="3 2" />
          <Estandarte x={s.x + 22} y={s.y} />
          {s.w > 250 && <><Estante x={s.x + 44} y={s.y + 30} w={44} /><Escudo x={s.x + s.w - 64} y={s.y + 56} /></>}
          <Lustre x={s.x + s.w / 2 - 74} y={s.y + 2} />
          <Barril x={s.x + 20} y={s.y + s.h - 6} /><Caixote x={s.x + s.w - 20} y={s.y + s.h - 6} />
          <Tocha x={s.x + s.w - 16} y={s.y + 30} i={i} />
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="var(--ouro)" strokeWidth="2.5" />
          <rect x={s.x + s.w / 2 - Math.min(s.w - 70, 200) / 2} y={s.y + 6} width={Math.min(s.w - 70, 200)} height="18" rx="3" fill="var(--noite-0)" stroke="var(--ouro)" />
          <text x={s.x + s.w / 2} y={s.y + 19} textAnchor="middle" className="cena-sala">{corta(s.nome, Math.floor((s.w - 70) / 8))}</text>
        </g>
      ))}
      <Portaria />
      <Treino />
    </g>
  );
}
