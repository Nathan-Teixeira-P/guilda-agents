import { useEffect, useMemo, useRef, useState } from "react";
import { avisosDe } from "../logic/alarmes.ts";
import { CAT_ICONE, CAT_ROTULO, CATEGORIAS, NIVEL_ROTULO, contarBadge, filtrar, lidaDe, linkSeguro, pendenciasDe, type Categoria, type Notificacao, type Pendencia } from "../logic/notificacoes.ts";
import { formatDesde } from "../logic/time.ts";
import type { Notif } from "../notif.ts";
import { useNow, type Live } from "../store.ts";

/** One notification. Level and category are spelled out (never colour only); unread is marked with the word "Nova". */
export function ItemNotif({ n, lida, agora, onAbrir }: { n: Pick<Notificacao, "categoria" | "nivel" | "titulo" | "texto" | "ts" | "link">; lida: boolean; agora: number; onAbrir?: () => void }) {
  const link = linkSeguro(n.link);
  return (
    <li className={`notif nv-${n.nivel}${lida ? " lida" : ""}`}>
      <span className="notif-ico" aria-hidden="true">{CAT_ICONE[n.categoria]}</span>
      <div className="notif-corpo">
        <p className="notif-meta">
          <span className={`notif-nivel nv-${n.nivel}`}>{NIVEL_ROTULO[n.nivel]}</span> · {CAT_ROTULO[n.categoria]}
          {n.ts && <> · <time dateTime={n.ts}>{formatDesde(n.ts, agora)}</time></>}
          {!lida && <> · <strong>Nova</strong></>}
        </p>
        <p className="notif-titulo">{n.titulo}</p>
        {n.texto && <p className="notif-texto">{n.texto}</p>}
      </div>
      {link && <a className="btn chico" href={link} onClick={onAbrir}>Abrir<span className="sr-only">: {n.titulo}</span></a>}
    </li>
  );
}

const pend2n = (p: Pendencia) => ({ categoria: p.categoria, nivel: p.nivel, titulo: p.titulo, texto: p.texto, ts: "", link: p.link });

