import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { textoCarregado, textoOllama, textoOrigem, textoStats, textoUltimoUso, textoViabilidade, type LocalConfig } from "../logic/local.ts";
import { formatDesde } from "../logic/time.ts";
import { membro } from "../roster.ts";
import type { Live } from "../store.ts";
import { useNow } from "../store.ts";

/** Arsenal panel: optional local model (Ollama). Everything shown comes from GET /local/status, /local and /local/stats. */
export function ModeloLocal({ live }: { live: Live }) {
  const { local: s, localStats: st } = live;
  const now = useNow();
  const [cfg, setCfg] = useState<LocalConfig>();
  const [cfgErro, setCfgErro] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [busy, setBusy] = useState(false);

  const carregarCfg = async () => {
    const r = await api.localConfig();
    if (r.ok) { setCfg(r.data); setCfgErro(undefined); } else setCfgErro(r.error);
  };
  useEffect(() => { void carregarCfg(); }, [s?.ollama.estado, s?.model]);

  const salvar = async (b: { enabled?: boolean; model?: string }) => {
    setBusy(true); setErro(undefined);
    const r = await api.setLocal(b);
    if (!r.ok) setErro(r.status === 503 ? "O Ollama está parado: não dá para trocar o modelo agora." : r.error);
    await live.recarregarLocal();
    await carregarCfg();
    setBusy(false);
  };

  if (!s) {
    return (
      <section className="panel field" id="modelo-local" aria-labelledby="ml-t">
        <h2 id="ml-t" className="mini">Modelo local (opcional)</h2>
        <p className="hint">Não foi possível ler o estado do modelo local (o servidor não o oferece ou está fora do ar).</p>
        <button type="button" className="btn chico" onClick={() => void live.recarregarLocal()}>Tentar de novo</button>
      </section>
    );
  }
  const modelos = cfg?.installed ?? [];
  const opcoes = modelos.includes(s.model) ? modelos : [s.model, ...modelos];
  const t = st ? textoStats(st) : undefined;
  const origem = textoOrigem(s);

  return (
    <section className={`panel field ml${s.emUso ? " ml-uso" : ""}`} id="modelo-local" aria-labelledby="ml-t">
      <h2 id="ml-t" className="mini">Modelo local (opcional)</h2>
      <p className="hint">Um modelo de código aberto, rodando no seu computador via Ollama, só para tarefas mecânicas e baratas. Vem desligado. Nunca é usado para código, specs, revisão, decisões nem texto final: quando falha ou não cabe na memória, o Claude faz o trabalho.</p>

      <div className="ml-linha">
        <button type="button" role="switch" aria-checked={s.enabled} aria-describedby="ml-sw" className={`btn ml-sw${s.enabled ? " on" : ""}`} disabled={busy} onClick={() => void salvar({ enabled: !s.enabled })}>
          {s.enabled ? "Ligado" : "Desligado"}
        </button>
        <span id="ml-sw" className="muted">{s.enabled ? "O hub pode usar o modelo local nas tarefas abaixo." : "Nenhuma tarefa usa o modelo local."}</span>
      </div>
      <div className="ml-linha">
        <label htmlFor="ml-modelo">Modelo</label>
        <select id="ml-modelo" value={s.model} disabled={busy || !cfg || cfg.ollama === "down"} onChange={(e) => void salvar({ model: e.target.value })}>
          {opcoes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {cfgErro && <p className="hint">Lista de modelos indisponível: {cfgErro}.</p>}
      {cfg?.ollama === "down" && <p className="hint">Com o Ollama parado só dá para escolher o modelo atual.</p>}
      {erro && <p role="alert" className="err">{erro}</p>}

      <h3 className="mini">Estado agora</h3>
      <ul className="lista-simples ml-estado" role="status" aria-live="polite">
        <li>{textoOllama(s)}{origem ? ` — ${origem}` : ""}</li>
        <li>{textoCarregado(s)}</li>
        <li>{textoViabilidade(s)}</li>
        <li className={s.emUso ? "ml-uso-t" : ""}>{s.emUso ? `Em uso agora: ${membro(s.emUso.agent).codinome} (${s.emUso.agent}) — ${s.emUso.task} com ${s.emUso.model}, ${formatDesde(new Date(s.emUso.desde).toISOString(), now)}` : `Em uso agora: ninguém. ${textoUltimoUso(s, now, formatDesde)}`}</li>
      </ul>

      <h3 className="mini">Quem pode usar</h3>
      <div className="rolagem">
        <table>
          <caption className="sr-only">Agentes e tarefas que podem usar o modelo local</caption>
          <thead><tr><th scope="col">Agente</th><th scope="col">Tarefa</th><th scope="col">O que faz</th></tr></thead>
          <tbody>{s.elegiveis.map((e) => <tr key={e.agente + e.tarefa}><th scope="row">{membro(e.agente).codinome} <span className="muted mono small">{e.agente}</span></th><td className="mono small">{e.tarefa}</td><td>{e.descricao}</td></tr>)}</tbody>
        </table>
      </div>

      <details className="ml-fora">
        <summary>Nunca usam ({s.fora.length})</summary>
        <ul className="lista-simples">{s.fora.map((f) => <li key={f.agente}><strong>{membro(f.agente).codinome}</strong> <span className="muted mono small">{f.agente}</span> — {f.motivo}</li>)}</ul>
      </details>

      <h3 className="mini">Economia</h3>
      {t ? (
        <ul className="lista-simples">
          <li>{t.local}</li><li>{t.semModelo}</li><li>{t.fallback}</li><li>{t.tokens}</li>
        </ul>
      ) : <p className="hint">Sem números ainda.</p>}
    </section>
  );
}
