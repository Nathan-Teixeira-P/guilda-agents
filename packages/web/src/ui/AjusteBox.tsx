import { useState } from "react";
import { api } from "../api.ts";
import { erroDeAcao } from "../logic/erros.ts";
import type { M } from "../logic/stages.ts";

/** Send a change or a bug to a mission without opening a new conversation. */
export function AjusteBox({ id, titulo, dica, onFeito, retomar = false }: { id: string; titulo: string; dica: string; onFeito: () => void; retomar?: boolean }) {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string>();
  async function enviar() {
    setBusy(true); setErro(undefined);
    const r = await (retomar ? api.resume : api.continuar)(id, texto.trim());
    setBusy(false);
    if (!r.ok) { setErro(erroDeAcao(r)); if (r.status === 409) onFeito(); return; }
    setTexto(""); onFeito();
  }
  return (
    <section className="panel field" aria-label={titulo}>
      <h2>{titulo}</h2>
      <p className="hint">{dica}</p>
      <textarea aria-label={titulo} placeholder={dica} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={20000} style={{ minHeight: 90 }} />
      {erro && <p className="err" role="alert">{erro}</p>}
      <button type="button" className="btn primario" disabled={busy || !texto.trim()} onClick={() => void enviar()}>{busy ? "Enviando…" : "Enviar"}</button>
    </section>
  );
}

/** The box inside the Regente's window: sends whatever the mission's stage accepts; nothing while planning or before the first seal. */
export function FalarComGuilda({ m, onFeito }: { m: M; onFeito: () => void }) {
  const retomar = m.stage === "pausada" || m.stage === "parada";
  const aceita = retomar || m.stage === "executando" || m.stage === "concluida" || (m.stage === "aguardando-aprovacao" && (m.specsFeitas?.length ?? 0) > 0);
  if (!aceita) return undefined;
  const dica = m.stage === "executando" ? "Ajuste ou bug: interrompe, faz primeiro e continua" : retomar ? "Responda ou cole o erro: a missão é retomada" : "Ajuste ou bug no que já foi feito";
  return <AjusteBox id={m.id} titulo="Falar com a guilda" dica={dica} retomar={retomar} onFeito={onFeito} />;
}
