import { useState } from "react";
import { salasDe, trabalhando, type Posto } from "../logic/guilda.ts";
import { membro } from "../roster.ts";
import type { Live } from "../store.ts";
import { Avatar, Membro } from "./Avatar.tsx";
import { Terminal, useConversas } from "./Terminal.tsx";
import { useEventos } from "./useEventos.ts";

/** Training room and one work room per project; clicking an agent at work opens its terminal window right here. */
export function Salas({ live }: { live: Live }) {
  useEventos(live, live.missions.filter(trabalhando).map((m) => m.id));
  const { salas, espera } = salasDe(live.missions, live.events);
  const [sel, setSel] = useState<string>();
  return (
    <div className="salas">
      {salas.map((s) => {
        const nome = live.projects.find((p) => p.id === s.project)?.nome ?? s.project;
        const aberto = s.postos.find((p) => `${p.missionId}:${p.id}` === sel);
        return (
          <section key={s.project} className="sala ocupada" aria-label={`Trabalhando em ${nome}`}>
            <h2>{nome}</h2>
            <ul className="sala-gente">
              {s.postos.map((p) => {
                const chave = `${p.missionId}:${p.id}`;
                return (
                  <li key={chave}>
                    <button type="button" aria-expanded={sel === chave} onClick={() => setSel(sel === chave ? undefined : chave)}>
                      <Avatar agente={p.tipo || "?"} tamanho={64} oculto />
                      <span>{membro(p.tipo || undefined).codinome}</span>
                      <span className="muted small">{p.linhas.at(-1)?.slice(0, 28) ?? "começando"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {aberto && <Janela key={sel} p={aberto} />}
          </section>
        );
      })}
      <section className="sala" aria-label="Sala de Treinamento">
        <h2>Sala de Treinamento <span className="muted">({espera.length})</span></h2>
        {salas.length === 0 && <p className="hint">Ninguém em campo: nenhuma missão rodando.</p>}
        <ul className="sala-gente">
          {espera.map((t) => <li key={t}><span className="sala-parado"><Avatar agente={t} tamanho={44} oculto /><span className="small">{membro(t).codinome}</span></span></li>)}
        </ul>
      </section>
    </div>
  );
}

export function Janela({ p }: { p: Posto }) {
  const conversas = useConversas(p.missionId, true);
  const nome = membro(p.tipo || undefined).codinome;
  return (
    <section className="no solto" aria-label={`Janela de ${nome}`}>
      <header><Membro agente={p.tipo || "?"} tamanho={20} /></header>
      <Terminal itens={conversas[p.id === "main" ? "main" : p.tipo]} linhas={p.linhas} nome={nome} />
      <footer className="small"><a href={`#/orquestra/${encodeURIComponent(p.missionId)}`}>Ver a equipe toda no canvas</a></footer>
    </section>
  );
}
