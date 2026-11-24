import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { api } from "../api.ts";
import { erroDeAcao } from "../logic/erros.ts";
import { go } from "../router.ts";
import { groupByStage, STAGE_LABEL, STAGE_ORDER, URGENCY, type M, type Stage } from "../logic/stages.ts";
import { formatDesde } from "../logic/time.ts";
import { useMedia, useNow, type Live } from "../store.ts";

const MAX_CONCLUIDAS = 10;

/** Quick actions on the card: Pausar (stays where it is), Parar (recolhe) and Retomar. */
function Acoes({ m, onChange }: { m: M; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string>();
  const ativa = m.stage === "planejando" || m.stage === "executando";
  if (!ativa && m.stage !== "pausada" && m.stage !== "parada") return null;
  async function agir(f: () => ReturnType<typeof api.stop>) {
    setBusy(true); setErro(undefined);
    const r = await f();
    setBusy(false);
    if (!r.ok) setErro(erroDeAcao(r));
    onChange();
  }
  const parar = () => { if (window.confirm("Parar e recolher a missão? Você pode retomá-la depois.")) void agir(() => api.stop(m.id)); };
  return (
    <>
      <div className="row" style={{ marginTop: "var(--e-3)" }}>
        {ativa && <button type="button" className="btn chico" disabled={busy} onClick={() => void agir(() => api.pause(m.id))}>❚❚ Pausar</button>}
        {(m.stage === "pausada" || m.stage === "parada") && <button type="button" className="btn chico primario" disabled={busy} onClick={() => void agir(() => api.resume(m.id))}>▶ Retomar</button>}
        {m.stage !== "parada" && <button type="button" className="btn chico perigo" disabled={busy} onClick={parar}>■ Parar</button>}
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}
    </>
  );
}

/** Article (Redação) shown on the board as a card: same stages, links to its own screen, no quick actions. */
type Item = M & { artigo?: true; titulo?: string };

function Card({ m, projeto, now, onChange }: { m: Item; projeto: string; now: number; onChange: () => void }) {
  const titulo = m.titulo ?? ((m.demanda ?? "").split("\n")[0]?.trim() || "(sem demanda)");
  const motivo = m.stage === "pausada" ? m.pauseReason : m.stage === "parada" ? m.stopReason : undefined;
  return (
    <li className={`card s-${m.stage}`}>
      <div className="tit" title={titulo}><a className="cartao-link" href={`#/${m.artigo ? "redacao" : "missao"}/${encodeURIComponent(m.id)}`}>{titulo}</a></div>
      <div className="meta">
        <span>{projeto}</span>
        <span>{formatDesde(m.updatedAt, now)}</span>
        <span className="muted" title="Custo de tabela, apenas informativo">US$ {m.costUsd.toFixed(2)} info</span>
      </div>
      {motivo && <p className="motivo"><strong>{m.stage === "pausada" ? "Motivo da pausa" : "Motivo"}:</strong> {motivo}</p>}
      {!m.artigo && <Acoes m={m} onChange={onChange} />}
    </li>
  );
}

export function Quadro({ live }: { live: Live }) {
  const now = useNow();
  const mobile = useMedia("(max-width: 639px)");
  const { projects, loading, error, artigos } = live;
  const missions = useMemo<Item[]>(() => [
    ...live.missions,
    ...artigos.map((a): Item => ({ id: a.id, project: "Redação", stage: a.stage, costUsd: a.costUsd, createdAt: a.createdAt, updatedAt: a.updatedAt, ...(a.pauseReason ? { pauseReason: a.pauseReason } : {}), ...(a.stopReason ? { stopReason: a.stopReason } : {}), artigo: true, titulo: `✎ ${a.tema || (a.pedido?.modo === "sugerir" ? "Sugestões de temas" : a.id)}` })),
  ], [live.missions, artigos]);
  const groups = useMemo(() => groupByStage(missions) as Record<Stage, Item[]>, [missions]);
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
                <ul className="cards">{lista.map((m) => <Card key={m.id} m={m} projeto={m.artigo ? "Redação" : nome(m.project)} now={now} onChange={live.reload} />)}</ul>
              )}
              {s === "concluida" && todas.length > MAX_CONCLUIDAS && <p className="hint">Mostrando as {MAX_CONCLUIDAS} últimas de {todas.length}.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
