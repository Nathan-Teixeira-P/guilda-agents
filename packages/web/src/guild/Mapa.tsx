import { useEffect, useRef, useState } from "react";
import type { Live } from "../store.ts";
import { distribuir, infoDistrito, LOTE, LOTES, novosHandoffs, TORRE, type Handoff } from "../logic/mapa.ts";
import { reduzido } from "../prefs.ts";
import { Avatar } from "./Avatar.tsx";

const corta = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const EMBLEMA = `${import.meta.env.BASE_URL}emblem-ntp.png`;
const SELO = `${import.meta.env.BASE_URL}seal-ntp.png`;

/** Rooftops line: one dashed path through every roof peak, where the messengers run. */
const TELHADOS = `M0 38 ${LOTES.slice(0, 4).map((l) => `L${l.x + LOTE.w / 2} ${l.y}`).join(" ")} L800 38`;

/** District map: 8 fixed lots, tower, river, rooftops. A messenger runs from the tower to the district when one of its missions hands off to an agent. CSS transforms only, one-shot; nothing runs at rest. */
export function Mapa({ live }: { live: Live }) {
  const { lotes } = distribuir(live.projects);
  const [correndo, setCorrendo] = useState<(Handoff & { n: number })[]>([]);
  const vistos = useRef<Record<string, number>>(undefined);
  const seq = useRef(0);
  useEffect(() => {
    const { contagem, novos } = novosHandoffs(vistos.current, live.events);
    vistos.current = contagem;
    if (novos.length === 0 || reduzido()) return;
    setCorrendo((c) => [...c, ...novos.slice(0, 4).map((h) => ({ ...h, n: ++seq.current }))].slice(-8));
  }, [live.events]);

  return (
    <nav className="mapa" aria-label="Distritos">
      <svg viewBox="0 0 800 400" role="group" aria-label="Mapa dos distritos da guilda">
        <image href={SELO} x="260" y="60" width="280" height="294" opacity=".08" />
        <path d="M0 205C150 170 250 240 400 205S650 170 800 205" className="rio" />
        <path d="M0 215C150 180 250 250 400 215S650 180 800 215" className="rio" opacity=".5" />
        <path d={TELHADOS} className="telhados" />
        <g className="torre">
          <path d="M370 250V160L400 118L430 160V250Z" />
          <circle cx={TORRE.x} cy={TORRE.y} r="30" fill="#160e0f" stroke="var(--bronze)" />
          <image href={EMBLEMA} x={TORRE.x - 16} y={TORRE.y - 20} width="32" height="39" />
        </g>
        {LOTES.map((l, i) => {
          const p = lotes[i];
          const cx = l.x + LOTE.w / 2;
          const corpo = (
            <>
              <path className="lote-contorno" d={`M${l.x} ${l.y + 22}L${cx} ${l.y}L${l.x + LOTE.w} ${l.y + 22}V${l.y + LOTE.h}H${l.x}Z`} />
              <path className="lote-contorno" d={`M${l.x} ${l.y + 22}H${l.x + LOTE.w}`} opacity=".5" />
            </>
          );
          if (!p) {
            return (
              <a key={i} href="#/projetos" className="lote vazio-lote" aria-label="Terreno vazio: anexar distrito">
                <rect x={l.x} y={l.y} width={LOTE.w} height={LOTE.h} fill="transparent" />
                {corpo}
                <text x={cx} y={l.y + 58} textAnchor="middle" className="lote-sub">terreno vazio</text>
                <text x={cx} y={l.y + 76} textAnchor="middle" className="lote-sub">+ Anexar distrito</text>
              </a>
            );
          }
          const info = infoDistrito(live.missions, p.id);
          return (
            <a key={i} href="#/quadro" className="lote" aria-label={`Distrito ${p.nome}, ${info.ativas} ${info.ativas === 1 ? "missão ativa" : "missões ativas"}${info.alarmes ? `, ${info.alarmes} ${info.alarmes === 1 ? "alarme" : "alarmes"}` : ""}`}>
              <rect x={l.x} y={l.y} width={LOTE.w} height={LOTE.h} fill="transparent" />
              {corpo}
              <text x={cx} y={l.y + 52} textAnchor="middle" className="lote-nome">{corta(p.nome)}</text>
              <g transform={`translate(${l.x + 12} ${l.y + 64})`}>
                <circle cx="9" cy="9" r="9" className="lote-selo" />
                <text x="9" y="13" textAnchor="middle" className="lote-num">{info.ativas}</text>
              </g>
              {info.alarmes > 0 && <text x={l.x + LOTE.w - 24} y={l.y + 80} className="lote-alarme" aria-hidden="true">⚠</text>}
            </a>
          );
        })}
        {correndo.map((h) => {
          const i = live.projects.findIndex((p) => live.missions.some((m) => m.id === h.missionId && m.project === p.id));
          const l = LOTES[i];
          if (!l) return null;
          return (
            <g key={h.n} className="msg" style={{ "--dx": `${l.x + LOTE.w / 2 - TORRE.x}px`, "--dy": `${l.y - TORRE.y + 8}px` } as React.CSSProperties} onAnimationEnd={() => setCorrendo((c) => c.filter((x) => x.n !== h.n))}>
              <Avatar oculto vista="costas" tamanho={18} agente={h.tipo || "?"} x={TORRE.x - 9} y={TORRE.y - 9} />
            </g>
          );
        })}
      </svg>
    </nav>
  );
}
