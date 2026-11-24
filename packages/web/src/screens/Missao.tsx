import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Detalhe } from "../api.ts";
import { go } from "../router.ts";
import { TetosPlano, lerTetos } from "../ui/TetosPlano.tsx";
import { type M } from "../logic/stages.ts";
import { formatDesde } from "../logic/time.ts";
import { useNow, type Live } from "../store.ts";
import { StageBadge } from "../ui/StageBadge.tsx";
import { Guerra } from "./Guerra.tsx";
import { Vivo } from "./Vivo.tsx";

export type Vista = "guerra" | "vivo";
/** One route, two views: planning/executing is watched live; everything else (waiting for the seal, paused, finished) is read in the war room. */
export const vistaPadrao = (m: Pick<M, "stage">): Vista => (m.stage === "planejando" || m.stage === "executando" ? "vivo" : "guerra");

interface Estado { loading: boolean; data?: Detalhe; error?: string; status?: number }

/** Full mission (with the package) fetched on mount and whenever the live summary changes. */
function useDetalhe(id: string, versao: string | undefined) {
  const [st, setSt] = useState<Estado>({ loading: true });
  const load = useCallback(async () => {
    const r = await api.mission(id);
    setSt((cur) => (r.ok ? { loading: false, data: r.data } : { loading: false, error: r.error, status: r.status, ...(cur.data ? { data: cur.data } : {}) }));
  }, [id]);
  useEffect(() => { void load(); }, [load, versao]);
  return { ...st, reload: load };
}

export function Missao({ id, forcada, live }: { id: string; forcada?: Vista; live: Live }) {
  const liveM = live.missions.find((m) => m.id === id);
  const det = useDetalhe(id, liveM?.updatedAt);
  const now = useNow();
  const h1 = useRef<HTMLHeadingElement>(null);
  const m: M | undefined = det.data ? { ...det.data.mission, ...liveM } : liveM;
  const vista: Vista | undefined = m ? (forcada ?? vistaPadrao(m)) : undefined;

  const antes = useRef<Vista>(undefined);
  useEffect(() => { // after sealing, the view changes: focus goes to the new h1
    if (vista && antes.current && antes.current !== vista) h1.current?.focus();
    if (vista) antes.current = vista;
  }, [vista]);

  if (!m) {
    if (det.loading || (live.loading && !det.error)) return <div aria-busy="true" aria-label="Carregando missão"><div className="skeleton" /><div className="skeleton" style={{ marginTop: 12 }} /></div>;
    return (
      <div className="vazio">
        <h1>{det.status === 404 ? "Missão não encontrada" : "Não foi possível abrir a missão"}</h1>
        <p className="err" role="alert">{det.status === 404 ? "Essa missão não existe (ou foi removida)." : det.error === "servidor fora do ar" ? "O servidor está fora do ar." : det.error}</p>
        <div className="row"><button type="button" className="btn" onClick={() => void det.reload()}>Tentar de novo</button><a className="btn" href="#/quadro">Ir para o Quadro</a></div>
      </div>
    );
  }

  const titulo = (m.demanda ?? "").split("\n")[0]?.trim() || "(sem demanda)";
  const nome = live.projects.find((p) => p.id === m.project)?.nome ?? m.project;
  const outra: Vista = vista === "vivo" ? "guerra" : "vivo";
  const recarregar = () => { void det.reload(); live.reload(); };
  const ocupada = m.stage === "planejando" || m.stage === "executando";
  const mm = m as M & { tetoPp?: number; tetoSemanaPp?: number };

  return (
    <>
      <a className="voltar" href="#/quadro">‹ Quadro</a>
      <div className="sec">
        <div>
          <h1 ref={h1} tabIndex={-1} className="titulo-missao">{titulo}</h1>
          <p className="meta-m"><StageBadge stage={m.stage} /> <span>{nome}</span> <span className="muted">{formatDesde(m.updatedAt, now)}</span></p>
        </div>
        <a className="btn chico" href={`#/missao/${encodeURIComponent(id)}/${outra}`}>{outra === "guerra" ? "Ler o pacote (sala de guerra)" : "Ver ao vivo"}</a>
      </div>
      {!ocupada && <Gerir id={id} demanda={m.demanda ?? ""} tetoPp={mm.tetoPp} tetoSemanaPp={mm.tetoSemanaPp} onSaved={recarregar} onDeleted={() => { live.reload(); go("/quadro"); }} />}
      {det.error && !det.loading && <p className="err field" role="alert">{det.status === 0 ? "O servidor está fora do ar: os dados abaixo podem estar desatualizados." : `Não foi possível atualizar a missão: ${det.error}`}</p>}
      {vista === "vivo" ? <Vivo m={m} live={live} onChange={recarregar} /> : <Guerra m={m} files={det.data?.package.files} carregando={det.loading} live={live} onChange={recarregar} />}
    </>
  );
}

/** Edit (demand and plan caps) and delete; only offered while no agent is running. */
function Gerir({ id, demanda, tetoPp, tetoSemanaPp, onSaved, onDeleted }: { id: string; demanda: string; tetoPp: number | undefined; tetoSemanaPp: number | undefined; onSaved: () => void; onDeleted: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [d, setD] = useState(demanda);
  const [c5, setC5] = useState(tetoPp?.toString() ?? "");
  const [cs, setCs] = useState(tetoSemanaPp?.toString() ?? "");
  const [err, setErr] = useState<string>();
  const { ok, tetos } = lerTetos(c5, cs);
  async function salvar() {
    if (!ok || !d.trim()) return setErr("Confira a demanda e os tetos.");
    const r = await api.editMission(id, { demanda: d.trim(), tetoPp: tetos.tetoPp ?? null, tetoSemanaPp: tetos.tetoSemanaPp ?? null });
    if (!r.ok) return setErr(r.error);
    setErr(undefined); setAberto(false); onSaved();
  }
  async function excluir() {
    if (!window.confirm("Excluir esta missão e todos os seus arquivos? Não dá para desfazer.")) return;
    const r = await api.deleteMission(id);
    if (!r.ok) return setErr(r.error);
    onDeleted();
  }
  return (
    <div className="field">
      <div className="row">
        <button type="button" className="btn chico" onClick={() => { setD(demanda); setC5(tetoPp?.toString() ?? ""); setCs(tetoSemanaPp?.toString() ?? ""); setAberto(!aberto); }}>{aberto ? "Cancelar edição" : "Editar"}</button>
        <button type="button" className="btn chico" onClick={() => void excluir()}>Excluir</button>
      </div>
      {aberto && (
        <div className="field">
          <label htmlFor="ed-dem">Demanda</label>
          <textarea id="ed-dem" value={d} onChange={(e) => setD(e.target.value)} maxLength={20000} />
          <TetosPlano cinco={c5} semana={cs} onCinco={setC5} onSemana={setCs} />
          <button type="button" className="btn primario" onClick={() => void salvar()}>Salvar</button>
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
