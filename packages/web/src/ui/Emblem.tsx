import { useEffect, useId, useRef, useState } from "react";
import { adiantado, ariaUso, arcoFantasma, cruzouAlerta, efetivo, erroConsulta, piorFaixa, ritmo, rotuloFaixa, textoCompacto, type Uso, type Tipo } from "../logic/emblem.ts";
import { exibido, textoFrescor, type AutoStatus } from "../logic/frescor.ts";
import { formatTempoRestante } from "../logic/time.ts";
import { AutoUso, Frescor, type OnAuto } from "./AutoUso.tsx";

interface Props {
  uso: Uso | undefined;
  now: number; // minute-resolution clock (useNow)
  onConsultar: () => Promise<{ status: number; error: string } | undefined>;
  auto?: AutoStatus | undefined; // automatic refresh status (undefined: old server)
  onAuto?: OnAuto;
  tamanho: number;
  modo: "compacto" | "completo";
  tetoPp?: number; // mission cap: ghost arc on the 5h ring
}

const R = { semana: 164, cincoHoras: 140 } as const;
const TICKS: [Tipo, number, number][] = [["semana", 7, 29], ["cincoHoras", 5, 53]];

/** Marker: a small diamond on the ring at the elapsed fraction of the window (amber when usage is ahead of time). */
function Ponto({ r, f, ambar }: { r: number; f: number; ambar: boolean }) {
  return <polygon points={`200,${200 - r - 12} 207,${200 - r} 200,${200 - r + 12} 193,${200 - r}`} transform={`rotate(${f * 360} 200 200)`} fill={ambar ? "#d9a441" : "#ece3d0"} stroke="#0b0707" strokeWidth="2" />;
}

function Aneis({ u, now, tetoPp, pulso }: { u: Uso; now: number; tetoPp?: number; pulso: boolean }) {
  const ok = u.estado === "ok";
  const fant = ok && tetoPp ? arcoFantasma(u.cincoHoras.percentual, tetoPp) : undefined;
  const faixa = piorFaixa(u);
  return (
    <svg className={`emblem-svg${pulso ? " pulso" : ""}`} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <defs><radialGradient id="eg-bg" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#241416" /><stop offset="1" stopColor="#0c0809" /></radialGradient>
        <linearGradient id="eg-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d8dade" /><stop offset=".5" stopColor="#6c7078" /><stop offset="1" stopColor="#2c2f35" /></linearGradient></defs>
      <circle cx="200" cy="200" r="196" fill="url(#eg-bg)" />
      <circle cx="200" cy="200" r="190" fill="none" stroke="url(#eg-rim)" strokeWidth="8" className={faixa !== "normal" ? "aro-alerta" : undefined} />
      {(["semana", "cincoHoras"] as const).map((t) => (
        <g key={t}>
          <circle cx="200" cy="200" r={R[t]} fill="none" stroke="#2a1a17" strokeWidth="14" strokeDasharray={ok ? undefined : "6 6"} />
          {ok && <circle className="arc" cx="200" cy="200" r={R[t]} pathLength="100" fill="none" stroke={t === "semana" ? "#a9adb3" : "#c1121f"} strokeWidth="14" strokeDasharray={`${u[t].percentual} 100`} />}
          {ok && <Ponto r={R[t]} f={ritmo(u[t].reiniciaEm, t, now)} ambar={adiantado(u[t].percentual, ritmo(u[t].reiniciaEm, t, now))} />}
        </g>
      ))}
      {fant && fant.tam > 0 && <circle className="arc" cx="200" cy="200" r={R.cincoHoras} pathLength="100" fill="none" stroke="#ece3d0" strokeOpacity=".55" strokeWidth="14" strokeDasharray={`0 ${fant.de} ${fant.tam} 100`} />}
      {TICKS.map(([, n, y]) => Array.from({ length: n }, (_, i) => <line key={`${n}-${i}`} x1="200" y1={y} x2="200" y2={y + 14} stroke="#0b0707" strokeWidth="3" transform={`rotate(${(360 / n) * i} 200 200)`} />))}
      <image href="/emblem-ntp.png" x="108" y="88" width="184" height="226" preserveAspectRatio="xMidYMid meet" opacity={ok ? 1 : 0.4} />
    </svg>
  );
}

