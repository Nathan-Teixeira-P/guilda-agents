import { useState } from "react";
import { api, type Projeto } from "../api.ts";
import { motivoRejeicao } from "../logic/comandos.ts";

/** Allow-list editor for a registered project: analysed suggestions (GET sugestoes) plus free-text commands, saved with PATCH comandos. Commands render as text only. */
export function ComandosEditor({ projeto, onSaved }: { projeto: Projeto; onSaved: (p: Projeto) => void }) {
  const [opcoes, setOpcoes] = useState<string[]>(projeto.comandos);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set(projeto.comandos));
  const [novo, setNovo] = useState("");
  const [erroNovo, setErroNovo] = useState<string>();
  const [buscou, setBuscou] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passos, setPassos] = useState<{ passo: number; comando: string; motivo: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  async function carregar() {
    setBusy(true);
    const [r, sub] = await Promise.all([api.sugestoes(projeto.id), api.subida(projeto.id)]);
    setBusy(false);
    if (sub.ok) setPassos(sub.data.passos);
    if (!r.ok) return setMsg({ ok: false, text: `Não consegui buscar sugestões: ${r.error}` });
    setMotivos(Object.fromEntries(r.data.sugestoes.map((s) => [s.comando, s.motivo])));
    setOpcoes((o) => [...new Set([...o, ...r.data.sugestoes.map((s) => s.comando)])]);
    setBuscou(true);
    setMsg(r.data.sugestoes.length === 0 ? { ok: false, text: r.data.mensagem ?? "Nenhuma sugestão encontrada." } : undefined);
  }
  function adicionar() {
    const c = novo.trim();
    const motivo = motivoRejeicao(c);
    if (motivo) return setErroNovo(motivo);
    setErroNovo(undefined);
    setNovo("");
    setOpcoes((o) => (o.includes(c) ? o : [...o, c]));
    setSel((s) => new Set(s).add(c));
  }
  async function salvar() {
    setBusy(true);
    const r = await api.setComandos(projeto.id, [...sel]);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: `Não salvou: ${r.error}` });
    onSaved(r.data.projeto);
    setMsg({ ok: true, text: "Comandos salvos." });
  }

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label">Comandos que a fase de execução pode rodar</legend>
      <p className="small muted">Só estes comandos poderão ser rodados na fase de execução.</p>
      {opcoes.map((c) => (
        <label key={c} className="check">
          <input type="checkbox" checked={sel.has(c)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(c); else n.delete(c); return n; })} />
          <code>{c}</code>
          {motivos[c] && <span className="small muted"> {motivos[c]}</span>}
        </label>
      ))}
      {opcoes.length === 0 && !buscou && <p className="small muted">Nenhum comando liberado ainda.</p>}
      <div style={{ display: "flex", gap: "var(--e-2)", alignItems: "center", marginTop: "var(--e-2)" }}>
        <input
          type="text" className="input" aria-label="Adicionar comando" placeholder="Adicionar comando, ex.: npm run lint" value={novo}
          aria-invalid={erroNovo ? true : undefined}
          onChange={(e) => { setNovo(e.target.value); setErroNovo(undefined); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
        />
        <button type="button" className="btn chico" onClick={adicionar}>Adicionar</button>
      </div>
      {erroNovo && <p className="err" role="alert">{erroNovo}</p>}
      <div style={{ display: "flex", gap: "var(--e-2)", marginTop: "var(--e-2)" }}>
        <button type="button" className="btn chico" onClick={carregar} disabled={busy}>{busy ? "Buscando…" : "Sugerir comandos"}</button>
        <button type="button" className="btn chico" onClick={salvar} disabled={busy}>Salvar comandos</button>
      </div>
      {passos.length > 0 && (
        <div style={{ marginTop: "var(--e-3)" }}>
          <p className="label">Como subir este projeto</p>
          <p className="small muted">Só informativo; o hub não executa. Estes passos não entram na lista de comandos permitidos aos agentes.</p>
          {passos.map((p) => (
            <div key={p.passo} className="small">
              {p.passo}. <code>{p.comando}</code> <span className="muted">{p.motivo}</span>{" "}
              <button type="button" className="btn chico" onClick={() => void navigator.clipboard?.writeText(p.comando)}>Copiar</button>
            </div>
          ))}
        </div>
      )}
      {msg && <p className={msg.ok ? "hint ok" : "err"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </fieldset>
  );
}
