import { useId } from "react";

export interface Tetos { tetoPp?: number; tetoSemanaPp?: number }
const um = (s: string) => (s.trim() === "" ? undefined : Number(s));
const valido = (n: number | undefined) => n === undefined || (Number.isFinite(n) && n >= 1 && n <= 100);

/** Both caps are optional: blank means "no cap". */
export function lerTetos(a: string, b: string): { ok: boolean; tetos: Tetos } {
  const x = um(a), y = um(b);
  return { ok: valido(x) && valido(y), tetos: { ...(x !== undefined && valido(x) ? { tetoPp: x } : {}), ...(y !== undefined && valido(y) ? { tetoSemanaPp: y } : {}) } };
}

export function TetosPlano({ cinco, semana, onCinco, onSemana, tentou = true }: { cinco: string; semana: string; onCinco: (v: string) => void; onSemana: (v: string) => void; tentou?: boolean }) {
  const id = useId();
  const campo = (suf: string, rotulo: string, v: string, set: (v: string) => void) => {
    const bad = tentou && !valido(um(v));
    return (
      <div className="field">
        <label htmlFor={`${id}-${suf}`}>{rotulo} (opcional, em %)</label>
        <input id={`${id}-${suf}`} type="number" inputMode="decimal" min={1} max={100} step={1} placeholder="sem teto" value={v} onChange={(e) => set(e.target.value)} aria-invalid={bad} style={{ maxWidth: 160 }} />
        {bad && <p className="err">Deixe em branco ou informe de 1 a 100.</p>}
      </div>
    );
  };
  return <>{campo("5h", "Teto da janela de 5 h", cinco, onCinco)}{campo("sem", "Teto da semana", semana, onSemana)}<p className="hint">Quanto do plano a missão pode gastar. Em branco, não há teto.</p></>;
}
