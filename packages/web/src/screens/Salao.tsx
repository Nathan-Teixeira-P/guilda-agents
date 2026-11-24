import { useMemo } from "react";
import { aguardamSelo, contagemPorEstagio, STAGE_LABEL, STAGE_ORDER, type M } from "../logic/stages.ts";
import { formatDesde } from "../logic/time.ts";
import { Avatar } from "../ui/Avatar.tsx";
import { Escritorio } from "./Escritorio.tsx";
import { Mapa } from "../guild/Mapa.tsx";
import { useNow, type Live } from "../store.ts";

const titulo = (m: M) => (m.demanda ?? "").split("\n")[0]?.trim() || "(sem demanda)";

/** The hall as a list of districts (the SVG map is spec 012). The seals waiting for the user come first. */
export function Salao({ live }: { live: Live }) {
  const now = useNow();
  const { missions, projects, loading, error } = live;
  const nome = (id: string) => projects.find((p) => p.id === id)?.nome ?? id;
  const selos = useMemo(() => aguardamSelo(missions), [missions]);
  const head = <div className="sec"><h1>Salão da Guilda</h1></div>;

  if (loading) return <>{head}<div className="lista" aria-busy="true" aria-label="Carregando o salão"><div className="skeleton" /><div className="skeleton" /></div></>;
  if (error && missions.length === 0 && projects.length === 0) {
    return <>{head}<div className="vazio"><p role="alert" className="err">{error === "servidor fora do ar" ? "O servidor está fora do ar. Não foi possível carregar o salão." : `Não foi possível carregar o salão: ${error}`}</p><button type="button" className="btn" onClick={live.reload}>Tentar de novo</button></div></>;
  }

  return (
    <>
      {head}
      <a className="gu-link" href="#/guilda">
        <span className="gu-trio" aria-hidden="true">{["orchestrator", "coder", "frontend-architect"].map((a) => <Avatar key={a} oculto agente={a} tamanho={56} />)}</span>
        <span><strong>Conheça a Guilda</strong><span className="muted">Os 23 membros, seus mantos, ofícios e modelos.</span></span>
      </a>
      {selos.length > 0 && (
        <section className="faixa" aria-labelledby="fx-t">
          <h2 id="fx-t">Aguardam seu selo ({selos.length})</h2>
          <ul className="lista-simples">
            {selos.map((m) => <li key={m.id}><a href={`#/missao/${encodeURIComponent(m.id)}`}>{titulo(m)}</a> <span className="muted">· {nome(m.project)} · {formatDesde(m.updatedAt, now)}</span></li>)}
          </ul>
        </section>
      )}
      <Escritorio live={live} lista={false} />
      <p className="hint"><a href="#/escritorio">Abrir o Escritório completo</a> com a lista de quem faz o quê.</p>
      <details className="mapa-det" open>
        <summary>Mapa dos distritos</summary>
        <Mapa live={live} />
      </details>
      <h2 className="sec-t">Distritos</h2>
      {projects.length === 0 ? (
        <div className="vazio">
          <p>Nenhum distrito no salão. Anexe um projeto para a guilda trabalhar.</p>
          <a className="btn primario" href="#/projetos">+ Anexar projeto</a>
        </div>
      ) : (
        <ul className="lista">
          {projects.map((p) => {
            const c = contagemPorEstagio(missions, p.id);
            const ativos = STAGE_ORDER.filter((s) => c[s] > 0);
            const total = ativos.reduce((s, k) => s + c[k], 0);
            return (
              <li key={p.id}>
                <div className="cab">
                  <h3>{p.nome}</h3>
                  <a className="btn chico" href={`#/nova?projeto=${encodeURIComponent(p.id)}`}>Nova missão aqui</a>
                </div>
                <p className="caminho">{p.caminho}</p>
                {total === 0 ? <p className="hint">Nenhuma missão neste distrito.</p> : (
                  <ul className="contagens" aria-label={`Missões de ${p.nome} por estágio`}>
                    {ativos.map((s) => <li key={s}><span className={`pill estagio s-${s}`}>{STAGE_LABEL[s].rotulo}: {c[s]}</span></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
