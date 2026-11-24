import { useCallback, useEffect, useState } from "react";
import { api, lerArtefato, type DetalheArtigo } from "../api.ts";
import { go } from "../router.ts";
import { ARTEFATOS_TEXTO, abaInicial, acoesDe, copiarTexto, dataCurta, ehSugestao, equipeDe, estadoDoArtigo, motivoDoArtigo, rotuloArtigo, semFontesConfiaveis, textoParaCopiar, type AbaTexto, type EstadoArtigo, type Sugestao } from "../logic/redacao.ts";
import { linkSeguro } from "../logic/doc.ts";
import { Avatar } from "./Avatar.tsx";
import { Capas } from "./Capas.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { Leitor } from "./Leitor.tsx";
import { membro } from "../roster.ts";
import type { Live } from "../store.ts";
import type { Result } from "../api.ts";

type Aba = AbaTexto | "versoes";
const ROTULO_ABA: Record<Aba, string> = { pesquisa: "Pesquisa", checagem: "Checagem", rascunho: "Rascunho", final: "Final", versoes: "Versões" };

/** Legacy copy path for non-secure contexts: a hidden textarea and execCommand. */
function copiarLegado(t: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.append(ta); ta.select();
  try { return document.execCommand("copy"); } finally { ta.remove(); }
}

