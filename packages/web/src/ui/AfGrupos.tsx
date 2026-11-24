import { useId, useState } from "react";
import { api } from "../api.ts";
import { listaDeTexto, mascararJid, resumoFontes, type ErrosNicho, type Nicho } from "../logic/afiliados.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

function Chips({ itens, vazio }: { itens: string[]; vazio: string }) {
  return itens.length === 0 ? <span className="muted small">{vazio}</span> : <ul className="chips" aria-label="Termos de busca">{itens.map((t, i) => <li key={`${t}-${i}`} className="chip">{t}</li>)}</ul>;
}

/** Comma-separated text that keeps what the user typed (trailing commas included) and reports the parsed list. */
function ListaInput({ rotulo, valor, onChange }: { rotulo: string; valor: string[]; onChange: (v: string[]) => void }) {
  const id = useId();
  const [txt, setTxt] = useState(valor.join(", "));
  return (
    <div className="field">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type="text" value={txt} onChange={(e) => { setTxt(e.target.value); onChange(listaDeTexto(e.target.value)); }} aria-describedby={`${id}-d`} />
      <p className="hint" id={`${id}-d`}>Separe por vírgula.</p>
    </div>
  );
}

function Campo({ rotulo, erro, children, id }: { rotulo: string; erro?: string | undefined; children: React.ReactNode; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{rotulo}</label>
      {children}
      {erro && <p className="err" id={`${id}-e`}>Erro: {erro}</p>}
    </div>
  );
}

function Editor({ n, novo, erros, onChange }: { n: Nicho; novo: boolean; erros: ErrosNicho; onChange: (n: Nicho) => void }) {
  const id = useId();
  const [revelado, setRevelado] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const set = (p: Partial<Nicho>) => onChange({ ...n, ...p });
  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  async function revelar() {
    const r = await api.afRevelarJid(n.key);
    if (r.ok) { setRevelado(r.data.groupJid); setMsg(undefined); } else setMsg(`Não foi possível revelar: ${r.error}`);
  }
  const inv = (e?: string) => (e ? { "aria-invalid": true as const } : {});
  return (
    <div className="af-editor">
      <Campo id={`${id}-label`} rotulo="Nome do grupo (rótulo)" erro={erros.label}><input id={`${id}-label`} type="text" value={n.label} onChange={(e) => set({ label: e.target.value })} {...inv(erros.label)} /></Campo>
      <Campo id={`${id}-key`} rotulo="Identificador (key)" erro={erros.key}>
        <input id={`${id}-key`} type="text" value={n.key} readOnly={!novo} onChange={(e) => set({ key: e.target.value })} {...inv(erros.key)} />
        {!novo && <p className="hint">A key de um nicho salvo não muda; remova e crie outro se precisar.</p>}
      </Campo>
      <div className="field">
        <span className="label" id={`${id}-jid-l`}>Grupo do WhatsApp (jid)</span>
        {revelado !== undefined || novo ? (
          <input id={`${id}-jid`} type="text" aria-labelledby={`${id}-jid-l`} value={revelado ?? n.groupJid} placeholder="120363000000000000@g.us" autoComplete="off" onChange={(e) => { setRevelado(e.target.value); set({ groupJid: e.target.value }); }} {...inv(erros.groupJid)} />
        ) : (
          <p className="mono" aria-labelledby={`${id}-jid-l`}>{mascararJid(n.groupJid)}</p>
        )}
        <div className="row">
          {!novo && revelado === undefined && <button type="button" className="btn chico" onClick={revelar}>Revelar jid</button>}
          {!novo && revelado !== undefined && <button type="button" className="btn chico" onClick={() => setRevelado(undefined)}>Ocultar jid</button>}
        </div>
        {msg && <p className="err">{msg}</p>}
        {erros.groupJid && <p className="err">Erro: {erros.groupJid}</p>}
      </div>
      <Campo id={`${id}-inst`} rotulo="Instância" erro={erros.instance}><input id={`${id}-inst`} type="text" value={n.instance} onChange={(e) => set({ instance: e.target.value })} {...inv(erros.instance)} /></Campo>
      <Campo id={`${id}-aud`} rotulo="Público (opcional)"><input id={`${id}-aud`} type="text" value={n.audience ?? ""} onChange={(e) => { const { audience: _a, ...rest } = n; onChange(e.target.value ? { ...rest, audience: e.target.value } : rest); }} /></Campo>
      <div className="af-num">
        <Campo id={`${id}-pri`} rotulo="Prioridade" erro={erros.priority}><input id={`${id}-pri`} type="number" value={Number.isNaN(n.priority) ? "" : n.priority} onChange={(e) => set({ priority: num(e.target.value) })} {...inv(erros.priority)} /></Campo>
        <Campo id={`${id}-min`} rotulo="Nota mínima da oferta (0 a 100)" erro={erros.minDealScore}><input id={`${id}-min`} type="number" value={Number.isNaN(n.minDealScore) ? "" : n.minDealScore} onChange={(e) => set({ minDealScore: num(e.target.value) })} {...inv(erros.minDealScore)} /></Campo>
        <Campo id={`${id}-max`} rotulo="Máximo por execução" erro={erros.maxPerRun}><input id={`${id}-max`} type="number" value={Number.isNaN(n.maxPerRun) ? "" : n.maxPerRun} onChange={(e) => set({ maxPerRun: num(e.target.value) })} {...inv(erros.maxPerRun)} /></Campo>
      </div>
      <ListaInput rotulo="Mercado Livre: termos de busca" valor={n.ml.keywords} onChange={(v) => set({ ml: { ...n.ml, keywords: v } })} />
      <ListaInput rotulo="Mercado Livre: categorias (ids)" valor={n.ml.categoryIds} onChange={(v) => set({ ml: { ...n.ml, categoryIds: v } })} />
      <ListaInput rotulo="Amazon: termos de busca" valor={n.amazon.keywords} onChange={(v) => set({ amazon: { ...n.amazon, keywords: v } })} />
      <ListaInput rotulo="Amazon: nós de navegação (ids)" valor={n.amazon.browseNodeIds} onChange={(v) => set({ amazon: { ...n.amazon, browseNodeIds: v } })} />
      {erros.cronSlots && <p className="err">Erro: {erros.cronSlots}. Ajuste na aba Agenda 24h.</p>}
    </div>
  );
}

