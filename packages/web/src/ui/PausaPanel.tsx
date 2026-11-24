import { useState } from "react";
import { api } from "../api.ts";
import { erroDeAcao } from "../logic/erros.ts";
import type { M } from "../logic/stages.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

/** Paused mission: shows why, lets the user answer and resume, or end it. Failures become messages, never exceptions. */
export function PausaPanel({ m, onDone }: { m: M; onDone: () => void }) {
  const [comentario, setComentario] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string>();
  const [encerrar, setEncerrar] = useState(false);

  async function retomar() {
    setBusy(true); setErro(undefined);
    const r = await api.resume(m.id, comentario.trim() || undefined);
    setBusy(false);
    if (!r.ok) { setErro(erroDeAcao(r)); if (r.status === 409) onDone(); return; }
    setComentario(""); onDone();
  }
  async function parar() {
    setBusy(true);
    const r = await api.stop(m.id);
    setBusy(false); setEncerrar(false);
    if (!r.ok) setErro(erroDeAcao(r));
    onDone();
  }

  return (
    <section className="panel aviso field" aria-labelledby="pz-t">
      <h2 id="pz-t">Missão pausada: aguarda você</h2>
      <p className="warn" role="alert"><strong>Motivo:</strong> {m.pauseReason ?? "não informado"}</p>
      <p className="hint">Retomando, a missão continua {m.pausedFrom === "executando" ? "a execução (o selo já foi dado)" : "o reconhecimento do plano"}; o disjuntor zera.</p>
      <div className="field" style={{ marginTop: "var(--e-3)" }}>
        <label htmlFor="pz-c">Sua resposta (opcional)</label>
        <textarea id="pz-c" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={20000} style={{ minHeight: 96 }} />
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}
      <div className="row">
        <button type="button" className="btn primario" disabled={busy} onClick={retomar}>{busy ? "Enviando…" : "Responder e retomar"}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => setEncerrar(true)}>Encerrar</button>
      </div>
      <ConfirmDialog aberto={encerrar} titulo="Encerrar a missão?" onFechar={() => setEncerrar(false)}>
        <p style={{ margin: "var(--e-3) 0 var(--e-5)" }}>A missão é encerrada de vez e não poderá ser retomada. O que já foi feito fica no projeto.</p>
        <div className="row">
          <button type="button" className="btn" autoFocus onClick={() => setEncerrar(false)}>Cancelar</button>
          <button type="button" className="btn perigo" onClick={parar}>Encerrar</button>
        </div>
      </ConfirmDialog>
    </section>
  );
}
