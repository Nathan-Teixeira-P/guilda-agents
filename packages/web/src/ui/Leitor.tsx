import { useMemo, type ReactNode } from "react";
import { linhasDoc, trechos } from "../logic/doc.ts";

/** Links open in a new tab without referrer or opener; only http(s) reaches an href (see trechos). */
function Texto({ t }: { t: string }): ReactNode {
  return trechos(t).map((p, i) => (p.href ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">{p.texto}</a> : p.texto));
}

/** Parchment reader. The content comes from agents: always rendered as text nodes (no HTML, no markdown library). */
export function Leitor({ texto, titulo }: { texto: string; titulo: string }) {
  const linhas = useMemo(() => linhasDoc(texto), [texto]);
  return (
    <article key={titulo} className="leitura abrindo" tabIndex={0} aria-label={`Documento: ${titulo}`}>
      {linhas.map((l, i) => {
        if (l.tipo === "vazia") return <div key={i} className="d-vazia" />;
        if (l.tipo === "codigo") return <div key={i} className="d-codigo">{l.texto}</div>;
        return <div key={i} className={`d-${l.tipo}`}>{l.tipo === "li" && <span aria-hidden="true">• </span>}<Texto t={l.texto} /></div>;
      })}
    </article>
  );
}