export function Legendas({ u, now, tetoPp }: { u: Uso; now: number; tetoPp?: number }) {
  if (u.estado !== "ok") return <p className="emblem-leg">{u.motivo === "desatualizado" ? "uso desatualizado: aguardando nova leitura" : "uso indisponível"}</p>;
  const linha = (nome: string, j: typeof u.semana, t: Tipo) => {
    const f = ritmo(j.reiniciaEm, t, now);
    const rf = j.percentual >= 90 ? "crítico" : rotuloFaixa(j.faixa) || (j.percentual >= 80 ? "atenção" : "");
    return (
      <p className={`emblem-leg ${j.percentual >= 90 ? "critico" : j.percentual >= 80 ? "atencao" : ""}`}>
        <strong>{nome} {j.percentual}%</strong> · reinicia em {formatTempoRestante(j.reiniciaEm, now)}
        {rf && <span className="emblem-faixa"> · {rf}</span>}
        {adiantado(j.percentual, f) && <span className="emblem-ritmo"> · consumo adiantado ({Math.round(f * 100)}% da janela decorrida)</span>}
      </p>
    );
  };
  return <>{linha("5 horas", u.cincoHoras, "cincoHoras")}{linha("Semana", u.semana, "semana")}{tetoPp ? <p className="emblem-leg">Teto da missão: +{tetoPp} pp (arco claro).</p> : null}</>;
}

export function Consultar({ onConsultar }: { onConsultar: Props["onConsultar"] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  return (
    <div className="emblem-consulta">
      <button type="button" className="btn chico" disabled={busy} onClick={async () => { setBusy(true); setMsg(undefined); const e = await onConsultar(); setBusy(false); if (e) setMsg(erroConsulta(e.status, e.error)); }}>{busy ? "Consultando…" : "Consultar agora"}</button>
      <p className="hint">Gasta uma chamada mínima do plano. Só roda quando você pede.</p>
      {msg && <p className="err" role="alert">{msg}</p>}
    </div>
  );
}

export function Emblem({ uso, now, onConsultar, auto, onAuto, tamanho, modo, tetoPp }: Props) {
  const u = exibido(uso, auto, now);
  const fresco = textoFrescor(efetivo(uso, now), auto, now);
  const anterior = useRef<Uso>(undefined);
  const [pulso, setPulso] = useState(false);
  useEffect(() => {
    if (cruzouAlerta(anterior.current, u)) setPulso(true); // single pulse, CSS plays once; reduced motion disables it
    anterior.current = u;
  });
  const [aberto, setAberto] = useState(false);
  const pid = useId();
  const box = { width: tamanho, height: tamanho };

  if (modo === "completo") {
    return (
      <section className="emblem emblem-completo" aria-label="Uso do plano">
        <div style={box}><Aneis u={u} now={now} {...(tetoPp ? { tetoPp } : {})} pulso={pulso} /></div>
        <div>
          <Legendas u={u} now={now} {...(tetoPp ? { tetoPp } : {})} />
          {u.estado !== "ok" && <p className="hint">Atualiza quando a guilda fizer a próxima chamada ao modelo.</p>}
          {u.estado !== "ok" && <Consultar onConsultar={onConsultar} />}
        </div>
      </section>
    );
  }
  const alerta = piorFaixa(u) !== "normal";
  return (
    <div className="emblem emblem-compacto">
      <button type="button" className="emblem-btn" aria-expanded={aberto} aria-controls={pid} aria-label={`${ariaUso(u, now)}. ${fresco}`} onClick={() => setAberto((a) => !a)} onKeyDown={(e) => { if (e.key === "Escape") setAberto(false); }}>
        <span style={box} className="emblem-ico"><Aneis u={u} now={now} pulso={pulso} /></span>
        <span className="emblem-col"><span className="emblem-txt" aria-hidden="true">{textoCompacto(u, now)}{alerta && ` · ${u.estado === "ok" && (u.cincoHoras.percentual >= 90 || u.semana.percentual >= 90) ? "crítico" : "atenção"}`}</span>
        <span className="emblem-fresco" aria-hidden="true">{fresco}</span></span>
      </button>
      {aberto && (
        <div id={pid} className="emblem-pop panel" role="group" aria-label="Detalhes do uso do plano">
          <Legendas u={u} now={now} />
          <Frescor uso={uso} auto={auto} now={now} />
          <Consultar onConsultar={onConsultar} />
          {onAuto && <AutoUso auto={auto} onAuto={onAuto} />}
          <button type="button" className="btn chico" onClick={() => setAberto(false)}>Fechar</button>
        </div>
      )}
    </div>
  );
}
