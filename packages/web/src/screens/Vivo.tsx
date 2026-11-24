import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.ts";
import { contarTrocas, cronicaDe, membrosDe, tokensVivos } from "../logic/events.ts";
import { erroDeAcao } from "../logic/erros.ts";
import { MAX_HANDOFFS, MAX_LOOPS } from "../logic/fuse.ts";
import { tokensDe } from "../logic/arsenal.ts";
import type { M } from "../logic/stages.ts";
import type { Live } from "../store.ts";
import { Membro } from "../ui/Avatar.tsx";
import { ConfirmDialog } from "../ui/ConfirmDialog.tsx";
import { Pavio } from "../ui/Pavio.tsx";
import { PausaPanel } from "../ui/PausaPanel.tsx";
import { membro } from "../roster.ts";

const n = (v: number) => v.toLocaleString("pt-BR");
const ESTADO = { ativo: "em campo", concluido: "terminou", falhou: "falhou" } as const;

/** Live mission: chronicle from SSE events, consumption, breaker fuse and Parar. Events exist for this session only (the server keeps no replay). */
export function Vivo({ m, live, onChange }: { m: M; live: Live; onChange: () => void }) {
  const eventos = useMemo(() => live.events[m.id] ?? [], [live.events, m.id]);
  const linhas = useMemo(() => cronicaDe(eventos), [eventos]);
  const tokens = useMemo(() => tokensVivos(eventos), [eventos]);
  const membros = useMemo(() => membrosDe(eventos), [eventos]);
  const trocas = contarTrocas(eventos);
  const aviso = live.missionWarnings[m.id]?.at(-1);
  const [parando, setParando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string>();
  const tipoDe = (id: string) => (id === "main" ? "main" : membros.find((x) => x.id === id)?.tipo);

  // the log is quiet for screen readers: one summary line every 10 s at most
  const ultima = linhas.at(-1)?.text;
  const [anuncio, setAnuncio] = useState("");
  const ult = useRef<string>(undefined);
  ult.current = ultima;
  useEffect(() => { const t = setInterval(() => setAnuncio((a) => (ult.current && ult.current !== a ? ult.current : a)), 10_000); return () => clearInterval(t); }, []);

  const caixa = useRef<HTMLOListElement>(null);
  const noFim = useRef(true);
  useEffect(() => { const c = caixa.current; if (c && noFim.current) c.scrollTop = c.scrollHeight; }, [linhas.length]);

  async function pausar() {
    setBusy(true);
    const r = await api.pause(m.id);
    setBusy(false);
    if (!r.ok) setErro(erroDeAcao(r));
    onChange();
  }
  async function parar() {
    setBusy(true);
    const r = await api.stop(m.id);
    setBusy(false); setParando(false);
    if (!r.ok) setErro(erroDeAcao(r));
    onChange();
  }

  const tokensTotal = tokens.total > 0 ? tokens.total : tokensDe(m);
  const porAgente = tokens.total > 0 ? tokens.porAgente : (m.tokensByAgent ?? {});
  const ativa = m.stage === "planejando" || m.stage === "executando";

  return (
    <>
      {ativa && (
        <div className="row parar-linha">
          <p className="muted">{m.stage === "planejando" ? "Fase 1: reconhecimento e plano" : "Fase 2: execução"}</p>
          <button type="button" className="btn" title="Para onde está; retome quando quiser" onClick={() => void pausar()} disabled={busy}>❚❚ Pausar</button>
          <button type="button" className="btn perigo" title="Encerra o agente e recolhe a missão" onClick={() => setParando(true)} disabled={busy}>■ Parar</button>
        </div>
      )}
      {m.stage === "pausada" && <PausaPanel m={m} onDone={onChange} />}
      {m.stage === "parada" && <PausaPanel m={m} onDone={onChange} />}
      {aviso && <p className="panel aviso field warn" role="status">Aviso: {aviso}</p>}
      {erro && <p className="err field" role="alert">{erro}</p>}
      <div className="vivo">
        <section aria-labelledby="cr-t" className="cronica">
          <h2 id="cr-t">Crônica</h2>
          <p className="sr-only" role="status">{anuncio}</p>
          {linhas.length === 0 ? (
            <p className="hint">{ativa ? "Aguardando os primeiros movimentos da guilda… A crônica mostra o que acontece a partir de agora; o que ocorreu antes desta tela abrir não é reproduzido." : "Nenhum evento nesta sessão: a crônica mostra só o que acontece com esta tela aberta."}</p>
          ) : (
            <ol className="log" ref={caixa} tabIndex={0} aria-label="Eventos da missão" onScroll={(e) => { const c = e.currentTarget; noFim.current = c.scrollTop + c.clientHeight >= c.scrollHeight - 40; }}>
              {linhas.map((l, i) => <li key={i} className={l.tone === "erro" ? "err" : ""}>{l.text}</li>)}
              {!live.up && <li className="warn">— mensageiro perdido, reconectando —</li>}
            </ol>
          )}
        </section>
        <aside aria-label="Consumo e disjuntor" className="lateral">
          <section className="panel field" aria-labelledby="co-t">
            <h2 id="co-t">Consumo</h2>
            <dl className="dados">
              <dt>Tokens</dt><dd>{n(tokensTotal)}{tokens.total > 0 ? ` (entrada ${n(tokens.entrada)}, saída ${n(tokens.saida)}, cache ${tokens.cachePct}%)` : tokensTotal > 0 ? " registrados até a última fase" : ""}</dd>
              <dt>Custo de tabela (informativo)</dt><dd>US$ {m.costUsd.toFixed(2)} <span className="muted small">atualiza ao fim de cada fase</span></dd>
            </dl>
            {Object.keys(porAgente).length > 0 && (
              <ul className="lista-simples">{Object.entries(porAgente).sort((a, b) => b[1] - a[1]).map(([id, t]) => <li key={id}><Membro agente={tipoDe(id) ?? id} tamanho={20} /> <span className="num">{n(t)}</span></li>)}</ul>
            )}
          </section>
          <section className="panel field" aria-labelledby="dj-t">
            <h2 id="dj-t">Disjuntor</h2>
            <Pavio rotulo="Trocas de agente" usado={trocas} limite={MAX_HANDOFFS} />
            {Object.entries(m.loops ?? {}).map(([passo, v]) => <Pavio key={passo} rotulo={`Voltas: ${passo}`} usado={v} limite={MAX_LOOPS} />)}
            <p className="hint">As trocas contam só o que esta tela viu; o disjuntor do servidor é quem decide. Estourado, a missão fica pausada e pergunta a você.</p>
          </section>
          <section className="panel" aria-labelledby="mb-t">
            <h2 id="mb-t">Membros convocados</h2>
            {membros.length === 0 ? <p className="hint">Ninguém convocado ainda.</p> : (
              <ul className="lista-simples">{membros.map((x) => <li key={x.id}><Membro agente={x.tipo || "?"} tamanho={24} estado={x.estado} /> <span className={x.estado === "falhou" ? "err" : "muted"}>{ESTADO[x.estado]}{x.ferramenta ? ` · ${x.ferramenta}` : ""}</span><span className="sr-only"> {membro(x.tipo).grupo.nome}</span></li>)}</ul>
            )}
          </section>
        </aside>
      </div>
      <ConfirmDialog aberto={parando} titulo="Parar e recolher a missão?" onFechar={() => setParando(false)}>
        <p style={{ margin: "var(--e-3) 0 var(--e-5)" }}>O agente é encerrado e a missão vai para Recolhida. O que já foi feito fica no projeto, e você pode retomá-la depois (com conferência do que foi feito).</p>
        <div className="row">
          <button type="button" className="btn" autoFocus onClick={() => setParando(false)}>Cancelar</button>
          <button type="button" className="btn perigo" disabled={busy} onClick={parar}>Recolher</button>
        </div>
      </ConfirmDialog>
    </>
  );
}
