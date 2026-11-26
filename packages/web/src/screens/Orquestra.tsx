import { useMemo } from "react";
import { janelasDe, porPapel, tokensVivos } from "../logic/events.ts";
import { trabalhando } from "../logic/guilda.ts";
import type { M } from "../logic/stages.ts";
import { formatDesde } from "../logic/time.ts";
import { useNow, type Live } from "../store.ts";
import { FalarComGuilda } from "../ui/AjusteBox.tsx";
import { useConversas } from "../ui/Terminal.tsx";
import { Canvas } from "../ui/Canvas.tsx";
import { StageBadge } from "../ui/StageBadge.tsx";
import { useEventos } from "../ui/useEventos.ts";

const titulo = (m: M) => (m.demanda ?? "").split("\n")[0]?.trim() || "(sem demanda)";

/** Missions list; picking one opens its orchestration canvas. */
export function Orquestra({ live, id }: { live: Live; id?: string }) {
  const m = live.missions.find((x) => x.id === id);
  if (m) return <Tela key={m.id} m={m} live={live} />;
  return <Lista live={live} />;
}

function Lista({ live }: { live: Live }) {
  const now = useNow();
  const missoes = live.missions
    .filter((m) => (m as unknown as { kind?: string }).kind !== "redacao")
    .sort((a, b) => Number(trabalhando(b)) - Number(trabalhando(a)) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className="sec"><h1>Orquestra</h1></div>
      <p className="muted">Escolha uma missão para ver a equipe no canvas. As que estão rodando vêm primeiro.</p>
      {missoes.length === 0 ? <p className="hint">{live.loading ? "Carregando…" : "Nenhuma missão ainda."}</p> : (
        <ul className="orq-lista">
          {missoes.map((m) => (
            <li key={m.id}>
              <a className="panel" href={`#/orquestra/${encodeURIComponent(m.id)}`}>
                <StageBadge stage={m.stage} />
                <strong>{titulo(m)}</strong>
                <span className="muted small">{live.projects.find((p) => p.id === m.project)?.nome ?? m.project} · {formatDesde(m.updatedAt, now)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Tela({ m, live }: { m: M; live: Live }) {
  useEventos(live, [m.id]);
  const eventos = useMemo(() => live.events[m.id] ?? [], [live.events, m.id]);
  const papeis = useMemo(() => porPapel(janelasDe(eventos), tokensVivos(eventos).porAgente), [eventos]);
  const vivo = trabalhando(m);
  const conversas = useConversas(m.id, vivo);
  return (
    <>
      <a className="voltar" href="#/orquestra">‹ Orquestra</a>
      <div className="sec">
        <div>
          <h1 className="titulo-missao">{titulo(m)}</h1>
          <p className="meta-m"><StageBadge stage={m.stage} /> <span>{live.projects.find((p) => p.id === m.project)?.nome ?? m.project}</span></p>
        </div>
        <a className="btn chico" href={`#/missao/${encodeURIComponent(m.id)}`}>Abrir a missão</a>
      </div>
      {eventos.length === 0 ? <p className="hint">Nenhum evento registrado para esta missão.</p> : <Canvas conversas={conversas} papeis={papeis} vivo={vivo} fala={<FalarComGuilda m={m} onFeito={live.reload} />} rotulo={(e) => (e === "concluido" ? "terminou" : e === "falhou" ? "falhou" : vivo ? "em campo" : "interrompido")} />}
    </>
  );
}