export type ItemDraft = { n: Nicho; novo: boolean };

export function AfGrupos({ itens, erros, onChange, onAdd, onRemove, backups, onRestaurar }: {
  itens: ItemDraft[]; erros: { porNicho: ErrosNicho[]; lista: string[] };
  onChange: (i: number, n: Nicho) => void; onAdd: () => void; onRemove: (i: number) => void;
  backups: Array<{ id: string; tamanho: number }>; onRestaurar: (id: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState<number>();
  const [removendo, setRemovendo] = useState<number>();
  const [restaurando, setRestaurando] = useState<string>();
  return (
    <section aria-labelledby="af-g">
      <div className="sec"><h2 id="af-g">Grupos e nichos</h2><button type="button" className="btn primario" onClick={() => { onAdd(); setAberto(itens.length); }}>+ Novo nicho</button></div>
      {erros.lista.map((m) => <p key={m} className="err" role="alert">Erro: {m}</p>)}
      <ul className="lista af-grupos">
        {itens.map(({ n, novo }, i) => {
          const f = resumoFontes(n);
          const e = erros.porNicho[i] ?? {};
          const ne = Object.keys(e).length;
          const abre = aberto === i;
          return (
            <li key={i} className={`grupo-card${n.enabled ? "" : " off"}`}>
              <div className="cab">
                <h3>{n.label || n.key || "Novo nicho"}</h3>
                <span className="row">
                  <span className={`pill ${n.enabled ? "lig" : "desl"}`}>{n.enabled ? "Ligado" : "Desligado"}</span>
                  <span className="pill">Prioridade {n.priority}</span>
                  {ne > 0 && <span className="pill erro">{ne} {ne === 1 ? "erro" : "erros"}</span>}
                </span>
              </div>
              <p className="muted small">Grupo <span className="mono">{mascararJid(n.groupJid) || "(sem jid)"}</span> · chave <span className="mono">{n.key || "(sem key)"}</span></p>
              <div className="fonte"><span className="rot">Mercado Livre</span><Chips itens={f.ml} vazio="sem termos" />{f.categoriasMl > 0 && <span className="muted small">{f.categoriasMl} categorias</span>}</div>
              <div className="fonte"><span className="rot">Amazon</span><Chips itens={f.amazon} vazio="sem termos" />{f.categoriasAmazon > 0 && <span className="muted small">{f.categoriasAmazon} nós</span>}</div>
              <p className="small">Nota mínima <strong>{n.minDealScore}</strong> · máx. por execução <strong>{n.maxPerRun}</strong> · {n.cronSlots.length} {n.cronSlots.length === 1 ? "horário" : "horários"} por dia</p>
              <div className="row">
                <label className="check"><input type="checkbox" checked={n.enabled} onChange={(ev) => onChange(i, { ...n, enabled: ev.target.checked })} /> Ligado</label>
                <button type="button" className="btn chico" aria-expanded={abre} onClick={() => setAberto(abre ? undefined : i)}>{abre ? "Fechar edição" : "Editar"}</button>
                <button type="button" className="btn chico" onClick={() => setRemovendo(i)}>Remover</button>
              </div>
              {abre && <Editor n={n} novo={novo} erros={e} onChange={(x) => onChange(i, x)} />}
            </li>
          );
        })}
        {itens.length === 0 && <li className="vazio"><p>Nenhum nicho no rascunho. Use “Novo nicho” ou restaure um backup.</p></li>}
      </ul>

      <details className="af-backups">
        <summary>Backups ({backups.length})</summary>
        {backups.length === 0 ? <p className="muted small">Nenhum backup ainda: o hub guarda um a cada gravação.</p> : (
          <ul className="lista-simples">
            {backups.map((b) => (
              <li key={b.id}><span className="mono">{b.id}</span><span className="muted small">{b.tamanho} bytes</span><button type="button" className="btn chico" onClick={() => setRestaurando(b.id)}>Restaurar</button></li>
            ))}
          </ul>
        )}
      </details>

      <ConfirmDialog aberto={removendo !== undefined} titulo="Remover este nicho do rascunho?" onFechar={() => setRemovendo(undefined)}>
        <p style={{ margin: "var(--e-3) 0 var(--e-5)" }}>“{removendo !== undefined ? itens[removendo]?.n.label || itens[removendo]?.n.key : ""}” sai do rascunho. Só vale depois de “Salvar alterações”, e há backup automático.</p>
        <div className="row">
          <button type="button" className="btn" autoFocus onClick={() => setRemovendo(undefined)}>Cancelar</button>
          <button type="button" className="btn perigo" onClick={() => { if (removendo !== undefined) { onRemove(removendo); setAberto(undefined); } setRemovendo(undefined); }}>Remover do rascunho</button>
        </div>
      </ConfirmDialog>
      <ConfirmDialog aberto={restaurando !== undefined} titulo="Restaurar este backup?" onFechar={() => setRestaurando(undefined)}>
        <p style={{ margin: "var(--e-3) 0 var(--e-5)" }}>O arquivo de nichos volta ao estado do backup <span className="mono">{restaurando}</span> e as edições não salvas daqui são descartadas. Depois será preciso sincronizar.</p>
        <div className="row">
          <button type="button" className="btn" autoFocus onClick={() => setRestaurando(undefined)}>Cancelar</button>
          <button type="button" className="btn primario" onClick={async () => { const id = restaurando; setRestaurando(undefined); if (id) await onRestaurar(id); }}>Restaurar backup</button>
        </div>
      </ConfirmDialog>
    </section>
  );
}
