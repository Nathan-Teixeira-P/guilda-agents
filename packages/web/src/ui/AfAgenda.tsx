import { useId, useState } from "react";
import { api } from "../api.ts";
import { analiseAgenda, descreverCron, horasParaCron, lerHoras, linhasAgenda, pedidoSugestao, posicaoNaLinha, type LinhaAgenda, type Nicho } from "../logic/afiliados.ts";

const TICKS = [0, 6, 12, 18, 24];

function Linha({ l, conc }: { l: LinhaAgenda; conc: Set<string> }) {
  return (
    <div className={`tl-linha${l.enabled ? "" : " off"}`}>
      <div className="tl-rot">{l.label}{!l.enabled && <span className="muted small"> (desligado)</span>}</div>
      <div className="trilho" role="img" aria-label={`${l.label}: ${l.horas.length ? l.horas.join(", ") : "sem horários simples"}`}>
        {l.horas.map((h) => <span key={h} className={`marca${conc.has(`${l.key}|${h}`) ? " conc" : ""}`} style={{ left: `${posicaoNaLinha(h)}%` }} title={h} />)}
      </div>
      <div className="tl-txt small">{l.horas.join(" · ") || "sem horários"}{l.custom.length > 0 && ` · ${l.custom.length} personalizado(s)`}</div>
    </div>
  );
}

/** Keeps the typed text; pushes cron list to the draft only when every token is a valid HH:MM. */
function HorasInput({ n, onChange }: { n: Nicho; onChange: (cron: string[]) => void }) {
  const id = useId();
  const { horas, custom } = linhasAgenda([n])[0]!;
  const [txt, setTxt] = useState(horas.join(", "));
  const { invalidas } = lerHoras(txt);
  if (custom.length > 0) return <p className="small muted">Este nicho usa expressões cron personalizadas ({custom.join("; ")}); edite-as no projeto afiliados.</p>;
  return (
    <div className="field">
      <label htmlFor={id}>Horários de envio de {n.label || n.key} (HH:MM, separados por vírgula)</label>
      <input id={id} type="text" value={txt} aria-describedby={`${id}-d`} {...(invalidas.length ? { "aria-invalid": true as const } : {})}
        onChange={(e) => { setTxt(e.target.value); const r = lerHoras(e.target.value); if (!r.invalidas.length) onChange(r.horas.map(horasParaCron)); }} />
      <p className="hint" id={`${id}-d`}>
        {invalidas.length ? <span className="err">Horário inválido: {invalidas.join(", ")}. Use HH:MM, como 09:30.</span> : n.cronSlots.length === 0 ? "Sem horários: o nicho precisa de ao menos um." : n.cronSlots.map((c) => `${c} = ${descreverCron(c)}`).join(" · ")}
      </p>
    </div>
  );
}

