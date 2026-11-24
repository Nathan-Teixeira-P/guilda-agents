import { pavio } from "../logic/fuse.ts";

/** Breaker fuse: text first (the source of truth), notches as a bar. */
export function Pavio({ rotulo, usado, limite }: { rotulo: string; usado: number; limite: number }) {
  const p = pavio(usado, limite);
  return (
    <div className="pavio">
      <span>{rotulo}</span>
      <span className="entalhes" aria-hidden="true">{Array.from({ length: limite }, (_, i) => <i key={i} className={i < p.cheios ? `on ${p.estado}` : ""} />)}</span>
      <span className={p.estado === "ok" ? "" : p.estado === "atencao" ? "warn" : "err"}>{p.texto}{p.estado === "atencao" ? " (perto do limite)" : p.estado === "estourou" ? " (limite estourado)" : ""}</span>
    </div>
  );
}
