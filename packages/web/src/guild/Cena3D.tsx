import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { corDe } from "../roster.ts";
import { derivarPainel } from "../logic/escritorio.ts";
import { exibido } from "../logic/frescor.ts";
import { FICHA } from "../logic/guilda.ts";
import { useNow } from "../store.ts";
import type { Live } from "../store.ts";
import { AutoUso, Frescor } from "../ui/AutoUso.tsx";
import { Consultar, Legendas } from "../ui/Emblem.tsx";
import { linhasDe, useReduzido } from "./Cena.tsx";
import { criarMundo, type Mundo } from "./Mundo3D.ts";

interface Props { live: Live; selecionado?: string | undefined; onSelecionar: (t: string | undefined) => void; onFalha: (motivo: string) => void }

/** The 3D hideout. Same plan as the 2D scene (logic/fortaleza.ts); three.js lives only in this lazy chunk. React renders the overlays; the canvas is driven imperatively. */
export default function Cena3D({ live, selecionado, onSelecionar, onFalha }: Props) {
  const painel = useMemo(() => derivarPainel(live.missions, live.events, (id) => live.projects.find((p) => p.id === id)?.nome ?? id), [live.missions, live.events, live.projects]);
  const linhas = useMemo(() => linhasDe(painel.atividade, painel.tokens), [painel]);
  const calmo = useReduzido();
  const now = useNow();
  const u = exibido(live.usage, live.auto, now);
  const host = useRef<HTMLDivElement>(null);
  const mundo = useRef<Mundo>(undefined);
  const bolhas = useRef(new Map<string, HTMLElement>());
  const [hover, setHover] = useState<string>();
  const cb = useRef({ selecionado, onSelecionar, onFalha });
  cb.current = { selecionado, onSelecionar, onFalha };
  const local = live.local?.emUso?.agent;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    try {
      mundo.current = criarMundo({
        host: el, calmo, toque: window.matchMedia("(pointer: coarse)").matches,
        onClicar: (t) => cb.current.onSelecionar(cb.current.selecionado === t ? undefined : t),
        onHover: setHover,
        onFalha: (m) => cb.current.onFalha(m),
        bolhas: () => bolhas.current,
      });
    } catch { /* criarMundo already reported the failure: the parent switches to 2D */ }
    return () => { mundo.current?.dispose(); mundo.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { mundo.current?.setCalmo(calmo); }, [calmo]);
  useEffect(() => {
    mundo.current?.atualizar({ atividade: painel.atividade, selecionado, uso: u, local, aoVivo: painel.aoVivo });
    mundo.current?.pedirQuadro();
  }, [painel, selecionado, u.estado === "ok" ? u : u.motivo, local, hover, now]);
  const ref = useCallback((id: string) => (el: HTMLElement | null) => { if (el) bolhas.current.set(id, el); else bolhas.current.delete(id); }, []);
  const mostradas = linhas.filter((l) => l.estado !== "ocioso" || local === l.tecnico || selecionado === l.tecnico || hover === l.tecnico);

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onSelecionar(undefined); return; }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = linhas.findIndex((l) => l.tecnico === selecionado);
    const n = linhas.length;
    onSelecionar(linhas[(i + (e.key === "ArrowRight" ? 1 : -1) + n) % n]?.tecnico);
  };

  return (
    <div className="cena3d">
      <div ref={host} className="cena3d-host" tabIndex={0} role="group" aria-label="Fortaleza da guilda em 3D: contratos ao fundo, portaria no meio, sala de treinamento à frente. Setas esquerda e direita percorrem os membros; Esc limpa a seleção. A lista Quem faz o quê traz a mesma informação." onKeyDown={teclas}>
        <div className="cena3d-bolhas" aria-hidden="true">
          {mostradas.map((l) => {
            const marcado = selecionado === l.tecnico || hover === l.tecnico;
            const txt = l.estado === "falhou" ? "falhou" : l.ferramenta ?? "em campo";
            return (
              <div key={l.tecnico} ref={ref(l.tecnico)} className={`bolha3d${l.estado === "falhou" ? " erro" : ""}${marcado ? " marcada" : ""}`} style={{ display: "none", ["--cor-ag" as string]: corDe(l.tecnico) }}>
                {local === l.tecnico && <span className="bolha3d-local">local</span>}
                {(marcado || (l.estado === "ativo" && l.projeto)) && <strong>{l.codinome}{l.projeto ? <span className="bolha3d-proj"> · {l.projeto}</span> : null}</strong>}
                <span className="bolha3d-l"><span className={`mod3d m-${l.modelo}`}>{l.estado === "falhou" ? "!" : (FICHA[l.tecnico]?.modelo ?? l.modelo)[0]!.toUpperCase()}</span>{l.estado !== "ocioso" && <span>{txt.length > 14 ? `${txt.slice(0, 13)}…` : txt}</span>}</span>
              </div>
            );
          })}
        </div>
      </div>
      <aside className="cena3d-uso panel" aria-label="Uso do plano Claude">
        <h3>Plano Claude</h3>
        <Legendas u={u} now={now} />
        <Frescor uso={live.usage} auto={live.auto} now={now} />
        <Consultar onConsultar={live.consultarUso} />
        <AutoUso auto={live.auto} onAuto={live.definirAuto} />
        {!live.auto && <p className="hint">Só atualiza com eventos de limite do Claude ou ao consultar.</p>}
      </aside>
    </div>
  );
}
