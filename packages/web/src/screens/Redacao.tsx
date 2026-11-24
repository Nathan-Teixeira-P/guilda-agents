import { useState } from "react";
import { go } from "../router.ts";
import { ESTADOS, FORM_VAZIO, comCapa, contarPorEstado, dataCurta, ehSugestao, estadoDoArtigo, filtrarPorEstado, formDaSugestao, motivoDoArtigo, rotuloArtigo, rotuloEstado, type EstadoArtigo, type FormRedacao } from "../logic/redacao.ts";
import type { Live } from "../store.ts";
import { ArtigoDetalhe } from "../ui/ArtigoDetalhe.tsx";
import { Capas } from "../ui/Capas.tsx";
import { PedidoRedacao } from "../ui/PedidoRedacao.tsx";

/** Redação: the fixed place to ask for research, topic ideas, articles and covers. Copy and "Baixar capa" are the only ways out. */
export function Redacao({ slug, live }: { slug?: string; live: Live }) {
  const [filtro, setFiltro] = useState<EstadoArtigo>();
  const [inicial, setInicial] = useState<{ n: number; f: FormRedacao }>();

  if (slug) {
    return <ArtigoDetalhe key={slug} slug={slug} live={live} onEscolher={(s) => { setInicial({ n: Date.now(), f: formDaSugestao(s) }); go("/redacao"); }} />;
  }
  const { artigos, loading } = live;
  const lista = filtrarPorEstado(artigos, filtro);
  const cont = contarPorEstado(artigos);

  return (
    <div className="rd">
      <div className="sec"><div><h1>Redação</h1><p className="muted">Pesquisa, pautas, artigos e capas, num só lugar.</p></div></div>
      <PedidoRedacao key={inicial?.n ?? 0} live={live} inicial={inicial?.f} onCriado={(s) => go(`/redacao/${encodeURIComponent(s)}`)} />

      <h2 className="sec-t">Artigos</h2>
      {loading ? <div className="skeleton" style={{ height: 120 }} aria-busy="true" aria-label="Carregando artigos" /> : artigos.length === 0 ? (
        <div className="vazio panel"><h3>Nenhum artigo ainda</h3><p className="muted">Escolha um modo acima e faça o primeiro pedido. Os artigos aparecem aqui e atualizam sozinhos.</p></div>
      ) : (
        <>
          <div className="rd-chips" role="group" aria-label="Filtrar por estado">
            <button type="button" className="btn chico" aria-pressed={filtro === undefined} onClick={() => setFiltro(undefined)}>Todos ({artigos.length})</button>
            {ESTADOS.filter((e) => cont[e] > 0 || e === filtro).map((e) => <button key={e} type="button" className="btn chico" aria-pressed={filtro === e} onClick={() => setFiltro(e)}>{rotuloEstado(e)} ({cont[e]})</button>)}
          </div>
          {lista.length === 0 ? <p className="muted">Nenhum artigo neste estado.</p> : (
            <ul className="rd-lista" aria-live="polite">
              {lista.map((a) => {
                const m = motivoDoArtigo(a);
                const ativo = ["pesquisando", "rascunho", "edicao-final"].includes(estadoDoArtigo(a));
                return (
                  <li key={a.id} className="panel rd-item">
                    <div className="rd-item-h">
                      <a className="rd-item-t" href={`#/redacao/${encodeURIComponent(a.id)}`}>{a.tema || (ehSugestao(a) ? "Sugestões de temas" : a.id)}</a>
                      <span className={`pill estagio s-${a.stage}`}>{rotuloArtigo(a)}</span>
                    </div>
                    <p className="muted small">{ehSugestao(a) ? "Sugestão de temas" : `v${a.versao}`} · atualizado em {dataCurta(a.updatedAt)}{ativo && <> · <span role="status">trabalhando…</span></>}</p>
                    {m && <p className="warn small">{m.titulo}: {m.texto}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <Capas itens={comCapa(artigos).map((a) => ({ slug: a.id, tema: a.tema || a.id }))} titulo="Capas dos artigos aprovados" />
        </>
      )}
    </div>
  );
}
