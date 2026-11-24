import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Cena, fmtTokens, linhasDe, rotuloEstado, type Linha } from "../guild/Cena.tsx";
import { escolherVista, lerVista, type Vista } from "../logic/cena3d.ts";
import { derivarPainel } from "../logic/escritorio.ts";
import { FICHA } from "../logic/guilda.ts";
import { Avatar } from "../guild/Avatar.tsx";
import { membro } from "../roster.ts";
import type { Live } from "../store.ts";

// three.js stays out of the main bundle: the 3D scene is its own chunk, fetched only when the hall opens in 3D.
const Cena3D = lazy(() => import("../guild/Cena3D.tsx"));
const CHAVE_VISTA = "escritorio-vista";
const lerPref = () => { try { return lerVista(localStorage.getItem(CHAVE_VISTA)); } catch { return undefined; } };
const gravarPref = (v: Vista) => { try { localStorage.setItem(CHAVE_VISTA, v); } catch { /* session only */ } };
function temWebgl() {
  try { const c = document.createElement("canvas"); const gl = c.getContext("webgl2") ?? c.getContext("webgl"); gl?.getExtension("WEBGL_lose_context")?.loseContext(); return !!gl; } catch { return false; }
}

/** The scene with its status line, the agent card and (optionally) the text alternative. Shared by the Escritório screen and the Salão. */
export function Escritorio({ live, lista = true }: { live: Live; lista?: boolean }) {
  const painel = useMemo(() => derivarPainel(live.missions, live.events, (id) => live.projects.find((p) => p.id === id)?.nome ?? id), [live.missions, live.events, live.projects]);
  const linhas = useMemo(() => linhasDe(painel.atividade, painel.tokens), [painel]);
  const [sel, setSel] = useState<string>();
  useEffect(() => {
    if (!sel) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(undefined); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [sel]);
  const ativos = linhas.filter((l) => l.estado === "ativo");
  const falhos = linhas.filter((l) => l.estado === "falhou");
  const resumo = painel.aoVivo
    ? `Missão ativa. ${ativos.length === 0 ? "Ninguém em campo ainda." : `Em campo: ${ativos.map((l) => l.codinome).join(", ")}.`}${falhos.length ? ` Falharam: ${falhos.map((l) => l.codinome).join(", ")}.` : ""}`
    : `Nenhuma missão ativa. O salão está calmo.${falhos.length ? ` Falharam: ${falhos.map((l) => l.codinome).join(", ")}.` : ""}`;
  const [pref, setPref] = useState(lerPref);
  const [webgl] = useState(temWebgl);
  const [falha, setFalha] = useState<string>();
  const { vista, aviso } = escolherVista({ preferida: pref, webgl, falha });
  const escolher = (v: Vista) => { setPref(v); setFalha(undefined); gravarPref(v); };
  const card = linhas.find((l) => l.tecnico === sel);

  return (
    <section className="escritorio" aria-label="Escritório da guilda">
      <p className={`cena-status${painel.aoVivo ? " viva" : ""}`}><span className="ponto" aria-hidden="true" />{painel.aoVivo ? `Missão ativa · ${ativos.length} em campo${falhos.length ? ` · ${falhos.length} com alarme` : ""}` : "Nenhuma missão ativa"}</p>
      <p className="sr-only" role="status" aria-live="polite">{resumo}</p>
      <div className="cena-vista" role="group" aria-label="Vista do escritório">
        <button type="button" className="btn chico" aria-pressed={vista === "2d"} onClick={() => escolher("2d")}>2D</button>
        <button type="button" className="btn chico" aria-pressed={vista === "3d"} disabled={!webgl} onClick={() => escolher("3d")}>3D</button>
        {vista === "3d" && <span className="hint">Arraste para girar · Ctrl + roda para aproximar</span>}
      </div>
      {aviso && <p className="hint" role="status">{aviso}</p>}
      <div className="cena-moldura">
        {vista === "3d"
          ? <Suspense fallback={<Cena live={live} selecionado={sel} onSelecionar={setSel} />}><Cena3D live={live} selecionado={sel} onSelecionar={setSel} onFalha={setFalha} /></Suspense>
          : <Cena live={live} selecionado={sel} onSelecionar={setSel} />}
      </div>
      {card && <Ficha l={card} onFechar={() => setSel(undefined)} />}
      {lista && <Lista linhas={linhas} sel={sel} onSel={setSel} />}
    </section>
  );
}

function Ficha({ l, onFechar }: { l: Linha; onFechar: () => void }) {
  const m = membro(l.tecnico);
  return (
    <aside className="cena-ficha" aria-label={`Ficha de ${l.codinome}`}>
      <div>
        <h3>{l.codinome} <span className="muted">· {m.grupo.nome}</span></h3>
        <p>{FICHA[l.tecnico]?.funcao}</p>
        <dl>
          {l.projeto && <div><dt>Projeto</dt><dd>{l.projeto}</dd></div>}
          <div><dt>Sala</dt><dd>{l.sala}</dd></div>
          <div><dt>Modelo</dt><dd><span className={`pill gu-m-${l.modelo}`}>{l.modelo}</span></dd></div>
          <div><dt>Estado</dt><dd className={l.estado === "falhou" ? "err" : ""}>{rotuloEstado(l)}</dd></div>
          <div><dt>Tokens</dt><dd>{l.tokens ? fmtTokens(l.tokens) : "sem dados"}</dd></div>
        </dl>
      </div>
      <button type="button" className="btn chico" onClick={onFechar}>Fechar</button>
    </aside>
  );
}

function Lista({ linhas, sel, onSel }: { linhas: Linha[]; sel: string | undefined; onSel: (t: string | undefined) => void }) {
  const salas = [...new Set(linhas.map((l) => l.sala))];
  return (
    <div className="cena-lista">
      <h2 className="sec-t">Quem faz o quê</h2>
      <div className="cena-grade">
        {salas.map((s) => (
          <section key={s} aria-label={s}>
            <h3>{s}</h3>
            <ul className="lista-simples">
              {linhas.filter((l) => l.sala === s).map((l) => (
                <li key={l.tecnico}>
                  <button type="button" className={`cena-item ${l.estado}`} aria-pressed={sel === l.tecnico} onClick={() => onSel(sel === l.tecnico ? undefined : l.tecnico)}>
                    <Avatar agente={l.tecnico} tamanho={20} oculto /> <strong>{l.codinome}</strong> <span className="muted">{rotuloEstado(l)}{l.projeto ? ` · ${l.projeto}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function EscritorioTela({ live }: { live: Live }) {
  return (
    <>
      <div className="sec"><h1>Escritório</h1></div>
      <p className="muted">A guilda por dentro: quem está em campo senta à sua mesa, os demais circulam pelo salão. Clique (ou use Tab e Enter) em um membro para ver a ficha.</p>
      <Escritorio live={live} />
    </>
  );
}
