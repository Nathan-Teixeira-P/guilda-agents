import { useState, type KeyboardEvent } from "react";
import { api, type Projeto } from "../api.ts";

/** Register a project by local folder or repository URL. Validation of the origin is the server's job; the UI only reports it. */
export function AnexarForm({ onDone, onCancel }: { onDone: (p: Projeto) => void; onCancel?: () => void }) {
  const [tipo, setTipo] = useState<"pasta" | "url">("pasta");
  const [valor, setValor] = useState("");
  const [nome, setNome] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function enviar() {
    if (!valor.trim() || !nome.trim()) return setErr("Preencha o nome e " + (tipo === "pasta" ? "a pasta." : "a URL."));
    setBusy(true);
    setErr(undefined);
    const r = await api.addProject({ nome: nome.trim(), ...(tipo === "pasta" ? { pasta: valor.trim() } : { url: valor.trim() }) });
    setBusy(false);
    if (!r.ok) return setErr(r.status === 0 ? "O servidor está fora do ar." : `O servidor recusou: ${r.error}`);
    setValor("");
    setNome("");
    onDone(r.data.projeto);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type === "text") { e.preventDefault(); e.stopPropagation(); void enviar(); }
  };

  return (
    // a div, not a form: this component lives inside the Nova missão form and nested forms are invalid.
    // Enter inside it must attach the project, never launch the mission.
    <div role="group" className="panel" aria-label="Anexar projeto" onKeyDown={onKey}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 var(--e-5)" }}>
        <legend className="label">Origem</legend>
        <div className="row">
          <label className="check"><input type="radio" name="tipo" checked={tipo === "pasta"} onChange={() => setTipo("pasta")} /> Pasta local</label>
          <label className="check"><input type="radio" name="tipo" checked={tipo === "url"} onChange={() => setTipo("url")} /> URL do repositório</label>
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="ax-valor">{tipo === "pasta" ? "Caminho absoluto da pasta" : "URL do repositório (https ou ssh)"}</label>
        <input id="ax-valor" type="text" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={tipo === "pasta" ? "/home/voce/projetos/meu-app" : "https://github.com/org/repo"} autoComplete="off" spellCheck={false} aria-invalid={!!err && !valor.trim()} />
        {tipo === "url" && <p className="hint">O repositório é clonado para dentro do hub.</p>}
      </div>
      <div className="field">
        <label htmlFor="ax-nome">Nome do projeto</label>
        <input id="ax-nome" type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} autoComplete="off" aria-invalid={!!err && !nome.trim()} />
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row" style={{ marginTop: "var(--e-4)" }}>
        <button type="button" className="btn primario" disabled={busy} onClick={() => void enviar()}>{busy ? "Anexando…" : "Anexar projeto"}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}
