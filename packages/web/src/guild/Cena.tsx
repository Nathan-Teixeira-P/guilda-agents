import { useEffect, useMemo, useRef, useState } from "react";
import { derivarPainel, VIEW, type Atividade } from "../logic/escritorio.ts";
import { posicionar } from "../logic/fortaleza.ts";
import { criarTreino, type Quadro } from "../logic/treino.ts";
import { Assassino, partesDe, posar, type Partes } from "./Assassino.tsx";
import { FICHA } from "../logic/guilda.ts";
import { reduzido } from "../prefs.ts";
import { membro, ROSTER } from "../roster.ts";
import type { Live } from "../store.ts";
import { Fortaleza } from "./Fortaleza.tsx";

const FPS_MS = 1000 / 30;
const EMBLEMA = `${import.meta.env.BASE_URL}emblem-ntp.png`;

export interface Linha { tecnico: string; codinome: string; sala: string; modelo: string; estado: "ativo" | "falhou" | "ocioso"; ferramenta?: string; tokens?: number; projeto?: string }
/** One row per agent, in the order of the hall (also the tab order). Shared with the text alternative. */
export function linhasDe(a: Record<string, Atividade>, tokens: Record<string, number>): Linha[] {
  return ROSTER.map(({ tecnico: t }) => {
    const x = a[t];
    return { tecnico: t, codinome: membro(t).codinome, sala: t === "orchestrator" ? "Portaria" : x?.ativo && x.projeto ? x.projeto : "Sala de Treinamento", modelo: FICHA[t]?.modelo ?? "sonnet", estado: x?.falhou ? "falhou" : x?.ativo ? "ativo" : "ocioso", ...(x?.ferramenta ? { ferramenta: x.ferramenta } : {}), ...(x?.ativo && x.projeto ? { projeto: x.projeto } : {}), ...(tokens[t] ? { tokens: tokens[t] } : {}) };
  });
}
export const rotuloEstado = (l: Linha) => (l.estado === "falhou" ? "Falhou" : l.estado === "ativo" ? (l.ferramenta ? `Em campo, usando ${l.ferramenta}` : "Em campo") : "Ocioso");
export const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} mil` : String(n));

export function useReduzido() {
  const [r, setR] = useState(reduzido);
  useEffect(() => {
    const f = () => setR(reduzido());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("motion-change", f);
    mq.addEventListener("change", f);
    return () => { window.removeEventListener("motion-change", f); mq.removeEventListener("change", f); };
  }, []);
  return r;
}

function Bolha({ l, local }: { l: Linha; local?: boolean }) {
  const txt = l.estado === "falhou" ? "falhou" : l.ferramenta ?? "em campo";
  const w = Math.min(86, txt.length * 5.1 + 22);
  return (
    <g transform="translate(0 -46)" className="bolha" aria-hidden="true">
      <rect x={-w / 2} y="-11" width={w} height="14" rx="4" className={l.estado === "falhou" ? "bolha-erro" : "bolha-fundo"} />
      <path d="M-3 3L0 7L3 3Z" className={l.estado === "falhou" ? "bolha-erro" : "bolha-fundo"} />
      <circle cx={-w / 2 + 8} cy="-4" r="4.6" className={`mod mod-${l.modelo}`} />
      <text x={-w / 2 + 8} y="-1.4" textAnchor="middle" className="mod-l">{l.estado === "falhou" ? "!" : l.modelo[0]!.toUpperCase()}</text>
      <text x={w / 2 - 6} y="-1" textAnchor="end" className="bolha-t">{txt.length > 13 ? `${txt.slice(0, 12)}…` : txt}</text>
      {local && <g transform="translate(0 -14)"><rect x="-17" y="-8" width="34" height="10" rx="3" className="local-tag" /><text x="0" y="-0.6" textAnchor="middle" className="local-tag-t">local</text></g>}
    </g>
  );
}

const ORDEM = ROSTER.map((r) => r.tecnico);

/** The 2D hideout: idle members train (swords, bows, dummies); called ones walk through the gate to their project's room. */
export function Cena({ live, selecionado, onSelecionar }: { live: Live; selecionado?: string | undefined; onSelecionar: (t: string | undefined) => void }) {
  const painel = useMemo(() => derivarPainel(live.missions, live.events, (id) => live.projects.find((p) => p.id === id)?.nome ?? id), [live.missions, live.events, live.projects]);
  const linhas = useMemo(() => linhasDe(painel.atividade, painel.tokens), [painel]);
  const calmo = useReduzido();
  const { salas, lugar } = posicionar(painel.atividade);
  const lugarRef = useRef(lugar);
  lugarRef.current = lugar;
  const treino = useRef<ReturnType<typeof criarTreino>>(undefined as never);
  treino.current ??= criarTreino();
  const partes = useRef<Record<string, Partes>>({});
  const flechas = useRef<(SVGGElement | null)[]>([]);
  const faiscas = useRef<(SVGGElement | null)[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const usoLocal = (t: string) => live.local?.emUso?.agent === t;

  const desenhar = (q: Quadro) => {
    for (const [id, p] of Object.entries(q.poses)) { const el = partes.current[id]; if (el) posar(el, p); }
    flechas.current.forEach((el, i) => { const f = q.flechas[i]; if (!el) return; el.setAttribute("display", f?.visivel ? "inline" : "none"); if (f?.visivel) el.setAttribute("transform", `translate(${f.x.toFixed(1)} ${f.y - 37 + (f.dy ?? 0)})`); });
    faiscas.current.forEach((el, i) => { const f = q.faiscas[i]; if (!el) return; el.setAttribute("display", f ? "inline" : "none"); if (f) el.setAttribute("transform", `translate(${f.x} ${f.y})`); });
  };

  // ~30 fps while motion is allowed, the tab is visible and the scene is on screen
  useEffect(() => {
    if (calmo) { desenhar(treino.current(0, 0, lugarRef.current, ORDEM, true)); return; }
    let raf = 0, ultimo = 0, visivel = true;
    const quadro = (t: number) => {
      raf = 0;
      if (document.hidden || !visivel) return;
      if (t - ultimo >= FPS_MS) { const dt = ultimo === 0 ? FPS_MS : t - ultimo; ultimo = t; desenhar(treino.current(t, dt, lugarRef.current, ORDEM)); }
      raf = requestAnimationFrame(quadro);
    };
    const parte = () => { if (!document.hidden && visivel && raf === 0) { ultimo = 0; raf = requestAnimationFrame(quadro); } };
    const io = svg.current && "IntersectionObserver" in window ? new IntersectionObserver((e) => { visivel = !!e[e.length - 1]?.isIntersecting; parte(); }) : undefined;
    if (svg.current) io?.observe(svg.current);
    document.addEventListener("visibilitychange", parte);
    desenhar(treino.current(performance.now(), 0, lugarRef.current, ORDEM));
    parte();
    return () => { cancelAnimationFrame(raf); raf = 0; io?.disconnect(); document.removeEventListener("visibilitychange", parte); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calmo]);
  useEffect(() => { if (calmo) desenhar(treino.current(0, 0, lugarRef.current, ORDEM, true)); }, [calmo, painel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg ref={svg} className={`cena${calmo ? " cena-calma" : ""}`} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label="Fortaleza da guilda: salas dos projetos em andamento, a portaria do Regente e a sala de treinamento" preserveAspectRatio="xMidYMid meet">
      <Fortaleza salas={salas} />
      {linhas.map((l) => {
        const t = l.tecnico, f = FICHA[t], sel = selecionado === t;
        return (
          <g
            key={t}
            ref={(el) => { if (el) partes.current[t] = partesDe(el); else delete partes.current[t]; }}
            className={`ag${sel ? " sel" : ""} ag-${l.estado}`}
            tabIndex={0}
            role="button"
            aria-pressed={sel}
            aria-label={`${l.codinome}, ${f?.funcao ?? ""} ${rotuloEstado(l)}. ${l.sala}. Modelo ${l.modelo}.${usoLocal(t) ? " Usando o modelo local." : ""}`}
            onClick={() => onSelecionar(sel ? undefined : t)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelecionar(sel ? undefined : t); } else if (e.key === "Escape") onSelecionar(undefined); }}
          >
            <ellipse className="sombra" cx="0" cy="0.5" rx="12" ry="3.5" />
            <Assassino agente={t} />
            <ellipse className="anel" cx="0" cy="-28" rx="17" ry="33" />
            <text y="11" textAnchor="middle" className="cena-nome">{l.codinome}</text>
            {(l.estado !== "ocioso" || usoLocal(t)) && <g transform="translate(0 -18)"><Bolha l={l} local={usoLocal(t)} /></g>}
          </g>
        );
      })}
      {Array.from({ length: 9 }, (_, i) => <g key={i} ref={(el) => { flechas.current[i] = el; }} display="none" pointerEvents="none">{i < 6 ? <path d="M-14 0H8M8 0l-5 -3M8 0l-5 3M-14 0l-3 -3M-14 0l-3 3" stroke="#e8e4c8" strokeWidth="1.4" fill="none" /> : <><path d="M-2 -1.6L8 0L-2 1.6Z" fill="#d8dde4" /><path d="M-8 0H-2M-2 -3V3" stroke="#5a3a26" strokeWidth="2" /></>}</g>)}
      {Array.from({ length: 8 }, (_, i) => <g key={i} ref={(el) => { faiscas.current[i] = el; }} display="none" pointerEvents="none"><path d="M-6 0H6M0 -6V6M-4 -4L4 4M-4 4L4 -4" stroke="#ffd36b" strokeWidth="1.2" /></g>)}
      <rect className="tinte" width={VIEW.w} height={VIEW.h} pointerEvents="none" />
    </svg>
  );
}
