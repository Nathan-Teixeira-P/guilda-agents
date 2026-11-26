import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Papel } from "../logic/events.ts";
import { membro } from "../roster.ts";
import { Membro } from "./Avatar.tsx";
import { Terminal } from "./Terminal.tsx";
import type { Item } from "../../../server/src/transcript.ts";

const W = 440, H = 330, GAP = 48, FALA = 120; // FALA: extra height of the Regente's window for its message box
const CHAVE = "guilda.canvas";
const salvas = (): Record<string, Pt> => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Record<string, Pt>; } catch { return {}; } };
type Pt = { x: number; y: number };

/** The Regente on top, the others in rows below it. */
const lugar = (i: number, total: number, cols: number): Pt => {
  const largura = Math.min(cols, Math.max(1, total - 1)) * (W + GAP) - GAP;
  if (i === 0) return { x: (largura - W) / 2, y: 0 };
  return { x: ((i - 1) % cols) * (W + GAP), y: (Math.floor((i - 1) / cols) + 1) * (H + GAP) + FALA };
};

/** Orchestration canvas: one terminal window per role, draggable, wired to the Regente; drag the background to move, Ctrl+wheel to zoom. */
export function Canvas({ papeis, rotulo, vivo, fala, conversas = {} }: { papeis: Papel[]; rotulo: (e: Papel["estado"]) => string; vivo: boolean; fala?: ReactNode; conversas?: Record<string, Item[]> }) {
  const [grande, setGrande] = useState<string>(); // role whose terminal is open over the whole screen
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (grande !== undefined) dialogo.current?.showModal(); }, [grande]);
  const aberto = papeis.find((p) => p.tipo === grande);
  const caixa = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState({ x: 24, y: 24, z: 1 });
  const [movidos, setMovidos] = useState<Record<string, Pt>>(salvas);
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(movidos)); } catch { /* private mode: positions last until reload */ } }, [movidos]);
  const arrasto = useRef<{ no?: string; de: Pt; base: Pt }>(undefined);
  const mexeu = useRef(false);
  const [tam, setTam] = useState("0x0");
  const largura = Number(tam.split("x")[0]);
  const cols = Math.max(2, Math.min(5, Math.floor(largura / 300)));
  const pos = (p: Papel, i: number) => movidos[p.tipo] ?? lugar(i, papeis.length, cols);

  const ajustar = useCallback(() => {
    const c = caixa.current;
    if (!c || papeis.length === 0) return;
    const pts = papeis.map(pos);
    const minX = Math.min(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y));
    const larg = Math.max(...pts.map((p) => p.x)) + W - minX, alt = Math.max(...pts.map((p, i) => p.y + (i === 0 ? H + FALA : H))) - minY;
    const z = Math.max(0.35, Math.min(1, (c.clientWidth - 48) / larg, (c.clientHeight - 48) / alt));
    setVista({ x: (c.clientWidth - larg * z) / 2 - minX * z, y: 24 - minY * z, z });
  }, [papeis, movidos, cols]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const o = new ResizeObserver(() => setTam(`${caixa.current?.clientWidth ?? 0}x${caixa.current?.clientHeight ?? 0}`));
    o.observe(caixa.current!);
    return () => o.disconnect();
  }, []);
  // fit when the box is resized or a new role shows up, until the user takes over the view
  useEffect(() => { if (!mexeu.current) ajustar(); }, [papeis.length, tam]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Zoom around a point of the viewport (its centre by default). */
  const zoom = useCallback((f: number, cx?: number, cy?: number) => {
    mexeu.current = true;
    setVista((v) => {
      const c = caixa.current!, z = Math.max(0.35, Math.min(1.6, v.z * f)), k = z / v.z;
      const px = cx ?? c.clientWidth / 2, py = cy ?? c.clientHeight / 2;
      return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);
  useEffect(() => { // native listener: React's wheel handler is passive and cannot stop the browser zoom
    const c = caixa.current!;
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    };
    c.addEventListener("wheel", roda, { passive: false });
    return () => c.removeEventListener("wheel", roda);
  }, [zoom]);

  const pegar = (e: React.PointerEvent, base: Pt, no?: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { de: { x: e.clientX, y: e.clientY }, base, ...(no !== undefined ? { no } : {}) };
  };
  const mover = (e: React.PointerEvent) => {
    const a = arrasto.current;
    if (!a) return;
    mexeu.current = true;
    const dx = e.clientX - a.de.x, dy = e.clientY - a.de.y;
    if (a.no !== undefined) setMovidos((m) => ({ ...m, [a.no!]: { x: a.base.x + dx / vista.z, y: a.base.y + dy / vista.z } }));
    else setVista((v) => ({ ...v, x: a.base.x + dx, y: a.base.y + dy }));
  };
  const soltar = () => { arrasto.current = undefined; };
  const setas = (e: React.KeyboardEvent, tipo: string, p: Pt) => {
    const d = ({ ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    mexeu.current = true;
    setMovidos((m) => ({ ...m, [tipo]: { x: p.x + d[0], y: p.y + d[1] } }));
  };

  const raiz = papeis[0] ? pos(papeis[0], 0) : { x: 0, y: 0 };
  return (
    <div className="canvas" ref={caixa} style={{ backgroundPosition: `${vista.x}px ${vista.y}px`, backgroundSize: `${24 * vista.z}px ${24 * vista.z}px` }}
      onPointerDown={(e) => pegar(e, { x: vista.x, y: vista.y })} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      <div className="canvas-mundo" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})` }}>
        <svg className="canvas-fios" aria-hidden="true">
          {papeis.slice(1).map((p, i) => {
            const d = pos(p, i + 1), x1 = raiz.x + W / 2, y1 = raiz.y + H + FALA, x2 = d.x + W / 2, y2 = d.y, m = (y1 + y2) / 2;
            return <path key={p.tipo} className={vivo && p.estado === "ativo" ? "ativo" : ""} d={`M${x1} ${y1}C${x1} ${m} ${x2} ${m} ${x2} ${y2}`} />;
          })}
        </svg>
        {papeis.map((p, i) => {
          const xy = pos(p, i), nome = membro(p.tipo || undefined).codinome;
          return (
            <section key={p.tipo} className={`no${vivo && p.estado === "ativo" ? " ativo" : ""}`} style={{ left: xy.x, top: xy.y, width: W, height: i === 0 ? H + FALA : H }} aria-label={`Janela de ${nome}`} onPointerDown={(e) => e.stopPropagation()}>
              <header tabIndex={0} title="Arraste (ou use as setas) para mover" onPointerDown={(e) => pegar(e, xy, p.tipo)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} onKeyDown={(e) => setas(e, p.tipo, xy)}>
                <Membro agente={p.tipo || "?"} tamanho={20} />
                {p.vezes > 1 && <span className="muted small">×{p.vezes}</span>}
                <button type="button" className="no-abrir" aria-label={`Abrir o terminal de ${nome} em tela cheia`} onPointerDown={(e) => e.stopPropagation()} onClick={() => setGrande(p.tipo)}>⤢</button>
              </header>
              <Terminal itens={conversas[p.tipo]} linhas={p.linhas} nome={nome} />
              <footer className="muted small">{rotulo(p.estado)} · {p.tokens.toLocaleString("pt-BR")} tokens</footer>
              {i === 0 && fala}
            </section>
          );
        })}
      </div>
      {aberto && (
        <dialog ref={dialogo} className="term-grande" aria-label="Terminal do agente" onClose={() => setGrande(undefined)} onPointerDown={(e) => e.stopPropagation()}>
          <header><Membro agente={aberto.tipo || "?"} tamanho={24} /><button type="button" className="btn chico" autoFocus onClick={() => dialogo.current?.close()}>Fechar</button></header>
          <Terminal itens={conversas[aberto.tipo]} linhas={aberto.linhas} nome={membro(aberto.tipo || undefined).codinome} />
        </dialog>
      )}
      <div className="canvas-botoes" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="btn chico" aria-label="Afastar" onClick={() => zoom(1 / 1.2)}>−</button>
        <button type="button" className="btn chico" aria-label="Aproximar" onClick={() => zoom(1.2)}>+</button>
        <button type="button" className="btn chico" onClick={() => { mexeu.current = false; ajustar(); }}>Ajustar à tela</button>
        {Object.keys(movidos).length > 0 && <button type="button" className="btn chico" onClick={() => { setMovidos({}); mexeu.current = false; }}>Reorganizar</button>}
      </div>
    </div>
  );
}
