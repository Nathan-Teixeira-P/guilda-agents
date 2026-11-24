import { useId, useState } from "react";
import type { Uso } from "../logic/emblem.ts";
import { efetivo } from "../logic/emblem.ts";
import { INTERVALOS, textoConsultasHoje, textoFrescor, textoProxima, type AutoStatus } from "../logic/frescor.ts";

export type OnAuto = (b: { auto?: boolean; intervaloMin?: number }) => Promise<string | undefined>;

/** Freshness lines: "atualizado há N min", "próxima consulta em ~N min" or "pausado: motivo". Text only, no colour-only meaning. */
export function Frescor({ uso, auto, now }: { uso: Uso | undefined; auto: AutoStatus | undefined; now: number }) {
  const u = efetivo(uso, now);
  const prox = textoProxima(auto, now);
  return (
    <div className="frescor">
      <p className="hint">{textoFrescor(u, auto, now)}{prox ? ` · ${prox}` : ""}</p>
      {auto?.erro && <p className="err">Última consulta automática falhou: {auto.erro}. Tentando de novo mais tarde.</p>}
    </div>
  );
}

/** Opt-out switch + interval for the automatic refresh. Renders nothing when the server has no such route. */
export function AutoUso({ auto, onAuto }: { auto: AutoStatus | undefined; onAuto: OnAuto }) {
  const id = useId();
  const [msg, setMsg] = useState<string>();
  if (!auto) return null;
  const mudar = async (b: Parameters<OnAuto>[0]) => setMsg(await onAuto(b));
  const opcoes: number[] = INTERVALOS.includes(auto.intervaloMin as never) ? [...INTERVALOS] : [...INTERVALOS, auto.intervaloMin].sort((a, b) => a - b);
  return (
    <div className="auto-uso">
      <label className="auto-linha"><input type="checkbox" checked={auto.auto} onChange={(e) => void mudar({ auto: e.target.checked })} /> Atualizar sozinho</label>
      <label className="auto-linha" htmlFor={id}>A cada
        <select id={id} value={auto.intervaloMin} disabled={!auto.auto} onChange={(e) => void mudar({ intervaloMin: Number(e.target.value) })}>
          {opcoes.map((n) => <option key={n} value={n}>{n} min</option>)}
        </select>
      </label>
      <p className="hint">Cada consulta gasta uma fração mínima da janela; só roda com a aba aberta e visível e sem missão em andamento.</p>
      {auto.auto && <p className="hint" aria-live="polite">{textoConsultasHoje(auto)}{auto.custoPp.media !== undefined ? ` (custo médio medido: ${auto.custoPp.media} pp)` : ""}.</p>}
      {msg && <p className="err" role="alert">{msg}</p>}
    </div>
  );
}
