import { useCallback, useEffect, useState } from "react";
import { api, type InfoResp, type NichosResp } from "../api.ts";
import { NICHO_NOVO, estadoAfiliados, resumoMudancas, validarLista, type Nicho } from "../logic/afiliados.ts";
import type { Live } from "../store.ts";
import { AfAgenda } from "../ui/AfAgenda.tsx";
import { AfAplicar } from "../ui/AfAplicar.tsx";
import { AfGrupos, type ItemDraft } from "../ui/AfGrupos.tsx";
import { AfSaude, type Rel } from "../ui/AfSaude.tsx";
import { COMANDO_SYNC } from "../logic/afiliados-const.ts";

export type Secao = "grupos" | "agenda" | "saude" | "aplicar";
const SECOES: Array<[Secao, string]> = [["grupos", "Grupos e nichos"], ["agenda", "Agenda 24h"], ["saude", "Saúde"], ["aplicar", "Aplicar mudanças"]];

export interface Dados { nichos: NichosResp; info?: InfoResp | undefined; ops: Rel; auditor: Rel; backups: Array<{ id: string; tamanho: number }> }

/** Setup instructions, not an error: the project is simply not registered yet. */
export function SemAfiliados() {
  return (
    <div className="vazio">
      <p>O projeto <strong>afiliados</strong> ainda não está registrado no hub.</p>
      <p className="muted">Para usar o painel: abra Projetos, anexe a pasta do projeto afiliados e use o nome ou o id <code>afiliados</code>. Depois volte aqui.</p>
      <a className="btn primario" href="#/projetos">+ Anexar projeto</a>
    </div>
  );
}

export function AvisoConflito({ onRecarregar }: { onRecarregar: () => void }) {
  return (
    <div className="aviso warn-box" role="alert">
      <strong>O arquivo de nichos mudou no disco desde que você abriu esta tela.</strong>
      <span> Nada foi gravado. Recarregue para ver a versão atual; suas edições não salvas serão descartadas.</span>
      <div className="row"><button type="button" className="btn primario" onClick={onRecarregar}>Recarregar</button></div>
    </div>
  );
}

