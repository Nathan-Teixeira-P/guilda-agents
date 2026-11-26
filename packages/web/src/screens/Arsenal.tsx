import { useMemo } from "react";
import { linhasAgente, textoPlano, tokensDe } from "../logic/arsenal.ts";
import { ondeMaisGastou } from "../logic/events.ts";
import type { M } from "../logic/stages.ts";
import type { Live } from "../store.ts";
import { Membro } from "../ui/Avatar.tsx";
import { StageBadge } from "../ui/StageBadge.tsx";
import { membro } from "../roster.ts";
import { ModeloLocal } from "../ui/ModeloLocal.tsx";

const n = (v: number) => v.toLocaleString("pt-BR");
const tecnico = (k: string) => (membro(k).tecnico || (k.length > 10 ? `${k.slice(0, 8)}…` : k));
const TAB_NOTE = "O uso é mostrado em porcentagem das janelas do plano Claude Pro (5 horas e semana), e inclui o que mais a conta usou no mesmo período.";

function TabAgente({ ms, legenda }: { ms: readonly M[]; legenda: string }) {
  const rows = linhasAgente(ms);
  if (rows.length === 0) return <p className="hint">Sem tokens registrados.</p>;
  return (
    <div className="rolagem">
      <table>
        <caption className="sr-only">{legenda}</caption>
        <thead><tr><th scope="col">Agente</th><th scope="col" className="num">Tokens</th><th scope="col" className="num">Uso do plano</th><th scope="col" className="num">Parcela</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.agente}>
              <th scope="row"><Membro agente={r.agente} tamanho={22} /> <span className="muted mono small">{tecnico(r.agente)}</span></th>
              <td className="num">{n(r.tokens)}</td>
              <td className="num"><span className="barra" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span> {r.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Arsenal({ live }: { live: Live }) {
  const { missions, projects, loading, error } = live;
  const nome = (id: string) => projects.find((p) => p.id === id)?.nome ?? id;
  const comGasto = useMemo(() => missions.filter((m) => tokensDe(m) > 0), [missions]);
  const onde = useMemo(() => ondeMaisGastou(missions), [missions]);
  const totalTokens = comGasto.reduce((s, m) => s + tokensDe(m), 0);
  const head = <><div className="sec"><h1>Arsenal de consumo</h1></div><ModeloLocal live={live} /></>;

  if (loading) return <>{head}<div className="lista" aria-busy="true" aria-label="Carregando consumo"><div className="skeleton" /><div className="skeleton" /></div></>;
  if (error && missions.length === 0) return <>{head}<div className="vazio"><p role="alert" className="err">{error === "servidor fora do ar" ? "O servidor está fora do ar. Não foi possível carregar o consumo." : `Não foi possível carregar o consumo: ${error}`}</p><button type="button" className="btn" onClick={live.reload}>Tentar de novo</button></div></>;
  if (comGasto.length === 0) return <>{head}<div className="vazio"><p>Sem consumo registrado ainda.</p><p className="hint">Os números aparecem quando uma fase de missão termina.</p><a className="btn primario" href="#/nova">Nova missão (N)</a></div></>;

  return (
    <>
      {head}
      <p className="hint field">{TAB_NOTE} A porcentagem só existe por missão, não por agente.</p>
      <dl className="grandes field">
        <div><dt>Tokens</dt><dd>{n(totalTokens)}</dd></div>
        <div><dt>Missões com gasto</dt><dd>{comGasto.length}</dd></div>
      </dl>
      {onde && <p className="panel field" role="note"><strong>Onde mais gastou:</strong> {membro(onde.agente).codinome} com {onde.pct}% dos tokens.</p>}

      <h2 className="sec-t">Todas as missões</h2>
      <div className="duas field">
        <div><h3 className="mini">Tokens por agente</h3><TabAgente ms={comGasto} legenda="Tokens por agente, todas as missões" /></div>
      </div>

      <h2 className="sec-t">Por missão</h2>
      <div className="rolagem field">
        <table>
          <caption className="sr-only">Gasto por missão</caption>
          <thead><tr><th scope="col">Missão</th><th scope="col">Projeto</th><th scope="col">Estágio</th><th scope="col" className="num">Tokens</th><th scope="col" className="num">Uso do plano</th></tr></thead>
          <tbody>
            {comGasto.map((m) => (
              <tr key={m.id}>
                <th scope="row"><a href={`#/missao/${encodeURIComponent(m.id)}`}>{(m.demanda ?? "").split("\n")[0]?.trim() || m.id}</a></th>
                <td>{nome(m.project)}</td><td><StageBadge stage={m.stage} /></td><td className="num">{n(tokensDe(m))}</td><td className="num">{textoPlano(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comGasto.map((m) => (
        <details key={m.id} className="panel field">
          <summary>Detalhe: {(m.demanda ?? "").split("\n")[0]?.trim() || m.id}</summary>
          <div className="duas">
            <div><h3 className="mini">Tokens por agente</h3><TabAgente ms={[m]} legenda={`Tokens por agente, missão ${m.id}`} /></div>
          </div>
        </details>
      ))}
    </>
  );
}
