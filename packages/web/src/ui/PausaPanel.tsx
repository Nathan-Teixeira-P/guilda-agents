import { useState } from "react";
import { api } from "../api.ts";
import { erroDeAcao } from "../logic/erros.ts";
import type { M } from "../logic/stages.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

/** Paused or recolhida (parada) mission: shows why, lets the user answer and resume, or end it. Failures become messages, never exceptions. */
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

  const parada = m.stage === "parada";
  const build = !parada && !!m.pauseReason?.startsWith("build necessário");
  return (
    <section className="panel aviso field" aria-labelledby="pz-t">
      <h2 id="pz-t">{parada ? "Missão recolhida" : "Missão pausada: aguarda você"}</h2>
      <p className="warn" role="alert"><strong>Motivo:</strong> {(parada ? m.stopReason : m.pauseReason) ?? "não informado"}</p>
      {m.notaBuild && <p style={{ whiteSpace: "pre-wrap" }}><strong>O agente diz:</strong> {m.notaBuild}</p>}
      <p className="hint">Ao retomar, o agente primeiro confere tudo o que já foi feito (plano, arquivos e código do projeto), aponta o que ficou faltando ou precisa mudar e só então continua {parada ? "de onde a missão parou" : m.pausedFrom === "executando" ? "a execução (o selo já foi dado)" : "o reconhecimento do plano"}; o disjuntor zera.</p>
      <div className="field" style={{ marginTop: "var(--e-3)" }}>
        <label htmlFor="pz-c">{build ? "O build deu erro? Cole o erro aqui (vazio = passou)" : "Sua resposta (opcional)"}</label>
        {build && <p className="hint">Com erro colado, o agente corrige primeiro e pede o build de novo. O campo aceita 20 mil caracteres: se o log for maior, cole só as linhas de erro.</p>}
        <textarea id="pz-c" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={20000} style={{ minHeight: 96 }} />
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}
      <div className="row">
        <button type="button" className="btn primario" disabled={busy} onClick={retomar}>{busy ? "Enviando…" : "Responder e retomar"}</button>
        {!parada && <button type="button" className="btn" disabled={busy} onClick={() => setEncerrar(true)}>Parar (recolher)</button>}
      </div>
      <ConfirmDialog aberto={encerrar} titulo="Recolher a missão?" onFechar={() => setEncerrar(false)}>
        <p style={{ margin: "var(--e-3) 0 var(--e-5)" }}>A missão vai para Recolhida. O que já foi feito fica no projeto, e você pode retomá-la depois.</p>
        <div className="row">
          <button type="button" className="btn" autoFocus onClick={() => setEncerrar(false)}>Cancelar</button>
          <button type="button" className="btn perigo" onClick={parar}>Recolher</button>
        </div>
      </ConfirmDialog>
    </section>
  );
}
