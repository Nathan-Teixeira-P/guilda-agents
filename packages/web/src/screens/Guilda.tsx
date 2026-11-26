import { useState } from "react";
import { Avatar, INSIGNIA } from "../guild/Avatar.tsx";
import { emUsoAgora, podeUsarLocal } from "../logic/local.ts";
import type { Live } from "../store.ts";
import { Assassino } from "../guild/Assassino.tsx";
import { Salas } from "../ui/Salas.tsx";
import { agruparPorGrupo } from "../logic/guilda.ts";

const SECOES = agruparPorGrupo();

/** The whole roster: one card per agent, grouped by role, front view with a toggle to the back (NTP emblem). */
export function Guilda({ live }: { live: Live }) {
  const [costas, setCostas] = useState(false);
  return (
    <>
      <div className="sec">
        <h1>Guilda</h1>
        <button type="button" className="btn" aria-pressed={costas} onClick={() => setCostas((v) => !v)}>{costas ? "Ver de frente" : "Ver de costas"}</button>
      </div>
      <Salas live={live} />
      <p className="muted">Todos os membros da guilda, por ofício. Cada manto traz a insígnia do grupo no peito e o emblema NTP nas costas.</p>
      {SECOES.map(({ grupo, membros }) => (
        <section key={grupo.id} aria-labelledby={`g-${grupo.id}`}>
          <h2 className="sec-t gu-t" id={`g-${grupo.id}`}>
            {INSIGNIA[grupo.id] && <svg viewBox="0 0 12 12" width="18" height="18" aria-hidden="true" focusable="false"><path d={INSIGNIA[grupo.id]} fill={grupo.cor} /></svg>}
            {grupo.nome} <span className="muted">({membros.length})</span>
          </h2>
          <ul className="gu-grade">
            {membros.map((m) => (
              <li key={m.tecnico} className={`gu-card${emUsoAgora(live.local, m.tecnico) ? " local-uso" : ""}`} style={{ borderTopColor: grupo.cor }}>
                <div className="gu-fig">
                  {costas
                    ? <Avatar agente={m.tecnico} tamanho={140} vista="costas" />
                    : <svg viewBox="-22 -62 44 66" width="120" height="180" role="img" aria-label={`${m.codinome}, com o traje da irmandade`}><ellipse cy="1" rx="13" ry="2.6" fill="#000" opacity=".35" /><Assassino agente={m.tecnico} /></svg>}
                  <span className="gu-mini"><Avatar agente={m.tecnico} tamanho={36} vista={costas ? "frente" : "costas"} oculto /></span>
                </div>
                <h3>{m.codinome}</h3>
                <p className="gu-tec"><code>{m.tecnico}</code></p>
                <p className="gu-fn">{m.funcao}</p>
                <p className="gu-mod"><span className={`pill gu-m-${m.modelo}`}>{m.modelo}</span></p>
                {podeUsarLocal(live.local, m.tecnico) && <p className="gu-local"><a className="pill local" href="#/arsenal" title="Esta tarefa pode rodar no modelo local (Ollama), se estiver ligado">{emUsoAgora(live.local, m.tecnico) ? "usando modelo local agora" : live.local?.enabled ? "pode usar modelo local" : "pode usar modelo local (desligado)"}</a></p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
