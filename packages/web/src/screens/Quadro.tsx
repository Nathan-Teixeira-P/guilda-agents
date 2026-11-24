import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { go } from "../router.ts";
import { groupByStage, STAGE_LABEL, STAGE_ORDER, URGENCY, type M, type Stage } from "../logic/stages.ts";
import { formatDesde } from "../logic/time.ts";
import { useMedia, useNow, type Live } from "../store.ts";

const MAX_CONCLUIDAS = 10;

function Card({ m, projeto, now }: { m: M; projeto: string; now: number }) {
  const titulo = (m.demanda ?? "").split("\n")[0]?.trim() || "(sem demanda)";
  const motivo = m.stage === "pausada" ? m.pauseReason : m.stage === "parada" ? m.stopReason : undefined;
  return (
    <li className={`card s-${m.stage}`}>
      <div className="tit" title={titulo}><a className="cartao-link" href={`#/missao/${encodeURIComponent(m.id)}`}>{titulo}</a></div>
      <div className="meta">
        <span>{projeto}</span>
        <span>{formatDesde(m.updatedAt, now)}</span>
        <span className="muted" title="Custo de tabela, apenas informativo">US$ {m.costUsd.toFixed(2)} info</span>
      </div>
      {motivo && <p className="motivo"><strong>{m.stage === "pausada" ? "Motivo da pausa" : "Motivo"}:</strong> {motivo}</p>}
    </li>
  );
}

export function Quadro({ live }: { live: Live }) {
  const now = useNow();
  const mobile = useMedia("(max-width: 639px)");
  const { missions, projects, loading, error } = live;
  const groups = useMemo(() => groupByStage(missions), [missions]);
  const nome = (id: string) => projects.find((p) => p.id === id)?.nome ?? id;
  const firstNonEmpty = URGENCY.find((s) => groups[s].length > 0) ?? "aguardando-aprovacao";
  const [aba, setAba] = useState<Stage>();
  const ativa = aba ?? firstNonEmpty;

  useEffect(() => { if (mobile) document.getElementById(`aba-${ativa}`)?.scrollIntoView({ inline: "nearest", block: "nearest" }); }, [mobile, ativa, loading]);

  function teclas(e: KeyboardEvent) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = STAGE_ORDER[(STAGE_ORDER.indexOf(ativa) + d + STAGE_ORDER.length) % STAGE_ORDER.length]!;
    setAba(next);
    document.getElementById(`aba-${next}`)?.focus();
  }

  const header = (
    <div className="sec">
      <h1>Quadro de missões</h1>
    </div>
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="board" aria-busy="true" aria-label="Carregando missões">
          {STAGE_ORDER.map((s) => <div key={s} className="col"><div className="skeleton" /></div>)}
        </div>
      </>
    );
  }
  if (error && missions.length === 0) {
    return (
      <>
        {header}
        <div className="vazio">
          <p role="alert" className="err">{error === "servidor fora do ar" ? "O servidor está fora do ar. Não foi possível carregar as missões." : `Não foi possível carregar as missões: ${error}`}</p>
          <button type="button" className="btn" onClick={live.reload}>Tentar de novo</button>
        </div>
      </>
    );
  }
  if (missions.length === 0) {
    return (
      <>
        {header}
        <div className="vazio">
          <p>Nenhum contrato ainda.</p>
          <button type="button" className="btn primario" onClick={() => go("/nova")}>Nova missão (N)</button>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {mobile && (
        <div className="tabs" role="tablist" aria-label="Estágios" onKeyDown={teclas}>
          {STAGE_ORDER.map((s) => (
            <button key={s} id={`aba-${s}`} role="tab" type="button" aria-selected={ativa === s} aria-controls={`col-${s}`} tabIndex={ativa === s ? 0 : -1} onClick={() => setAba(s)}>
              {STAGE_LABEL[s].rotulo} · {groups[s].length}
            </button>
          ))}
        </div>
      )}
      <div className="board">
        {STAGE_ORDER.map((s) => {
          const todas = groups[s];
          const lista = s === "concluida" ? todas.slice(0, MAX_CONCLUIDAS) : todas;
          return (
            <section key={s} id={`col-${s}`} role={mobile ? "tabpanel" : undefined} aria-labelledby={mobile ? `aba-${s}` : `h-${s}`} className={`col${s === "aguardando-aprovacao" ? " destaque" : ""}${mobile && ativa === s ? " ativa" : ""}`}>
              <h2 id={`h-${s}`}>{STAGE_LABEL[s].rotulo} <span className="pill">{todas.length}</span></h2>
              <p className="tec">{STAGE_LABEL[s].tecnico}</p>
              {lista.length === 0 ? (
                <p className="col-vazia">{s === "aguardando-aprovacao" ? "Nada aguardando seu selo." : "Nada por aqui."}</p>
              ) : (
                <ul className="cards">{lista.map((m) => <Card key={m.id} m={m} projeto={nome(m.project)} now={now} />)}</ul>
              )}
              {s === "concluida" && todas.length > MAX_CONCLUIDAS && <p className="hint">Mostrando as {MAX_CONCLUIDAS} últimas de {todas.length}.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