export function AfAgenda({ draft, waMax, onSlots }: { draft: Nicho[]; waMax?: number | undefined; onSlots: (key: string, cron: string[]) => void }) {
  const [intervalo, setIntervalo] = useState("45");
  const [desejadas, setDesejadas] = useState<Record<string, string>>({});
  const [envios, setEnvios] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: "ok" | "err"; txt: string }>();
  const [versao, setVersao] = useState(0);
  const [busy, setBusy] = useState(false);
  const idInt = useId();
  const min = Number(intervalo);
  const minOk = Number.isInteger(min) && min >= 1 && min <= 600;
  const linhas = linhasAgenda(draft);
  const { concentracoes, total } = analiseAgenda(linhas, minOk ? min : 45, waMax);
  const conc = new Set(concentracoes.flatMap((c) => [`${c.a.key}|${c.a.hhmm}`, `${c.b.key}|${c.b.hhmm}`]));

  async function sugerir() {
    const alvo = draft.filter((n) => n.enabled && linhasAgenda([n])[0]!.custom.length === 0);
    const pedido = pedidoSugestao(alvo.map((n) => ({ key: n.key, horas: lerHoras(desejadas[n.key] ?? "").horas, envios: Number(envios[n.key] ?? n.cronSlots.length) || 1 })), minOk ? min : 45);
    setBusy(true);
    const r = await api.afSugerir(pedido);
    setBusy(false);
    if (!r.ok) return setMsg({ tipo: "err", txt: `Não foi possível sugerir: ${r.error}` });
    for (const n of alvo) {
      const s = r.data.slots.filter((x) => x.key === n.key).map((x) => x.cron);
      if (s.length) onSlots(n.key, s);
    }
    setVersao((v) => v + 1);
    const falta = r.data.impossiveis.map((x) => `${draft.find((n) => n.key === x.key)?.label ?? x.key}: faltam ${x.faltam}`);
    setMsg({ tipo: falta.length ? "err" : "ok", txt: falta.length ? `Sugestão aplicada ao rascunho, mas não coube tudo com ${minOk ? min : 45} min de intervalo (${falta.join("; ")}).` : "Sugestão aplicada ao rascunho. Ajuste os horários abaixo e salve." });
  }

  return (
    <section aria-labelledby="af-a">
      <div className="sec"><h2 id="af-a">Agenda 24h</h2><span className="muted small">Fuso America/Sao_Paulo</span></div>

      <div className="tl" aria-label="Linha do tempo de 24 horas">
        <div className="tl-ticks" aria-hidden="true">{TICKS.map((t) => <span key={t} style={{ left: `${(t / 24) * 100}%` }}>{t}h</span>)}</div>
        {linhas.map((l) => <Linha key={l.key} l={l} conc={conc} />)}
        {linhas.length === 0 && <p className="muted">Sem nichos para mostrar.</p>}
      </div>

      {concentracoes.length > 0 ? (
        <div className="aviso warn-box" role="alert">
          <strong>Alerta de concentração: {concentracoes.length} {concentracoes.length === 1 ? "par de envios" : "pares de envios"} muito próximos.</strong>
          <ul>{concentracoes.map((c, i) => <li key={i}>{c.texto}</li>)}</ul>
        </div>
      ) : <p className="ok small" role="status">Sem concentração: todos os envios respeitam {minOk ? min : 45} min de intervalo.</p>}

      <p className={`total${total.excede ? " excede" : ""}`} role="status">
        Total estimado: <strong>{total.total}</strong> envios por dia (máx. por execução × horários, nichos ligados).{" "}
        {total.limiteDiario === undefined ? "Limite WA_MAX_PER_DAY não encontrado no .env do projeto." : total.excede ? `ACIMA do limite WA_MAX_PER_DAY de ${total.limiteDiario} (aviso informativo, o hub não bloqueia).` : `Dentro do limite WA_MAX_PER_DAY de ${total.limiteDiario}.`}
      </p>

      <h3 className="sec-t">Sugerir horários</h3>
      <p className="muted small">Informe as horas que você prefere por nicho (opcional) e quantos envios por dia. O hub sugere horários respeitando o intervalo mínimo; o resultado vai para o rascunho e pode ser editado.</p>
      <div className="field narrow">
        <label htmlFor={idInt}>Intervalo mínimo entre envios (minutos)</label>
        <input id={idInt} type="number" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} {...(minOk ? {} : { "aria-invalid": true as const })} />
        {!minOk && <p className="err">Erro: informe um número inteiro entre 1 e 600.</p>}
      </div>
      <ul className="lista af-sug">
        {draft.filter((n) => n.enabled).map((n) => (
          <li key={n.key}>
            <strong>{n.label || n.key}</strong>
            <div className="af-num">
              <div className="field"><label htmlFor={`${idInt}-d-${n.key}`}>Horas desejadas</label><input id={`${idInt}-d-${n.key}`} type="text" placeholder="09:00, 12:30 (vazio = livre)" value={desejadas[n.key] ?? ""} onChange={(e) => setDesejadas({ ...desejadas, [n.key]: e.target.value })} /></div>
              <div className="field"><label htmlFor={`${idInt}-e-${n.key}`}>Envios por dia</label><input id={`${idInt}-e-${n.key}`} type="number" min={1} value={envios[n.key] ?? String(n.cronSlots.length)} onChange={(e) => setEnvios({ ...envios, [n.key]: e.target.value })} /></div>
            </div>
          </li>
        ))}
      </ul>
      <div className="row field">
        <button type="button" className="btn primario" disabled={busy || !minOk} onClick={sugerir}>{busy ? "Sugerindo…" : "Sugerir horários"}</button>
      </div>
      {msg && <p role="status" className={msg.tipo === "ok" ? "ok" : "err"}>{msg.tipo === "ok" ? "" : "Atenção: "}{msg.txt}</p>}

      <h3 className="sec-t">Horários por nicho (editável)</h3>
      <div key={versao}>
        {draft.map((n) => <HorasInput key={`${n.key}-${versao}`} n={n} onChange={(c) => onSlots(n.key, c)} />)}
      </div>
    </section>
  );
}
