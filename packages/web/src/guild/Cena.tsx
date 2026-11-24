import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CENTRAL, criarSim, derivarPainel, MESA_CENTRAL, montarPlanta, recadosNovos, VIEW, type Atividade, type Planta, type Sala } from "../logic/escritorio.ts";
import { FICHA } from "../logic/guilda.ts";
import { reduzido } from "../prefs.ts";
import { membro } from "../roster.ts";
import type { Live } from "../store.ts";
import { Avatar } from "./Avatar.tsx";

const PLANTA = montarPlanta();
const EMBLEMA = `${import.meta.env.BASE_URL}emblem-ntp.png`;
const FPS_MS = 1000 / 30;

export interface Linha { tecnico: string; codinome: string; sala: string; modelo: string; estado: "ativo" | "falhou" | "ocioso"; ferramenta?: string; tokens?: number; projeto?: string }
/** One row per agent, in the order of the hall (also the tab order). Shared with the text alternative. */
export function linhasDe(a: Record<string, Atividade>, tokens: Record<string, number>): Linha[] {
  const ordem = [...CENTRAL, ...PLANTA.salas.flatMap((s) => s.agentes)];
  return ordem.map((t) => {
    const x = a[t];
    return { tecnico: t, codinome: membro(t).codinome, sala: PLANTA.sala[t] === "mesa" ? "Mesa do Regente" : PLANTA.salas.find((s) => s.id === PLANTA.sala[t])!.nome, modelo: FICHA[t]?.modelo ?? "sonnet", estado: x?.falhou ? "falhou" : x?.ativo ? "ativo" : "ocioso", ...(x?.ferramenta ? { ferramenta: x.ferramenta } : {}), ...(x?.ativo && x.projeto ? { projeto: x.projeto } : {}), ...(tokens[t] ? { tokens: tokens[t] } : {}) };
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

const MESAS = PLANTA.mesas;
const mix = (c: string, pct: number, base = "var(--noite-2)") => `color-mix(in srgb, ${c} ${pct}%, ${base})`;

function Tocha({ x, y, i }: { x: number; y: number; i: number }) {
  const s = { animationDelay: `${-(i * 0.37) % 1.6}s` } as CSSProperties;
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle className="halo" r="30" cy="-4" fill="url(#halo)" style={s} />
      <rect x="-1.5" y="0" width="3" height="9" fill="var(--bronze)" />
      <path className="chama" d="M0 -9Q4 -4 3 0Q0 2 -3 0Q-4 -4 0 -9Z" fill="var(--ambar)" style={s} />
    </g>
  );
}

function Banner({ x, y, cor }: { x: number; y: number; cor: string }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <path d="M-10 0H10V26L0 21L-10 26Z" fill={mix(cor, 55, "var(--vinho)")} stroke="var(--bronze)" strokeWidth=".8" />
      <image href={EMBLEMA} x="-7" y="3" width="14" height="17" opacity=".92" />
    </g>
  );
}

/** Per-room props: small and distinct, so each zone reads at a glance. */
function Adereco({ s }: { s: Sala }) {
  const { x, y, w } = s;
  const bem = "var(--bronze)";
  switch (s.id) {
    case "guerra": return (<g><rect x={x + w / 2 - 36} y={y + 8} width="72" height="20" rx="2" fill="color-mix(in srgb, var(--pergaminho) 75%, var(--noite-0))" stroke={bem} /><path d={`M${x + w / 2 - 28} ${y + 22}Q${x + w / 2 - 12} ${y + 10} ${x + w / 2} ${y + 18}T${x + w / 2 + 28} ${y + 14}`} stroke="var(--sangue)" fill="none" strokeWidth="1.2" strokeDasharray="3 2" /><circle cx={x + w / 2 + 10} cy={y + 17} r="2" fill="var(--sangue)" /></g>);
    case "scriptorium": return (<g>{[0, 1, 2].map((i) => <g key={i} transform={`translate(${x + w / 2 - 54 + i * 38} ${y + 6})`}><rect width="34" height="24" fill="var(--noite-1)" stroke={bem} />{[0, 1, 2, 3, 4].map((k) => <rect key={k} x={3 + k * 6} y={k % 2 ? 5 : 3} width="4" height={k % 2 ? 15 : 17} fill={["#7f9bb5", "var(--vinho)", "var(--verdete)", "var(--ambar)", "#a77bb0"][k]} />)}</g>)}</g>);
    case "forja": return (<g><rect x={x + w / 2 - 22} y={y + 4} width="44" height="26" fill="var(--noite-1)" stroke={bem} /><path className="chama" d={`M${x + w / 2} ${y + 8}Q${x + w / 2 + 8} ${y + 18} ${x + w / 2 + 4} ${y + 28}H${x + w / 2 - 6}Q${x + w / 2 - 10} ${y + 18} ${x + w / 2} ${y + 8}Z`} fill="var(--ambar)" /><path d={`M${x + w - 52} ${y + 150}h28l-4 -8h-20z`} fill="var(--aco)" stroke="#000" strokeOpacity=".4" /></g>);
    case "arena": return (<g>{[0, 1].map((i) => <g key={i} transform={`translate(${x + 14 + i * 146} ${y + 128})`}><rect width="38" height="22" fill="var(--noite-1)" stroke={bem} /><path d="M6 4V18M14 4V18M22 6L30 4M22 10L30 8M22 16L30 14" stroke="var(--aco)" strokeWidth="1.6" /></g>)}<circle cx={x + 106} cy={y + 150} r="10" fill={mix("var(--sangue)", 30)} stroke={bem} /><circle cx={x + 106} cy={y + 150} r="5" fill="none" stroke={bem} /></g>);
    default: return (<g><rect x={x + w / 2 - 14} y={y + 4} width="28" height="26" fill="var(--noite-1)" stroke={bem} /><circle cx={x + w / 2} cy={y + 17} r="7" fill="none" stroke="var(--ambar)" strokeWidth="1.6" /><circle cx={x + w / 2} cy={y + 17} r="2.5" fill="var(--ambar)" /><path d={`M${x + w - 54} ${y + 150}l12 -22M${x + w - 36} ${y + 150}l-12 -22`} stroke={bem} strokeWidth="2" /><rect x={x + w - 60} y={y + 120} width="28" height="8" rx="2" fill="var(--aco)" transform={`rotate(-28 ${x + w - 46} ${y + 124})`} /></g>);
  }
}

/** Static scenery: floors, walls, windows, torches, banners, rugs. Drawn once. */
const Fundo = memo(function Fundo({ p }: { p: Planta }) {
  return (
    <g>
      <defs>
        <pattern id="ladrilho" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 0H24M0 0V24" stroke="var(--bronze)" strokeOpacity=".3" fill="none" /><path d="M12 12h.01" stroke="var(--bronze)" strokeOpacity=".2" /></pattern>
        <radialGradient id="halo"><stop offset="0" stopColor="var(--ambar)" stopOpacity=".5" /><stop offset="1" stopColor="var(--ambar)" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={p.w} height={p.h} fill="var(--noite-0)" />
      <rect x={p.corredor.x} y={p.corredor.y} width={p.corredor.w} height={p.corredor.h} fill={mix("var(--bronze)", 28, "var(--noite-1)")} />
      <rect x={p.corredor.x} y={p.corredor.y} width={p.corredor.w} height={p.corredor.h} fill="url(#ladrilho)" />
      <rect x={p.corredor.x} y="228" width={p.corredor.w} height="24" fill="var(--vinho)" opacity=".55" />
      <path d={`M${p.corredor.x} 228H${p.corredor.x + p.corredor.w}M${p.corredor.x} 252H${p.corredor.x + p.corredor.w}`} stroke="var(--ouro)" strokeOpacity=".5" strokeDasharray="6 4" />
      {p.salas.map((s, si) => (
        <g key={s.id}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={mix(s.cor, 9)} />
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="url(#ladrilho)" />
          <rect x={s.x + 26} y={s.y + (s.agentes.length > 3 ? 98 : 112)} width={s.w - 52} height={s.agentes.length > 3 ? 70 : 56} rx="3" fill={mix(s.cor, 22, "var(--vinho)")} opacity=".55" stroke="var(--ouro)" strokeOpacity=".4" strokeDasharray="5 3" />
          <rect x={s.x} y={s.y} width={s.w} height="34" fill="var(--noite-0)" opacity=".85" />
          <path d={`M${s.x} ${s.y + 34}H${s.x + s.w}`} stroke="var(--bronze)" strokeOpacity=".6" />
          {[0.22, 0.78].map((f, i) => (
            <g key={i} transform={`translate(${s.x + s.w * f - 10} ${s.y + 6})`}>
              <rect className="ceu" width="20" height="22" rx="9" ry="9" stroke="var(--bronze)" strokeWidth="1.4" />
              <circle className="astro" cx="13" cy="9" r="3.4" />
              <path d="M10 0V22M0 11H20" stroke="var(--bronze)" strokeWidth=".8" />
            </g>
          ))}
          <Banner x={s.x + s.w / 2 + (s.id === "guerra" || s.id === "scriptorium" ? 70 : s.id === "arena" ? 0 : -48)} y={s.y + 4} cor={s.cor} />
          <Adereco s={s} />
          <Tocha x={s.x + 12} y={s.y + 20} i={si * 2} />
          <Tocha x={s.x + s.w - 12} y={s.y + 20} i={si * 2 + 1} />
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="var(--bronze)" strokeWidth="3" />
          <rect x={s.doorX - 20} y={(s.porta === "baixo" ? s.y + s.h : s.y) - 2.5} width="40" height="5" fill={mix("var(--bronze)", 28, "var(--noite-1)")} />
          <path d={`M${s.doorX - 20} ${s.porta === "baixo" ? s.y + s.h - 6 : s.y + 6}V${s.porta === "baixo" ? s.y + s.h + 4 : s.y - 4}M${s.doorX + 20} ${s.porta === "baixo" ? s.y + s.h - 6 : s.y + 6}V${s.porta === "baixo" ? s.y + s.h + 4 : s.y - 4}`} stroke="var(--ouro)" strokeWidth="3" />
          <text x={s.x + 10} y={s.y + s.h - 6} className="cena-sala">{s.nome}</text>
        </g>
      ))}
      <rect x={p.corredor.x} y={p.corredor.y} width={p.corredor.w} height={p.corredor.h} fill="none" stroke="var(--bronze)" strokeWidth="3" />
    </g>
  );
});

/** Desks and the central table: drawn above seated agents (their legs vanish behind them) and below walkers. */
const Moveis = memo(function Moveis() {
  return (
    <g aria-hidden="true">
      {MESAS.filter((d) => d.agente).map((d) => (
        <g key={d.agente}>
          <rect x={d.x} y={d.y - 6} width={d.w} height="20" rx="2" fill={mix("var(--bronze)", 52, "var(--noite-0)")} stroke="#000" strokeOpacity=".45" />
          <rect x={d.x} y={d.y - 6} width={d.w} height="5" rx="2" fill="var(--bronze)" opacity=".7" />
          <rect x={d.x + d.w - 20} y={d.y - 3} width="12" height="8" fill="var(--pergaminho)" opacity=".85" />
          <circle cx={d.x + 8} cy={d.y - 1} r="2" fill="var(--ambar)" />
          <text x={d.x + d.w / 2} y={d.y + 22} textAnchor="middle" className="cena-nome">{membro(d.agente).codinome}</text>
        </g>
      ))}
      <g>
        <rect x={MESA_CENTRAL.x} y={MESA_CENTRAL.y - 3} width={MESA_CENTRAL.w} height={MESA_CENTRAL.h + 3} rx="5" fill={mix("var(--bronze)", 60, "var(--noite-0)")} stroke="var(--ouro)" strokeOpacity=".7" />
        <rect x={MESA_CENTRAL.x + 8} y={MESA_CENTRAL.y + 3} width="30" height="10" fill="var(--pergaminho)" opacity=".9" />
        <circle cx={MESA_CENTRAL.x + 52} cy={MESA_CENTRAL.y + 8} r="3.5" fill="var(--ambar)" />
        <text x="400" y={MESA_CENTRAL.y + 20} textAnchor="middle" className="cena-nome">Regente · Porteiro</text>
      </g>
    </g>
  );
});

interface Refs { g: SVGGElement | null; corpo: SVGGElement | null; f1: SVGRectElement | null; f2: SVGRectElement | null; rolo: SVGGElement | null }

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

/** The guild hall scene. Movement is driven imperatively from one rAF loop (no React renders per frame); React only renders when the live state changes. */
export function Cena({ live, selecionado, onSelecionar }: { live: Live; selecionado?: string | undefined; onSelecionar: (t: string | undefined) => void }) {
  const painel = useMemo(() => derivarPainel(live.missions, live.events, (id) => live.projects.find((p) => p.id === id)?.nome ?? id), [live.missions, live.events, live.projects]);
  const linhas = useMemo(() => linhasDe(painel.atividade, painel.tokens), [painel]);
  const calmo = useReduzido();
  const sim = useRef<ReturnType<typeof criarSim>>(undefined as never);
  sim.current ??= criarSim(PLANTA, Math.random, { maxPasseio: 5 });
  const atividade = useRef(painel.atividade);
  atividade.current = painel.atividade;
  const refs = useRef<Record<string, Refs>>({});
  const svg = useRef<SVGSVGElement>(null);
  const [sentados, setSentados] = useState(() => sim.current.atores.map((a) => a.id).join());
  const sentadosRef = useRef(sentados);
  const vistos = useRef<Record<string, number>>(undefined as never);

  // handoffs: the receiving agent walks to the sender's desk and carries the scroll home
  useEffect(() => {
    const { contagem, novos } = recadosNovos(vistos.current, live.events);
    vistos.current = contagem;
    if (!calmo) for (const r of novos.slice(0, 6)) sim.current.recado(r);
  }, [live.events, calmo]);

  useEffect(() => { sim.current.setMaxPasseio(painel.aoVivo ? 7 : 5); }, [painel.aoVivo]);

  const desenhar = (t: number) => {
    const s = sim.current;
    for (const a of s.atores) {
      const r = refs.current[a.id];
      if (!r?.g) continue;
      r.g.setAttribute("transform", `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`);
      const andando = a.fase === "andando";
      const ph = (a.dist / 7) * Math.PI / 2;
      const sw = andando ? Math.sin(ph) : 0;
      const respira = a.fase === "sentado" && atividade.current[a.id]?.ativo ? Math.sin(t / 260) * 0.9 : 0;
      r.corpo?.setAttribute("transform", `translate(0 ${(andando ? -Math.abs(sw) * 2.4 : respira).toFixed(2)}) rotate(${(sw * 4).toFixed(1)}) scale(${a.face} 1)`);
      r.f1?.setAttribute("transform", `translate(${(-5 + sw * 3.2).toFixed(1)} ${(-Math.max(0, sw) * 2.4).toFixed(1)})`);
      r.f2?.setAttribute("transform", `translate(${(1 - sw * 3.2).toFixed(1)} ${(-Math.max(0, -sw) * 2.4).toFixed(1)})`);
      r.rolo?.setAttribute("display", a.carrega ? "inline" : "none");
    }
    const k = s.atores.filter((a) => a.fase === "sentado").map((a) => a.id).join();
    if (k !== sentadosRef.current) { sentadosRef.current = k; setSentados(k); }
  };

  // loop: only while motion is allowed, the tab is visible and the scene is on screen; ~30 fps
  useEffect(() => {
    if (calmo) { sim.current.parar(); desenhar(0); return; }
    let raf = 0, ultimo = 0, visivel = true;
    const permitido = () => !document.hidden && visivel;
    const quadro = (t: number) => {
      raf = 0;
      if (!permitido()) return;
      if (t - ultimo >= FPS_MS) {
        const dt = ultimo === 0 ? FPS_MS : t - ultimo;
        ultimo = t;
        sim.current.passo(dt, atividade.current);
        desenhar(t);
      }
      raf = requestAnimationFrame(quadro);
    };
    const parte = () => { if (permitido() && raf === 0) { ultimo = 0; raf = requestAnimationFrame(quadro); } };
    const io = svg.current && "IntersectionObserver" in window ? new IntersectionObserver((e) => { visivel = !!e[e.length - 1]?.isIntersecting; parte(); }) : undefined;
    if (svg.current) io?.observe(svg.current);
    document.addEventListener("visibilitychange", parte);
    parte();
    return () => { cancelAnimationFrame(raf); raf = 0; io?.disconnect(); document.removeEventListener("visibilitychange", parte); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calmo]);
  useEffect(() => { if (calmo) { sim.current.parar(); desenhar(0); } }, [calmo, painel]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = new Set(sentados ? sentados.split(",") : []);
  const por = new Map(linhas.map((l) => [l.tecnico, l]));
  const usoLocal = (t: string) => live.local?.emUso?.agent === t;
  const agente = (t: string) => {
    const l = por.get(t)!;
    const a = sim.current.atores.find((x) => x.id === t)!;
    const f = FICHA[t];
    const sel = selecionado === t;
    return (
      <g
        key={t}
        ref={(el) => { refs.current[t] = { g: el, corpo: el?.querySelector(".corpo") ?? null, f1: el?.querySelector(".f1") ?? null, f2: el?.querySelector(".f2") ?? null, rolo: el?.querySelector(".rolo") ?? null } as Refs; }}
        className={`ag${sel ? " sel" : ""} ag-${l.estado}`}
        transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`}
        tabIndex={0}
        role="button"
        aria-pressed={sel}
        aria-label={`${l.codinome}, ${f?.funcao ?? ""} ${rotuloEstado(l)}. Modelo ${l.modelo}.${usoLocal(t) ? " Usando o modelo local." : ""}`}
        onClick={() => onSelecionar(sel ? undefined : t)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelecionar(sel ? undefined : t); } else if (e.key === "Escape") onSelecionar(undefined); }}
      >
        <ellipse className="sombra" cx="0" cy="0.5" rx="10" ry="3" />
        <rect className="f1 pe" x="0" y="-2" width="5" height="3" rx="1.5" />
        <rect className="f2 pe" x="0" y="-2" width="5" height="3" rx="1.5" />
        <g className="corpo"><Avatar oculto agente={t} tamanho={38} x={-19} y={-37} {...(l.estado === "ativo" ? { estado: "ativo" as const } : l.estado === "falhou" ? { estado: "falhou" as const } : {})} /></g>
        <ellipse className="anel" cx="0" cy="-16" rx="14" ry="21" />
        <g className="rolo" display="none" aria-hidden="true"><rect x="9" y="-18" width="12" height="4.5" rx="2.2" fill="var(--pergaminho)" stroke="var(--bronze)" strokeWidth=".8" /><path d="M10.5 -18V-13.5M19.5 -18V-13.5" stroke="var(--sangue)" strokeWidth="1.2" /></g>
        {(l.estado !== "ocioso" || usoLocal(t)) && <Bolha l={l} local={usoLocal(t)} />}
      </g>
    );
  };
  const todos = linhas.map((l) => l.tecnico);

  return (
    <svg ref={svg} className={`cena${calmo ? " cena-calma" : ""}`} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label="Escritório da guilda: cinco salas e a mesa do Regente" preserveAspectRatio="xMidYMid meet">
      <Fundo p={PLANTA} />
      <g>{todos.filter((t) => set.has(t)).map(agente)}</g>
      <Moveis />
      <g>{todos.filter((t) => !set.has(t)).map(agente)}</g>
      <rect className="tinte" width={VIEW.w} height={VIEW.h} pointerEvents="none" />
    </svg>
  );
}