/** Bell + popover. Counts live pendências (breaker, cap, failures, pauses: they resolve by themselves) plus unread notifications. */
export function Centro({ live, notif }: { live: Live; notif: Notif }) {
  const pend = useMemo(() => pendenciasDe(avisosDe(live.missions, live.events)), [live.missions, live.events]);
  const { total, critico } = contarBadge(notif.lista, pend, notif.locais);
  const agora = useNow();
  const [aberto, setAberto] = useState(false);
  const [cat, setCat] = useState<Categoria | "todas">("todas");
  const [limpando, setLimpando] = useState(false);
  const [msg, setMsg] = useState<string>();
  const raiz = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); btn.current?.focus(); } };
    const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    window.addEventListener("keydown", esc);
    window.addEventListener("pointerdown", fora);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("pointerdown", fora); };
  }, [aberto]);
  useEffect(() => { if (!aberto) { setLimpando(false); setMsg(undefined); } }, [aberto]);
  const lista = filtrar(notif.lista, cat);
  const naoLidas = notif.lista.filter((n) => !lidaDe(n, notif.locais)).length;
  const recentes = lista.slice(0, 8);
  return (
    <div className="sino" ref={raiz}>
      <button ref={btn} type="button" className={`btn chico sino-btn${critico ? " critico" : ""}`} aria-expanded={aberto} aria-controls="sino-pop" aria-label={total === 0 ? "Notificações: nenhuma nova" : `Notificações: ${total} ${total === 1 ? "pendente" : "pendentes"}`} onClick={() => setAberto(!aberto)}>
        <span aria-hidden="true">🔔</span>
        {total > 0 && <span className="sino-n" aria-hidden="true">{total > 99 ? "99+" : total}</span>}
      </button>
      <div className="sr-only" role="status">{total > 0 ? `${total} ${total === 1 ? "notificação pendente" : "notificações pendentes"}` : ""}</div>
      {aberto && (
        <div className="panel sino-pop" id="sino-pop" role="region" aria-label="Central de notificações">
          <div className="sino-topo">
            <h2>Notificações</h2>
            <label className="sr-only" htmlFor="sino-cat">Filtrar por categoria</label>
            <select id="sino-cat" value={cat} onChange={(e) => setCat(e.target.value as Categoria | "todas")}>
              <option value="todas">Todas as categorias</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_ROTULO[c]}</option>)}
            </select>
          </div>
          {notif.falhou && <p className="err" role="alert">Não consegui carregar o histórico (servidor fora do ar ou versão antiga). Os alertas ao vivo continuam aqui.</p>}
          {pend.length > 0 && (cat === "todas" || pend.some((p) => p.categoria === cat)) && (
            <section aria-label="Em aberto agora">
              <h3 className="notif-sec">Em aberto agora</h3>
              <ul className="lista-simples">{pend.filter((p) => cat === "todas" || p.categoria === cat).map((p) => <ItemNotif key={p.chave} n={pend2n(p)} lida={true} agora={agora} onAbrir={() => setAberto(false)} />)}</ul>
            </section>
          )}
          <section aria-label="Histórico">
            {pend.length > 0 && <h3 className="notif-sec">Histórico</h3>}
            {recentes.length === 0 ? (
              <p className="hint">{notif.falhou ? "" : cat === "todas" ? "Nenhuma notificação ainda. Quando uma missão, um artigo ou uma rotina terminar, o aviso aparece aqui." : "Nada nesta categoria."}</p>
            ) : (
              <ul className="lista-simples">{recentes.map((n) => <ItemNotif key={n.id} n={n} lida={lidaDe(n, notif.locais)} agora={agora} onAbrir={() => { void notif.marcarLidas([n.id]); setAberto(false); }} />)}</ul>
            )}
          </section>
          {msg && <p className="err" role="alert">{msg}</p>}
          <div className="row sino-rodape">
            <button type="button" className="btn chico" disabled={naoLidas === 0} onClick={() => void notif.marcarLidas()}>Marcar todas como lidas</button>
            {limpando
              ? <><button type="button" className="btn chico perigo" onClick={async () => { setMsg(await notif.limpar()); setLimpando(false); }}>Confirmar: limpar tudo</button><button type="button" className="btn chico" onClick={() => setLimpando(false)}>Cancelar</button></>
              : <button type="button" className="btn chico" disabled={notif.lista.length === 0} onClick={() => setLimpando(true)}>Limpar</button>}
            <a className="btn chico" href="#/notificacoes" onClick={() => setAberto(false)}>Ver todas e configurar</a>
          </div>
        </div>
      )}
    </div>
  );
}

/** Toasts for new success/warning/error notifications. Polite status for most, alert for errors; auto-dismiss (the item stays in the center). Motion is CSS-only and off under reduced motion. */
export function Toasts({ notif }: { notif: Notif }) {
  const agora = useNow();
  const erros = notif.toasts.filter((t) => t.nivel === "erro");
  const resto = notif.toasts.filter((t) => t.nivel !== "erro");
  const item = (t: Notificacao) => (
    <div key={t.id} className={`toast nv-${t.nivel}`}>
      <p className="notif-meta"><span className={`notif-nivel nv-${t.nivel}`}>{NIVEL_ROTULO[t.nivel]}</span> · {CAT_ROTULO[t.categoria]}</p>
      <p className="notif-titulo">{t.titulo}</p>
      {t.texto && <p className="notif-texto">{t.texto}</p>}
      <div className="row">
        {linkSeguro(t.link) && <a className="btn chico" href={linkSeguro(t.link)} onClick={() => notif.dispensar(t.id)}>Abrir<span className="sr-only">: {t.titulo}</span></a>}
        <button type="button" className="btn chico" onClick={() => notif.dispensar(t.id)} aria-label={`Dispensar: ${t.titulo}`}>Dispensar</button>
      </div>
      <span className="sr-only">{formatDesde(t.ts, agora)}</span>
    </div>
  );
  return (
    <div className="toasts">
      <div role="status" aria-live="polite">{resto.map(item)}</div>
      <div role="alert">{erros.map(item)}</div>
    </div>
  );
}
