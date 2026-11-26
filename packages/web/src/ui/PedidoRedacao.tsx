import { TetosPlano, lerTetos } from "./TetosPlano.tsx";
import { useId, useState } from "react";
import { api } from "../api.ts";
import { FORM_VAZIO, montarPedido, type Estimativa, type FormRedacao, type PedidoRedacao as Pedido, type Referencia } from "../logic/redacao.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { Emblem } from "./Emblem.tsx";
import { Membro } from "./Avatar.tsx";
import { useNow, type Live } from "../store.ts";

const TIPOS: { v: Referencia["tipo"]; r: string; dica: string }[] = [
  { v: "url", r: "Link", dica: "https://…" },
  { v: "caminho", r: "Caminho", dica: "/home/você/arquivo.md" },
  { v: "texto", r: "Texto", dica: "Cole um trecho" },
];

/** The big request panel: two modes, advanced fields collapsed, usage estimate shown before anything starts. */
export function PedidoRedacao({ live, inicial, onCriado }: { live: Live; inicial?: FormRedacao | undefined; onCriado: (slug: string) => void }) {
  const [f, setF] = useState<FormRedacao>(inicial ?? FORM_VAZIO);
  const [tentou, setTentou] = useState(false);
  const [est, setEst] = useState<Estimativa>();
  const [pedido, setPedido] = useState<Pedido>();
  const [teto, setTeto] = useState("");
  const [tetoSem, setTetoSem] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [motivoUso, setMotivoUso] = useState<string>();
  const now = useNow();
  const id = useId();
  const v = montarPedido(f);
  const erros = v.ok ? {} : v.erros;
  const { ok: tetoOk, tetos } = lerTetos(teto, tetoSem);
  const mudar = (p: Partial<FormRedacao>) => { setF((c) => ({ ...c, ...p })); setEst(undefined); setErr(undefined); };
  const setRef = (i: number, p: Partial<Referencia>) => mudar({ referencias: f.referencias.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const definido = f.modo === "definido";

  async function revisar(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (!v.ok) return;
    setBusy(true); setErr(undefined);
    const r = await api.estimarArtigo({ ...v.pedido, ...tetos });
    setBusy(false);
    if (!r.ok) return setErr(r.status === 0 ? "O servidor está fora do ar. Nada foi enviado." : `Não foi possível estimar: ${r.error}`);
    setPedido(v.pedido); setEst(r.data.estimativa);
  }
  async function iniciar(confirmarUso = false) {
    if (!pedido || !tetoOk) return;
    setBusy(true); setErr(undefined);
    const r = await api.criarArtigo({ ...pedido, ...tetos, ...(confirmarUso ? { confirmarUso: true } : {}) });
    setBusy(false);
    if (!r.ok && r.status === 409) return setMotivoUso(r.error);
    if (!r.ok) return setErr(r.status === 0 ? "O servidor está fora do ar. Nada foi iniciado." : `O servidor recusou o pedido: ${r.error}`);
    setF(FORM_VAZIO); setEst(undefined); setTentou(false);
    live.reload();
    onCriado(r.data.artigo.id);
  }

  return (
    <form className="panel rd-pedido" onSubmit={revisar} noValidate aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="rd-titulo">O que vamos escrever?</h2>
      <fieldset className="rd-modos">
        <legend className="sr-only">Modo do pedido</legend>
        {([["sugerir", "Sugerir temas", "O Erudito pesquisa e propõe pautas com fontes. Você escolhe uma.", "researcher"], ["definido", "Tema definido", "Você diz o tema: pesquisa, checagem, rascunho, revisão e capa.", "writer"]] as const).map(([m, t, d, ag]) => (
          <label key={m} className={`rd-modo${f.modo === m ? " ativo" : ""}`}>
            <input type="radio" name={`${id}-modo`} checked={f.modo === m} onChange={() => mudar({ modo: m })} />
            <span className="rd-modo-t"><Membro agente={ag} tamanho={32} /> <strong>{t}</strong>{f.modo === m && <span className="pill">escolhido</span>}</span>
            <span className="hint">{d}</span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-tema`}>{definido ? "Tema do artigo" : "Assunto ou área (opcional)"}</label>
        <input id={`${id}-tema`} type="text" value={f.tema} maxLength={300} onChange={(e) => mudar({ tema: e.target.value })} aria-invalid={tentou && !!erros["tema"]} aria-describedby={tentou && erros["tema"] ? `${id}-tema-e` : undefined} placeholder={definido ? "Ex.: como o cache HTTP funciona" : "Ex.: novidades em acessibilidade web"} />
        {tentou && erros["tema"] && <p id={`${id}-tema-e`} className="err">{erros["tema"]}</p>}
      </div>

      <details className="rd-avancado">
        <summary>{definido ? "Opções do artigo (público, tom, tamanho)" : "Opções da pesquisa (idioma, fontes de apoio)"}</summary>
        <div className="rd-grade">
          {definido && <div className="field"><label htmlFor={`${id}-pub`}>Público</label><input id={`${id}-pub`} type="text" value={f.publico} onChange={(e) => mudar({ publico: e.target.value })} placeholder="Ex.: devs júnior" /></div>}
          {definido && <div className="field"><label htmlFor={`${id}-tom`}>Tom</label><input id={`${id}-tom`} type="text" value={f.tom} onChange={(e) => mudar({ tom: e.target.value })} placeholder="Ex.: didático, direto" /></div>}
          {definido && <div className="field"><label htmlFor={`${id}-pal`}>Palavras</label><input id={`${id}-pal`} type="number" inputMode="numeric" min={200} max={5000} step={100} value={f.palavras} onChange={(e) => mudar({ palavras: e.target.value })} aria-invalid={tentou && !!erros["palavras"]} aria-describedby={`${id}-pal-h`} /><p id={`${id}-pal-h`} className={tentou && erros["palavras"] ? "err" : "hint"}>{tentou && erros["palavras"] ? erros["palavras"] : "De 200 a 5000. Padrão: 1200."}</p></div>}
          <div className="field"><label htmlFor={`${id}-idi`}>Idioma</label><input id={`${id}-idi`} type="text" value={f.idioma} onChange={(e) => mudar({ idioma: e.target.value })} aria-invalid={tentou && !!erros["idioma"]} />{tentou && erros["idioma"] && <p className="err">{erros["idioma"]}</p>}</div>
        </div>
        <fieldset className="rd-refs">
          <legend>Referências (opcional)</legend>
          {f.referencias.map((r, i) => (
            <div key={i} className="rd-ref">
              <select aria-label={`Tipo da referência ${i + 1}`} value={r.tipo} onChange={(e) => setRef(i, { tipo: e.target.value as Referencia["tipo"] })}>{TIPOS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}</select>
              <input type="text" aria-label={`Valor da referência ${i + 1}`} value={r.valor} placeholder={TIPOS.find((t) => t.v === r.tipo)!.dica} onChange={(e) => setRef(i, { valor: e.target.value })} />
              <button type="button" className="btn chico" onClick={() => mudar({ referencias: f.referencias.filter((_, j) => j !== i) })} aria-label={`Remover referência ${i + 1}`}>Remover</button>
            </div>
          ))}
          <button type="button" className="btn chico" onClick={() => mudar({ referencias: [...f.referencias, { tipo: "url", valor: "" }] })}>+ Adicionar referência</button>
          {tentou && erros["referencias"] && <p className="err" role="alert">{erros["referencias"]}</p>}
          <p className="hint">Caminho é um arquivo do seu computador (caminho absoluto); o agente só lê.</p>
        </fieldset>
      </details>

      {!est && (
        <div className="row">
          <button type="submit" className="btn primario" disabled={busy}>{busy ? "Calculando…" : "Ver estimativa de uso"}</button>
          <span className="hint">Nada começa antes de você confirmar.</span>
        </div>
      )}

      {est && (
        <section className="rd-estimativa" aria-label="Estimativa de uso" aria-live="polite">
          <h3>Antes de começar</h3>
          <p>{definido ? "Artigo" : "Pesquisa de temas"} de cerca de {est.palavras} palavras.</p>
          {!est.livre.ok && <p className="warn" role="note"><strong>Atenção:</strong> {est.livre.motivo ?? "o uso do plano está alto agora."}</p>}
          {est.livre.ok && <p className="hint ok">Há folga no plano agora.</p>}
          <TetosPlano cinco={teto} semana={tetoSem} onCinco={setTeto} onSemana={setTetoSem} />
          <Emblem uso={live.usage} now={now} onConsultar={live.consultarUso} tamanho={96} modo="completo" {...(tetos.tetoPp ? { tetoPp: tetos.tetoPp } : {})} />
          <div className="row" style={{ marginTop: "var(--e-4)" }}>
            <button type="button" className="btn primario" disabled={busy || !tetoOk} onClick={() => void iniciar()}>{busy ? "Iniciando…" : definido ? "Iniciar o artigo" : "Iniciar a pesquisa"}</button>
            <button type="button" className="btn" onClick={() => setEst(undefined)}>Voltar a editar</button>
          </div>
        </section>
      )}
      {err && <p className="err field" role="alert">{err}</p>}

      <ConfirmDialog aberto={motivoUso !== undefined} titulo="Uso do plano alto" onFechar={() => setMotivoUso(undefined)}>
        <p>{motivoUso}</p>
        <p className="hint">Começar mesmo assim pode esgotar a janela do plano antes do fim.</p>
        <div className="row" style={{ marginTop: "var(--e-4)" }}>
          <button type="button" className="btn" autoFocus onClick={() => setMotivoUso(undefined)}>Cancelar</button>
          <button type="button" className="btn primario" onClick={() => { setMotivoUso(undefined); void iniciar(true); }}>Começar mesmo assim</button>
        </div>
      </ConfirmDialog>
    </form>
  );
}