function Sugestoes({ lista, onEscolher }: { lista: Sugestao[]; onEscolher: (s: Sugestao) => void }) {
  return (
    <section aria-label="Temas sugeridos" className="rd-sugestoes">
      <h2>Temas sugeridos</h2>
      <p className="hint">Em ordem de relevância. Escolher leva o tema e as fontes para o pedido, onde você vê a estimativa de uso antes de começar.</p>
      <ol>
        {lista.map((s, i) => (
          <li key={s.rank + s.tema} className="panel rd-sug">
            <div className="rd-sug-h"><span className="pill">{i + 1}º</span> <h3>{s.tema}</h3></div>
            <p><strong>Por que vale agora:</strong> {s.motivo}</p>
            <ul className="rd-fontes" aria-label={`Fontes de ${s.tema}`}>
              {s.fontes.map((f) => { const h = linkSeguro(f.url); return <li key={f.url}>{h ? <a href={h} target="_blank" rel="noopener noreferrer">{f.url}</a> : <span>{f.url}</span>} <span className="muted small">acessado em {dataCurta(f.acessadoEm).split(",")[0]}</span></li>; })}
            </ul>
            <button type="button" className="btn primario chico" onClick={() => onEscolher(s)}>Escolher</button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ArtigoDetalhe({ slug, live, onEscolher }: { slug: string; live: Live; onEscolher: (s: Sugestao) => void }) {
  const [d, setD] = useState<DetalheArtigo>();
  const [erro, setErro] = useState<{ msg: string; status: number }>();
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [aba, setAba] = useState<Aba>();
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string>();
  const [comentario, setComentario] = useState("");
  const [tentou, setTentou] = useState(false);
  const [confirma, setConfirma] = useState<{ titulo: string; texto: string; rotulo: string; fn: () => Promise<Result<unknown>>; depois?: () => void }>();
  const [copiado, setCopiado] = useState<"ok" | "falhou">();

  const vivo = live.artigos.find((a) => a.id === slug);
  const chave = vivo ? `${estadoDoArtigo(vivo)}:${vivo.versao}:${vivo.updatedAt}` : "";

  const carregar = useCallback(async () => {
    const r = await api.artigo(slug);
    if (!r.ok) { setErro({ msg: r.error, status: r.status }); return; }
    const achados = await Promise.all(ARTEFATOS_TEXTO.filter((n) => r.data.artefatos.includes(`${n}.md`)).map(async (n) => [n, await lerArtefato(slug, `${n}.md`)] as const));
    setTextos(Object.fromEntries(achados.flatMap(([n, t]) => (t.ok ? [[n, t.data]] : []))));
    setErro(undefined); setD(r.data); // together with the texts: no "does not exist" flash while they load
    setAba((cur) => cur ?? abaInicial(r.data.artefatos));
  }, [slug]);
  useEffect(() => { void carregar(); }, [carregar, chave]);

  if (erro) return <div className="vazio"><h1>{erro.status === 404 ? "Artigo não encontrado" : "Não foi possível abrir o artigo"}</h1><p className="muted">{erro.status === 404 ? "Ele pode ter sido excluído." : erro.msg}</p><a className="btn" href="#/redacao">Voltar à Redação</a></div>;
  if (!d) return <div className="skeleton" style={{ height: 240 }} aria-busy="true" aria-label="Carregando artigo" />;

  const a = { ...d.artigo, ...(vivo?.estado ? { estado: vivo.estado } : {}) };
  const estado: EstadoArtigo = estadoDoArtigo(a);
  const sug = ehSugestao(a);
  const ac = acoesDe(estado, sug);
  const motivo = motivoDoArtigo(a);
  const temCapa = d.artefatos.includes("capa.png");
  const abaAtual: Aba = aba ?? "pesquisa";
  const copiavel = textoParaCopiar({ final: textos["final"] ?? "", rascunho: textos["rascunho"] ?? "" });
  const semFontes = semFontesConfiaveis(textos["pesquisa"]);

  async function agir(fn: () => Promise<Result<unknown>>, depois?: () => void) {
    setBusy(true); setAviso(undefined);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setAviso(r.status === 0 ? "O servidor está fora do ar. Nada foi alterado." : `O servidor recusou: ${r.error}`);
    live.reload();
    if (depois) depois(); else void carregar();
  }
  async function copiar() {
    const ok = await copiarTexto(copiavel, { ...(navigator.clipboard ? { clipboard: navigator.clipboard } : {}), copiarLegado });
    setCopiado(ok ? "ok" : "falhou");
  }

  return (
    <div className="rd-detalhe">
      <p><a href="#/redacao">← Voltar à Redação</a></p>
      <div className="sec">
        <div>
          <h1>{a.tema || (sug ? "Sugestões de temas" : slug)}</h1>
          <p className="muted small">v{a.versao} · criado em {dataCurta(a.createdAt)} · atualizado em {dataCurta(a.updatedAt)}</p>
        </div>
        <span className={`pill estagio s-${a.stage}`}>{rotuloArtigo(a)}</span>
      </div>

      <ol className="rd-equipe" aria-label="Quem trabalha neste artigo">
        {equipeDe(estado, sug).map((p) => (
          <li key={p.agente} className={`rd-membro ${p.estado}`}>
            <Avatar oculto agente={p.agente} tamanho={40} estado={p.estado} />
            <span><strong>{membro(p.agente).codinome}</strong><br /><span className="small">{p.papel}: {p.estado === "ativo" ? "em campo" : p.estado === "concluido" ? "feito" : "aguardando"}</span></span>
          </li>
        ))}
      </ol>
      {estado === "pesquisando" && <p className="hint" role="status">Na fila: ainda não começou a trabalhar.</p>}

      {motivo && <div className="panel aviso field" role="note"><p className="warn"><strong>{motivo.titulo}:</strong> {motivo.texto}</p>{estado === "pausado" && <p className="hint">Retomar continua de onde parou.</p>}</div>}
      {a.erroCapa && <div className="panel aviso field" role="note"><p className="warn"><strong>Capa:</strong> {a.erroCapa}</p><p className="hint">O arquivo vetorial (SVG) foi mantido. {d.artefatos.includes("capa.svg") && <a href={`/redacao/${encodeURIComponent(slug)}/capa.svg`} download={`capa-${slug}.svg`}>Baixar capa em SVG</a>}</p></div>}
      {semFontes && !sug && <div className="panel aviso field" role="alert"><p className="warn"><strong>Sem fontes confiáveis.</strong> A pesquisa não encontrou fontes que sustentem este tema. Confira o rascunho com cuidado ou peça ajustes.</p></div>}
      {a.comentarios && a.comentarios.length > 0 && <details className="field"><summary>Seus pedidos de ajuste ({a.comentarios.length})</summary><ul>{a.comentarios.map((c, i) => <li key={i}>{c.texto} <span className="muted small">({dataCurta(c.em)})</span></li>)}</ul></details>}

      {d.sugestoes.length > 0 && <Sugestoes lista={d.sugestoes} onEscolher={onEscolher} />}
      {sug && d.sugestoes.length === 0 && estado === "aprovado" && <p className="muted">Nenhuma sugestão válida foi salva.</p>}

      {!sug && (
        <>
          <div className="rd-acoes panel" role="group" aria-label="Ações do artigo">
            <div className="row">
              <button type="button" className="btn primario" disabled={busy || !ac.aprovar} onClick={() => void agir(() => api.aprovarArtigo(slug))} aria-describedby="rd-aprovar-h">Aprovar</button>
              <button type="button" className="btn" disabled={busy || !ac.retomar} onClick={() => void agir(() => api.retomarArtigo(slug))}>Retomar</button>
              <button type="button" className="btn" disabled={busy || !ac.reabrir} onClick={() => void agir(() => api.reabrirArtigo(slug))}>Reabrir</button>
              <button type="button" className="btn" disabled={busy || !ac.cancelar} onClick={() => setConfirma({ titulo: "Cancelar o artigo?", texto: "O trabalho em andamento para. Você pode reabrir depois.", rotulo: "Cancelar artigo", fn: () => api.cancelarArtigo(slug) })}>Cancelar</button>
            </div>
            <p id="rd-aprovar-h" className="hint">{ac.aprovar ? "Aprovar libera a edição final e a capa." : `Aprovar só fica disponível em “Em revisão do usuário” (agora: ${rotuloArtigo(a)}).`}</p>
            {ac.ajustes && (
              <form className="rd-ajustes" noValidate onSubmit={(e) => { e.preventDefault(); setTentou(true); if (!comentario.trim()) return; void agir(() => api.ajustarArtigo(slug, comentario.trim()), () => { setComentario(""); setTentou(false); void carregar(); }); }}>
                <label htmlFor="rd-coment">Pedir ajustes</label>
                <textarea id="rd-coment" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={20000} aria-invalid={tentou && !comentario.trim()} aria-describedby={tentou && !comentario.trim() ? "rd-coment-e" : undefined} placeholder="O que mudar? Ex.: abra com um exemplo e corte a seção 3." style={{ minHeight: 96 }} />
                {tentou && !comentario.trim() && <p id="rd-coment-e" className="err">Escreva o que deve mudar.</p>}
                <button type="submit" className="btn" disabled={busy}>Pedir ajustes</button>
              </form>
            )}
          </div>

          <div className="row rd-saida">
            <button type="button" className="btn" disabled={!copiavel} onClick={() => void copiar()}>Copiar texto</button>
            <span role="status" className={copiado === "falhou" ? "err" : "hint ok"}>{copiado === "ok" ? "Texto copiado." : copiado === "falhou" ? "Não foi possível copiar. Selecione o texto e copie à mão." : ""}</span>
            {!copiavel && <span className="hint">O texto aparece aqui quando houver rascunho.</span>}
          </div>
          {temCapa && <Capas itens={[{ slug, tema: a.tema || slug }]} />}

          <div className="rd-abas" role="tablist" aria-label="Documentos do artigo">
            {(["pesquisa", "checagem", "rascunho", "final", "versoes"] as Aba[]).map((t) => (
              <button key={t} type="button" role="tab" id={`rd-aba-${t}`} aria-selected={abaAtual === t} aria-controls="rd-painel" tabIndex={abaAtual === t ? 0 : -1} className="btn chico"
                onClick={() => setAba(t)}
                onKeyDown={(e) => { const ordem: Aba[] = ["pesquisa", "checagem", "rascunho", "final", "versoes"]; const i = ordem.indexOf(t); const n = e.key === "ArrowRight" ? ordem[(i + 1) % 5] : e.key === "ArrowLeft" ? ordem[(i + 4) % 5] : undefined; if (n) { e.preventDefault(); setAba(n); document.getElementById(`rd-aba-${n}`)?.focus(); } }}>
                {ROTULO_ABA[t]}
              </button>
            ))}
          </div>
          <div id="rd-painel" role="tabpanel" aria-labelledby={`rd-aba-${abaAtual}`}>
            {abaAtual === "versoes" ? (
              <div className="panel">
                {(a.versoes ?? []).length === 0 ? <p className="muted">Ainda não há versões salvas. Cada rascunho entregue para revisão vira uma versão (guardamos até 3).</p> : (
                  <ul className="rd-versoes">{[...(a.versoes ?? [])].sort((x, y) => y.versao - x.versao).map((v) => <li key={v.versao}><strong>Versão {v.versao}</strong>{v.atual && <span className="pill">atual</span>} <span className="muted small">{v.arquivo}</span></li>)}</ul>
                )}
                <p className="hint">Guardamos as 3 versões mais recentes; as anteriores são apagadas. O texto de versões antigas não é exibido aqui, apenas o rascunho atual na aba Rascunho.</p>
              </div>
            ) : textos[abaAtual] !== undefined ? <Leitor texto={textos[abaAtual]!} titulo={ROTULO_ABA[abaAtual]} /> : (
              <div className="panel vazio-aba"><p className="muted">{ROTULO_ABA[abaAtual]} ainda não existe para este artigo.</p></div>
            )}
          </div>
        </>
      )}
      {sug && textos["pesquisa"] !== undefined && <details className="field"><summary>Ver a pesquisa completa</summary><Leitor texto={textos["pesquisa"]} titulo="Pesquisa" /></details>}

      {aviso && <p className="err field" role="alert">{aviso}</p>}
      <div className="rd-perigo"><button type="button" className="btn perigo chico" disabled={busy} onClick={() => setConfirma({ titulo: "Excluir o artigo?", texto: "A pasta do artigo (pesquisa, texto, versões e capa) será apagada. Não dá para desfazer.", rotulo: "Excluir", fn: () => api.excluirArtigo(slug), depois: () => go("/redacao") })}>Excluir artigo</button></div>

      <ConfirmDialog aberto={confirma !== undefined} titulo={confirma?.titulo ?? ""} onFechar={() => setConfirma(undefined)}>
        <p>{confirma?.texto}</p>
        <div className="row" style={{ marginTop: "var(--e-4)" }}>
          <button type="button" className="btn" autoFocus onClick={() => setConfirma(undefined)}>Voltar</button>
          <button type="button" className="btn perigo" onClick={() => { const c = confirma!; setConfirma(undefined); void agir(c.fn, c.depois); }}>{confirma?.rotulo}</button>
        </div>
      </ConfirmDialog>
    </div>
  );
}
