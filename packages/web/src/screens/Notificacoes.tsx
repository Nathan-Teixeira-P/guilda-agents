import { useState } from "react";
import { CAT_ROTULO, CATEGORIAS, filtrar, lidaDe, type Categoria } from "../logic/notificacoes.ts";
import { permissaoNotif, type PermissaoNotif } from "../logic/notificacao.ts";
import { definirSom, somLigado } from "../prefs.ts";
import type { Notif } from "../notif.ts";
import { useNow } from "../store.ts";
import { ItemNotif } from "../ui/Notificacoes.tsx";

const TXT_NAV: Record<PermissaoNotif, string> = {
  padrao: "Os avisos do navegador ainda não foram permitidos.",
  concedida: "Avisos do navegador ligados (só aparecem com a aba em segundo plano).",
  negada: "Avisos do navegador bloqueados nas permissões do navegador.",
  indisponivel: "Este navegador não tem avisos.",
};

/** Full page `#/notificacoes`: history with filter, and the settings (categories, desktop, quiet hours, sound). */
export function Notificacoes({ notif }: { notif: Notif }) {
  const agora = useNow();
  const [cat, setCat] = useState<Categoria | "todas">("todas");
  const [limpando, setLimpando] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [som, setSom] = useState(somLigado);
  const [nav, setNav] = useState<PermissaoNotif>(permissaoNotif);
  const { config: c } = notif;
  const lista = filtrar(notif.lista, cat);
  const naoLidas = notif.lista.filter((n) => !lidaDe(n, notif.locais)).length;
  const salvar = async (patch: object) => setMsg(await notif.salvarConfig(patch));
  const contar = (k: Categoria | "todas") => filtrar(notif.lista, k).length;
  return (
    <>
      <div className="sec"><h1>Notificações</h1><a className="btn" href="#/">Voltar ao Salão</a></div>
      {notif.falhou && <p className="err" role="alert">Não consegui carregar as notificações: o servidor está fora do ar ou é uma versão antiga.</p>}
      <section className="panel" aria-labelledby="not-hist">
        <h2 id="not-hist">Histórico</h2>
        <div className="row" role="group" aria-label="Filtrar por categoria">
          {(["todas", ...CATEGORIAS] as const).map((k) => (
            <button key={k} type="button" className="btn chico" aria-pressed={cat === k} onClick={() => setCat(k)}>{k === "todas" ? "Todas" : CAT_ROTULO[k]} ({contar(k)})</button>
          ))}
        </div>
        <div className="row" style={{ marginTop: "var(--e-3)" }}>
          <button type="button" className="btn chico" disabled={naoLidas === 0} onClick={() => void notif.marcarLidas()}>Marcar todas como lidas ({naoLidas})</button>
          {limpando
            ? <><button type="button" className="btn chico perigo" onClick={async () => { setMsg(await notif.limpar()); setLimpando(false); }}>Confirmar: limpar tudo</button><button type="button" className="btn chico" onClick={() => setLimpando(false)}>Cancelar</button></>
            : <button type="button" className="btn chico" disabled={notif.lista.length === 0} onClick={() => setLimpando(true)}>Limpar</button>}
        </div>
        {lista.length === 0
          ? <p className="hint">{notif.carregado ? (cat === "todas" ? "Nenhuma notificação ainda. Quando uma missão, um artigo ou uma rotina terminar, o aviso aparece aqui." : "Nada nesta categoria.") : "Carregando…"}</p>
          : <ul className="lista-simples notif-lista">{lista.map((n) => <ItemNotif key={n.id} n={n} lida={lidaDe(n, notif.locais)} agora={agora} onAbrir={() => { void notif.marcarLidas([n.id]); }} />)}</ul>}
      </section>

      <section className="panel notif-cfg" aria-labelledby="not-cfg">
        <h2 id="not-cfg">Configurações</h2>
        {msg && <p className="err" role="alert">{msg}</p>}
        <table className="notif-tabela">
          <caption className="sr-only">Quais categorias geram notificações</caption>
          <thead><tr><th scope="col">Categoria</th><th scope="col">Registrar no centro</th><th scope="col">Aviso no desktop</th></tr></thead>
          <tbody>
            {CATEGORIAS.map((k) => (
              <tr key={k}>
                <th scope="row">{CAT_ROTULO[k]}</th>
                <td><label><input type="checkbox" checked={c.categorias[k]} onChange={(e) => void salvar({ categorias: { [k]: e.target.checked } })} /> <span className="sr-only">Registrar {CAT_ROTULO[k]} no centro</span><span aria-hidden="true">{c.categorias[k] ? "Sim" : "Não"}</span></label></td>
                <td><label><input type="checkbox" checked={c.desktop.categorias[k]} disabled={!c.desktop.ligado} onChange={(e) => void salvar({ desktop: { categorias: { [k]: e.target.checked } } })} /> <span className="sr-only">Aviso no desktop para {CAT_ROTULO[k]}</span><span aria-hidden="true">{c.desktop.categorias[k] ? "Sim" : "Não"}</span></label></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="notif-opc">
          <label><input type="checkbox" checked={c.desktop.ligado} onChange={(e) => void salvar({ desktop: { ligado: e.target.checked } })} /> Avisos do desktop (notify-send) ligados</label>
          <p className="hint">Só sucesso, aviso e erro viram aviso no desktop, no máximo um a cada 3 s. Se o notify-send não existir neste computador, nada acontece.</p>
        </div>
        <fieldset className="notif-opc">
          <legend>Horário de silêncio</legend>
          <label><input type="checkbox" checked={c.silencio.ativo} onChange={(e) => void salvar({ silencio: { ativo: e.target.checked } })} /> Silenciar avisos (desktop, toast, navegador e som)</label>
          <div className="row">
            <label>Das <input type="time" value={c.silencio.inicio} onChange={(e) => { if (e.target.value) void salvar({ silencio: { inicio: e.target.value } }); }} /></label>
            <label>até <input type="time" value={c.silencio.fim} onChange={(e) => { if (e.target.value) void salvar({ silencio: { fim: e.target.value } }); }} /></label>
          </div>
          <p className="hint">Durante o silêncio as notificações continuam no histórico.</p>
        </fieldset>
        <div className="notif-opc">
          <label><input type="checkbox" checked={som} onChange={(e) => { definirSom(e.target.checked); setSom(e.target.checked); }} /> Som suave ao chegar um aviso (neste navegador)</label>
          <p className="hint">{TXT_NAV[nav]}</p>
          {nav === "padrao" && <button type="button" className="btn chico" onClick={async () => { try { await Notification.requestPermission(); } catch { /* old browsers */ } setNav(permissaoNotif()); }}>Permitir avisos do navegador</button>}
        </div>
      </section>
    </>
  );
}