/** Draft editor + sections. Remounted (key = file hash) after every reload, so the draft always starts from what is on disk. */
export function Painel({ dados, aviso, onRecarregar, secaoInicial = "grupos" }: { dados: Dados; aviso?: string | undefined; onRecarregar: (aviso?: string) => void; secaoInicial?: Secao }) {
  const salvo = dados.nichos.nichos;
  const [secao, setSecao] = useState<Secao>(secaoInicial);
  const [itens, setItens] = useState<ItemDraft[]>(() => salvo.map((n) => ({ n, novo: false })));
  const [salvando, setSalvando] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [erro, setErro] = useState<string>();

  const draft = itens.map((i) => i.n);
  const erros = validarLista(draft, salvo);
  const mud = resumoMudancas(salvo, draft);
  const sujo = mud.total > 0;
  const setN = (i: number, n: Nicho) => setItens((l) => l.map((x, j) => (j === i ? { ...x, n } : x)));

  async function salvar() {
    setSalvando(true); setErro(undefined);
    const r = await api.afGravar({ nichos: draft, hash: dados.nichos.hash, mtimeMs: dados.nichos.mtimeMs });
    setSalvando(false);
    if (r.ok) return onRecarregar("Alterações salvas. Falta sincronizar: veja “Aplicar mudanças”.");
    if (r.status === 409) setConflito(true); else setErro(r.error);
  }
  async function restaurar(id: string) {
    const r = await api.afRestaurar(id);
    if (r.ok) onRecarregar(`Backup ${id} restaurado. Falta sincronizar.`);
    else if (r.status === 409) setConflito(true); else setErro(`Não restaurou: ${r.error}`);
  }
  async function marcar() {
    const r = await api.afSincronizado();
    if (r.ok) { onRecarregar("Marcado como sincronizado."); return undefined; }
    return r.error;
  }

  return (
    <div className="af">
      <nav className="af-nav" aria-label="Seções do painel afiliados">
        {SECOES.map(([id, rot]) => (
          <button key={id} type="button" className="af-tab" {...(secao === id ? { "aria-current": "page" as const } : {})} onClick={() => setSecao(id)}>
            {rot}{id === "aplicar" && dados.nichos.pendenteSync && <span className="pill pend"> pendente</span>}
          </button>
        ))}
      </nav>
      <div className="af-corpo-painel">
        {aviso && <p role="status" className="ok field">{aviso}</p>}
        {conflito && <AvisoConflito onRecarregar={() => onRecarregar()} />}
        {erro && <p role="alert" className="err field">Erro: {erro}</p>}

        {secao === "grupos" && <AfGrupos itens={itens} erros={erros} onChange={setN} onAdd={() => setItens((l) => [...l, { n: NICHO_NOVO(salvo[0]?.instance ?? ""), novo: true }])} onRemove={(i) => setItens((l) => l.filter((_, j) => j !== i))} backups={dados.backups} onRestaurar={restaurar} />}
        {secao === "agenda" && <AfAgenda draft={draft} waMax={dados.info?.waMaxPerDay} onSlots={(key, cron) => setItens((l) => l.map((x) => (x.n.key === key ? { ...x, n: { ...x.n, cronSlots: cron } } : x)))} />}
        {secao === "saude" && <AfSaude info={dados.info} ops={dados.ops} auditor={dados.auditor} />}
        {secao === "aplicar" && <AfAplicar pendente={dados.nichos.pendenteSync} comando={dados.info?.comandoSync ?? COMANDO_SYNC} rascunho={sujo} onMarcar={marcar} />}

        {sujo && (
          <div className="af-barra" role="region" aria-label="Alterações não salvas">
            <span>
              <strong>Alterações não salvas: {mud.total}.</strong>{" "}
              {[mud.novos.length ? `novos: ${mud.novos.join(", ")}` : "", mud.alterados.length ? `alterados: ${mud.alterados.join(", ")}` : "", mud.removidos.length ? `removidos: ${mud.removidos.join(", ")}` : ""].filter(Boolean).join(" · ")}
              {erros.total > 0 && <span className="err"> Corrija {erros.total} {erros.total === 1 ? "erro" : "erros"} antes de salvar (aba Grupos e nichos).</span>}
            </span>
            <span className="row">
              <button type="button" className="btn" onClick={() => setItens(salvo.map((n) => ({ n, novo: false })))}>Descartar</button>
              <button type="button" className="btn primario" disabled={salvando || erros.total > 0} onClick={salvar}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type Carga = { t: "carregando" } | { t: "vazio" } | { t: "erro"; msg: string } | { t: "ok"; dados: Dados; aviso?: string | undefined };

export function Afiliados({ live }: { live: Live }) {
  const est = estadoAfiliados(live.projects);
  const [carga, setCarga] = useState<Carga>({ t: "carregando" });
  const registrado = est.tipo !== "sem-projeto";

  const carregar = useCallback(async (aviso?: string) => {
    const n = await api.afNichos();
    if (!n.ok) return setCarga({ t: "erro", msg: n.status === 501 ? "O hub foi iniciado sem pasta de dados; reinicie-o com `npm start`." : n.error });
    if (!n.data.configurado) return setCarga({ t: "vazio" });
    const [info, ops, aud, bk] = await Promise.all([api.afInfo(), api.afRelatorio("ops"), api.afRelatorio("deal-auditor"), api.afBackups()]);
    const rel = (r: typeof ops): Rel => (r.ok && r.data.configurado ? r.data : "erro");
    setCarga({ t: "ok", aviso, dados: { nichos: n.data, info: info.ok && info.data.configurado ? info.data : undefined, ops: rel(ops), auditor: rel(aud), backups: bk.ok ? bk.data.backups : [] } });
  }, []);

  useEffect(() => { if (registrado) void carregar(); }, [registrado, carregar]);

  let corpo;
  if (live.loading) corpo = <div className="lista" aria-busy="true" aria-label="Carregando"><div className="skeleton" /></div>;
  else if (!registrado || carga.t === "vazio") corpo = <SemAfiliados />;
  else if (carga.t === "carregando") corpo = <div className="lista" aria-busy="true" aria-label="Carregando painel"><div className="skeleton" /><div className="skeleton" /></div>;
  else if (carga.t === "erro") corpo = <div className="vazio"><p className="err">Não foi possível abrir o painel: {carga.msg}</p><button type="button" className="btn" onClick={() => { setCarga({ t: "carregando" }); void carregar(); }}>Tentar de novo</button></div>;
  else corpo = <Painel key={carga.dados.nichos.hash + carga.dados.nichos.mtimeMs + (carga.aviso ?? "")} dados={carga.dados} aviso={carga.aviso} onRecarregar={(a) => void carregar(a)} />;

  return (
    <>
      <div className="sec"><h1>Afiliados</h1><span className="muted small">Painel do bot de ofertas · o hub só edita a configuração, nunca envia nem executa</span></div>
      {corpo}
    </>
  );
}
