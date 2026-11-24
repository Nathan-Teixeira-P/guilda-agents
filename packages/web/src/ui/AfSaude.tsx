import type { InfoResp, RelatorioResp } from "../api.ts";
import { dataHora } from "../logic/afiliados.ts";

export type Rel = RelatorioResp | undefined | "erro";

function Relatorio({ titulo, r }: { titulo: string; r: Rel }) {
  return (
    <article className="af-rel" aria-label={`Relatório ${titulo}`}>
      <h3>{titulo}</h3>
      {r === undefined ? <p className="muted" aria-busy="true">Carregando…</p>
        : r === "erro" ? <p className="err">Erro: não foi possível ler o relatório agora.</p>
        : !r.existe ? <p className="muted">Ainda não há relatório do agente {titulo}. Quando ele rodar, o último aparece aqui (somente leitura).</p>
        : (
          <>
            <p className="small"><strong>{r.data ? dataHora(r.data) : "Sem data no relatório"}</strong> · <span className="mono">{r.arquivo}</span>{r.status && <> · Status: <strong>{r.status}</strong></>}</p>
            {r.nichos && r.nichos.length > 0 && <ul className="chips" aria-label="Nichos citados">{r.nichos.map((n) => <li key={n} className="chip">{n}</li>)}</ul>}
            {r.achados && <div className="small"><span className="label">Achados</span>{Array.isArray(r.achados) ? <ul>{r.achados.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p>{r.achados}</p>}</div>}
            <details><summary>Ver relatório completo</summary><pre className="af-corpo">{r.corpo}</pre></details>
          </>
        )}
    </article>
  );
}

export function AfSaude({ info, ops, auditor }: { info?: InfoResp | undefined; ops: Rel; auditor: Rel }) {
  const d = info?.dryRun;
  return (
    <section aria-labelledby="af-s">
      <div className="sec"><h2 id="af-s">Saúde</h2><span className="muted small">Somente leitura</span></div>
      <div className={`dry ${d === false ? "off" : "on"}`} role={d === false ? "alert" : "status"}>
        {d === false ? <><strong>DRY_RUN DESLIGADO</strong><span> O bot envia mensagens de verdade para os grupos. Este painel só mostra o valor; para mudar, edite o .env do projeto.</span></>
          : d === true ? <><strong>DRY_RUN ligado</strong><span> Simulação: nada é enviado de verdade.</span></>
          : <><strong>DRY_RUN não definido</strong><span> Não encontrei DRY_RUN no .env do projeto.</span></>}
      </div>
      <Relatorio titulo="ops" r={ops} />
      <Relatorio titulo="deal-auditor" r={auditor} />
    </section>
  );
}
