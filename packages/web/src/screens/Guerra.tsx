import { useEffect, useMemo, useRef, useState } from "react";
import { go } from "../router.ts";
import { api } from "../api.ts";
import { gateState } from "../logic/events.ts";
import { erroDeAcao } from "../logic/erros.ts";
import { agruparPacote, type Arquivo } from "../logic/pacote.ts";
import { linhasAgente } from "../logic/arsenal.ts";
import type { M } from "../logic/stages.ts";
import { useMedia, type Live } from "../store.ts";
import { Membro } from "../ui/Avatar.tsx";
import { Seal } from "../guild/Seal.tsx";
import { duracaoCarimbo } from "../logic/tema.ts";
import { reduzido } from "../prefs.ts";
import { ConfirmDialog } from "../ui/ConfirmDialog.tsx";
import { Leitor } from "../ui/Leitor.tsx";
import { PausaPanel } from "../ui/PausaPanel.tsx";

const GATE_TXT = { fechado: "Fechado: ainda não há selo.", aguardando: "Aguardando o seu selo.", selado: "Selado: a execução foi autorizada." } as const;

/** War room: read the package, then seal or ask for adjustments. The server is the authority on the gate; here every failure is a message. */
export function Guerra({ m, files, carregando, live, onChange }: { m: M; files: Arquivo[] | undefined; carregando: boolean; live: Live; onChange: () => void }) {
  const mobile = useMedia("(max-width: 639px)");
  const grupos = useMemo(() => agruparPacote(files ?? []), [files]);
  const todos = grupos.flatMap((g) => g.arquivos);
  const [sel, setSel] = useState<string>();
  const atual = todos.find((f) => f.path === sel) ?? todos[0];
  const [selando, setSelando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string>();
  const [carimbando, setCarimbando] = useState(false);
  const [recusado, setRecusado] = useState(false);
  const [coment, setComent] = useState("");
  const [tentou, setTentou] = useState(false);
  const comentRef = useRef<HTMLTextAreaElement>(null);
  const aguardando = m.stage === "aguardando-aprovacao";
  const ausentes = (m.promoted ?? []).filter((p) => !(files ?? []).some((f) => f.path === p));
  const nomeProj = live.projects.find((p) => p.id === m.project)?.nome ?? m.project;
  const agentes = linhasAgente([m]);

  useEffect(() => {
    const f = (e: Event) => {
      const a = (e as CustomEvent<string>).detail;
      if (!aguardando) return;
      if (a === "selar") setSelando(true);
      if (a === "ajustes") comentRef.current?.focus();
    };
    window.addEventListener("atalho", f);
    return () => window.removeEventListener("atalho", f);
  }, [aguardando]);

  async function selar() {
    setBusy(true); setErro(undefined); setRecusado(false);
    const r = await api.approve(m.id);
    setBusy(false); setSelando(false);
    if (!r.ok) { setErro(erroDeAcao(r)); setRecusado(r.status === 409 && /approval gate/i.test(r.error)); if (r.status === 409) onChange(); return; }
    const d = duracaoCarimbo(reduzido());
    if (d > 0) { setCarimbando(true); await new Promise((ok) => setTimeout(ok, d)); }
    onChange();
    go(`/missao/${encodeURIComponent(m.id)}`);
  }
  async function ajustar() {
    setTentou(true);
    if (!coment.trim()) { comentRef.current?.focus(); return; }
    setBusy(true); setErro(undefined);
    const r = await api.adjust(m.id, coment.trim());
    setBusy(false);
    if (!r.ok) { setErro(erroDeAcao(r)); if (r.status === 409) onChange(); return; }
    setComent(""); setTentou(false); onChange();
    go(`/missao/${encodeURIComponent(m.id)}`);
  }

  const veredito = (
    <aside className="veredito" aria-label="Veredito">
      <h2>Veredito</h2>
      <dl className="dados">
        <dt>Portão</dt><dd className={gateState(m) === "selado" ? "ok" : "warn"}>{GATE_TXT[gateState(m)]}</dd>
        <dt>Custo de tabela (informativo)</dt><dd>US$ {m.costUsd.toFixed(2)}</dd>
        {m.local && <><dt>Modelo local</dt><dd>{m.local.localTasks} tarefa(s) · {m.local.fallbacks} recuo(s) para o Claude · ≈ {m.local.tokensSaved} tokens economizados (estimativa)</dd></>}
        <dt>Pacote</dt><dd>{todos.length} arquivo{todos.length === 1 ? "" : "s"} · {grupos.find((g) => g.grupo === "specs")?.arquivos.filter((a) => /\.spec\.md$/.test(a.path)).length ?? 0} spec(s)</dd>
      </dl>
      {agentes.length > 0 && (
        <>
          <h3 className="mini">Tokens por agente</h3>
          <ul className="lista-simples">{agentes.slice(0, 5).map((a) => <li key={a.agente}><Membro agente={a.agente} tamanho={20} /> <span className="num">{a.tokens.toLocaleString("pt-BR")} ({a.pct}%)</span></li>)}</ul>
        </>
      )}
      {(m.promoted?.length ?? 0) > 0 && (
        <details>
          <summary>Arquivos promovidos ({m.promoted!.length})</summary>
          <ul className="lista-simples">{m.promoted!.map((p) => <li key={p} className="mono">{p}</li>)}</ul>
        </details>
      )}
      {recusado && <div className="selo-recusado"><Seal rachado tamanho={64} /></div>}
      {erro && <p className="err" role="alert">{erro}</p>}
      {aguardando && (
        <>
          <button type="button" className="btn primario selar" disabled={busy} onClick={() => setSelando(true)}>Selar (A)</button>
          <div className="field" style={{ marginTop: "var(--e-4)" }}>
            <label htmlFor="aj-c">Pedir ajustes (J): o que mudar no plano</label>
            <textarea id="aj-c" ref={comentRef} value={coment} onChange={(e) => setComent(e.target.value)} maxLength={20000} style={{ minHeight: 110 }} aria-invalid={tentou && !coment.trim()} aria-describedby={tentou && !coment.trim() ? "aj-e" : undefined} />
            {tentou && !coment.trim() && <p id="aj-e" className="err">Escreva o comentário: sem ele a guilda não sabe o que ajustar.</p>}
          </div>
          <button type="button" className="btn" disabled={busy || !coment.trim()} onClick={ajustar}>Devolver ao reconhecimento</button>
        </>
      )}
    </aside>
  );

  return (
    <>
      {m.stage === "pausada" && <PausaPanel m={m} onDone={onChange} />}
      {m.stage === "parada" && <PausaPanel m={m} onDone={onChange} />}
      {m.stage === "concluida" && <p className="panel field ok" role="status">Missão concluída. O pacote continua disponível para leitura.</p>}
      <div className={`guerra${carimbando ? " tranco" : ""}`}>
        <nav className="indice" aria-label="Pacote da missão">
          <h2>Pacote</h2>
          {carregando && !files ? <div className="skeleton" aria-busy="true" /> : todos.length === 0 && ausentes.length === 0 ? (
            <p className="hint">{aguardando ? "O pacote está vazio: nenhum arquivo foi produzido." : "Esta missão ainda não tem arquivos de pacote."}</p>
          ) : mobile ? (
            <>
              <label htmlFor="doc-sel" className="sr-only">Documento</label>
              <select id="doc-sel" value={atual?.path ?? ""} onChange={(e) => setSel(e.target.value)}>{todos.map((f) => <option key={f.path} value={f.path}>{f.path}</option>)}</select>
            </>
          ) : (
            grupos.map((g) => (
              <div key={g.grupo}>
                <h3 className="mini">{g.rotulo}</h3>
                <ul className="lista-simples">{g.arquivos.map((f) => <li key={f.path}><button type="button" className="arq" aria-current={atual?.path === f.path ? "true" : undefined} onClick={() => setSel(f.path)}>{f.path}</button></li>)}</ul>
              </div>
            ))
          )}
          {ausentes.map((p) => <p key={p} className="err">⚠ arquivo não encontrado: <span className="mono">{p}</span></p>)}
        </nav>
        <div className="miolo">
          {gateState(m) === "selado" && <div className="seal-cravado" title="Missão selada"><Seal tamanho={64} /></div>}
          {carregando && !files ? <div className="leitura" aria-busy="true" aria-label="Carregando pacote"><div className="skeleton claro" /><div className="skeleton claro" /></div>
            : atual ? <Leitor texto={atual.content} titulo={atual.path} />
            : <div className="leitura"><p>Nada para ler ainda. {aguardando ? "" : "O pacote aparece quando o reconhecimento termina."}</p></div>}
        </div>
        {veredito}
      </div>
      {aguardando && mobile && (
        <div className="barra-fixa">
          <button type="button" className="btn" onClick={() => comentRef.current?.focus()}>Ajustes</button>
          <button type="button" className="btn primario" disabled={busy} onClick={() => setSelando(true)}>Selar</button>
        </div>
      )}
      {carimbando && <div className="carimbo-palco" role="status"><Seal tamanho={160} carimbando /><span className="sr-only">Missão selada.</span></div>}
      <ConfirmDialog aberto={selando} titulo="Selar a missão?" onFechar={() => setSelando(false)}>
        <p style={{ margin: "var(--e-3) 0" }}>Selar “{(m.demanda ?? "").split("\n")[0]?.trim() || m.id}” em {nomeProj}? A execução começa agora e gasta o plano da sua conta Claude.</p>
        {ausentes.length > 0 && <p className="warn" role="note">Atenção: {ausentes.length} arquivo(s) do pacote não foram encontrados e não puderam ser lidos.</p>}
        <div className="row" style={{ marginTop: "var(--e-5)" }}>
          <button type="button" className="btn" autoFocus onClick={() => setSelando(false)}>Cancelar</button>
          <button type="button" className="btn primario selo-btn" disabled={busy} onClick={selar}><Seal tamanho={40} />{busy ? "Selando…" : "Selar"}</button>
        </div>
      </ConfirmDialog>
    </>
  );
}
