import { useRef, useState } from "react";
import type { Live } from "../store.ts";
import { api, type Projeto } from "../api.ts";
import { AnexarForm } from "../ui/AnexarForm.tsx";
import { ComandosEditor } from "../ui/ComandosEditor.tsx";

export function Projetos({ live }: { live: Live }) {
  const [anexando, setAnexando] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [removendo, setRemovendo] = useState<Projeto>();
  const dlg = useRef<HTMLDialogElement>(null);
  const { projects, loading, error } = live;

  async function remover() {
    if (!removendo) return;
    const r = await api.removeProject(removendo.id);
    dlg.current?.close();
    setMsg(r.ok ? `Registro de “${removendo.nome}” removido. A pasta continua no disco.` : `Não removeu: ${r.error}`);
    setRemovendo(undefined);
    live.reload();
  }

  return (
    <>
      <div className="sec">
        <h1>Projetos</h1>
        <div className="row">
          <a className="btn" href="#/afiliados">Painel afiliados</a>
          <button type="button" className="btn primario" onClick={() => setAnexando((v) => !v)} aria-expanded={anexando}>+ Anexar projeto</button>
        </div>
      </div>
      {anexando && (
        <div className="narrow field">
          <AnexarForm onCancel={() => setAnexando(false)} onDone={(p) => { setAnexando(false); setMsg(`Projeto “${p.nome}” anexado.`); live.reload(); }} />
        </div>
      )}
      {msg && <p role="status" className="ok field">{msg}</p>}
      {loading ? (
        <div className="lista" aria-busy="true" aria-label="Carregando projetos"><div className="skeleton" /><div className="skeleton" /></div>
      ) : projects.length === 0 ? (
        <div className="vazio">
          <p>{error ? `Não foi possível carregar os projetos: ${error}` : "Nenhum projeto anexado. Anexe uma pasta ou repositório para a guilda trabalhar."}</p>
          {error ? <button type="button" className="btn" onClick={live.reload}>Tentar de novo</button> : !anexando && <button type="button" className="btn primario" onClick={() => setAnexando(true)}>+ Anexar projeto</button>}
        </div>
      ) : (
        <ul className="lista">
          {projects.map((p) => (
            <li key={p.id}>
              <div className="cab">
                <h2>{p.nome}</h2>
                <button type="button" className="btn chico" onClick={() => { setRemovendo(p); dlg.current?.showModal(); }}>Remover registro</button>
              </div>
              <p className="caminho">{p.origem.tipo === "url" ? `${p.origem.valor} → ` : ""}{p.caminho}</p>
              {p.comandos.length === 0 && <p className="warn small">Sem comandos configurados: a fase de execução roda sem Bash.</p>}
              <ComandosEditor projeto={p} onSaved={live.reload} />
            </li>
          ))}
        </ul>
      )}
      <dialog ref={dlg} aria-labelledby="rm-t" onClose={() => setRemovendo(undefined)}>
        <h2 id="rm-t">Remover o registro?</h2>
        <p style={{ margin: "var(--e-3) 0 var(--e-5)" }}>“{removendo?.nome}” sai da lista. A pasta do projeto no disco não é apagada.</p>
        <div className="row">
          <button type="button" className="btn" autoFocus onClick={() => dlg.current?.close()}>Cancelar</button>
          <button type="button" className="btn perigo" onClick={remover}>Remover registro</button>
        </div>
      </dialog>
    </>
  );
}
