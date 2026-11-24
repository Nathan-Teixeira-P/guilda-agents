import { TetosPlano, lerTetos } from "../ui/TetosPlano.tsx";
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { go, type Route } from "../router.ts";
import type { Live } from "../store.ts";
import { AnexarForm } from "../ui/AnexarForm.tsx";
import { ConfirmDialog } from "../ui/ConfirmDialog.tsx";
import { Emblem } from "../ui/Emblem.tsx";
import { useNow } from "../store.ts";
import { dicaEntrada } from "../logic/entrada.ts";
import { ComandosEditor } from "../ui/ComandosEditor.tsx";

const NOVO = "__novo__";

export function Nova({ live, route }: { live: Live; route: Route }) {
  const { projects, loading } = live;
  const pre = route.query.get("projeto");
  const [escolha, setEscolha] = useState<string>(pre ?? ""); // only ever compared against known project ids
  const [demanda, setDemanda] = useState("");
  const [teto, setTeto] = useState("");
  const [tetoSem, setTetoSem] = useState("");
  const [analise, setAnalise] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [motivoUso, setMotivoUso] = useState<string>(); // 409: usage above the threshold, waiting for the user to confirm
  const now = useNow();

  const projeto = projects.find((p) => p.id === escolha);
  const { ok: tetoOk, tetos } = lerTetos(teto, tetoSem);
  const erros = { projeto: !projeto ? "Escolha um projeto." : "", demanda: !demanda.trim() ? "Descreva a demanda." : "", teto: !tetoOk ? "Teto inválido." : "" };

  async function enviar(e?: FormEvent, confirmarUso = false) {
    e?.preventDefault();
    setTentou(true);
    if (erros.projeto || erros.demanda || erros.teto || !projeto) return;
    setBusy(true);
    setErr(undefined);
    const r = await api.newMission({ project: projeto.id, demanda: demanda.trim(), ...tetos, ...(analise ? { analise: true } : {}), ...(confirmarUso ? { confirmarUso: true } : {}) });
    setBusy(false);
    if (!r.ok && r.status === 409) return setMotivoUso(r.error);
    if (!r.ok) return setErr(r.status === 0 ? "O servidor está fora do ar. Nada foi enviado." : `O servidor recusou a missão: ${r.error}`);
    go("/quadro");
  }

  return (
    <form onSubmit={enviar} className="narrow" noValidate onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void enviar(); }}>
      <div className="sec"><h1>Nova missão</h1></div>

      <div className="field">
        <label htmlFor="nm-proj">Projeto</label>
        {loading ? <div className="skeleton" style={{ height: 44 }} aria-busy="true" /> : (
          <select id="nm-proj" value={escolha} onChange={(e) => setEscolha(e.target.value)} aria-invalid={tentou && !!erros.projeto} aria-describedby={tentou && erros.projeto ? "nm-proj-e" : undefined}>
            <option value="">Escolha…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            <option value={NOVO}>+ Anexar projeto…</option>
          </select>
        )}
        {tentou && erros.projeto && <p id="nm-proj-e" className="err">{erros.projeto}</p>}
        {!loading && projects.length === 0 && escolha !== NOVO && <p className="hint">Nenhum projeto anexado ainda. Escolha “+ Anexar projeto…”.</p>}
      </div>

      {escolha === NOVO && (
        <div className="field">
          <AnexarForm onCancel={() => setEscolha("")} onDone={(p) => { setEscolha(p.id); live.reload(); }} />
        </div>
      )}

      {projeto && projeto.comandos.length === 0 && (
        <div className="panel aviso field" role="note">
          <p className="warn"><strong>Este projeto não tem comandos configurados.</strong> A fase de execução vai rodar sem Bash (não consegue rodar testes).</p>
          <details style={{ marginTop: "var(--e-2)" }}>
            <summary>Configurar comandos sugeridos</summary>
            <div style={{ marginTop: "var(--e-3)" }}><ComandosEditor projeto={projeto} onSaved={live.reload} /></div>
          </details>
        </div>
      )}

      <div className="field">
        <label htmlFor="nm-dem">Demanda (link do ClickUp ou texto)</label>
        <textarea id="nm-dem" value={demanda} onChange={(e) => setDemanda(e.target.value)} maxLength={20000} aria-invalid={tentou && !!erros.demanda} aria-describedby={tentou && erros.demanda ? "nm-dem-e nm-dem-h" : "nm-dem-h"} />
        <p id="nm-dem-h" className="hint">{dicaEntrada(demanda)}</p>
        {tentou && erros.demanda && <p id="nm-dem-e" className="err">{erros.demanda}</p>}
        <label><input type="checkbox" checked={analise} onChange={(e) => setAnalise(e.target.checked)} /> É uma análise (depois, oferece começar a codar a partir dela)</label>
      </div>

      <TetosPlano cinco={teto} semana={tetoSem} onCinco={setTeto} onSemana={setTetoSem} tentou={tentou} />

      <div className="field"><Emblem uso={live.usage} now={now} onConsultar={live.consultarUso} tamanho={96} modo="completo" {...(tetos.tetoPp ? { tetoPp: tetos.tetoPp } : {})} /></div>

      {err && <p className="err field" role="alert">{err}</p>}
      <div className="row">
        <button type="submit" className="btn primario" disabled={busy}>{busy ? "Lançando…" : "Lançar contrato"}</button>
        <button type="button" className="btn" onClick={() => go("/quadro")}>Cancelar</button>
        <span className="hint">Ctrl+Enter também lança.</span>
      </div>
      <ConfirmDialog aberto={motivoUso !== undefined} titulo="Uso do plano alto" onFechar={() => setMotivoUso(undefined)}>
        <p>{motivoUso}</p>
        <p className="hint">Lançar mesmo assim pode esgotar a janela do plano antes do fim da missão.</p>
        <div className="row" style={{ marginTop: "var(--e-4)" }}>
          <button type="button" className="btn" autoFocus onClick={() => setMotivoUso(undefined)}>Cancelar</button>
          <button type="button" className="btn primario" onClick={() => { setMotivoUso(undefined); void enviar(undefined, true); }}>Lançar mesmo assim</button>
        </div>
      </ConfirmDialog>
    </form>
  );
}
